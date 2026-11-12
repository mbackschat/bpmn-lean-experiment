/**
 * Binds the host's `PopulationPort` to the TypeScript kernel's population layer, beside `kernel-port.ts` the only
 * module of this package that imports the kernel. Kernel values cross the port in the continuation codec's form
 * (`wire-codec.ts`), so the ingress carries them through Updates, Activities and Continue-As-New without reading them.
 *
 * A fan-out machine's work list and entries are persistent stacks; on the wire they are flat arrays, so the depth of an
 * encoded machine never grows with its stack.
 */
import {
  CommandTag,
  DefinitionSelectorTag,
  DeliveryTriggerTag,
  FailureTag,
  FanOutEntryTag,
  FanOutNextTag,
  InputTag,
  MessageAddressTag,
  PendingTag,
  PublishMode,
  ReceiverTag,
  ResolutionTag,
  SignalReach,
  StartTriggerTag,
  cascadeBound,
  channelToJson,
  conditionalStartVerdict,
  criteriaRefusal,
  currentSummary,
  definitionCapabilities,
  deploymentSummary,
  emissionStartedId,
  fanOutBegin,
  fanOutEntryJson,
  fanOutNext,
  fanOutPass,
  fanOutRecord,
  fanOutSnapshot,
  hooks,
  hostView,
  inOrder,
  linearizeReceivers,
  messageReceivers,
  messageStartCandidates,
  populationCommandFromJson,
  reachOccurrence,
  refusesSignalVariables,
  registerSummary,
  resolutionJson,
  rootStarts,
  signalAddressToJson,
  signalReceiversOf,
  signalStartReceivers,
  startCriteriaRefusal,
  startedInstanceId,
  step,
  timerInstanceId,
  timerStartCheck,
  type Binding,
  type BroadcastIntent,
  type Command,
  type DefinitionSelector,
  type DeploymentSummary,
  type Emission,
  type FanOutEntry,
  type FanOutMachine,
  type Failure,
  type MessageChannel,
  type OccurrenceRef,
  type Outcome,
  type Pending,
  type Program,
  type Publication,
  type Receiver,
  type Resolution,
  type SignalAddress,
  type StartInput,
  type StartTrigger,
  type State,
  type Value,
} from "@bpmn-lean/kernel";

import { assertNever } from "./host-machine.js";
import { fanOutCapacityCode } from "./population.js";
import type {
  CommandView, FanOutStep, JsonValue, PopulationPort, PopulationStep, ReceiverView, RefusalParts, ResolutionParts, SelectorView, Wire,
} from "./port.js";
import { fromWire, toWire } from "./wire-codec.js";

/** The kernel's own stop code of a fan-out past its cascade bound (`Kernel.Population.Signals.machineStop`). */
const kernelStopCode = "population-cascade-bound";

/** A delivery the ingress hands a chain: a Signal's broadcast reach, or a publication's Message delivery. */
type Delivery =
  | Readonly<{ signal: Readonly<{ address: SignalAddress; variables: readonly Binding[]; target: OccurrenceRef }> }>
  | Readonly<{ message: Readonly<{ target: OccurrenceRef; channel: MessageChannel; publication: Publication }> }>;

/** A start the ingress asks a new chain to make; a Timer start's trigger takes the chain's logical time. */
type StartRequest = Readonly<{
  startEvent: string;
  instanceId: string;
  variables: readonly Binding[];
  businessKey: string | null;
  trigger: StartTrigger | null;
}>;

/** A fan-out machine on the wire: its stacks as arrays, top first. */
type FlatMachine = Readonly<{ commandId: string; pending: readonly Pending[]; reversed: readonly FanOutEntry[]; budget: number; stopped: boolean }>;

type Stack<T> = Readonly<{ head: T; tail: Stack<T> }> | null;

function stackOf<T>(items: readonly T[]): Stack<T> {
  let stack: Stack<T> = null;
  for (let index = items.length - 1; index >= 0; index -= 1) stack = { head: items[index] as T, tail: stack };
  return stack;
}

function itemsOf<T>(stack: Stack<T>): T[] {
  const items: T[] = [];
  for (let at = stack; at !== null; at = at.tail) items.push(at.head);
  return items;
}

