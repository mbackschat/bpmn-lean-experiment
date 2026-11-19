/**
 * Kernel runtime state, transcribed from `Kernel/State.lean`.
 *
 * Flat and identifier-indexed: scope occurrences refer to their parent by identifier, tokens sit on sequence flows,
 * every begun flow-node occurrence is one `Occurrence`, and every open interaction is one `OpenItem`. The top-level
 * shape is fixed; a feature keeps its own data in its slot of `FeatureSlots`, which is always present and empty by
 * default. Every operation returns a new state; nothing is mutated. A Lean function `State.f` is exported as `f`;
 * any other `T.f` as `tF`.
 *
 * Occurrences and activations are created and removed only here, in `state/removal.ts` and in `step.ts`; variables are written only through
 * `setVariable`, whose one caller is `feature/data.ts`; flow tokens are added only by `emit`, whose one caller is
 * `feature/flow.ts`, and deferred begins only by `deferBegins`, whose one caller is `feature/multi-instance.ts`
 * (guard 17).
 */
import {
  VariableEvent, assertNever, definitionRefEquals, programChildren, programItemScope, programProcessChildren, programPublicId, utf8ByteSize,
  type DefinitionRef, type Element, type ElementId, type FlowId, type Program, type Value,
} from "./il/types.js";
import {
  type Binding, type ConditionalWaitDetail, type EffectDetail, type IncidentDetail, InputTag, type MessageChannel,
  messageChannelEquals, type MessageWaitDetail, type OpenKind, OpenKindTag, openKindView, optionalChannelEquals,
  type SendDescriptor, type SignalAddress, SignalAddressTag, signalAddressMatches, type SignalWaitDetail, type TimerDetail,
  type TimerRecurrence, type UserTaskDetail, type WaitView, type IncidentSubject, IncidentSubjectTag, type JobDetail, type JobSubject, JobSubjectTag,
} from "./state/wait.js";
export {
  type Binding, type ConditionalWaitDetail, type EffectDetail, type IncidentDetail, InputTag, type MessageChannel,
  messageChannelEquals, type MessageWaitDetail, type OpenKind, OpenKindTag, openKindView, optionalChannelEquals,
  type SendDescriptor, type SignalAddress, SignalAddressTag, signalAddressMatches, type SignalWaitDetail, type TimerDetail,
  type TimerRecurrence, type UserTaskDetail, type WaitView, type IncidentSubject, IncidentSubjectTag, type JobDetail, type JobSubject, JobSubjectTag,
};
import {
  type CommandAction, CommandActionTag, type CommandInput, type ConditionChoice, type CorrelationMatch, type CriterionTarget,
  CriterionTargetTag, type DeliveryInput, type DeliveryTrigger, DeliveryTriggerTag, type EffectInput,
  type EffectOutcome, EffectOutcomeTag, type EvalContext, type Input, noStartTrigger, type OccurrenceRef,
  SignalReach, type StartInput, type StartTrigger, StartTriggerTag, type TimerInput, type CancelInstanceInput,
} from "./state/input.js";
export {
  type CommandAction, CommandActionTag, type CommandInput, type ConditionChoice, type CorrelationMatch, type CriterionTarget,
  CriterionTargetTag, type DeliveryInput, type DeliveryTrigger, DeliveryTriggerTag, type EffectInput,
  type EffectOutcome, EffectOutcomeTag, type EvalContext, type Input, noStartTrigger, type OccurrenceRef,
  SignalReach, type StartInput, type StartTrigger, StartTriggerTag, type TimerInput, type CancelInstanceInput,
};
import {
  type Compensable, type CompensableChild, type CompensationRun, type Compensations, type FeatureSlots, featureSlotsClear,
  featureSlotsKeptAlive, featureSlotsSuspended, type InstanceData, type Iteration, iterationHolds, IterationTag, type Leave,
  leaveFlows, leaveOutgoing, leaveRaised, LeaveTag, type MultiInstanceRun, type Parked, parkedEquals, type Held, type Resume,
  ResumeTag, type ScopeOccurrenceId, type Suspended,
} from "./state/slots.js";
import {
  type InstanceFailure, type Origin, type Raised, raisedIsCancel, RaisedTag,
} from "./state/raise.js";
export {
  type InstanceFailure, type Origin, type Raised, raisedIsCancel, RaisedTag,
};
import {
  ActivationRole, type Cause, CauseTag, marks, type OccurrenceKey, type StartedFact, Terminal, type Transition,
} from "./state/journal.js";
export {
  ActivationRole, type Cause, CauseTag, type OccurrenceKey, type StartedFact, Terminal, type Transition,
};
export {
  type Compensable, type CompensableChild, type CompensationRun, type Compensations, type FeatureSlots, featureSlotsClear,
  featureSlotsKeptAlive, featureSlotsSuspended, type InstanceData, type Iteration, iterationHolds, IterationTag, type Leave,
  leaveFlows, leaveOutgoing, leaveRaised, LeaveTag, type MultiInstanceRun, type Parked, parkedEquals, type Held, type Resume,
  ResumeTag, type ScopeOccurrenceId, type Suspended,
};

