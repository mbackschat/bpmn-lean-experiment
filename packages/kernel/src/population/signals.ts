/**
 * Population: Signal fan-out, transcribed from `Kernel/Population/Signals.lean`: a Signal reaches every receiver of the
 * population one at a time, each its own unit of commitment: an API broadcast, and the intent a committed step's throw
 * leaves, which cascades depth-first (PC-SIGNAL-04,
 * [specification](../../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts)).
 */
import { SignalPayload, assertNever, compareStrings, elementStart, mergeSort, programChildren, programPublicId, type Header, type Program } from "../il/types.js";
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
  type Failure,
  type Outcome,
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

/**
 * `step.ts`'s `closureBound` (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts): how many
 * receivers one stimulus reaches, its cascades included; a semantic limit, not a guard bound.
 */
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
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts). `null` when the order is no such permutation
 * (`discovery-order-mismatch`).
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
 * throw occurrence it left by public identifier, which names the instances it starts (`cascadeInstanceId`; without one,
 * `startedInstanceId` after the command), and the State that threw it, which never receives it again: its own receivers
 * fired inside the throwing step (CIB-OP-0019). Plain data, so a host can carry it in a fan-out in progress.
 */
export type Emission = Readonly<{
  address: SignalAddress;
  variables: readonly Binding[];
  businessKey: string | null;
  origin: OccurrenceRef | null;
  emitter: string | null;
}>;

/** The identity of the instance `emission` starts at `startEvent` of `deploymentId` in the fan-out `commandId` began. */
export function emissionStartedId(emission: Emission, commandId: string, deploymentId: number, startEvent: string): string {
  return emission.origin === null
    ? startedInstanceId(commandId, deploymentId, startEvent)
    : cascadeInstanceId(commandId, deploymentId, startEvent, emission.origin);
}

/** The emission of an intent a committed step of the instance `emitter` left, its origin by public identifier. */
export function intentEmission(emitter: string, intent: BroadcastIntent): Emission {
  return { address: intent.address, variables: intent.variables, businessKey: intent.businessKey, origin: intent.origin, emitter };
}

/**
 * The open Signal items of `address` in one instance's `state` of `program`, by process instance identifier (a called
 * instance's own), then arming order: none unless the instance is running, and none for the `emitter`'s own State. A
 * host asks it of each instance a delivery may reach.
 */
export function signalReceiversOf(
  program: Program,
  state: State,
  address: SignalAddress,
  emitter: string | null,
): readonly OccurrenceRef[] {
  if (state.status !== InstanceStatus.Running || emitter === state.instanceId) return [];
  const waiting = state.openItems.flatMap((item) => {
    const signal = openKindView(item.kind).signal;
    if (signal === null || !signalAddressMatches(address, signal.address)) return [];
    return [[instanceOf(state, item.scope), item.id, occurrence(program, state, item)] as const];
  });
  const ordered = mergeSort(waiting, ([leftInstance, leftItem], [rightInstance, rightItem]) =>
    compareStrings(leftInstance, rightInstance) < 0 || (leftInstance === rightInstance && leftItem <= rightItem));
  return ordered.map(([, , ref]) => ref);
}

/**
 * The root Signal starts of `program`, deployed as `deploymentId`, that a delivery of `address` carrying `variables`
 * fires (`Hooks.startsFired`), in document order. A start whose firing fails is a receiver too, so its start step records
 * the failure as its `failed` entry instead of the scan dropping it.
 */
export function signalStartReceivers(
  hooks: Hooks,
  deploymentId: number,
  program: Program,
  address: SignalAddress,
  variables: readonly Binding[],
): readonly Receiver[] {
  const ctx = context(hooks, program);
  return programChildren(program, null).flatMap((element) => {
    const started = elementStart(element);
    if (started === null) return [];
    const probe: StartInput = {
      instanceId: "", startEvent: started[0].id, variables: [], businessKey: null, atMs: null, conditionChoices: [],
      trigger: { tag: StartTriggerTag.Signal, address, variables },
    };
    const fired = hooks.startsFired(ctx, probe);
    if (fired.ok && fired.value.length === 0) return [];
    return [{ tag: ReceiverTag.Start, deploymentId, startEvent: programPublicId(program, started[0].id) } as Receiver];
  });
}

