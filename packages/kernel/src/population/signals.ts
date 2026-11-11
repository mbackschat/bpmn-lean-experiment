/**
 * Population: Signal fan-out, transcribed from `Kernel/Population/Signals.lean`: a Signal reaches every receiver of the
 * population one at a time, each its own unit of commitment: an API broadcast, and the intent a committed step's throw
 * leaves, which cascades depth-first (PC-SIGNAL-04, population contract §5, §6,
 * [specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)).
 */
import { SignalPayload, compareStrings, elementStart, mergeSort, programChildren, programPublicId, type Program } from "../il/types.js";
import type { Hooks } from "../hooks.js";
import {
  DeliveryTriggerTag,
  FailureTag,
  InputTag,
  InstanceStatus,
  SignalReach,
  StartTriggerTag,
  instanceOf,
  openKindView,
  signalAddressMatches,
  type BroadcastIntent,
  type Binding,
  type OccurrenceRef,
  type SignalAddress,
  type StartInput,
  type State,
} from "../state.js";
import { closureBound, context, step } from "../step.js";
import {
  FanOutEntryTag,
  ReceiverTag,
  ResolutionTag,
  cascadeInstanceId,
  currentDeployments,
  occurrence,
  startInstance,
  startedInstanceId,
  type Broadcast,
  type Deployment,
  type FanOutEntry,
  type Instance,
  type Receiver,
  type Refusable,
  type Resolution,
} from "./messages.js";

// `Kernel/Population/Conditions.lean` imports `Signals` publicly, so it reads Messages through Signals.
export {
  FanOutEntryTag,
  ReceiverTag,
  ResolutionTag,
  currentDeployments,
  selected,
  startInstance,
  startedInstanceId,
  type ConditionEvaluation,
  type Deployment,
  type FanOutEntry,
  type Instance,
  type Receiver,
  type Refusable,
  type Resolution,
} from "./messages.js";

/** `step.ts`'s `closureBound` (D-CASCADE): how many receivers one stimulus reaches, its cascades included; a semantic limit, not a guard bound. */
export const cascadeBound = closureBound;

function sameOccurrence(left: OccurrenceRef, right: OccurrenceRef): boolean {
  return left.processInstanceId === right.processInstanceId && left.element === right.element && left.activation === right.activation;
}

/** Whether two receivers are one. */
export function receiverSame(left: Receiver, right: Receiver): boolean {
  if (left.tag === ReceiverTag.Occurrence) return right.tag === ReceiverTag.Occurrence && sameOccurrence(left.ref, right.ref);
  return right.tag === ReceiverTag.Start && left.deploymentId === right.deploymentId && left.startEvent === right.startEvent;
}

/**
 * `listed` in the order a command's `order` gives, which must name each of them exactly once; without one, as listed
 * (population contract §6). `null` when the order is no such permutation (`discovery-order-mismatch`).
 */
export function inOrder<T>(receiver: (item: T) => Receiver, listed: readonly T[], order: readonly Receiver[] | null): readonly T[] | null {
  if (order === null) return listed;
  const once = listed.every((item) => order.filter((named) => receiverSame(named, receiver(item))).length === 1);
  if (order.length !== listed.length || !once) return null;
  return order.flatMap((named) => {
    const item = listed.find((candidate) => receiverSame(named, receiver(candidate)));
    return item === undefined ? [] : [item];
  });
}

/**
 * A Signal on its way to the population: its address and variables, the business key of the instances it starts, the
 * identity of the instance it starts at a deployment's start Event, and the State that threw it, which never receives
 * it again: its own receivers fired inside the throwing step (M7 OP-A).
 */
export type Emission = Readonly<{
  address: SignalAddress;
  variables: readonly Binding[];
  businessKey: string | null;
  startedId: (deploymentId: number, startEvent: string) => string;
  emitter: string | null;
}>;

/**
 * The receivers of `emission` when its delivery begins (population contract §6), each with the program it runs: the
 * open Signal items of its address in running instances other than the emitter's, by process instance identifier, then
 * arming order; then the root Signal starts of its address in each key's current deployment, in deploy order, then
 * document order. A receiver armed later in the delivery is not reached.
 */
