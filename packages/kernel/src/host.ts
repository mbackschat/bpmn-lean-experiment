/**
 * Host interface, transcribed from `Kernel/Host.lean`.
 *
 * The adapter sees the kernel only through these projections
 * ([architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#host-interface)): what a program needs from its host, what
 * a definition offers before any instance runs, and the open waits and occurrence facts of a state. Matches no guarded
 * type; every wait is read through `openKindView`.
 */
import {
  elementActivity,
  elementEnvelope,
  elementEvent,
  elementHeader,
  elementScope,
  elementStart,
  eventPayloadCatch,
  eventPayloadThrow,
  programChildren,
  programPublicId,
  scopeKindStart,
  throwEffect,
  triggerMessage,
  triggerTimer,
  valueSourceLiteral,
  workCall,
  workIsService,
  workIsUser,
  workReceive,
  type CorrelationCriterion,
  type DefinitionRef,
  type ElementId,
  type Program,
  type Subscription,
  type Throw,
  type Work,
} from "./il/types.js";
import { resolve, type Resolved } from "./il/timer.js";
import {
  instanceOf,
  instanceRoot,
  messageChannelEquals,
  occurrenceOf,
  openKindView,
  ownScope,
  type BroadcastIntent,
  type InstanceFailure,
  type InstanceStatus,
  type MessageChannel,
  type OccurrenceKey,
  type OccurrenceRef,
  type OpenItem,
  type State,
  type Transition,
  type WaitView,
} from "./state.js";
import { messageTriggerChannel, ownVariables } from "./hooks.js";

/**
 * What a program needs from its host. `maxConcurrentWaits` is `null` when the shape bounds nothing, which is every
 * program that can hold a wait: tokens can multiply through implicit splits and loops, and no finer bound is selected.
 * Every declared subscription counts as one that can, a Signal or Conditional one included, which no flag names.
 */
export interface Requirements {
  readonly timers: boolean;
  readonly messages: boolean;
  readonly effects: boolean;
  readonly userTasks: boolean;
  readonly calls: boolean;
  readonly maxConcurrentWaits: number | null;
}

/**
 * Every subscription a program declares, with the element that declares it: catch Events, boundaries, starts and Event
 * Sub-Process starts (declared by the Event Sub-Process).
 */
function subscriptions(program: Program): readonly (readonly [ElementId, Subscription])[] {
  return program.elements.flatMap((element) => {
    const boundaries = (elementEnvelope(element)?.boundaries ?? []).map((boundary) => [boundary.id, boundary.subscription] as const);
    const event = elementEvent(element);
    const catching = event === null ? null : eventPayloadCatch(event[1]);
    const starting = elementStart(element)?.[1].subscription ?? null;
    const scope = elementScope(element);
    const eventStart = scope === null ? null : scopeKindStart(scope[1].kind);
    const id = elementHeader(element).id;
    const own = [catching, starting, eventStart].filter((entry) => entry !== null).map((entry) => [id, entry] as const);
    return [...boundaries, ...own];
  });
}

function activityWork(program: Program): readonly Work[] {
  return program.elements.flatMap((element) => {
    const activity = elementActivity(element);
    return activity === null ? [] : [activity[1].work];
  });
}

/** Every throw a program's throw Events declare. */
function throws(program: Program): readonly Throw[] {
  return program.elements.flatMap((element) => {
    const event = elementEvent(element);
    const thrown = event === null ? null : eventPayloadThrow(event[1]);
    return thrown === null ? [] : [thrown];
  });
}

export function hostRequirements(program: Program): Requirements {
  const triggers = subscriptions(program).map(([, subscription]) => subscription.trigger);
  const work = activityWork(program);
  const timers = triggers.some((trigger) => triggerTimer(trigger) !== null);
  const messages = triggers.some((trigger) => triggerMessage(trigger) !== null) || work.some((entry) => workReceive(entry) !== null);
  // A bound Message throw opens an effect item as a Service Task does (`feature/propagation.ts#throwMessage`).
  const effects = work.some(workIsService) || throws(program).some((thrown) => throwEffect(thrown) !== null);
  const userTasks = work.some(workIsUser);
  const calls = work.some((entry) => workCall(entry) !== null);
  const waits = triggers.length > 0 || messages || effects || userTasks || calls;
  return { timers, messages, effects, userTasks, calls, maxConcurrentWaits: waits ? null : 0 };
}

/**
 * A start the host can offer: a none start, a Message start on its channel, or a Timer start with its resolved schedule
 * (`il/timer.ts#resolve`).
 */
export interface StartCapability {
  readonly startEventId: ElementId;
  readonly channel: MessageChannel | null;
  readonly messageName: string | null;
  readonly timer: Resolved | null;
}

/**
 * A correlated Message subscription as its host routes to it: the public identifier of the element that declares it and
 * its criteria, each a correlation key and the expression bound to its value, which the kernel evaluates in the waiting
 * instance when a delivery is matched (`Hooks.correlates`), never the host.
 */
export interface CorrelatedCatch {
  readonly element: ElementId;
  readonly criteria: readonly CorrelationCriterion[];
}

/** The correlated subscriptions on one Message channel. */
export interface CorrelatedChannel {
  readonly channel: MessageChannel;
  readonly catches: readonly CorrelatedCatch[];
}