/**
 * The defined linearization of a delivery's snapshot
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts, CIB-INT-0030): the waiting receivers of every
 * instance by their process instance identifier, each instance's own in the order its list gives, then the start
 * receivers of each deployment in deploy order. No process instance identifier spans two instances' lists.
 */
export function linearizeReceivers(
  waiting: readonly (readonly [instanceId: string, receivers: readonly OccurrenceRef[]])[],
  starts: readonly (readonly [deploymentId: number, receivers: readonly Receiver[]])[],
): readonly Receiver[] {
  const occurrences = mergeSort(waiting.flatMap(([, refs]) => refs), (left, right) =>
    compareStrings(left.processInstanceId, right.processInstanceId) <= 0);
  const deployments = mergeSort(starts, ([left], [right]) => left <= right);
  return [
    ...occurrences.map((ref): Receiver => ({ tag: ReceiverTag.Occurrence, ref })),
    ...deployments.flatMap(([, receivers]) => receivers),
  ];
}

/**
 * The receivers of `emission` when its delivery begins: `signalReceiversOf` each instance and `signalStartReceivers`
 * each key's current deployment, linearized; and the programs of the instances and deployments it reaches. A receiver
 * armed later in the delivery is not reached.
 */
export function receiversOf(
  hooks: Hooks,
  registry: readonly Deployment[],
  instances: readonly Instance[],
  emission: Emission,
): readonly [readonly Receiver[], readonly Program[]] {
  const waiting = instances.map((member) =>
    [member, signalReceiversOf(member.deployment.program, member.state, emission.address, emission.emitter)] as const);
  const starts = currentDeployments(registry).map((deployment) =>
    [deployment, signalStartReceivers(hooks, deployment.deploymentId, deployment.program, emission.address, emission.variables)] as const);
  const reached = [
    ...waiting.filter(([, refs]) => refs.length > 0).map(([member]) => member.deployment.program),
    ...starts.filter(([, receivers]) => receivers.length > 0).map(([deployment]) => deployment.program),
  ];
  const linearized = linearizeReceivers(
    waiting.map(([member, refs]) => [member.state.instanceId, refs] as const),
    starts.map(([deployment, receivers]) => [deployment.deploymentId, receivers] as const));
  return [linearized, reached];
}

/**
 * What reaching an occurrence of one instance did: nothing when it is no longer a receiver of the address, read off the
 * open items and never off a Step failure (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts), else
 * the step of its broadcast delivery.
 */
export type OccurrenceReach = { readonly skipped: true } | { readonly skipped: false; readonly outcome: Outcome };

/**
 * Reach `target` in `state`, an instance of `program`, with a broadcast delivery of `address` at `atMs`: the only place
 * a delivery takes the `broadcast` reach.
 */
export function reachOccurrence(
  hooks: Hooks,
  program: Program,
  state: State,
  address: SignalAddress,
  variables: readonly Binding[],
  target: OccurrenceRef,
  atMs: number,
): OccurrenceReach {
  if (!signalReceiversOf(program, state, address, null).some((ref) => sameOccurrence(ref, target))) return { skipped: true };
  const outcome = step(hooks, program, state, {
    tag: InputTag.Deliver,
    payload: {
      occurrence: target, trigger: { tag: DeliveryTriggerTag.Signal, address, reach: SignalReach.Broadcast },
      correlation: [], payload: null, variables, atMs, conditionChoices: [],
    },
  });
  return { skipped: false, outcome };
}

/** A persistent stack, top first: Lean's `List`, so pushing and popping never copy. */
type Stack<T> = Readonly<{ head: T; tail: Stack<T> }> | null;

function pushAll<T>(items: readonly T[], onto: Stack<T>): Stack<T> {
  let stack = onto;
  for (let index = items.length - 1; index >= 0; index -= 1) stack = { head: items[index] as T, tail: stack };
  return stack;
}

function stackItems<T>(stack: Stack<T>): T[] {
  const items: T[] = [];
  for (let at = stack; at !== null; at = at.tail) items.push(at.head);
  return items;
}

export enum PendingTag {
  Receiver = "receiver",
  Intent = "intent",
}

/**
 * What a fan-out still has to do, first item first: reach a receiver, of a Signal's `emission` or, without one, one the
 * command names itself (a Conditional start); or take the snapshot of an intent the instance `emitter` left, its origin
 * by public identifier, and reach its receivers.
 */