/** A machine's wire form; `machineFromWire` inverts it. */
export function machineToWire(machine: FanOutMachine): Wire {
  const flat: FlatMachine = {
    commandId: machine.commandId,
    pending: itemsOf(machine.pending as Stack<Pending>),
    reversed: itemsOf(machine.reversed as Stack<FanOutEntry>),
    budget: machine.budget,
    stopped: machine.stopped,
  };
  return toWire(flat);
}

export function machineFromWire(wire: Wire): FanOutMachine {
  const flat = fromWire(wire) as FlatMachine;
  return { ...flat, pending: stackOf(flat.pending), reversed: stackOf(flat.reversed) } as FanOutMachine;
}

const decode = <T>(wire: Wire): T => fromWire(wire) as T;

function reference(ref: OccurrenceRef): ReceiverView {
  return { kind: "occurrence", occurrence: { processInstanceId: ref.processInstanceId, elementId: ref.element, activation: ref.activation } };
}

function receiverView(receiver: Receiver): ReceiverView {
  switch (receiver.tag) {
    case ReceiverTag.Occurrence: return reference(receiver.ref);
    case ReceiverTag.Start: return { kind: "start", deploymentId: receiver.deploymentId, startEvent: receiver.startEvent };
  }
  return assertNever(receiver);
}

function selectorView(selector: DefinitionSelector | null): SelectorView | null {
  if (selector === null) return null;
  switch (selector.tag) {
    case DefinitionSelectorTag.ProcessKey: return { processKey: selector.key };
    case DefinitionSelectorTag.Deployment: return { deploymentId: selector.deploymentId };
  }
  return assertNever(selector);
}

function commandView(command: Command): CommandView {
  switch (command.tag) {
    case CommandTag.Publish: {
      const publication = command.publication;
      const message = publication.message;
      return {
        kind: "publish",
        commandId: publication.commandId,
        definition: selectorView(publication.definition),
        executions: publication.mode !== PublishMode.StartOnly,
        starts: publication.mode !== PublishMode.ExecutionsOnly,
        channel: message.tag === MessageAddressTag.Channel ? channelToJson(message.channel) as JsonValue : null,
        name: message.tag === MessageAddressTag.Name ? message.name : null,
      };
    }
    case CommandTag.Broadcast: {
      const sent = command.broadcast;
      return { kind: "broadcast", commandId: sent.commandId, address: signalAddressToJson(sent.address), hasVariables: sent.variables.length > 0 };
    }
    case CommandTag.EvaluateConditions:
      return { kind: "evaluateConditions", commandId: command.evaluation.commandId, definition: selectorView(command.evaluation.definition) };
    case CommandTag.TimerStart: {
      const fired = command.timerStart;
      return { kind: "timerStart", commandId: fired.commandId, deploymentId: fired.deploymentId, startEvent: fired.startEvent, dueMs: fired.dueMs };
    }
  }
  return assertNever(command);
}

/**
 * `entries` as the host answers them: when the fan-out stopped at its budget and that budget, the host's, is below the
 * kernel's cascade bound, the stop entry's code is the host's capacity, since the kernel would have gone on; a stop at
 * the kernel's own bound keeps the kernel's code.
 */
export function hostCapacityEntries(entries: readonly FanOutEntry[], stopped: boolean, budget: number): readonly FanOutEntry[] {
  const last = entries.at(-1);
  if (!stopped || budget >= cascadeBound || last === undefined || last.tag !== FanOutEntryTag.Failed) return entries;
  return [...entries.slice(0, -1), { ...last, failure: { tag: FailureTag.Unsupported, code: fanOutCapacityCode } }];
}

/** Whether a finished fan-out stopped at its bound: its last entry is the stop `machineStop` records. */
function stoppedAtBound(entries: readonly FanOutEntry[]): boolean {
  const last = entries.at(-1);
  return last !== undefined && last.tag === FanOutEntryTag.Failed && last.failure.tag === FailureTag.Unsupported &&
    last.failure.code === kernelStopCode;
}