import {
  childScope, compareOccurrenceId, compareScopeSlot, occurrenceId, type OccurrenceId, rootScope, scopeParent, type ScopeSlot,
} from "./state/key.js";
export { type OccurrenceId };
import {
  compareItemKey, insertItem, type ItemKey, itemAt, itemKeyText, ItemRole, itemsByPosition, type OpenItem, type OpenItems, sameItemKey,
} from "./state/items.js";
export {
  compareItemKey, insertItem, type ItemKey, itemAt, itemKeyText, ItemRole, itemsByPosition, type OpenItem, type OpenItems, sameItemKey,
};
import { type TreeMap, treeMapGetD, treeMapInsert } from "./state/map.js";
export { type TreeMap };
import {
  committed, type Failure, failed, failedWith, FailureTag, type RecordedFailure, recorded, type Result, SemanticCause, semanticFailure,
} from "./state/failure.js";
export {
  committed, type Failure, failed, failedWith, FailureTag, type RecordedFailure, recorded, type Result, SemanticCause, semanticFailure,
};

/** Guarded type: `step.ts` owns matching on it. Whom `Step` tells when an occurrence completes. */
export enum ContinuationTag {
  /** Leave through the outgoing flows. */
  Flow = "flow",
  /** One instance of the Multi-Instance body occurrence `body`. */
  MultiInstance = "multiInstance",
  /** A compensation handler of the run in that scope occurrence. */
  Compensation = "compensation",
}

export type Continuation =
  | { readonly tag: ContinuationTag.Flow }
  | { readonly tag: ContinuationTag.MultiInstance; readonly body: OccurrenceId }
  | { readonly tag: ContinuationTag.Compensation; readonly run: ScopeOccurrenceId };

export const flowContinuation: Continuation = { tag: ContinuationTag.Flow };

/**
 * One flow-node occurrence, from its issue until it ends. `activation` counts the activations of `element` in its
 * process instance under `role`, from 1. `incoming` is the flow the token arrived on, `null` for an occurrence no
 * token began.
 *
 * `begun = false` is a subscription's reservation: a boundary, Event Sub-Process start or Event-Based Gateway arm has a
 * published identity from the moment it is armed, but its flow node runs only when the trigger arrives (CIB declares
 * the subscription on the event scope and starts the activity instance on receipt, `BpmnParse:3288-3298`). A
 * reservation keeps nothing alive and never appears in the journal until it begins.
 */
export interface Occurrence {
  readonly id: OccurrenceId;
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly activation: number;
  readonly role: ActivationRole;
  readonly continuation: Continuation;
  readonly incoming: FlowId | null;
  readonly begun: boolean;
}

/**
 * A scope occurrence: the process instance (`element = null`), one activation of a Scope element, the root of a called
 * process instance, whose `element` is the Call Activity and `calledInstance` the instance's identifier, a
 * Multi-Instance body or instance, the occurrence holding a compensation handler's restored context, or an Activity's
 * local variables (CIB-EXT-0015), which live as long as the Activity. `occurrence` is the flow-node occurrence it
 * belongs to, `null` for the process root, a Multi-Instance instance and a handler's context. Its parent is its key's
 * (`scopeOccurrenceParent`), so no record can name another.
 */
export interface ScopeOccurrence {
  readonly id: ScopeOccurrenceId;
  readonly element: ElementId | null;
  readonly occurrence: OccurrenceId | null;
  readonly calledInstance: string | null;
}

/** Lean's `ScopeOccurrence.parent` over a search's result: the parent of a found record's key, `null` for none. */
export function scopeOccurrenceParent(scope: ScopeOccurrence | null | undefined): ScopeOccurrenceId | null {
  return scope === null || scope === undefined ? null : scopeParent(scope.id);
}

export interface ScopeVariables { readonly scope: ScopeOccurrenceId; readonly entries: readonly Binding[]; }

export enum InstanceStatus { Running = "running", Completed = "completed", Cancelled = "cancelled", Failed = "failed" }

/** Where writes land (`feature/data.ts`). */
export enum WriteRule {
  /**
   * The innermost scope that binds the name, else the instance root when its process declares the name; any other name
   * follows `ProfileOptions.undeclaredWrite`.
   */
  Outward = "outward",
  /** The writing scope's own variables, the rule of one Multi-Instance instance's output. */
  Own = "own",
}

/** Every write logs, same-value updates and entry writes included (PC-CONDITION-01, PC-CONDITION-04). */
export interface WriteEvent { readonly scope: ScopeOccurrenceId; readonly name: string; readonly kind: VariableEvent; }

// guard-exception(3): what a firing carried, handed to the one owner of `Trigger`; it adds no dispatch of its own.
export enum FiredTag { Timer = "timer", Message = "message", Signal = "signal", Condition = "condition" }

/** What fired a subscription. */
export type Fired =
  | { readonly tag: FiredTag.Timer; readonly logicalTimeMs: number }
  | { readonly tag: FiredTag.Message; readonly delivery: DeliveryInput }
  | { readonly tag: FiredTag.Signal; readonly delivery: DeliveryInput }
  | { readonly tag: FiredTag.Condition; readonly write: WriteEvent | null };