export function receiversOf(
  hooks: Hooks,
  registry: readonly Deployment[],
  instances: readonly Instance[],
  emission: Emission,
): readonly (readonly [Receiver, Program])[] {
  const waiting = instances.flatMap((member) => {
    if (member.state.status !== InstanceStatus.Running || emission.emitter === member.state.instanceId) return [];
    return member.state.openItems.flatMap((item) => {
      const signal = openKindView(item.kind).signal;
      if (signal === null || !signalAddressMatches(emission.address, signal.address)) return [];
      return [[instanceOf(member.state, item.scope), item.id, occurrence(member.deployment.program, member.state, item),
        member.deployment.program] as const];
    });
  });
  const ordered = mergeSort(waiting, ([leftInstance, leftItem], [rightInstance, rightItem]) =>
    compareStrings(leftInstance, rightInstance) < 0 || (leftInstance === rightInstance && leftItem <= rightItem));
  const starts = currentDeployments(registry).flatMap((deployment) => {
    const ctx = context(hooks, deployment.program);
    return programChildren(deployment.program, null).flatMap((element) => {
      const started = elementStart(element);
      if (started === null) return [];
      const probe: StartInput = {
        instanceId: "", startEvent: started[0].id, variables: [], businessKey: null, atMs: null,
        trigger: { tag: StartTriggerTag.Signal, address: emission.address, variables: emission.variables },
      };
      const fired = hooks.startsFired(ctx, probe);
      if (!fired.ok || fired.value.length === 0) return [];
      const receiver: Receiver = { tag: ReceiverTag.Start, deploymentId: deployment.deploymentId, startEvent: programPublicId(deployment.program, started[0].id) };
      return [[receiver, deployment.program] as const];
    });
  });
  return [...ordered.map(([, , ref, program]) => [{ tag: ReceiverTag.Occurrence, ref } as Receiver, program] as const), ...starts];
}

/**
 * The emission of the intent a committed step of `state`, an instance of `program`, left in the cascade the command
 * `commandId` began: the instances it starts are named after the throw's own occurrence (`cascadeInstanceId`).
 */
export function intentEmission(commandId: string, program: Program, state: State, intent: BroadcastIntent): Emission {
  const emitter = { ...intent.origin, element: programPublicId(program, intent.origin.element) };
  return {
    address: intent.address, variables: intent.variables, businessKey: intent.businessKey,
    startedId: (deploymentId, startEvent) => cascadeInstanceId(commandId, deploymentId, startEvent, emitter),
    emitter: state.instanceId,
  };
}

/** An intent's emission and its receivers when its delivery begins. */
export function intentReceivers(
  hooks: Hooks,
  registry: readonly Deployment[],
  commandId: string,
  instances: readonly Instance[],
  program: Program,
  state: State,
  intent: BroadcastIntent,
): readonly [Emission, readonly Receiver[]] {
  const emission = intentEmission(commandId, program, state, intent);
  return [emission, receiversOf(hooks, registry, instances, emission).map(([receiver]) => receiver)];
}

/** Lean's `List` built newest first: adding an entry shares the rest. */
type Entries = Readonly<{ head: FanOutEntry; tail: Entries }> | null;

/**
 * A fan-out in progress: the population's instances, the entries so far, newest first so that adding one costs the same
 * however long a cascade runs, how many receivers it may still reach and whether the cascade bound stopped it.
 */
export type Fanning = Readonly<{ instances: readonly Instance[]; reversed: Entries; budget: number; stopped: boolean }>;

export function fanningOf(instances: readonly Instance[], budget = cascadeBound): Fanning {
  return { instances, reversed: null, budget, stopped: false };
}

export function fanningAdd(fanning: Fanning, entry: FanOutEntry): Fanning {
  return { ...fanning, reversed: { head: entry, tail: fanning.reversed } };
}

/** The entries in the order the fan-out reached them. */
export function fanningEntries(fanning: Fanning): readonly FanOutEntry[] {
  const entries: FanOutEntry[] = [];
  for (let at = fanning.reversed; at !== null; at = at.tail) entries.push(at.head);
  return entries.reverse();
}

/** Stop at `receiver`: the cascade bound is reached, receivers already committed stay committed. */
export function fanningStop(fanning: Fanning, receiver: Receiver): Fanning {
  const failure = { tag: FailureTag.Unsupported, code: "population-cascade-bound" } as const;
  return { ...fanningAdd(fanning, { tag: FanOutEntryTag.Failed, target: receiver, failure }), stopped: true };
}

/** Spend one of the fan-out's receivers on `receiver`: `false` when the fan-out has stopped or stops now at it. */
export function fanningSpend(fanning: Fanning, receiver: Receiver): readonly [Fanning, boolean] {
  if (fanning.stopped) return [fanning, false];
  if (fanning.budget === 0) return [fanningStop(fanning, receiver), false];
  return [{ ...fanning, budget: fanning.budget - 1 }, true];
}

type Reached = readonly [Fanning, readonly [State, Program] | null];