function nextStep(machine: FanOutMachine): FanOutStep {
  const next = fanOutNext(machine);
  switch (next.tag) {
    case FanOutNextTag.Reach:
      return {
        kind: "reach", receiver: toWire(next.receiver), view: receiverView(next.receiver),
        emission: next.emission === null ? null : toWire(next.emission),
      };
    case FanOutNextTag.Snapshot:
      return { kind: "snapshot", address: signalAddressToJson(next.emission.address), emission: toWire(next.emission), emitter: next.emission.emitter };
    case FanOutNextTag.Done:
      return { kind: "done", entries: next.entries.map(toWire), stopped: stoppedAtBound(next.entries) };
  }
  return assertNever(next);
}

function populationStep(outcome: Outcome): PopulationStep<State> {
  return outcome.ok ? { kind: "committed", state: outcome.value } : { kind: "failed", failure: toWire(outcome.failure) };
}

function parts(resolution: ResolutionParts): Resolution {
  const entries = (wires: readonly Wire[]): readonly FanOutEntry[] => wires.map((wire) => decode<FanOutEntry>(wire));
  switch (resolution.kind) {
    case "committed":
      return { tag: ResolutionTag.Committed, target: decode<OccurrenceRef>(resolution.target), cascade: entries(resolution.cascade) };
    case "failed":
      return { tag: ResolutionTag.Failed, target: decode<OccurrenceRef>(resolution.target), failure: decode<Failure>(resolution.failure) };
    case "fanOut": return { tag: ResolutionTag.FanOut, entries: entries(resolution.entries) };
    case "noMatch": return { tag: ResolutionTag.NoMatch };
    case "ambiguous": return { tag: ResolutionTag.Ambiguous };
    case "rejected": return { tag: ResolutionTag.Rejected, code: resolution.code };
    case "unsupported": return { tag: ResolutionTag.Unsupported, code: resolution.code };
  }
  return assertNever(resolution);
}

/** The emission of an API broadcast: no business key, origin or emitter (`Kernel.Population.Signals.broadcast`). */
function broadcastEmission(command: Wire): Emission {
  const issued = decode<Command>(command);
  if (issued.tag !== CommandTag.Broadcast) throw new TypeError("not a broadcast");
  const sent = issued.broadcast;
  return { address: sent.address, variables: sent.variables, businessKey: null, origin: null, emitter: null };
}

function rootStart(program: Program, publicStart: string) {
  const found = rootStarts(program).find(([named]) => named === publicStart);
  if (found === undefined) throw new TypeError(`no root start Event is published as ${publicStart}`);
  return found[1];
}

function startRequest(request: StartRequest): Wire {
  return toWire(request);
}

/** A publication's criteria refusal as resolution parts; the kernel's criteria refusals only reject or refuse as
 * unsupported, as `publish` relies on too. */
/** A publication's command-level refusal; it only rejects or refuses as unsupported, so another failure is a defect. */
function refusalParts(refusal: Failure): RefusalParts {
  switch (refusal.tag) {
    case FailureTag.Rejected: return { kind: "rejected", code: refusal.code };
    case FailureTag.Unsupported: return { kind: "unsupported", code: refusal.code };
    case FailureTag.RolledBack:
    case FailureTag.SemanticFailure:
      throw new TypeError(`publication refusal ${refusal.code} is not command-level`);
  }
  return assertNever(refusal.tag);
}

const criteriaRefusalParts = (refusal: Failure | null): ResolutionParts | null => refusal === null ? null : refusalParts(refusal);