/** `relations` are the profile's register entries, as provenance a host can show. */
export interface Capabilities {
  readonly starts: readonly StartCapability[];
  readonly correlatedChannels: readonly CorrelatedChannel[];
  readonly relations: readonly string[];
}

/** `catches` grouped by channel, each channel once, in the order of its first catch. */
function byChannel(catches: readonly (readonly [MessageChannel, CorrelatedCatch])[]): readonly CorrelatedChannel[] {
  return catches.reduce<readonly CorrelatedChannel[]>((grouped, [channel, entry]) =>
    grouped.some((group) => messageChannelEquals(group.channel, channel))
      ? grouped.map((group) => messageChannelEquals(group.channel, channel) ? { ...group, catches: [...group.catches, entry] } : group)
      : [...grouped, { channel, catches: [entry] }], []);
}

/**
 * A Timer start whose schedule does not resolve offers nothing: admission refuses it (`timer.*`), so an admitted
 * program's every Timer start is offered.
 */
export function definitionCapabilities(program: Program): Capabilities {
  const starts = programChildren(program, null).flatMap((element): StartCapability[] => {
    const start = elementStart(element);
    if (start === null) return [];
    const trigger = start[1].subscription?.trigger ?? null;
    const message = trigger === null ? null : triggerMessage(trigger);
    const offered = (timer: Resolved | null): StartCapability => ({
      startEventId: start[0].id,
      channel: message === null ? null : messageTriggerChannel(message),
      messageName: message === null || message.name === null ? null : valueSourceLiteral(message.name),
      timer,
    });
    const timer = trigger === null ? null : triggerTimer(trigger);
    if (timer === null) return [offered(null)];
    const resolved = resolve(timer.schedule);
    return resolved.ok ? [offered(resolved.value)] : [];
  });
  const correlated = subscriptions(program).flatMap(([element, subscription]) => {
    const trigger = triggerMessage(subscription.trigger);
    return trigger === null || trigger.correlation.length === 0
      ? []
      : [[messageTriggerChannel(trigger), { element: programPublicId(program, element), criteria: trigger.correlation }] as const];
  });
  return { starts, correlatedChannels: byChannel(correlated), relations: program.options.relations };
}

/**
 * One open wait: its public occurrence identity, the called definition it runs in (`null` in the root instance, whose
 * definition is the program's) and its view.
 */
export interface OpenWait {
  readonly id: OccurrenceRef;
  readonly definition: DefinitionRef | null;
  readonly view: WaitView;
}

/**
 * `broadcasts` are the Signals the input threw to the population (`State.outbox`), which the host publishes once the
 * input commits (PC-SIGNAL-01).
 */
export interface View {
  readonly status: InstanceStatus;
  readonly failure: InstanceFailure | null;
  readonly openWaits: readonly OpenWait[];
  readonly journal: readonly Transition[];
  readonly broadcasts: readonly BroadcastIntent[];
}

function publicRef(program: Program, ref: OccurrenceRef): OccurrenceRef {
  return { ...ref, element: programPublicId(program, ref.element) };
}

function publicKey(program: Program, key: OccurrenceKey): OccurrenceKey {
  return { ...key, element: programPublicId(program, key.element) };
}

function publicTransition(program: Program, transition: Transition): Transition {
  return {
    ...transition,
    element: transition.element === null ? null : programPublicId(program, transition.element),
    started: transition.started.map((fact) => ({ ...fact, occurrence: publicKey(program, fact.occurrence) })),
    ended: transition.ended.map(([key, terminal]) => [publicKey(program, key), terminal] as const),
  };
}

function publicFailure(program: Program, failure: InstanceFailure): InstanceFailure {
  return {
    ...failure,
    occurrence: publicRef(program, failure.occurrence),
    related: failure.related.map(([name, ref]) => [name, publicRef(program, ref)] as const),
  };
}

/**
 * An open User Task's inputs are its occurrence's input-mapped locals as they stand now, which a variable command can
 * rewrite or remove while it waits (CIB projects `RuntimeService#getVariablesLocal`); an effect's arguments stay the
 * snapshot taken when it opened.
 */
function currentInputs(state: State, item: OpenItem, view: WaitView): WaitView {
  if (view.userTask === null) return view;
  const own = ownVariables(state, ownScope(state, item.occurrence, item.scope));
  const inputs = view.userTask.inputs.flatMap(([name]) => own.filter(([key]) => key === name));
  return { ...view, userTask: { ...view.userTask, inputs } };
}

function openWait(program: Program, state: State, item: OpenItem): OpenWait {
  const root = instanceRoot(state, item.scope);
  return {
    id: publicRef(program, {
      processInstanceId: instanceOf(state, item.scope),
      element: item.element,
      activation: occurrenceOf(state, item.occurrence)?.activation ?? 0,
    }),
    definition: state.slots.instances.find((instance) => instance.root === root)?.definition ?? null,
    view: currentInputs(state, item, openKindView(item.kind)),
  };
}

export function hostView(program: Program, state: State): View {
  return {
    status: state.status,
    failure: state.failure === null ? null : publicFailure(program, state.failure),
    openWaits: state.openItems.map((item) => openWait(program, state, item)),
    journal: state.journal.map((transition) => publicTransition(program, transition)),
    broadcasts: state.outbox.map((intent) => ({ ...intent, origin: publicRef(program, intent.origin) })),
  };
}