export type Pending =
  | { readonly tag: PendingTag.Receiver; readonly emission: Emission | null; readonly receiver: Receiver }
  | { readonly tag: PendingTag.Intent; readonly emitter: string; readonly intent: BroadcastIntent };

/**
 * A fan-out in progress as plain data (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts): its
 * command, the work still to do, the entries so far, newest first so that adding one costs the same however long a
 * cascade runs, how many receivers it may still reach and whether the cascade bound stopped it.
 */
export type FanOutMachine = Readonly<{
  commandId: string;
  pending: Stack<Pending>;
  reversed: Stack<FanOutEntry>;
  budget: number;
  stopped: boolean;
}>;

export enum FanOutNextTag {
  Reach = "reach",
  Snapshot = "snapshot",
  Done = "done",
}

/**
 * The next thing a fan-out needs: a receiver reached, the snapshot of an intent the occurrence `emitter` threw taken, or
 * nothing more, with every entry.
 */
export type FanOutNext =
  | { readonly tag: FanOutNextTag.Reach; readonly receiver: Receiver; readonly emission: Emission | null }
  | { readonly tag: FanOutNextTag.Snapshot; readonly intent: BroadcastIntent; readonly emitter: OccurrenceRef; readonly emission: Emission }
  | { readonly tag: FanOutNextTag.Done; readonly entries: readonly FanOutEntry[] };

/** A fan-out of `commandId` over `root`, which may reach `budget` receivers. */
export function fanOutBegin(commandId: string, root: readonly Pending[], budget: number): FanOutMachine {
  return { commandId, pending: pushAll(root, null), reversed: null, budget, stopped: false };
}

/** The entries in the order the fan-out reached them. */
export function machineEntries(machine: FanOutMachine): readonly FanOutEntry[] {
  return stackItems(machine.reversed).reverse();
}

export function machineAdd(machine: FanOutMachine, entry: FanOutEntry): FanOutMachine {
  return { ...machine, reversed: { head: entry, tail: machine.reversed } };
}

/** Stop at `receiver`: the cascade bound is reached, receivers already committed stay committed. */
function machineStop(machine: FanOutMachine, receiver: Receiver): FanOutMachine {
  // dynamic-only: how far a cascade runs depends on the population and its run
  const failure: Failure = { tag: FailureTag.Unsupported, code: "population-cascade-bound" };
  return { ...machineAdd(machine, { tag: FanOutEntryTag.Failed, target: receiver, failure }), stopped: true, pending: null };
}

/** The machine stopped at its next receiver when no receiver is left to spend, else as it is. */
export function machineStopWhenSpent(machine: FanOutMachine): FanOutMachine {
  const next = machine.pending?.head;
  if (next === undefined || next.tag === PendingTag.Intent) return machine;
  return !machine.stopped && machine.budget === 0 ? machineStop(machine, next.receiver) : machine;
}

/**
 * What the fan-out needs next. Past `cascadeBound` receivers it is done, its last entry `failed {receiver, unsupported,
 * population-cascade-bound}`.
 */
export function fanOutNext(start: FanOutMachine): FanOutNext {
  const machine = machineStopWhenSpent(start);
  const next = machine.pending?.head;
  if (machine.stopped || next === undefined) return { tag: FanOutNextTag.Done, entries: machineEntries(machine) };
  if (next.tag === PendingTag.Receiver) return { tag: FanOutNextTag.Reach, receiver: next.receiver, emission: next.emission };
  return { tag: FanOutNextTag.Snapshot, intent: next.intent, emitter: next.intent.origin, emission: intentEmission(next.emitter, next.intent) };
}

/**
 * Take the snapshot of the intent `fanOutNext` named: its `receivers`, in `order` when given, which must name each of
 * them exactly once (`discovery-order-mismatch`), go first, before the rest.
 */
export function fanOutSnapshot(machine: FanOutMachine, receivers: readonly Receiver[], order: readonly Receiver[] | null): Refusable<FanOutMachine> {
  const next = machine.pending;
  if (next === null || next.head.tag !== PendingTag.Intent) return { ok: false, error: "fan-out-not-at-snapshot" };
  const ordered = inOrder((receiver: Receiver) => receiver, receivers, order);
  if (ordered === null) return { ok: false, error: "discovery-order-mismatch" };
  const emission = intentEmission(next.head.emitter, next.head.intent);
  const items = ordered.map((receiver): Pending => ({ tag: PendingTag.Receiver, emission, receiver }));
  return { ok: true, value: { ...machine, pending: pushAll(items, next.tail) } };
}