/**
 * Reach one receiver at `atMs`. An occurrence still open in a running instance takes a broadcast delivery, one gone
 * since the snapshot is `skipped`, read off the open items and never off a Step failure (R8); a start starts its
 * instance. Answers the fan-out with the receiver's entry and, when it committed, its State and program, whose intents
 * cascade.
 */
export function reach(
  hooks: Hooks,
  registry: readonly Deployment[],
  atMs: number,
  fanning: Fanning,
  emission: Emission,
  receiver: Receiver,
): Refusable<Reached> {
  if (receiver.tag === ReceiverTag.Occurrence) {
    const target = receiver.ref;
    const index = fanning.instances.findIndex((member) => member.state.status === InstanceStatus.Running &&
      member.state.openItems.some((item) => {
        const signal = openKindView(item.kind).signal;
        return signal !== null && signalAddressMatches(emission.address, signal.address) &&
          sameOccurrence(occurrence(member.deployment.program, member.state, item), target);
      }));
    const member = fanning.instances[index];
    if (index < 0) return { ok: true, value: [fanningAdd(fanning, { tag: FanOutEntryTag.Skipped, target }), null] };
    if (member === undefined) return { ok: false, error: "receiver-without-instance" };
    const stepped = step(hooks, member.deployment.program, member.state, {
      tag: InputTag.Deliver,
      payload: {
        occurrence: target, trigger: { tag: DeliveryTriggerTag.Signal, address: emission.address, reach: SignalReach.Broadcast },
        correlation: [], payload: null, variables: emission.variables, atMs,
      },
    });
    if (!stepped.ok) return { ok: true, value: [fanningAdd(fanning, { tag: FanOutEntryTag.Failed, target: receiver, failure: stepped.failure }), null] };
    const instances = fanning.instances.map((other, at) => (at === index ? { ...member, state: stepped.value } : other));
    return { ok: true, value: [{ ...fanningAdd(fanning, { tag: FanOutEntryTag.Delivered, target }), instances }, [stepped.value, member.deployment.program]] };
  }
  const deployment = registry.find((candidate) => candidate.deploymentId === receiver.deploymentId);
  if (deployment === undefined) return { ok: false, error: "receiver-without-deployment" };
  const program = deployment.program;
  const header = programChildren(program, null).flatMap((element) => {
    const started = elementStart(element);
    return started !== null && programPublicId(program, started[0].id) === receiver.startEvent ? [started[0]] : [];
  })[0];
  if (header === undefined) return { ok: false, error: "receiver-without-start" };
  const started = startInstance(hooks, deployment, receiver.startEvent, {
    instanceId: emission.startedId(receiver.deploymentId, receiver.startEvent), startEvent: header.id, variables: [],
    trigger: { tag: StartTriggerTag.Signal, address: emission.address, variables: emission.variables },
    businessKey: emission.businessKey, atMs,
  });
  if (!started.ok) return started;
  const [instance, entry] = started.value;
  const added = fanningAdd(fanning, entry);
  if (instance === null) return { ok: true, value: [added, null] };
  return { ok: true, value: [{ ...added, instances: [...fanning.instances, instance] }, [instance.state, program]] };
}

/**
 * What a fan-out still has to do: reach a receiver, or take the snapshot of an intent a committed step left and reach
 * its receivers.
 */
export enum PendingTag {
  Receiver = "receiver",
  Intent = "intent",
}

export type Pending =
  | Readonly<{ tag: PendingTag.Receiver; emission: Emission; receiver: Receiver }>
  | Readonly<{ tag: PendingTag.Intent; program: Program; state: State; intent: BroadcastIntent }>;

/**
 * Enough items for any fan-out: it takes at most `cascadeBound + 1` receivers, the last stopping it, of which at most
 * `cascadeBound` commit, and each committed step, the one that began the fan-out included, leaves at most one intent per
 * micro-step, so at most `closureBound + 1`.
 */
export const pendingFuel = (cascadeBound + 1) * (closureBound + 2);

/**
 * Work off `pending` in order, each receiver its own unit of commitment (population contract §5): a committed
 * receiver's intents go first, depth-first, each taking its snapshot when its own delivery begins, before the next
 * receiver. Past `cascadeBound` receivers the fan-out stops with `failed {receiver, unsupported,
 * population-cascade-bound}` and the rest is dropped. A stack, not recursion per intent, so a long cascade needs no deep
 * call stack.
 */