/**
 * What `Step.begin` starts: `reserved` names a subscription's reservation to begin instead of a fresh occurrence; for an
 * Event Sub-Process, `writes` are the values the start writes outward from the new occurrence (mapped Data Outputs, then
 * delivered variables; `step.ts#writeStart`) and `inner` the reservation of its start Event; `trigger` is what fired a
 * start Event.
 */
export interface BeginRequest {
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly continuation: Continuation;
  readonly incoming: FlowId | null;
  readonly reserved: OccurrenceId | null;
  readonly writes: readonly Binding[];
  readonly inner: OccurrenceId | null;
  readonly trigger: StartTrigger;
}

export enum TokenTag { Flow = "flow", Begin = "begin" }

/**
 * One entry of a closure's work stack, `State.tokens`, which `step.ts` owns matching on: a token on a sequence flow
 * inside a scope occurrence, or a deferred begin, the request of a `begin` signal moved onto the stack, which `step.ts`
 * dispatches as that signal, with its journal cause, when the closure reaches it. Both carry the scope occurrence they
 * keep busy, Lean's `Token.busyScope`: a deferred begin's is the one its request begins in, `request.scope`.
 */
export type Token =
  | { readonly tag: TokenTag.Flow; readonly flow: FlowId; readonly scope: ScopeOccurrenceId }
  | { readonly tag: TokenTag.Begin; readonly request: BeginRequest; readonly scope: ScopeOccurrenceId };

/** The flow a token arrives on; a deferred begin arrives on none. */
export function tokenArrivalFlow(token: Token): FlowId | null {
  switch (token.tag) {
    case TokenTag.Flow:
      return token.flow;
    case TokenTag.Begin:
      return null;
  }
  return assertNever(token);
}

/** A `BeginRequest` with Lean's field defaults. */
export function beginRequest(fields: Pick<BeginRequest, "element" | "scope"> & Partial<BeginRequest>): BeginRequest {
  return {
    continuation: flowContinuation,
    incoming: null,
    reserved: null,
    writes: [],
    inner: null,
    trigger: noStartTrigger,
    ...fields,
  };
}

/**
 * Guarded type: `step.ts` owns matching on it. The cross-feature protocol: a feature that needs another feature's
 * mechanism enqueues a signal, and `Step` hands it to the owning hook before any token moves.
 */
export enum SignalTag {
  /** Arm the boundaries of `element`, attached to the occurrence `host`, in `scope`. */
  Arm = "arm",
  /** Arm the Event Sub-Process starts of the scope occurrence `scope` (the process root included). */
  ArmScope = "armScope",
  /** Arm the arms of the Event-Based Gateway occurrence `occurrence`, of `gateway`, reached in `scope`. */
  ArmGateway = "armGateway",
  Raise = "raise",
  /** Begin a flow-node occurrence without a token. */
  Begin = "begin",
  /** The occurrence is done: `Step`'s one completion pipeline runs. */
  Complete = "complete",
  /** Write without ending an occurrence (`EscalationHandler:60`, PC-SCOPE-06). */
  Write = "write",
  /** Delete variables, as seen from `scope`. */
  Remove = "remove",
  /** Begin and complete a fresh occurrence of `element` at once. */
  Occur = "occur",
  /** Cancel the occurrence wherever it stands. */
  Cancel = "cancel",
  /** Fire the open item before anything queued behind this signal (`ThrowSignalEventActivityBehavior#execute`). */
  Fire = "fire",
  /** End the process instance with `status`, recording `failure`. */
  EndInstance = "endInstance",
  /** Run the compensation handlers retained in `scope` for `trigger`. */
  Compensate = "compensate",
  /** An Error left the compensation handler context `handler` uncaught. */
  CompensationFailed = "compensationFailed",
}

export type Signal =
  | { readonly tag: SignalTag.Arm; readonly host: OccurrenceId; readonly element: ElementId; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.ArmScope; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.ArmGateway; readonly occurrence: OccurrenceId; readonly gateway: ElementId; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.Raise; readonly event: Raised; readonly origin: Origin }
  | { readonly tag: SignalTag.Begin; readonly request: BeginRequest }
  | {
      readonly tag: SignalTag.Complete;
      readonly occurrence: OccurrenceId;
      readonly leave: Leave;
      readonly writes: readonly Binding[];
      readonly rule: WriteRule;
    }
  | { readonly tag: SignalTag.Write; readonly scope: ScopeOccurrenceId; readonly writes: readonly Binding[]; readonly rule: WriteRule }
  | { readonly tag: SignalTag.Remove; readonly scope: ScopeOccurrenceId; readonly names: readonly string[] }
  | {
      readonly tag: SignalTag.Occur;
      readonly element: ElementId;
      readonly scope: ScopeOccurrenceId;
      readonly leave: Leave;
      readonly writes: readonly Binding[];
      readonly rule: WriteRule;
    }
  | { readonly tag: SignalTag.Cancel; readonly occurrence: OccurrenceId }
  | { readonly tag: SignalTag.Fire; readonly item: ItemKey; readonly fired: Fired }
  | { readonly tag: SignalTag.EndInstance; readonly status: InstanceStatus; readonly failure: InstanceFailure | null }
  | {
      readonly tag: SignalTag.Compensate;
      readonly scope: ScopeOccurrenceId;
      readonly activity: ElementId | null;
      readonly trigger: OccurrenceRef;
      readonly leave: OccurrenceId | null;
      readonly resume: Resume | null;
    }
  | {
      readonly tag: SignalTag.CompensationFailed;
      readonly handler: ScopeOccurrenceId;
      readonly code: string;
      readonly message: string | null;
      readonly origin: Origin;
    };