/**
 * Record the entry of the receiver `fanOutNext` named and the intents its committed step in the instance `emitter` left,
 * origins by public identifier: they go first, depth-first, before the next receiver.
 */
export function fanOutRecord(machine: FanOutMachine, entry: FanOutEntry, intents: readonly BroadcastIntent[], emitter: string): FanOutMachine {
  const next = machine.pending;
  if (next === null || next.head.tag !== PendingTag.Receiver) return machine;
  const items = intents.map((intent): Pending => ({ tag: PendingTag.Intent, emitter, intent }));
  return { ...machineAdd(machine, entry), budget: machine.budget - 1, pending: pushAll(items, next.tail) };
}

/**
 * Pass the receiver `fanOutNext` named: it takes one of the fan-out's receivers and records nothing, as a Conditional
 * start whose predicate does not hold.
 */
export function fanOutPass(machine: FanOutMachine): FanOutMachine {
  const next = machine.pending;
  if (next === null || next.head.tag !== PendingTag.Receiver) return machine;
  return { ...machine, budget: machine.budget - 1, pending: next.tail };
}

/** A fan-out over the population's instances. */
export type Fanning = Readonly<{ instances: readonly Instance[]; machine: FanOutMachine }>;

/** A fan-out of `commandId` over `instances` with nothing to do yet, which may reach `budget` receivers. */
export function fanningOf(commandId: string, instances: readonly Instance[], budget = cascadeBound): Fanning {
  return { instances, machine: fanOutBegin(commandId, [], budget) };
}

export function fanningEntries(fanning: Fanning): readonly FanOutEntry[] {
  return machineEntries(fanning.machine);
}

/** The intents a committed step of `state`, an instance of `program`, left, origins by public identifier. */
export function publicIntents(program: Program, state: State): readonly BroadcastIntent[] {
  return state.outbox.map((intent) => ({ ...intent, origin: { ...intent.origin, element: programPublicId(program, intent.origin.element) } }));
}

/**
 * What reaching one receiver did: the instances, the receiver's entry, `null` when it records nothing, and, when it
 * committed, its State and program, whose intents cascade.
 */
export type Reached = readonly [readonly Instance[], FanOutEntry | null, readonly [State, Program] | null];

/** The reach of a receiver the command names itself among `instances`. */
export type OwnReach = (instances: readonly Instance[], receiver: Receiver) => Refusable<Reached>;

/** The registered deployment `deploymentId` and its root start `startEvent`, by public identifier. */
export function rootStart(registry: readonly Deployment[], deploymentId: number, startEvent: string): Refusable<readonly [Deployment, Header]> {
  const deployment = registry.find((candidate) => candidate.deploymentId === deploymentId);
  if (deployment === undefined) return { ok: false, error: "receiver-without-deployment" };
  const program = deployment.program;
  const header = programChildren(program, null).flatMap((element) => {
    const started = elementStart(element);
    return started !== null && programPublicId(program, started[0].id) === startEvent ? [started[0]] : [];
  })[0];
  if (header === undefined) return { ok: false, error: "receiver-without-start" };
  return { ok: true, value: [deployment, header] };
}

/**
 * Reach one receiver of `emission` at `atMs` in the fan-out `commandId` began: an occurrence by `reachOccurrence` in the
 * instance it is waiting in, `skipped` when none still waits there; a start starts its instance.
 */