export function fanOut(
  hooks: Hooks,
  registry: readonly Deployment[],
  commandId: string,
  atMs: number,
  start: Fanning,
  pending: readonly Pending[],
): Refusable<Fanning> {
  let fanning = start;
  const stack = [...pending].reverse();
  for (let fuel = pendingFuel; ; fuel -= 1) {
    const next = stack.pop();
    if (next === undefined) return { ok: true, value: fanning };
    // `pendingFuel` bounds every fan-out, so running out of it is a harness defect.
    if (fuel === 0) return { ok: false, error: "population-fan-out-fuel" };
    if (next.tag === PendingTag.Intent) {
      const [emission, receivers] = intentReceivers(hooks, registry, commandId, fanning.instances, next.program, next.state, next.intent);
      for (const receiver of [...receivers].reverse()) stack.push({ tag: PendingTag.Receiver, emission, receiver });
      continue;
    }
    const [spent, reachable] = fanningSpend(fanning, next.receiver);
    if (!reachable) return { ok: true, value: spent };
    const reached = reach(hooks, registry, atMs, spent, next.emission, next.receiver);
    if (!reached.ok) return reached;
    const [after, committed] = reached.value;
    fanning = after;
    if (committed === null) continue;
    const [state, program] = committed;
    for (const intent of [...state.outbox].reverse()) stack.push({ tag: PendingTag.Intent, program, state, intent });
  }
}

/** Deliver the intents a committed step of `state`, an instance of `program`, left, in the cascade `commandId` began. */
export function cascade(
  hooks: Hooks,
  registry: readonly Deployment[],
  commandId: string,
  atMs: number,
  start: Fanning,
  state: State,
  program: Program,
): Refusable<Fanning> {
  return fanOut(hooks, registry, commandId, atMs, start, state.outbox.map((intent) => ({ tag: PendingTag.Intent, program, state, intent })));
}

/**
 * A single start's resolution followed by the cascade of the intents its instance's start step left, for the commands
 * that start at most one instance (`publish`, `timerStart`); every other resolution as it is.
 */
export function cascadeStarted(
  hooks: Hooks,
  registry: readonly Deployment[],
  commandId: string,
  atMs: number,
  instances: readonly Instance[],
  resolution: Resolution,
): Refusable<readonly [readonly Instance[], Resolution]> {
  const only = resolution.tag === ResolutionTag.FanOut && resolution.entries.length === 1 ? resolution.entries[0] : undefined;
  if (only === undefined || only.tag !== FanOutEntryTag.Started) return { ok: true, value: [instances, resolution] };
  const member = instances.find((candidate) => candidate.state.instanceId === only.instanceId);
  if (member === undefined) return { ok: false, error: "started-without-instance" };
  const settled = cascade(hooks, registry, commandId, atMs, fanningOf(instances, cascadeBound - 1), member.state, member.deployment.program);
  if (!settled.ok) return settled;
  return { ok: true, value: [settled.value.instances, { tag: ResolutionTag.FanOut, entries: [only, ...fanningEntries(settled.value)] }] };
}

/**
 * Broadcast a Signal at `atMs` (PC-SIGNAL-04): every receiver of its address in the snapshot, in the command's `order`
 * or the defined linearization, each its own unit of commitment, the instances it starts named after the command
 * (`startedInstanceId`) and carrying no business key. A broadcast with variables that reaches a program under
 * `signalPayload = none` is `rejected broadcast-variables-not-admitted` before any receiver, an `order` that is no
 * permutation of the snapshot `rejected discovery-order-mismatch`.
 */
export function broadcast(
  hooks: Hooks,
  registry: readonly Deployment[],
  instances: readonly Instance[],
  atMs: number,
  sent: Broadcast,
): Refusable<readonly [readonly Instance[], Resolution]> {
  const emission: Emission = {
    address: sent.address, variables: sent.variables, businessKey: null,
    startedId: (deploymentId, startEvent) => startedInstanceId(sent.commandId, deploymentId, startEvent), emitter: null,
  };
  const snapshot = receiversOf(hooks, registry, instances, emission);
  const rejected = (code: string): Refusable<readonly [readonly Instance[], Resolution]> =>
    ({ ok: true, value: [instances, { tag: ResolutionTag.Rejected, code }] });
  if (sent.variables.length > 0 && snapshot.some(([, program]) => program.options.signalPayload === SignalPayload.None)) {
    return rejected("broadcast-variables-not-admitted");
  }
  const ordered = inOrder(([receiver]) => receiver, snapshot, sent.order);
  if (ordered === null) return rejected("discovery-order-mismatch");
  const fanned = fanOut(hooks, registry, sent.commandId, atMs, fanningOf(instances),
    ordered.map(([receiver]) => ({ tag: PendingTag.Receiver, emission, receiver })));
  if (!fanned.ok) return fanned;
  return { ok: true, value: [fanned.value.instances, { tag: ResolutionTag.FanOut, entries: fanningEntries(fanned.value) }] };
}