/** `Signal.complete`. */
export function completeSignal(occurrence: OccurrenceId, leave: Leave, writes: readonly Binding[], rule: WriteRule): Signal {
  return { tag: SignalTag.Complete, occurrence, leave, writes, rule };
}

// The occurrence journal

/**
 * The facts of the micro-step in progress, which `step.ts` turns into one `Transition`. `cancelled` holds the
 * occurrences cancelled, for `Hooks.cancelled` after the micro-step.
 */
export interface Draft {
  readonly started: readonly StartedFact[];
  readonly ended: readonly (readonly [OccurrenceKey, Terminal])[];
  readonly cancelled: readonly Occurrence[];
  readonly ready: readonly OccurrenceKey[];
}

export const emptyDraft: Draft = { started: [], ended: [], cancelled: [], ready: [] };

/** One activation counter (R8: per process instance, element and role). */
export interface ActivationCount {
  readonly processInstance: string;
  readonly element: ElementId;
  readonly role: ActivationRole;
  readonly count: number;
}

/** A Signal thrown to the population, which the host publishes after the input commits (PC-SIGNAL-01, PC-SIGNAL-04). */
export interface BroadcastIntent {
  readonly address: SignalAddress;
  readonly variables: readonly Binding[];
  readonly businessKey: string | null;
  readonly origin: OccurrenceRef;
}

export interface State {
  readonly instanceId: string;
  readonly status: InstanceStatus;
  readonly scopes: readonly ScopeOccurrence[];
  readonly occurrences: readonly Occurrence[];
  /** The closure's work stack (`nextToken` in `step.ts`), empty once a closure settles. */
  readonly tokens: readonly Token[];
  readonly variables: readonly ScopeVariables[];
  readonly openItems: OpenItems;
  /** The next item ordinal of each occurrence that opened an item, in occurrence key order, pruned with the occurrence. */
  readonly itemOrdinals: TreeMap<OccurrenceId, number>;
  /** The next ordinal of each element in each scope occurrence that entered one, pruned with the scope occurrence. */
  readonly scopeOrdinals: TreeMap<ScopeSlot, number>;
  /** The next ordinal of each element in each scope occurrence that issued an occurrence of it, pruned with it. */
  readonly occurrenceOrdinals: TreeMap<ScopeSlot, number>;
  readonly activations: readonly ActivationCount[];
  /** The next order position of an open item or a compensation record, read only by the sites that order them (K0.8). */
  readonly nextPosition: number;
  readonly logicalTimeMs: number;
  readonly signals: readonly Signal[];
  /** Every variable write since the last drain, same-value writes included: `Step` hands them to `Hooks.written`. */
  readonly writes: readonly WriteEvent[];
  /** The intents of the input in progress; `step` empties it first, so a host publishes a committed input's own. */
  readonly outbox: readonly BroadcastIntent[];
  readonly slots: FeatureSlots;
  /** Present exactly when `status` is `failed`. */
  readonly failure: InstanceFailure | null;
  /** The occurrence facts of the input in progress; `step` empties it first. */
  readonly journal: readonly Transition[];
  readonly draft: Draft;
}

/**
 * Whether the input in progress has crossed a transaction boundary: begun an occurrence marked `asyncBefore`, or
 * completed one marked `asyncAfter`, in the journal or the micro-step's draft. The kernel's one reader of the marks.
 */
export function crossed(program: Program, state: State): boolean {
  const facts = [...state.journal.map((transition) => [transition.started, transition.ended] as const),
    [state.draft.started, state.draft.ended] as const];
  return facts.some(([started, ended]) =>
    started.some((fact) => marks(program, fact.occurrence)[0]) ||
      ended.some(([key, terminal]) => terminal === Terminal.Completed && marks(program, key)[1]));
}

export type Outcome = Result<State>;

// State operations

/**
 * `bindings` with only the last binding of each name, where that binding stands: a variable set holds one value per
 * name, as a Data Association's copy replaces its target's value (BPMN 2.0.2 §10.4.2) and CIB keys a scope's variables
 * by name (`VariableStore.java:39`), so a name bound twice keeps the value bound last (#147).
 */
export function keyed(bindings: readonly Binding[]): readonly Binding[] {
  const kept: Binding[] = [];
  for (let index = bindings.length - 1; index >= 0; index -= 1) {
    const binding = bindings[index] as Binding;
    if (!kept.some(([name]) => name === binding[0])) kept.unshift(binding);
  }
  return kept;
}