export function reachReceiver(
  hooks: Hooks,
  registry: readonly Deployment[],
  atMs: number,
  commandId: string,
  instances: readonly Instance[],
  emission: Emission,
  receiver: Receiver,
): Refusable<Reached> {
  if (receiver.tag === ReceiverTag.Occurrence) {
    const target = receiver.ref;
    for (const [index, member] of instances.entries()) {
      const reached = reachOccurrence(hooks, member.deployment.program, member.state, emission.address, emission.variables, target, atMs);
      if (reached.skipped) continue;
      const outcome = reached.outcome;
      if (!outcome.ok) return { ok: true, value: [instances, { tag: FanOutEntryTag.Failed, target: receiver, failure: outcome.failure }, null] };
      const stepped = instances.map((other, at) => (at === index ? { ...member, state: outcome.value } : other));
      return { ok: true, value: [stepped, { tag: FanOutEntryTag.Delivered, target }, [outcome.value, member.deployment.program]] };
    }
    return { ok: true, value: [instances, { tag: FanOutEntryTag.Skipped, target }, null] };
  }
  const found = rootStart(registry, receiver.deploymentId, receiver.startEvent);
  if (!found.ok) return found;
  const [deployment, header] = found.value;
  const program = deployment.program;
  const started = startInstance(hooks, deployment, receiver.startEvent, {
    instanceId: emissionStartedId(emission, commandId, receiver.deploymentId, receiver.startEvent), startEvent: header.id, variables: [],
    trigger: { tag: StartTriggerTag.Signal, address: emission.address, variables: emission.variables },
    businessKey: emission.businessKey, atMs, conditionChoices: [],
  });
  if (!started.ok) return started;
  const [instance, entry] = started.value;
  if (instance === null) return { ok: true, value: [instances, entry, null] };
  return { ok: true, value: [[...instances, instance], entry, [instance.state, program]] };
}

/**
 * Enough items for any fan-out: it takes at most `cascadeBound + 1` receivers, the last stopping it, of which at most
 * `cascadeBound` commit, and each committed step, the one that began the fan-out included, leaves at most one intent per
 * micro-step, so at most `closureBound + 1`.
 */
export const pendingFuel = (cascadeBound + 1) * (closureBound + 2);

/**
 * The reach of a receiver the command names itself, in a fan-out whose every receiver is a Signal's: there is none, so
 * reaching one is a harness defect.
 */
export const signalsOnly: OwnReach = () => ({ ok: false, error: "receiver-without-emission" });

/**
 * Take the snapshot or reach the receiver `next` names at `atMs`: a Signal's by `reachReceiver`, one the command names
 * itself by `own`; one that records nothing is passed.
 */
function fanOutStep(
  hooks: Hooks,
  registry: readonly Deployment[],
  atMs: number,
  own: OwnReach,
  fanning: Fanning,
  next: FanOutNext,
): Refusable<Fanning> {
  const machine = fanning.machine;
  switch (next.tag) {
    case FanOutNextTag.Done:
      return { ok: true, value: fanning };
    case FanOutNextTag.Snapshot: {
      const taken = fanOutSnapshot(machine, receiversOf(hooks, registry, fanning.instances, next.emission)[0], null);
      return taken.ok ? { ok: true, value: { ...fanning, machine: taken.value } } : taken;
    }
    case FanOutNextTag.Reach: {
      const reached = next.emission === null
        ? own(fanning.instances, next.receiver)
        : reachReceiver(hooks, registry, atMs, machine.commandId, fanning.instances, next.emission, next.receiver);
      if (!reached.ok) return reached;
      const [instances, entry, committed] = reached.value;
      if (entry === null) return { ok: true, value: { instances, machine: fanOutPass(machine) } };
      const [emitter, intents] = committed === null ? ["", []] as const : [committed[0].instanceId, publicIntents(committed[1], committed[0])] as const;
      return { ok: true, value: { instances, machine: fanOutRecord(machine, entry, intents, emitter) } };
    }
  }
  return assertNever(next);
}

/**
 * Run the fan-out's machine to its end at `atMs`, each receiver its own unit of commitment
 * (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts): a committed receiver's intents go first,
 * depth-first, each taking its snapshot (`receiversOf`) when its own delivery begins, before the next receiver. A
 * receiver of a Signal is reached by `reachReceiver`, one the command names itself by `own`; one that records nothing is
 * passed. The work list is the machine's, so a long cascade needs no deep call stack.
 */
export function fanOut(hooks: Hooks, registry: readonly Deployment[], atMs: number, own: OwnReach, start: Fanning): Refusable<Fanning> {
  let fanning = start;
  for (let fuel = pendingFuel; ; fuel -= 1) {
    const machine = machineStopWhenSpent(fanning.machine);
    fanning = { ...fanning, machine };
    const next = fanOutNext(machine);
    if (next.tag === FanOutNextTag.Done) return { ok: true, value: fanning };
    // `pendingFuel` bounds every fan-out, so running out of it is a harness defect.
    if (fuel === 0) return { ok: false, error: "population-fan-out-fuel" };
    const stepped = fanOutStep(hooks, registry, atMs, own, fanning, next);
    if (!stepped.ok) return stepped;
    fanning = stepped.value;
  }
}