export const populationPort: PopulationPort<Program, State, FanOutMachine> = {
  decodeCommand: (kind, json) => {
    let command: Command | null;
    try {
      command = populationCommandFromJson(kind, json, "population command");
    } catch (error) {
      throw new TypeError(error instanceof Error ? error.message : String(error));
    }
    if (command === null) throw new TypeError(`no population command is named ${kind}`);
    return { view: commandView(command), command: toWire(command) };
  },
  deploymentSummary: (program) => toWire(deploymentSummary(program)),
  registerSummary: (registry, deploymentId, candidate, atMs) => {
    const summaries = registry.map((wire) => decode<DeploymentSummary>(wire));
    const summary = decode<DeploymentSummary>(candidate);
    const registered = registerSummary(summaries, deploymentId, summary);
    if (!registered.ok) return { refused: registered.error };
    const { versions } = registered.value;
    return { summary: toWire({ ...summary, deploymentId, versions, deployedAtMs: atMs }), key: summary.key, versions };
  },
  currentDeployments: (registry) => {
    const summaries = registry.map((wire) => decode<DeploymentSummary>(wire));
    const keys = [...new Set(summaries.map((summary) => summary.key))];
    return summaries.filter((summary) => keys.some((key) => currentSummary(summaries, key)?.deploymentId === summary.deploymentId))
      .map((summary) => summary.deploymentId);
  },
  publicationRefusal: (registry, command) => {
    const issued = decode<Command>(command);
    if (issued.tag !== CommandTag.Publish) throw new TypeError("not a publication");
    const readings = registry.map((wire) => decode<DeploymentSummary>(wire).messageCorrelation);
    return criteriaRefusalParts(criteriaRefusal(readings, issued.publication.mode === PublishMode.StartOnly, issued.publication.criteria));
  },
  startRefusal: (summary, command) => {
    const issued = decode<Command>(command);
    if (issued.tag !== CommandTag.Publish) throw new TypeError("not a publication");
    return criteriaRefusalParts(startCriteriaRefusal(decode<DeploymentSummary>(summary).messageCorrelation, issued.publication.criteria));
  },
  timerStartCheck: (registry, deploymentId, startEvent, dueMs, atMs, consumed) =>
    timerStartCheck(registry.map((wire) => decode<DeploymentSummary>(wire)), deploymentId, startEvent, dueMs, atMs, consumed),
  startedInstanceId,
  timerInstanceId,
  emissionStartedId: (emission, commandId, deploymentId, startEvent) =>
    emissionStartedId(decode<Emission>(emission), commandId, deploymentId, startEvent),
  linearize: (waiting, starts) => linearizeReceivers(
    waiting.map(([instanceId, refs]) => [instanceId, refs.map((ref) => decode<OccurrenceRef>(ref))] as const),
    starts.map(([deploymentId, receivers]) => [deploymentId, receivers.map((receiver) => decode<Receiver>(receiver))] as const),
  ).map(toWire),
  receiverView: (receiver) => receiverView(decode<Receiver>(receiver)),
  broadcastEmission: (command) => toWire(broadcastEmission(command)),
  broadcastBegin: (command, snapshot, budget) => {
    const emission = broadcastEmission(command);
    const sent = decode<Command & { tag: CommandTag.Broadcast }>(command).broadcast;
    const ordered = inOrder((receiver: Receiver) => receiver, snapshot.map((wire) => decode<Receiver>(wire)), sent.order);
    if (ordered === null) return null;
    return fanOutBegin(sent.commandId, ordered.map((receiver): Pending => ({ tag: PendingTag.Receiver, emission, receiver })), budget);
  },
  conditionsBegin: (command, starts, budget) => {
    const issued = decode<Command>(command);
    if (issued.tag !== CommandTag.EvaluateConditions) throw new TypeError("not a Conditional evaluation");
    const ordered = inOrder((receiver: Receiver) => receiver, starts.map((wire) => decode<Receiver>(wire)), issued.evaluation.order);
    if (ordered === null) return null;
    return fanOutBegin(issued.evaluation.commandId,
      ordered.map((receiver): Pending => ({ tag: PendingTag.Receiver, emission: null, receiver })), budget);
  },
  fanOutPass,
  cascadeBegin: (commandId, emitter, intents, budget) => fanOutBegin(commandId,
    intents.map((intent): Pending => ({ tag: PendingTag.Intent, emitter, intent: decode<BroadcastIntent>(intent) })), budget),
  fanOutNext: nextStep,
  fanOutSnapshot: (machine, receivers) => {
    const taken = fanOutSnapshot(machine, receivers.map((wire) => decode<Receiver>(wire)), null);
    if (!taken.ok) throw new TypeError(`fan-out snapshot: ${taken.error}`);
    return taken.value;
  },
  fanOutRecord: (machine, entry, intents, emitter) => fanOutRecord(machine, decode<FanOutEntry>(entry),
    intents.map((intent) => decode<BroadcastIntent>(intent)), emitter),
  machineWire: machineToWire,
  machineOf: machineFromWire,
  occurrenceReceiver: (target) => toWire({ tag: ReceiverTag.Occurrence, ref: decode<OccurrenceRef>(target) } satisfies Receiver),
  receiverTarget: (receiver) => {
    const decoded = decode<Receiver>(receiver);
    if (decoded.tag !== ReceiverTag.Occurrence) throw new TypeError("a start receiver has no target occurrence");
    return toWire(decoded.ref);
  },
  startReceiver: (deploymentId, startEvent) => toWire({ tag: ReceiverTag.Start, deploymentId, startEvent } satisfies Receiver),
  deliveredEntry: (target) => toWire({ tag: FanOutEntryTag.Delivered, target: decode<OccurrenceRef>(target) } satisfies FanOutEntry),
  skippedEntry: (target) => toWire({ tag: FanOutEntryTag.Skipped, target: decode<OccurrenceRef>(target) } satisfies FanOutEntry),
  failedEntry: (receiver, failure) =>
    toWire({ tag: FanOutEntryTag.Failed, target: decode<Receiver>(receiver), failure: decode<Failure>(failure) } satisfies FanOutEntry),
  startedEntry: (summary, instanceId, startEvent) => {
    const registered = decode<DeploymentSummary>(summary);
    const version = registered.versions.find(([key]) => key === registered.key)?.[1];
    if (version === undefined) throw new TypeError(`deployment ${String(registered.deploymentId)} has no version of its key`);
    return toWire({ tag: FanOutEntryTag.Started, instanceId, deploymentId: registered.deploymentId, version, startEvent } satisfies FanOutEntry);
  },
  hostCapacityEntries: (entries, stopped, budget) =>
    hostCapacityEntries(entries.map((wire) => decode<FanOutEntry>(wire)), stopped, budget).map(toWire),
  renderResolution: (resolution) => resolutionJson(parts(resolution)) as JsonValue,
  renderEntries: (entries) => entries.map((wire) => fanOutEntryJson(decode<FanOutEntry>(wire)) as JsonValue),
  messageDelivery: (command, target, channel) => {
    const issued = decode<Command>(command);
    if (issued.tag !== CommandTag.Publish) throw new TypeError("not a publication");
    return toWire({ message: { target: decode<OccurrenceRef>(target), channel: decode<MessageChannel>(channel), publication: issued.publication } } satisfies Delivery);
  },
  signalDelivery: (emission, target) => {
    const sent = decode<Emission>(emission);
    return toWire({ signal: { address: sent.address, variables: sent.variables, target: decode<OccurrenceRef>(target) } } satisfies Delivery);
  },
  signalStart: (emission, instanceId, startEvent) => {
    const sent = decode<Emission>(emission);
    return startRequest({
      startEvent, instanceId, variables: [], businessKey: sent.businessKey,
      trigger: { tag: StartTriggerTag.Signal, address: sent.address, variables: sent.variables },
    });
  },
  messageStart: (command, instanceId, startEvent, channel) => {
    const issued = decode<Command>(command);
    if (issued.tag !== CommandTag.Publish) throw new TypeError("not a publication");
    const publication = issued.publication;
    return startRequest({
      startEvent, instanceId, variables: publication.variables, businessKey: publication.businessKey,
      trigger: { tag: StartTriggerTag.Message, channel: decode<MessageChannel>(channel), payload: publication.payload },
    });
  },
  timerStartRequest: (instanceId, startEvent) => startRequest({ startEvent, instanceId, variables: [], businessKey: null, trigger: null }),
  conditionStart: (command, instanceId, startEvent) => {
    const issued = decode<Command>(command);
    if (issued.tag !== CommandTag.EvaluateConditions) throw new TypeError("not a Conditional evaluation");
    const evaluation = issued.evaluation;
    return startRequest({
      startEvent, instanceId, variables: evaluation.variables, businessKey: evaluation.businessKey, trigger: { tag: StartTriggerTag.Condition },
    });
  },
  publication: (command) => {
    const issued = decode<Command>(command);
    if (issued.tag !== CommandTag.Publish) throw new TypeError("not a publication");
    return toWire(issued.publication);
  },
  messageAddress: (command) => {
    const issued = decode<Command>(command);
    if (issued.tag !== CommandTag.Publish) throw new TypeError("not a publication");
    return toWire(issued.publication.message);
  },
  signalReceivers: (program, state, address, emitter) =>
    signalReceiversOf(program, state, decode<SignalAddress>(address), emitter).map(toWire),
  messageReceivers: (program, state, publication) => {
    const scanned = messageReceivers(hooks, program, state, decode<Publication>(publication));
    return scanned.ok
      ? { kind: "receivers", receivers: scanned.value.map(([ref, channel]) => [toWire(ref), toWire(channel)] as const) }
      : { kind: "refused", refusal: refusalParts(scanned.failure) };
  },
  populationReach: (program, state, delivery, atMs) => {
    const sent = decode<Delivery>(delivery);
    if ("signal" in sent) {
      const reached = reachOccurrence(hooks, program, state, sent.signal.address, sent.signal.variables, sent.signal.target, atMs);
      return reached.skipped ? { kind: "skipped" } : populationStep(reached.outcome);
    }
    const { target, channel, publication } = sent.message;
    return populationStep(step(hooks, program, state, {
      tag: InputTag.Deliver,
      payload: {
        occurrence: target, trigger: { tag: DeliveryTriggerTag.Message, channel }, correlation: publication.criteria,
        payload: publication.payload as Value | null, variables: publication.variables, atMs,
      },
    }));
  },
  populationStart: (program, request, atMs) => {
    const asked = decode<StartRequest>(request);
    const input: StartInput = {
      instanceId: asked.instanceId, startEvent: rootStart(program, asked.startEvent), variables: asked.variables,
      trigger: asked.trigger ?? { tag: StartTriggerTag.Timer, logicalTimeMs: atMs }, businessKey: asked.businessKey, atMs,
    };
    // A Conditional start's predicate is asked over the exact input it then starts with (CIB-EXT-0044).
    if (input.trigger.tag === StartTriggerTag.Condition) {
      const verdict = conditionalStartVerdict(hooks, program, input);
      if (!verdict.ok) return { kind: "failed", failure: toWire(verdict.failure) };
      if (!verdict.value) return { kind: "passed" };
    }
    return populationStep(step(hooks, program, null, { tag: InputTag.Start, payload: input }));
  },
  hostRefusal: (code) => toWire({ tag: FailureTag.Rejected, code } satisfies Failure),
  intentsOf: (program, state) => hostView(program, state).broadcasts.map(toWire),
  instanceIdOf: (state) => state.instanceId,
  failureCode: (failure) => decode<Failure>(failure).code,
  signalStartReceivers: (program, deploymentId, address, variables) =>
    signalStartReceivers(hooks, deploymentId, program, decode<SignalAddress>(address), decode<readonly Binding[]>(variables)).map(toWire),
  emissionAddress: (emission) => toWire(decode<Emission>(emission).address),
  emissionVariables: (emission) => toWire(decode<Emission>(emission).variables),
  messageStartCandidates: (program, message) => {
    const starts = rootStarts(program);
    return messageStartCandidates(program, decode<Parameters<typeof messageStartCandidates>[1]>(message)).map(([startEvent, channel]) => {
      const named = starts.find(([, own]) => own === startEvent);
      if (named === undefined) throw new TypeError(`Message start ${startEvent} is no root start`);
      return [named[0], toWire(channel)] as const;
    });
  },
  refusesSignalVariables,
  conditionalStarts: (program) => {
    const starts = rootStarts(program);
    return definitionCapabilities(program).starts.filter((start) => start.condition).map((start) => {
      const named = starts.find(([, own]) => own === start.startEventId);
      if (named === undefined) throw new TypeError(`Conditional start ${start.startEventId} is no root start`);
      return named[0];
    });
  },
};