export const root: ScopeOccurrenceId = rootScope;

/** A fresh process instance: one root scope occurrence with the given variables, `keyed`. */
export function initial(instanceId: string, variables: readonly Binding[], businessKey: string | null = null): State {
  return {
    instanceId,
    status: InstanceStatus.Running,
    scopes: [{ id: root, element: null, occurrence: null, calledInstance: null }],
    occurrences: [],
    tokens: [],
    variables: [{ scope: root, entries: keyed(variables) }],
    openItems: [],
    itemOrdinals: [],
    scopeOrdinals: [],
    occurrenceOrdinals: [],
    activations: [],
    nextPosition: 1,
    logicalTimeMs: 0,
    signals: [],
    writes: [],
    outbox: [],
    slots: {
      parked: [],
      held: [],
      multiInstances: [],
      compensation: { retained: [], runs: [] },
      instances: [{ root, businessKey, definition: null }],
    },
    failure: null,
    journal: [],
    draft: emptyDraft,
  };
}

export function emit(state: State, flows: readonly FlowId[], scope: ScopeOccurrenceId): State {
  return { ...state, tokens: [...state.tokens, ...flows.map((flow): Token => ({ tag: TokenTag.Flow, flow, scope }))] };
}

/**
 * Defer the begins `requests` onto the work stack, the first on top: above every token queued before them, so under
 * `declarationDepthFirst` each begins, and runs to its next wait, join or end, before the next.
 */
export function deferBegins(state: State, requests: readonly BeginRequest[]): State {
  const deferred = requests.map((request): Token => ({ tag: TokenTag.Begin, request, scope: request.scope }));
  return { ...state, tokens: [...state.tokens, ...deferred.reverse()] };
}

/** The next order position (`nextPosition`), counted up. */
export function takePosition(state: State): readonly [State, number] {
  return [{ ...state, nextPosition: state.nextPosition + 1 }, state.nextPosition];
}

/** A fresh key for an occurrence of `element` issued in `scope`, the one issuer of occurrence keys (KD1). */
export function issueOccurrence(state: State, scope: ScopeOccurrenceId, element: ElementId): readonly [State, OccurrenceId] {
  const slot: ScopeSlot = { parent: scope, element };
  const ordinal = treeMapGetD(state.occurrenceOrdinals, slot, compareScopeSlot, 0);
  const occurrenceOrdinals = treeMapInsert(state.occurrenceOrdinals, slot, ordinal + 1, compareScopeSlot);
  return [{ ...state, occurrenceOrdinals }, occurrenceId(scope, element, ordinal)];
}

export function signal(state: State, next: Signal): State { return { ...state, signals: [...state.signals, next] }; }

function scopeOf(state: State, id: ScopeOccurrenceId): ScopeOccurrence | null {
  return state.scopes.find((scope) => scope.id === id) ?? null;
}

/** Whether `scope` is the root of a called process instance, which hides its caller's variables. */
export function calledRoot(state: State, scope: ScopeOccurrenceId): boolean {
  return (scopeOf(state, scope)?.calledInstance ?? null) !== null;
}

/**
 * The local or child scope occurrence an occurrence `host` owns, when its inputs or its Scope gave it one. A called
 * instance's root belongs to the callee and is never the host's own.
 */
export function localScope(state: State, host: OccurrenceId): ScopeOccurrenceId | null {
  return state.scopes.find((entry) => entry.occurrence === host && entry.calledInstance === null)?.id ?? null;
}

/**
 * The scope occurrence an occurrence `host` reads from and writes outward from: its own scope (`localScope`), so its
 * input-mapped locals are visible (`PvmExecutionImpl.java:1304-1318`), otherwise `scope`, the enclosing one.
 */
export function ownScope(state: State, host: OccurrenceId, scope: ScopeOccurrenceId): ScopeOccurrenceId {
  return localScope(state, host) ?? scope;
}

/** Whether the scope occurrence `scope` stands. */
export function stands(state: State, scope: ScopeOccurrenceId): boolean {
  return state.scopes.some((entry) => entry.id === scope);
}

/**
 * The root of the process instance `scope` belongs to: the nearest called-instance root, else the process root. The
 * search climbs `scope`'s key while its scope occurrences stand.
 */
export function instanceRoot(state: State, scope: ScopeOccurrenceId): ScopeOccurrenceId {
  for (let current = scope; current !== root; current = scopeParent(current) ?? root) {
    if (calledRoot(state, current)) return current;
    if (!stands(state, current)) return root;
  }
  return root;
}

/**
 * The scope occurrences in which something remains: a token, an open item that keeps it alive, a begun occurrence, a
 * child scope occurrence or a feature slot entry. One pass over the state, so that `Step`'s search for an idle scope
 * occurrence stays linear in a state the closure can grow at every micro-step.
 */