/** Deliver the intents a committed step of `state`, an instance of `program`, left, before the fan-out's other work. */
export function cascade(hooks: Hooks, registry: readonly Deployment[], atMs: number, fanning: Fanning, state: State, program: Program): Refusable<Fanning> {
  const items = publicIntents(program, state).map((intent): Pending => ({ tag: PendingTag.Intent, emitter: state.instanceId, intent }));
  return fanOut(hooks, registry, atMs, signalsOnly, { ...fanning, machine: { ...fanning.machine, pending: pushAll(items, fanning.machine.pending) } });
}

/**
 * The cascade of the intents the last committed step of the instance `instanceId` left, which may reach `budget`
 * receivers, in the cascade `commandId` began.
 */
export function cascadeOf(
  hooks: Hooks,
  registry: readonly Deployment[],
  commandId: string,
  atMs: number,
  budget: number,
  instances: readonly Instance[],
  instanceId: string,
): Refusable<Fanning> {
  const member = instances.find((candidate) => candidate.state.instanceId === instanceId);
  if (member === undefined) return { ok: false, error: "cascade-without-instance" };
  return cascade(hooks, registry, atMs, fanningOf(commandId, instances, budget), member.state, member.deployment.program);
}

/**
 * A command's resolution followed by the cascade of the intents its one committed step left, after that step: a
 * delivery's (`delivered` names its root instance) into `committed`'s `cascade`, a single start's into its `fanOut`, for
 * the commands that deliver or start at most once (`publish`, `timerStart`); every other resolution as it is. A start's
 * cascade may reach `cascadeBound - 1` receivers, since its `started` entry is itself one the bound counts, and a
 * delivery's target is not.
 */
export function cascadeCommitted(
  hooks: Hooks,
  registry: readonly Deployment[],
  commandId: string,
  atMs: number,
  instances: readonly Instance[],
  resolution: Resolution,
  delivered: string | null,
): Refusable<readonly [readonly Instance[], Resolution]> {
  switch (resolution.tag) {
    case ResolutionTag.Committed: {
      if (delivered === null) return { ok: false, error: "delivery-without-instance" };
      const settled = cascadeOf(hooks, registry, commandId, atMs, cascadeBound, instances, delivered);
      if (!settled.ok) return settled;
      return { ok: true, value: [settled.value.instances, { ...resolution, cascade: fanningEntries(settled.value) }] };
    }
    case ResolutionTag.FanOut: {
      const only = resolution.entries.length === 1 ? resolution.entries[0] : undefined;
      if (only === undefined || only.tag !== FanOutEntryTag.Started) return { ok: true, value: [instances, resolution] };
      const settled = cascadeOf(hooks, registry, commandId, atMs, cascadeBound - 1, instances, only.instanceId);
      if (!settled.ok) return settled;
      return { ok: true, value: [settled.value.instances, { tag: ResolutionTag.FanOut, entries: [only, ...fanningEntries(settled.value)] }] };
    }
    case ResolutionTag.Failed:
    case ResolutionTag.NoMatch:
    case ResolutionTag.Ambiguous:
    case ResolutionTag.Rejected:
    case ResolutionTag.Unsupported:
      return { ok: true, value: [instances, resolution] };
  }
  return assertNever(resolution);
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
  const emission: Emission = { address: sent.address, variables: sent.variables, businessKey: null, origin: null, emitter: null };
  const [snapshot, programs] = receiversOf(hooks, registry, instances, emission);
  const rejected = (code: string): Refusable<readonly [readonly Instance[], Resolution]> =>
    ({ ok: true, value: [instances, { tag: ResolutionTag.Rejected, code }] });
  if (sent.variables.length > 0 && programs.some((program) => program.options.signalPayload === SignalPayload.None)) {
    return rejected("broadcast-variables-not-admitted");
  }
  const ordered = inOrder((receiver: Receiver) => receiver, snapshot, sent.order);
  if (ordered === null) return rejected("discovery-order-mismatch");
  const root = ordered.map((receiver): Pending => ({ tag: PendingTag.Receiver, emission, receiver }));
  const fanned = fanOut(hooks, registry, atMs, signalsOnly, { instances, machine: fanOutBegin(sent.commandId, root, cascadeBound) });
  if (!fanned.ok) return fanned;
  return { ok: true, value: [fanned.value.instances, { tag: ResolutionTag.FanOut, entries: fanningEntries(fanned.value) }] };
}
