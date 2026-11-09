/**
 * Host interface, transcribed from `Kernel/Host.lean`.
 *
 * The adapter sees the kernel only through these projections
 * ([proposal](../../../docs/LEAN-KERNEL-REWRITE-PROPOSAL.md#host-interface)): what a program needs from its host, what
 * a definition offers before any instance runs, and the open waits and occurrence facts of a state. Matches no guarded
 * type; every wait is read through `openKindView`.
 */
import {
  elementActivity,
  elementEnvelope,
  elementEvent,
  elementScope,
  elementStart,
  eventPayloadCatch,
  programChildren,
  programPublicId,
  scopeKindStart,
  triggerMessage,
  triggerTimer,
  workCall,
  workIsService,
  workIsUser,
  workReceive,
  type DefinitionRef,
  type ElementId,
  type Program,
  type Subscription,
  type TimerSchedule,
  type Work,
} from "./il/types.js";
import {
  instanceOf,
  instanceRoot,
  occurrenceOf,
  openKindView,
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
import { messageTriggerChannel } from "./hooks.js";

/**
 * What a program needs from its host. `maxConcurrentWaits` is `null` when the shape bounds nothing, which is every
 * program with a wait: tokens can multiply through implicit splits and loops, and no finer bound is selected.
 */
export interface Requirements {
  readonly timers: boolean;
  readonly messages: boolean;
  readonly effects: boolean;
  readonly userTasks: boolean;
  readonly calls: boolean;
  readonly maxConcurrentWaits: number | null;
}

/** Every subscription a program declares: catch Events, boundaries, starts and Event Sub-Process starts. */
function subscriptions(program: Program): readonly Subscription[] {
  return program.elements.flatMap((element) => {
    const boundaries = (elementEnvelope(element)?.boundaries ?? []).map((boundary) => boundary.subscription);
    const event = elementEvent(element);
    const catching = event === null ? null : eventPayloadCatch(event[1]);
    const starting = elementStart(element)?.[1].subscription ?? null;
    const scope = elementScope(element);
    const eventStart = scope === null ? null : scopeKindStart(scope[1].kind);
    return [...boundaries, ...[catching, starting, eventStart].filter((entry) => entry !== null)];
  });
}

function activityWork(program: Program): readonly Work[] {
  return program.elements.flatMap((element) => {
    const activity = elementActivity(element);
    return activity === null ? [] : [activity[1].work];
  });
}

export function hostRequirements(program: Program): Requirements {
  const triggers = subscriptions(program).map((subscription) => subscription.trigger);
  const work = activityWork(program);
  const timers = triggers.some((trigger) => triggerTimer(trigger) !== null);
  const messages = triggers.some((trigger) => triggerMessage(trigger) !== null) || work.some((entry) => workReceive(entry) !== null);
  const effects = work.some(workIsService);
  const userTasks = work.some(workIsUser);
  const calls = work.some((entry) => workCall(entry) !== null);
  const waits = timers || messages || effects || userTasks || calls;
  return { timers, messages, effects, userTasks, calls, maxConcurrentWaits: waits ? null : 0 };
}

/** A start the host can offer: a none start, a Message start on its channel, or a Timer start. */
export interface StartCapability {
  readonly startEventId: ElementId;
  readonly channel: MessageChannel | null;
  readonly timer: TimerSchedule | null;
}

/** `relations` are the profile's register entries, as provenance a host can show. */
export interface Capabilities {
  readonly starts: readonly StartCapability[];
  readonly correlatedChannels: readonly MessageChannel[];
  readonly relations: readonly string[];
}

export function definitionCapabilities(program: Program): Capabilities {
  const starts = programChildren(program, null).flatMap((element): StartCapability[] => {
    const start = elementStart(element);
    if (start === null) return [];
    const trigger = start[1].subscription?.trigger ?? null;
    const message = trigger === null ? null : triggerMessage(trigger);
    const timer = trigger === null ? null : triggerTimer(trigger);
    return [{
      startEventId: start[0].id,
      channel: message === null ? null : messageTriggerChannel(message),
      timer: timer === null ? null : timer.schedule,
    }];
  });
  const correlated = subscriptions(program).flatMap((subscription) => {
    const trigger = triggerMessage(subscription.trigger);
    const channel = trigger === null || trigger.correlation.length === 0 ? null : messageTriggerChannel(trigger);
    return channel === null ? [] : [channel];
  });
  return { starts, correlatedChannels: correlated, relations: program.options.relations };
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

export interface View {
  readonly status: InstanceStatus;
  readonly failure: InstanceFailure | null;
  readonly openWaits: readonly OpenWait[];
  readonly journal: readonly Transition[];
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

function openWait(program: Program, state: State, item: OpenItem): OpenWait {
  const root = instanceRoot(state, item.scope);
  return {
    id: publicRef(program, {
      processInstanceId: instanceOf(state, item.scope),
      element: item.element,
      activation: occurrenceOf(state, item.occurrence)?.activation ?? 0,
    }),
    definition: state.slots.instances.find((instance) => instance.root === root)?.definition ?? null,
    view: openKindView(item.kind),
  };
}

export function hostView(program: Program, state: State): View {
  return {
    status: state.status,
    failure: state.failure === null ? null : publicFailure(program, state.failure),
    openWaits: state.openItems.map((item) => openWait(program, state, item)),
    journal: state.journal.map((transition) => publicTransition(program, transition)),
  };
}