export function busyScopes(state: State): ReadonlySet<ScopeOccurrenceId> {
  return new Set<ScopeOccurrenceId>([
    ...state.tokens.map((token) => token.scope),
    ...state.openItems.flatMap((item) => item.passive ? [] : [item.scope]),
    ...state.occurrences.flatMap((occurrence) => occurrence.begun ? [occurrence.scope] : []),
    ...state.scopes.flatMap((candidate) => scopeOccurrenceParent(candidate) ?? []),
    ...featureSlotsKeptAlive(state.slots),
  ]);
}

/** Whether nothing remains in `scope` (`busyScopes`). */
export function idle(state: State, scope: ScopeOccurrenceId): boolean {
  return !busyScopes(state).has(scope);
}

/**
 * The entries a micro-step's scans run over: tokens, occurrences, open items, scope occurrences and queued signals.
 * `Step.closureWorkBound` sums it over a closure's micro-steps.
 */
export function entryCount(state: State): number {
  return state.tokens.length + state.occurrences.length + state.openItems.length + state.scopes.length + state.signals.length;
}

/** The process instance identifier of `scope`. */
export function instanceOf(state: State, scope: ScopeOccurrenceId): string {
  return scopeOf(state, instanceRoot(state, scope))?.calledInstance ?? state.instanceId;
}

/** The next activation of `element` under `role` in `processInstance`, recorded (R8: per process instance). */
export function activate(
  state: State,
  processInstance: string,
  element: ElementId,
  role: ActivationRole,
): readonly [State, number] {
  const key = (entry: ActivationCount): boolean =>
    entry.processInstance === processInstance && entry.element === element && entry.role === role;
  const count = (state.activations.find(key)?.count ?? 0) + 1;
  return [
    { ...state, activations: [{ processInstance, element, role, count }, ...state.activations.filter((entry) => !key(entry))] },
    count,
  ];
}

/** A reservation for `element` in `scope`: issued and numbered now, begun only when its trigger arrives. */
export function reserve(state: State, element: ElementId, scope: ScopeOccurrenceId): readonly [State, Occurrence] {
  const [activated, activation] = activate(state, instanceOf(state, scope), element, ActivationRole.Element);
  const [issued, id] = issueOccurrence(activated, scope, element);
  const occurrence: Occurrence = {
    id,
    element,
    scope,
    activation,
    role: ActivationRole.Element,
    continuation: flowContinuation,
    incoming: null,
    begun: false,
  };
  return [{ ...issued, occurrences: [...issued.occurrences, occurrence] }, occurrence];
}

export function occurrenceOf(state: State, id: OccurrenceId): Occurrence | null {
  return state.occurrences.find((occurrence) => occurrence.id === id) ?? null;
}

/** The public key of an occurrence. */
export function keyOf(state: State, occurrence: Occurrence): OccurrenceKey {
  return {
    processInstanceId: instanceOf(state, occurrence.scope),
    element: occurrence.element,
    activation: occurrence.activation,
    role: occurrence.role,
  };
}

/** The journal fact that `occurrence` started, at the moment it begins. */
function recordStart(state: State, occurrence: Occurrence, sourceType: string): State {
  const fact: StartedFact = { occurrence: keyOf(state, occurrence), owner: occurrence.scope, sourceType };
  return { ...state, draft: { ...state.draft, started: [...state.draft.started, fact] } };
}

/** The journal fact that `occurrence` ended. */
export function recordEnd(state: State, key: OccurrenceKey, terminal: Terminal): State {
  return { ...state, draft: { ...state.draft, ended: [...state.draft.ended, [key, terminal] as const] } };
}

/**
 * Begin what `request` names: its reservation, placed in the request's scope, or a fresh occurrence numbered under
 * `role`. A reservation keeps its activation, so an armed subscription's number is its occurrence's number.
 */
export function beginOccurrence(
  state: State,
  request: BeginRequest,
  role: ActivationRole,
  sourceType: string,
): readonly [State, Occurrence] {
  const reserved = request.reserved === null ? null : occurrenceOf(state, request.reserved);
  let current = state;
  let occurrence: Occurrence;
  if (reserved !== null) { occurrence = reserved; } else {
    const [activated, activation] = activate(state, instanceOf(state, request.scope), request.element, role);
    const [issued, id] = issueOccurrence(activated, request.scope, request.element);
    current = issued;
    occurrence = {
      id,
      element: request.element,
      scope: request.scope,
      activation,
      role,
      continuation: flowContinuation,
      incoming: null,
      begun: true,
    };
  }
  const begun: Occurrence = {
    ...occurrence,
    scope: request.scope,
    continuation: request.continuation,
    incoming: request.incoming,
    begun: true,
  };
  const others = current.occurrences.filter((other) => other.id !== begun.id);
  return [recordStart({ ...current, occurrences: [...others, begun] }, begun, sourceType), begun];
}

/** Start a reservation's occurrence where it stands: the journal fact only. */
export function startReserved(state: State, occurrence: Occurrence, sourceType: string): readonly [State, Occurrence] {
  if (occurrence.begun) return [state, occurrence];
  const begun: Occurrence = { ...occurrence, begun: true };
  const occurrences = state.occurrences.map((other) => (other.id === begun.id ? begun : other));
  return [recordStart({ ...state, occurrences }, begun, sourceType), begun];
}

