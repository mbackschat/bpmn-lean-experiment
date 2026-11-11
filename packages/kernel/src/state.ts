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
  VariableEvent, assertNever, definitionRefEquals, programChildren, programProcessChildren, utf8ByteSize, type DefinitionRef, type Element,
  type ElementId, type FlowId, type Program, type Value,
} from "./il/types.js";
import {
  type Binding, type ConditionalWaitDetail, type EffectDetail, type IncidentDetail, InputTag, type MessageChannel,
  messageChannelEquals, type MessageWaitDetail, type OpenKind, OpenKindTag, openKindView, optionalChannelEquals,
  type SendDescriptor, type SignalAddress, SignalAddressTag, signalAddressMatches, type SignalWaitDetail, type TimerDetail,
  type TimerRecurrence, type UserTaskDetail, type WaitView,
} from "./state/wait.js";
export {
  type Binding, type ConditionalWaitDetail, type EffectDetail, type IncidentDetail, InputTag, type MessageChannel,
  messageChannelEquals, type MessageWaitDetail, type OpenKind, OpenKindTag, openKindView, optionalChannelEquals,
  type SendDescriptor, type SignalAddress, SignalAddressTag, signalAddressMatches, type SignalWaitDetail, type TimerDetail,
  type TimerRecurrence, type UserTaskDetail, type WaitView,
};
import {
  type CommandAction, CommandActionTag, type CommandInput, type CorrelationMatch, type CriterionTarget,
  CriterionTargetTag, type DeliveryInput, type DeliveryTrigger, DeliveryTriggerTag, type EffectInput,
  type EffectOutcome, EffectOutcomeTag, type EvalContext, type Input, noStartTrigger, type OccurrenceRef,
  type StartInput, type StartTrigger, StartTriggerTag, type TimerInput,
} from "./state/input.js";
export {
  type CommandAction, CommandActionTag, type CommandInput, type CorrelationMatch, type CriterionTarget,
  CriterionTargetTag, type DeliveryInput, type DeliveryTrigger, DeliveryTriggerTag, type EffectInput,
  type EffectOutcome, EffectOutcomeTag, type EvalContext, type Input, noStartTrigger, type OccurrenceRef,
  type StartInput, type StartTrigger, StartTriggerTag, type TimerInput,
};
import {
  type Compensable, type CompensationRun, type Compensations, type FeatureSlots, featureSlotsClear,
  featureSlotsKeptAlive, type InstanceData, type Iteration, IterationTag, type Leave, leaveFlows, leaveOutgoing,
  leaveRaised, LeaveTag, type MultiInstanceRun, type Parked, parkedEquals, type Resume, ResumeTag,
  type ScopeOccurrenceId,
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
  type Compensable, type CompensationRun, type Compensations, type FeatureSlots, featureSlotsClear,
  featureSlotsKeptAlive, type InstanceData, type Iteration, IterationTag, type Leave, leaveFlows, leaveOutgoing,
  leaveRaised, LeaveTag, type MultiInstanceRun, type Parked, parkedEquals, type Resume, ResumeTag,
  type ScopeOccurrenceId,
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
  | { readonly tag: ContinuationTag.MultiInstance; readonly body: number }
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
  readonly id: number;
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
 * belongs to, `null` for the process root, a Multi-Instance instance and a handler's context.
 */
export interface ScopeOccurrence {
  readonly id: ScopeOccurrenceId;
  readonly element: ElementId | null;
  readonly parent: ScopeOccurrenceId | null;
  readonly occurrence: number | null;
  readonly calledInstance: string | null;
}

export interface ScopeVariables { readonly scope: ScopeOccurrenceId; readonly entries: readonly Binding[]; }

/**
 * One open interaction. `occurrence` is the occurrence it waits for, or a subscription's reservation; the public
 * identity is the occurrence's activation of `element`. `attachedTo` is the occurrence the subscription hangs on (the
 * boundary's host, the Event-Based Gateway of an arm). A `passive` item, such as an Event Sub-Process start
 * subscription, keeps no scope occurrence alive and is removed when its scope completes.
 */
export interface OpenItem {
  readonly id: number;
  readonly kind: OpenKind;
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly occurrence: number;
  readonly attachedTo: number | null;
  readonly passive: boolean;
}

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
 * Event Sub-Process, `locals` are the new occurrence's extra locals and `inner` the reservation of its start Event;
 * `trigger` is what fired a start Event.
 */
export interface BeginRequest {
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly continuation: Continuation;
  readonly incoming: FlowId | null;
  readonly reserved: number | null;
  readonly locals: readonly Binding[];
  readonly inner: number | null;
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
    locals: [],
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
  | { readonly tag: SignalTag.Arm; readonly host: number; readonly element: ElementId; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.ArmScope; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.ArmGateway; readonly occurrence: number; readonly gateway: ElementId; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.Raise; readonly event: Raised; readonly origin: Origin }
  | { readonly tag: SignalTag.Begin; readonly request: BeginRequest }
  | {
      readonly tag: SignalTag.Complete;
      readonly occurrence: number;
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
  | { readonly tag: SignalTag.Cancel; readonly occurrence: number }
  | { readonly tag: SignalTag.Fire; readonly item: number; readonly fired: Fired }
  | { readonly tag: SignalTag.EndInstance; readonly status: InstanceStatus; readonly failure: InstanceFailure | null }
  | {
      readonly tag: SignalTag.Compensate;
      readonly scope: ScopeOccurrenceId;
      readonly activity: ElementId | null;
      readonly trigger: OccurrenceRef;
      readonly leave: number | null;
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
export function completeSignal(occurrence: number, leave: Leave, writes: readonly Binding[], rule: WriteRule): Signal {
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
}

export const emptyDraft: Draft = { started: [], ended: [], cancelled: [] };

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
  readonly openItems: readonly OpenItem[];
  readonly activations: readonly ActivationCount[];
  readonly nextIssue: number;
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

/**
 * Why a step does not commit. Harness failures never appear here. `rolledBack` is a command whose closure could not
 * continue (no outgoing flow to take): it ends the run with the state before the command.
 */
export enum FailureTag {
  Rejected = "rejected",
  RolledBack = "rolledBack",
  SemanticFailure = "semanticFailure",
  Unsupported = "unsupported",
}

export interface Failure { readonly tag: FailureTag; readonly code: string; }

/** Lean's `Except Failure α`. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: Failure };

export type Outcome = Result<State>;

export function committed<T>(value: T): Result<T> { return { ok: true, value }; }

export function failed<T>(tag: FailureTag, code: string): Result<T> { return { ok: false, failure: { tag, code } }; }

/** An `Except` failure carried to another result type. */
export function failedWith<T>(failure: Failure): Result<T> { return { ok: false, failure }; }

// State operations

export const root: ScopeOccurrenceId = 0;

/** A fresh process instance: one root scope occurrence with the given variables. */
export function initial(instanceId: string, variables: readonly Binding[], businessKey: string | null = null): State {
  return {
    instanceId,
    status: InstanceStatus.Running,
    scopes: [{ id: root, element: null, parent: null, occurrence: null, calledInstance: null }],
    occurrences: [],
    tokens: [],
    variables: [{ scope: root, entries: variables }],
    openItems: [],
    activations: [],
    nextIssue: 1,
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

export function issue(state: State): readonly [State, number] {
  return [{ ...state, nextIssue: state.nextIssue + 1 }, state.nextIssue];
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
export function localScope(state: State, host: number): ScopeOccurrenceId | null {
  return state.scopes.find((entry) => entry.occurrence === host && entry.calledInstance === null)?.id ?? null;
}

/**
 * The scope occurrence an occurrence `host` reads from and writes outward from: its own scope (`localScope`), so its
 * input-mapped locals are visible (`PvmExecutionImpl.java:1304-1318`), otherwise `scope`, the enclosing one.
 */
export function ownScope(state: State, host: number, scope: ScopeOccurrenceId): ScopeOccurrenceId {
  return localScope(state, host) ?? scope;
}

/** The root of the process instance `scope` belongs to: the nearest called-instance root, else the process root. */
export function instanceRoot(state: State, scope: ScopeOccurrenceId): ScopeOccurrenceId {
  let current = scope;
  for (let fuel = state.scopes.length; fuel > 0; fuel -= 1) {
    if (calledRoot(state, current)) return current;
    const parent = scopeOf(state, current)?.parent ?? null;
    if (parent === null) return root;
    current = parent;
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
    ...state.scopes.flatMap((candidate) => candidate.parent === null ? [] : [candidate.parent]),
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
  const [issued, id] = issue(activated);
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

export function occurrenceOf(state: State, id: number): Occurrence | null {
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
    const [issued, id] = issue(activated);
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

/** An item waiting for the begun `occurrence`. */
export function openItem(state: State, kind: OpenKind, occurrence: Occurrence): State {
  const [issued, id] = issue(state);
  const item: OpenItem = {
    id,
    kind,
    element: occurrence.element,
    scope: occurrence.scope,
    occurrence: occurrence.id,
    attachedTo: null,
    passive: false,
  };
  return { ...issued, openItems: [...issued.openItems, item] };
}

/** A subscription item for `element`, with a fresh reservation; `host` is the occurrence it hangs on. */
export function openSubscription(
  state: State,
  kind: OpenKind,
  element: ElementId,
  scope: ScopeOccurrenceId,
  host: number | null,
  passive: boolean,
): readonly [State, OpenItem] {
  const [reserved, occurrence] = reserve(state, element, scope);
  const [issued, id] = issue(reserved);
  const item: OpenItem = { id, kind, element, scope, occurrence: occurrence.id, attachedTo: host, passive };
  return [{ ...issued, openItems: [...issued.openItems, item] }, item];
}

export function closeItem(state: State, id: number): State {
  return { ...state, openItems: state.openItems.filter((item) => item.id !== id) };
}

/** Remove the items waiting for the occurrence `id`. */
export function closeOwnItems(state: State, id: number): State {
  return { ...state, openItems: state.openItems.filter((item) => item.occurrence !== id) };
}

/** Remove the items attached to the occurrence `host`, with the reservations they hold. */
export function disarm(state: State, host: number): State {
  const attached = state.openItems.filter((item) => item.attachedTo === host);
  return {
    ...state,
    openItems: state.openItems.filter((item) => item.attachedTo !== host),
    occurrences: state.occurrences.filter((occurrence) =>
      occurrence.begun || !attached.some((item) => item.occurrence === occurrence.id)),
  };
}

/**
 * Enter a new scope occurrence of `element` inside `parent`, with the given local variables. The scope belongs to
 * `occurrence`, when it has one.
 */
export function enterScope(
  state: State,
  element: ElementId,
  parent: ScopeOccurrenceId,
  locals: readonly Binding[],
  occurrence: number | null,
): readonly [State, ScopeOccurrenceId] {
  const [issued, id] = issue(state);
  return [
    {
      ...issued,
      scopes: [...issued.scopes, { id, element, parent, occurrence, calledInstance: null }],
      variables: [...issued.variables, { scope: id, entries: locals }],
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
 * is the called instance's root, recording the definition the Call bound for this instance.
 */
export function enterCalled(
  state: State,
  call: Occurrence,
  variables: readonly Binding[],
  definition: DefinitionRef,
): readonly [State, ScopeOccurrenceId] {
  const caller = instanceOf(state, call.scope);
  const [entered, id] = enterScope(state, call.element, call.scope, variables, call.id);
  const calledInstance = calledInstanceId(caller, call.element, call.activation);
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

/** The scope occurrences inside `scope`, transitively, including `scope`, the deepest last. */
export function subtree(state: State, scope: ScopeOccurrenceId): readonly ScopeOccurrenceId[] {
  let frontier: ScopeOccurrenceId[] = [scope];
  const seen: ScopeOccurrenceId[] = [];
  for (let fuel = state.scopes.length + 1; fuel > 0 && frontier.length > 0; fuel -= 1) {
    const [next, ...rest] = frontier as [ScopeOccurrenceId, ...ScopeOccurrenceId[]];
    const children = state.scopes.filter((candidate) => candidate.parent === next).map((candidate) => candidate.id);
    frontier = [...rest, ...children];
    seen.push(next);
  }
  return seen;
}

function ownEntries(state: State, scope: ScopeOccurrenceId): readonly Binding[] | null {
  return state.variables.find((entry) => entry.scope === scope)?.entries ?? null;
}

/** Variables visible from `scope`, innermost first, up to the root of its process instance. */
export function visible(state: State, scope: ScopeOccurrenceId): readonly Binding[] {
  const out: Binding[] = [];
  let current: ScopeOccurrenceId | null = scope;
  for (let fuel = state.scopes.length; fuel > 0 && current !== null; fuel -= 1) {
    out.push(...(ownEntries(state, current) ?? []));
    if (calledRoot(state, current)) break;
    current = scopeOf(state, current)?.parent ?? null;
  }
  return out;
}

/** The innermost scope visible from `scope` that declares `name`, up to the root of its process instance. */
export function owner(state: State, scope: ScopeOccurrenceId, name: string): ScopeOccurrenceId | null {
  const declares = (id: ScopeOccurrenceId): boolean => (ownEntries(state, id) ?? []).some(([key]) => key === name);
  let current: ScopeOccurrenceId | null = scope;
  for (let fuel = state.scopes.length; fuel > 0 && current !== null; fuel -= 1) {
    if (declares(current)) return current;
    if (calledRoot(state, current)) return null;
    current = scopeOf(state, current)?.parent ?? null;
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