/** A fresh key for an item of `occurrence` in `role`: the occurrence's next ordinal, counted up. */
export function issueItem(state: State, occurrence: OccurrenceId, role: ItemRole): readonly [State, ItemKey] {
  const ordinal = treeMapGetD(state.itemOrdinals, occurrence, compareOccurrenceId, 0);
  const itemOrdinals = treeMapInsert(state.itemOrdinals, occurrence, ordinal + 1, compareOccurrenceId);
  return [{ ...state, itemOrdinals }, { occurrence, role, ordinal }];
}

/** Add `item` under its own key, replacing an item with that key. */
export function putItem(state: State, item: OpenItem): State {
  return { ...state, openItems: insertItem(state.openItems, item) };
}

/** An item waiting for the begun `occurrence`. */
export function openItem(state: State, kind: OpenKind, occurrence: Occurrence): State {
  const [positioned, position] = takePosition(state);
  const [issued, id] = issueItem(positioned, occurrence.id, ItemRole.Wait);
  return putItem(issued, {
    id, position, kind, element: occurrence.element, scope: occurrence.scope, attachedTo: null, passive: false,
  });
}

/** A subscription item for `element`, with a fresh reservation; `host` is the occurrence it hangs on. */
export function openSubscription(
  state: State,
  kind: OpenKind,
  element: ElementId,
  scope: ScopeOccurrenceId,
  host: OccurrenceId | null,
  passive: boolean,
): readonly [State, OpenItem] {
  const [reserved, occurrence] = reserve(state, element, scope);
  const [positioned, position] = takePosition(reserved);
  const [issued, id] = issueItem(positioned, occurrence.id, ItemRole.Subscription);
  const item: OpenItem = { id, position, kind, element, scope, attachedTo: host, passive };
  return [putItem(issued, item), item];
}

export function closeItem(state: State, id: ItemKey): State {
  return { ...state, openItems: state.openItems.filter((item) => !sameItemKey(item.id, id)) };
}

/** Remove the items waiting for the occurrence `id`. */
export function closeOwnItems(state: State, id: OccurrenceId): State {
  return { ...state, openItems: state.openItems.filter((item) => item.id.occurrence !== id) };
}

/** Remove the items attached to the occurrence `host`, with the reservations they hold, listed once (`State.disarm`). */
export function disarm(state: State, host: OccurrenceId): State {
  const attached = new Set(state.openItems.flatMap((item) => item.attachedTo === host ? [item.id.occurrence] : []));
  const dropped = new Set(state.occurrences.flatMap((occurrence) =>
    !occurrence.begun && attached.has(occurrence.id) ? [occurrence.id] : []));
  return {
    ...state,
    openItems: state.openItems.filter((item) => item.attachedTo !== host),
    occurrences: state.occurrences.filter((occurrence) => occurrence.begun || !attached.has(occurrence.id)),
    itemOrdinals: state.itemOrdinals.filter(([id]) => !dropped.has(id)),
  };
}

/**
 * Enter a new scope occurrence of `element` inside `parent`, with the given local variables, `keyed`. The scope belongs
 * to `occurrence`, when it has one.
 */
export function enterScope(
  state: State,
  element: ElementId,
  parent: ScopeOccurrenceId,
  locals: readonly Binding[],
  occurrence: OccurrenceId | null,
): readonly [State, ScopeOccurrenceId] {
  const slot: ScopeSlot = { parent, element };
  const ordinal = treeMapGetD(state.scopeOrdinals, slot, compareScopeSlot, 0);
  const id = childScope(parent, element, ordinal);
  return [
    {
      ...state,
      scopeOrdinals: treeMapInsert(state.scopeOrdinals, slot, ordinal + 1, compareScopeSlot),
      scopes: [...state.scopes, { id, element, occurrence, calledInstance: null }],
      variables: [...state.variables, { scope: id, entries: keyed(locals) }],
    },
    id,
  ];
}

/**
 * The identifier of the process instance a Call Activity's `activation` calls from the instance `caller`: each part
 * prefixed by its UTF-8 byte length, so that nested identifiers never collide.
 */
export function calledInstanceId(caller: string, call: ElementId, activation: number): string {
  return `call:${utf8ByteSize(caller)}:${caller}:${utf8ByteSize(call)}:${call}:${activation}`;
}

/**
 * Enter the called process instance of the Call occurrence `call`, with the given variables: a scope occurrence that
 * is the called instance's root, recording the definition the Call bound for this instance. The instance is named by the
 * Call's authored identifier (`programPublicId`), so a Call in another deployment's process that a program carries as a
 * renamed copy names its instance as that process's own deployment does (PC-SCOPE-03).
 */
export function enterCalled(
  state: State,
  program: Program,
  call: Occurrence,
  variables: readonly Binding[],
  definition: DefinitionRef,
): readonly [State, ScopeOccurrenceId] {
  const caller = instanceOf(state, call.scope);
  const [entered, id] = enterScope(state, call.element, call.scope, variables, call.id);
  const calledInstance = calledInstanceId(caller, programPublicId(program, call.element), call.activation);
  return [
    {
      ...entered,
      scopes: entered.scopes.map((occurrence) => (occurrence.id === id ? { ...occurrence, calledInstance } : occurrence)),
      slots: { ...entered.slots, instances: [...entered.slots.instances, { root: id, businessKey: null, definition }] },
    },
    id,
  ];
}

/**
 * The elements the scope occurrence `scope` declares: for a called root, the process-level elements of the process its
 * Call bound (its `slots.instances` entry), not the Call Activity's, since a called Process behaves as a normal Process
 * (BPMN 2.0.2 §13.3.4); otherwise the children of its element.
 */
export function childrenOf(state: State, program: Program, scope: ScopeOccurrenceId): readonly Element[] {
  const occurrence = state.scopes.find((candidate) => candidate.id === scope);
  const bound = state.slots.instances.find((entry) => entry.root === scope)?.definition ?? null;
  if (occurrence !== undefined && occurrence.calledInstance !== null && bound !== null) {
    const process = program.processes.find((candidate) => definitionRefEquals(candidate.definition, bound));
    return process === undefined ? [] : programProcessChildren(program, process);
  }
  return programChildren(program, occurrence?.element ?? null);
}

function ownEntries(state: State, scope: ScopeOccurrenceId): readonly Binding[] | null {
  return state.variables.find((entry) => entry.scope === scope)?.entries ?? null;
}

/**
 * Whether the frame of `scope` shows its binding of `name`: a Scope's item only in an occurrence of the Scope that
 * declares it, any other name in every frame. BPMN references data by element identity (§10.4.1), so another frame's
 * binding of an item's identifier neither shadows the item nor stands in for it while it is unset.
 */
export function shows(state: State, program: Program, scope: ScopeOccurrenceId, name: string): boolean {
  const declaring = programItemScope(program, name);
  return declaring === null || scopeOf(state, scope)?.element === declaring;
}

/** Variables visible from `scope`, innermost first, up to the root of its process instance, each frame's as it `shows` them. */
export function visible(state: State, program: Program, scope: ScopeOccurrenceId): readonly Binding[] {
  const out: Binding[] = [];
  for (let current: ScopeOccurrenceId | null = scope; current !== null;) {
    const frame = current;
    out.push(...(ownEntries(state, frame) ?? []).filter(([name]) => shows(state, program, frame, name)));
    if (frame === root || calledRoot(state, frame) || !stands(state, frame)) break;
    current = scopeParent(frame);
  }
  return out;
}

/**
 * The nearest occurrence of the Scope `element` from `scope` outward, up to the root of its process instance: the
 * occurrence whose frame holds the items `element` declares for a site in `scope`.
 */
export function declaring(state: State, scope: ScopeOccurrenceId, element: ElementId): ScopeOccurrenceId | null {
  for (let current: ScopeOccurrenceId | null = scope; current !== null; current = scopeParent(current)) {
    if (scopeOf(state, current)?.element === element) return current;
    if (calledRoot(state, current) || !stands(state, current)) return null;
  }
  return null;
}

/** The innermost scope visible from `scope` that declares `name`, up to the root of its process instance. */
export function owner(state: State, scope: ScopeOccurrenceId, name: string): ScopeOccurrenceId | null {
  const bindsOwn = (id: ScopeOccurrenceId): boolean => (ownEntries(state, id) ?? []).some(([key]) => key === name);
  for (let current: ScopeOccurrenceId | null = scope; current !== null; current = scopeParent(current)) {
    if (bindsOwn(current)) return current;
    if (calledRoot(state, current) || !stands(state, current)) return null;
  }
  return null;
}

/** Set `name` in `target`'s own variables and log the write. */
export function setVariable(state: State, target: ScopeOccurrenceId, name: string, value: Value): State {
  const replace = (entries: readonly Binding[]): readonly Binding[] =>
    entries.some(([key]) => key === name)
      ? entries.map((entry) => (entry[0] === name ? ([name, value] as const) : entry))
      : [...entries, [name, value] as const];
  const kind = (ownEntries(state, target) ?? []).some(([key]) => key === name) ? VariableEvent.Update : VariableEvent.Create;
  const written: State = { ...state, writes: [...state.writes, { scope: target, name, kind }] };
  if (written.variables.some((entry) => entry.scope === target)) {
    return {
      ...written,
      variables: written.variables.map((entry) =>
        entry.scope === target ? { ...entry, entries: replace(entry.entries) } : entry),
    };
  }
  return { ...written, variables: [...written.variables, { scope: target, entries: [[name, value] as const] }] };
}

/** Delete `name` from `target`'s own variables and log the deletion. */
export function removeVariable(state: State, target: ScopeOccurrenceId, name: string): State {
  return {
    ...state,
    writes: [...state.writes, { scope: target, name, kind: VariableEvent.Delete }],
    variables: state.variables.map((entry) =>
      entry.scope === target ? { ...entry, entries: entry.entries.filter(([key]) => key !== name) } : entry),
  };
}
