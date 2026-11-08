/**
 * Kernel runtime state, transcribed from `Kernel/State.lean`.
 *
 * Flat and identifier-indexed: scope occurrences refer to their parent by identifier, tokens sit on sequence
 * flows, and every open interaction is one `OpenItem` keyed by an engine-issued identity. The top-level shape is
 * fixed; a feature keeps its own data in its slot of `FeatureSlots`, which is always present and empty by default.
 * Every operation returns a new state; nothing is mutated. A Lean function `State.f` is exported as `f`; any
 * other `T.f` as `tF`.
 */
import { assertNever, type ElementId, type FlowId, type Value, ValueTag } from "./il/types.js";

/** Lean's `ScopeOccurrenceId`, a structure around one `Nat`. */
export type ScopeOccurrenceId = number;

export type Binding = readonly [string, Value];

/**
 * A scope occurrence: the process instance (`element = null`), one activation of a Scope element, or the root of
 * a called process instance, whose `element` is the Call Activity and `calledInstance` the instance's identifier.
 * `compensating` marks the occurrence of one compensation handler, whose `element` is the handler; the handler's
 * public activation is the one its own start records inside this occurrence.
 */
export interface ScopeOccurrence {
  readonly id: ScopeOccurrenceId;
  readonly element: ElementId | null;
  readonly parent: ScopeOccurrenceId | null;
  readonly activation: number;
  readonly calledInstance: string | null;
  readonly compensating: boolean;
}

/** A token on a sequence flow, inside a scope occurrence. */
export interface Token {
  readonly flow: FlowId;
  readonly scope: ScopeOccurrenceId;
}

export interface ScopeVariables {
  readonly scope: ScopeOccurrenceId;
  readonly entries: readonly Binding[];
}

/**
 * What an open User Task publishes besides its identity. Metadata is published only when the task carries
 * candidate groups; form fields are `(key, type)` pairs.
 */
export interface UserTaskDetail {
  readonly name: string | null;
  readonly candidateGroups: readonly string[];
  readonly formFields: readonly (readonly [string, string])[];
  readonly inputs: readonly Binding[];
}

/**
 * A Message address: the Message's identifier and, when the model routes it through an Operation, that
 * Operation. `messageId = null` is an unspecified Message.
 */
export interface MessageChannel {
  readonly messageId: string | null;
  readonly interfaceRef: string | null;
  readonly operationRef: string | null;
}

/** Lean's derived `DecidableEq MessageChannel`. */
export function messageChannelEquals(left: MessageChannel, right: MessageChannel): boolean {
  return left.messageId === right.messageId && left.interfaceRef === right.interfaceRef &&
    left.operationRef === right.operationRef;
}

/**
 * `payload`: the delivery carries a payload the wait writes. `correlationKey` is the key a delivery must match, for
 * a subscription with correlation criteria: such a wait is published as a definition-scoped correlated
 * publication, never as a directly addressed delivery.
 */
export interface MessageWaitDetail {
  readonly channel: MessageChannel;
  readonly payload: boolean;
  readonly correlationKey: string | null;
}

/** `period` re-arms a cycle Timer after it fires. */
export interface TimerDetail {
  readonly deadlineMs: number;
  readonly period: number | null;
}

/** `failures` counts the incidents this effect occurrence has had; a retry reopens it with the same activation. */
export interface EffectDetail {
  readonly protocol: string;
  readonly operation: string;
  readonly arguments: readonly Binding[];
  readonly failures: number;
}

/** `cancellable` publishes the `cancelIncidentProcess` interaction beside `retryIncident`. */
export interface IncidentDetail {
  readonly effect: EffectDetail;
  readonly generation: number;
  readonly cancellable: boolean;
}

/**
 * Guarded type: only `step.ts` and `publish.ts` match on it. Each kind carries the typed detail its public
 * observation needs, filled by the feature that opens the item.
 */
export enum OpenKindTag {
  UserTask = "userTask",
  Message = "message",
  Timer = "timer",
  Effect = "effect",
  Incident = "incident",
  Evaluation = "evaluation",
}

export type OpenKind =
  | { readonly tag: OpenKindTag.UserTask; readonly detail: UserTaskDetail }
  | { readonly tag: OpenKindTag.Message; readonly detail: MessageWaitDetail }
  | { readonly tag: OpenKindTag.Timer; readonly detail: TimerDetail }
  | { readonly tag: OpenKindTag.Effect; readonly detail: EffectDetail }
  | { readonly tag: OpenKindTag.Incident; readonly detail: IncidentDetail }
  | { readonly tag: OpenKindTag.Evaluation; readonly request: number };

export function openKindTimer(kind: OpenKind): TimerDetail | null {
  switch (kind.tag) {
    case OpenKindTag.Timer:
      return kind.detail;
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

export function openKindEffect(kind: OpenKind): EffectDetail | null {
  switch (kind.tag) {
    case OpenKindTag.Effect:
      return kind.detail;
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Timer:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

export function openKindIncident(kind: OpenKind): IncidentDetail | null {
  switch (kind.tag) {
    case OpenKindTag.Incident:
      return kind.detail;
    case OpenKindTag.UserTask:
    case OpenKindTag.Message:
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

export function openKindMessage(kind: OpenKind): MessageWaitDetail | null {
  switch (kind.tag) {
    case OpenKindTag.Message:
      return kind.detail;
    case OpenKindTag.UserTask:
    case OpenKindTag.Timer:
    case OpenKindTag.Effect:
    case OpenKindTag.Incident:
    case OpenKindTag.Evaluation:
      return null;
  }
  return assertNever(kind);
}

/**
 * One open interaction. `activation` counts activations of `element` in this process instance, from 1.
 * `attachedTo` is the host an attached subscription belongs to: the id of the host's own item, or the value of the
 * host scope occurrence's id. A `passive` item, such as an Event Sub-Process start subscription, keeps no scope
 * occurrence alive and is removed when its scope completes.
 */
export interface OpenItem {
  readonly id: number;
  readonly kind: OpenKind;
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly activation: number;
  readonly attachedTo: number | null;
  readonly passive: boolean;
}

export enum InstanceStatus {
  Running = "running",
  Completed = "completed",
  Cancelled = "cancelled",
  Failed = "failed",
}

/** A thrown event that propagates to a catcher. */
export enum RaisedTag {
  Error = "error",
  Escalation = "escalation",
  Signal = "signal",
  Compensation = "compensation",
  Cancel = "cancel",
}

export type Raised =
  | { readonly tag: RaisedTag.Error; readonly code: string; readonly message: string | null }
  | { readonly tag: RaisedTag.Escalation; readonly code: string }
  | { readonly tag: RaisedTag.Signal; readonly name: string }
  | { readonly tag: RaisedTag.Compensation; readonly activity: ElementId | null; readonly waitForCompletion: boolean }
  | { readonly tag: RaisedTag.Cancel };

/** Whether a raised event is a Cancel. */
export function raisedIsCancel(raised: Raised): boolean {
  switch (raised.tag) {
    case RaisedTag.Cancel:
      return true;
    case RaisedTag.Error:
    case RaisedTag.Escalation:
    case RaisedTag.Signal:
    case RaisedTag.Compensation:
      return false;
  }
  return assertNever(raised);
}

/**
 * Where a raised event starts its search: the throwing element, the scope occurrence it ran in, and, for an
 * Activity, the host id its boundaries are attached to and the activation it raised from.
 */
export interface Origin {
  readonly element: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly host: number | null;
  readonly activation: number | null;
}

/** The public identity of an occurrence: its process instance, the element and its activation number. */
export interface OccurrenceRef {
  readonly processInstanceId: string;
  readonly element: ElementId;
  readonly activation: number;
}

/**
 * Guarded type: `step.ts` owns matching on it. The cross-feature protocol: a feature that needs another feature's
 * mechanism enqueues a signal, and `step.ts` hands it to the owning hook before any token moves.
 */
export enum SignalTag {
  /** Arm the boundaries of `element`, attached to `host`, in `scope`. */
  Arm = "arm",
  /** Arm the Event Sub-Process starts of the scope occurrence `scope` (the process root included). */
  ArmScope = "armScope",
  /** Arm the arms of the Event-Based Gateway `gateway`, reached in `scope`. */
  ArmGateway = "armGateway",
  Raise = "raise",
  /** Start the Event Sub-Process `element` inside `parent`, writing `variables` into its new occurrence. */
  StartEventSubProcess = "startEventSubProcess",
  /**
   * `element`, an Activity or Scope with a compensation handler, completed in `scope`; `snapshot` is the context
   * its handler restores.
   */
  Completed = "completed",
  /**
   * Run the compensation handlers retained in `scope` for `trigger`; once all have completed, leave `scope` if
   * `leave` and add the `resume` tokens.
   */
  Compensate = "compensate",
  /** Begin the Activity `element` in `scope` without an arriving token. */
  StartActivity = "startActivity",
  /** An Error left the compensation handler occurrence `handler` uncaught. */
  CompensationFailed = "compensationFailed",
}

export type Signal =
  | { readonly tag: SignalTag.Arm; readonly host: number; readonly element: ElementId; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.ArmScope; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.ArmGateway; readonly gateway: ElementId; readonly scope: ScopeOccurrenceId }
  | { readonly tag: SignalTag.Raise; readonly event: Raised; readonly origin: Origin }
  | {
      readonly tag: SignalTag.StartEventSubProcess;
      readonly element: ElementId;
      readonly parent: ScopeOccurrenceId;
      readonly variables: readonly Binding[];
    }
  | {
      readonly tag: SignalTag.Completed;
      readonly element: ElementId;
      readonly scope: ScopeOccurrenceId;
      readonly snapshot: readonly Binding[];
    }
  | {
      readonly tag: SignalTag.Compensate;
      readonly scope: ScopeOccurrenceId;
      readonly trigger: OccurrenceRef;
      readonly leave: boolean;
      readonly resume: readonly Token[];
    }
  | { readonly tag: SignalTag.StartActivity; readonly element: ElementId; readonly scope: ScopeOccurrenceId }
  | {
      readonly tag: SignalTag.CompensationFailed;
      readonly handler: ScopeOccurrenceId;
      readonly code: string;
      readonly message: string | null;
      readonly origin: Origin;
    };

/**
 * One instance of a Multi-Instance Activity: waiting to start, running as the open item `item`, or completed with
 * the value its output data item received.
 */
export enum IterationTag {
  Waiting = "waiting",
  Active = "active",
  Completed = "completed",
}

export type Iteration =
  | { readonly tag: IterationTag.Waiting }
  | { readonly tag: IterationTag.Active; readonly item: number }
  | { readonly tag: IterationTag.Completed; readonly output: Value };

/**
 * A running Multi-Instance Activity (`feature/multi-instance.ts`): the scope occurrence it holds its instances in,
 * the Activity's own activation, the input collection as evaluated once on entry, and one instance per item in
 * collection order.
 */
export interface MultiInstanceRun {
  readonly scope: ScopeOccurrenceId;
  readonly element: ElementId;
  readonly activation: number;
  readonly collection: Value;
  readonly instances: readonly Iteration[];
}

/**
 * The members of an input collection in order, `null` for a value that is not a collection; a String List's
 * members are Strings.
 */
export function multiInstanceRunItems(run: MultiInstanceRun): readonly Value[] | null {
  const collection = run.collection;
  switch (collection.tag) {
    case ValueTag.StringList:
      return collection.items.map((value): Value => ({ tag: ValueTag.String, value }));
    case ValueTag.List:
      return collection.items;
    case ValueTag.Null:
    case ValueTag.Bool:
    case ValueTag.Int:
    case ValueTag.Decimal:
    case ValueTag.String:
    case ValueTag.Map:
      return null;
  }
  return assertNever(collection);
}

/**
 * `runs` are the open Multi-Instance Activities; `entered` counts each Activity's activations, which are numbered
 * apart from those of its instances.
 */
export interface MultiInstances {
  readonly runs: readonly MultiInstanceRun[];
  readonly entered: readonly (readonly [ElementId, number])[];
}

/**
 * A completed Activity or Scope whose compensation handler may still run: it completed in `scope`, and its handler
 * restores `snapshot` (BPMN 2.0.2 §13.5.5).
 */
export interface Compensable {
  readonly subject: ElementId;
  readonly handler: ElementId;
  readonly scope: ScopeOccurrenceId;
  readonly snapshot: readonly Binding[];
}

/**
 * One compensation trigger in progress for the records retained in `scope`: handlers still `pending`, and those
 * `running` in their own scope occurrence. `leave` and `resume` say how the trigger continues once all completed.
 */
export interface CompensationRun {
  readonly trigger: OccurrenceRef;
  readonly scope: ScopeOccurrenceId;
  readonly pending: readonly Compensable[];
  readonly running: readonly (readonly [ScopeOccurrenceId, Compensable])[];
  readonly leave: boolean;
  readonly resume: readonly Token[];
}

/** `feature/compensation.ts`'s data: the retained records and the triggers in progress. */
export interface Compensations {
  readonly retained: readonly Compensable[];
  readonly runs: readonly CompensationRun[];
}

/**
 * The failure of a compensation handler, which fails its process instance: the trigger, the handler occurrence,
 * the effect that reported the Error, and the Error.
 */
export interface CompensationFailure {
  readonly trigger: OccurrenceRef;
  readonly handler: OccurrenceRef;
  readonly effect: OccurrenceRef;
  readonly code: string;
  readonly message: string | null;
}

/**
 * Feature-owned data, each slot starting empty. `parked` holds tokens that reached a join and wait for its other
 * incoming flows (`feature/flow.ts`); `held` holds tokens at an Activity whose InputSet is unavailable (BPMN 2.0.2
 * §10.4.2, `feature/work.ts`). Both keep their scope occurrence alive.
 */
export interface FeatureSlots {
  readonly parked: readonly Token[];
  readonly held: readonly Token[];
  readonly multiInstances: MultiInstances;
  readonly compensation: Compensations;
}

export interface State {
  readonly instanceId: string;
  readonly status: InstanceStatus;
  readonly scopes: readonly ScopeOccurrence[];
  readonly tokens: readonly Token[];
  readonly variables: readonly ScopeVariables[];
  readonly openItems: readonly OpenItem[];
  readonly activations: readonly (readonly [ElementId, number])[];
  readonly nextIssue: number;
  readonly logicalTimeMs: number;
  readonly signals: readonly Signal[];
  readonly slots: FeatureSlots;
  /** Present exactly when `status` is `failed`. */
  readonly failure: CompensationFailure | null;
}

/**
 * Why a step does not commit. Harness failures never appear here. `rolledBack` is a command whose closure could
 * not continue (no outgoing flow to take): it ends the run with the state before the command.
 */
export enum FailureTag {
  Rejected = "rejected",
  RolledBack = "rolledBack",
  SemanticFailure = "semanticFailure",
  Unsupported = "unsupported",
}

export interface Failure {
  readonly tag: FailureTag;
  readonly code: string;
}

/** Lean's `Except Failure α`. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: Failure };

export type Outcome = Result<State>;

export function committed<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function failed<T>(tag: FailureTag, code: string): Result<T> {
  return { ok: false, failure: { tag, code } };
}

// Inputs

export interface StartInput {
  readonly instanceId: string;
  readonly startEvent: ElementId | null;
  readonly variables: readonly Binding[];
}

export enum CommandActionTag {
  CompleteUserTask = "completeUserTask",
  RetryIncident = "retryIncident",
  CancelIncidentProcess = "cancelIncidentProcess",
}

export type CommandAction =
  | { readonly tag: CommandActionTag.CompleteUserTask; readonly values: readonly Binding[] }
  | { readonly tag: CommandActionTag.RetryIncident }
  | { readonly tag: CommandActionTag.CancelIncidentProcess };

export interface CommandInput {
  readonly occurrence: OccurrenceRef;
  readonly action: CommandAction;
}

/** A Message delivered to the subscription `occurrence` names. */
export interface DeliveryInput {
  readonly occurrence: OccurrenceRef;
  readonly channel: MessageChannel;
  readonly correlation: readonly Binding[];
  readonly payload: Value | null;
}

/** What fired a message or timer subscription. */
export enum FiredTag {
  Timer = "timer",
  Message = "message",
}

export type Fired =
  | { readonly tag: FiredTag.Timer; readonly logicalTimeMs: number }
  | { readonly tag: FiredTag.Message; readonly delivery: DeliveryInput };

export interface TimerInput {
  readonly occurrence: OccurrenceRef;
  readonly logicalTimeMs: number;
}

export enum EffectOutcomeTag {
  Success = "success",
  BusinessFailure = "businessFailure",
  TechnicalFailure = "technicalFailure",
}

export type EffectOutcome =
  | { readonly tag: EffectOutcomeTag.Success; readonly outputs: readonly Binding[] }
  | {
      readonly tag: EffectOutcomeTag.BusinessFailure;
      readonly code: string;
      readonly message: string | null;
      readonly outputs: readonly Binding[];
    }
  | { readonly tag: EffectOutcomeTag.TechnicalFailure };

export interface EffectInput {
  readonly occurrence: OccurrenceRef;
  readonly outcome: EffectOutcome;
}

/** The host's answer to an evaluation request, bound to the request's content digest. */
export interface EvaluationInput {
  readonly request: number;
  readonly contentSha256: string;
  readonly result: { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: string };
}

/** Guarded type: `step.ts` owns matching on it. */
export enum InputTag {
  Start = "start",
  Command = "command",
  Deliver = "deliver",
  TimerFire = "timerFire",
  EffectResult = "effectResult",
  EvaluationResult = "evaluationResult",
}

export type Input =
  | { readonly tag: InputTag.Start; readonly payload: StartInput }
  | { readonly tag: InputTag.Command; readonly payload: CommandInput }
  | { readonly tag: InputTag.Deliver; readonly payload: DeliveryInput }
  | { readonly tag: InputTag.TimerFire; readonly payload: TimerInput }
  | { readonly tag: InputTag.EffectResult; readonly payload: EffectInput }
  | { readonly tag: InputTag.EvaluationResult; readonly payload: EvaluationInput };

// Operations

export const root: ScopeOccurrenceId = 0;

/** A fresh process instance: one root scope occurrence with the given variables. */
export function initial(instanceId: string, variables: readonly Binding[]): State {
  return {
    instanceId,
    status: InstanceStatus.Running,
    scopes: [{ id: root, element: null, parent: null, activation: 0, calledInstance: null, compensating: false }],
    tokens: [],
    variables: [{ scope: root, entries: variables }],
    openItems: [],
    activations: [],
    nextIssue: 1,
    logicalTimeMs: 0,
    signals: [],
    slots: {
      parked: [],
      held: [],
      multiInstances: { runs: [], entered: [] },
      compensation: { retained: [], runs: [] },
    },
    failure: null,
  };
}

export function emit(state: State, flows: readonly FlowId[], scope: ScopeOccurrenceId): State {
  return { ...state, tokens: [...state.tokens, ...flows.map((flow) => ({ flow, scope }))] };
}

/** Hold a token at an Activity whose InputSet is unavailable (`FeatureSlots.held`). */
export function hold(state: State, token: Token): State {
  return { ...state, slots: { ...state.slots, held: [...state.slots.held, token] } };
}

/** The next activation number of `element`, recorded. */
export function activate(state: State, element: ElementId): readonly [State, number] {
  const count = (state.activations.find((entry) => entry[0] === element)?.[1] ?? 0) + 1;
  const activations = [
    [element, count] as const,
    ...state.activations.filter((entry) => entry[0] !== element),
  ];
  return [{ ...state, activations }, count];
}

export function issue(state: State): readonly [State, number] {
  return [{ ...state, nextIssue: state.nextIssue + 1 }, state.nextIssue];
}

export function openItem(state: State, kind: OpenKind, element: ElementId, scope: ScopeOccurrenceId): State {
  const [activated, activation] = activate(state, element);
  const [issued, id] = issue(activated);
  return {
    ...issued,
    openItems: [...issued.openItems, { id, kind, element, scope, activation, attachedTo: null, passive: false }],
  };
}

export function signal(state: State, next: Signal): State {
  return { ...state, signals: [...state.signals, next] };
}

export function closeItem(state: State, id: number): State {
  return { ...state, openItems: state.openItems.filter((item) => item.id !== id) };
}

/** Remove the items attached to `host`. */
export function disarm(state: State, host: number): State {
  return { ...state, openItems: state.openItems.filter((item) => item.attachedTo !== host) };
}

export function openAttached(
  state: State,
  kind: OpenKind,
  element: ElementId,
  scope: ScopeOccurrenceId,
  host: number | null,
): readonly [State, number] {
  const [activated, activation] = activate(state, element);
  const [issued, id] = issue(activated);
  return [
    {
      ...issued,
      openItems: [...issued.openItems, { id, kind, element, scope, activation, attachedTo: host, passive: false }],
    },
    id,
  ];
}

/** Enter a new scope occurrence of `element` inside `parent`, with the given local variables. */
export function enterScope(
  state: State,
  element: ElementId,
  parent: ScopeOccurrenceId,
  locals: readonly Binding[],
): readonly [State, ScopeOccurrenceId] {
  const [activated, activation] = activate(state, element);
  const [issued, id] = issue(activated);
  return [
    {
      ...issued,
      scopes: [
        ...issued.scopes,
        { id, element, parent, activation, calledInstance: null, compensating: false },
      ],
      variables: [...issued.variables, { scope: id, entries: locals }],
    },
    id,
  ];
}

/**
 * Lean's `String.utf8ByteSize`, counted per code point. A lone surrogate, which a Lean `String` cannot hold, counts
 * as the three bytes of its replacement character.
 */
export function utf8ByteSize(text: string): number {
  let size = 0;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    size += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return size;
}

/**
 * The identifier of the process instance a Call Activity's `activation` calls from the instance `caller`: each
 * part prefixed by its UTF-8 byte length, so that nested identifiers never collide; the retained baselines publish
 * it (`called-process-call-activity`, `repeated-nested-calls-natural-order`).
 */
export function calledInstanceId(caller: string, call: ElementId, activation: number): string {
  return `call:${utf8ByteSize(caller)}:${caller}:${utf8ByteSize(call)}:${call}:${activation}`;
}

function occurrence(state: State, id: ScopeOccurrenceId): ScopeOccurrence | undefined {
  return state.scopes.find((candidate) => candidate.id === id);
}

/** Whether `scope` is the root of a called process instance, which hides its caller's variables. */
export function calledRoot(state: State, scope: ScopeOccurrenceId): boolean {
  return (occurrence(state, scope)?.calledInstance ?? null) !== null;
}

/** The root of the process instance `scope` belongs to: the nearest called-instance root, else the process root. */
export function instanceRoot(state: State, scope: ScopeOccurrenceId): ScopeOccurrenceId {
  let current = scope;
  for (let fuel = state.scopes.length; fuel > 0; fuel -= 1) {
    if (calledRoot(state, current)) {
      return current;
    }
    const parent = occurrence(state, current)?.parent ?? null;
    if (parent === null) {
      return root;
    }
    current = parent;
  }
  return root;
}

/** The process instance identifier of `scope`. */
export function instanceOf(state: State, scope: ScopeOccurrenceId): string {
  return occurrence(state, instanceRoot(state, scope))?.calledInstance ?? state.instanceId;
}

/**
 * Enter the called process instance of the Call Activity `call` inside `parent`, with the given variables: a scope
 * occurrence for the call's activation that is the called instance's root.
 */
export function enterCalled(
  state: State,
  call: ElementId,
  parent: ScopeOccurrenceId,
  variables: readonly Binding[],
): readonly [State, ScopeOccurrenceId] {
  const caller = instanceOf(state, parent);
  const [entered, id] = enterScope(state, call, parent, variables);
  return [
    {
      ...entered,
      scopes: entered.scopes.map((scope) =>
        scope.id === id ? { ...scope, calledInstance: calledInstanceId(caller, call, scope.activation) } : scope,
      ),
    },
    id,
  ];
}

/** The scope occurrences inside `scope`, transitively, including `scope`. */
export function subtree(state: State, scope: ScopeOccurrenceId): readonly ScopeOccurrenceId[] {
  let frontier: readonly ScopeOccurrenceId[] = [scope];
  const seen: ScopeOccurrenceId[] = [];
  for (let fuel = state.scopes.length + 1; fuel > 0 && frontier.length > 0; fuel -= 1) {
    const [next, ...rest] = frontier as [ScopeOccurrenceId, ...ScopeOccurrenceId[]];
    const children = state.scopes.filter((candidate) => candidate.parent === next).map((candidate) => candidate.id);
    frontier = [...rest, ...children];
    seen.push(next);
  }
  return seen;
}

/**
 * Remove every token, item, parked or held token, Multi-Instance run, compensation trigger, variable set and child
 * scope occurrence inside `scope`, with the compensation records of the child occurrences, keeping `scope` itself.
 * The owning features are told nothing: what a removal means is the caller's account.
 */
export function clearInside(state: State, scope: ScopeOccurrenceId): State {
  const inside = subtree(state, scope);
  const nested = inside.filter((id) => id !== scope);
  return {
    ...state,
    tokens: state.tokens.filter((token) => !inside.includes(token.scope)),
    openItems: state.openItems.filter((item) => !inside.includes(item.scope)),
    scopes: state.scopes.filter((candidate) => !nested.includes(candidate.id)),
    variables: state.variables.filter((vars) => !nested.includes(vars.scope)),
    slots: {
      ...state.slots,
      parked: state.slots.parked.filter((token) => !inside.includes(token.scope)),
      held: state.slots.held.filter((token) => !inside.includes(token.scope)),
      multiInstances: {
        ...state.slots.multiInstances,
        runs: state.slots.multiInstances.runs.filter((run) => !inside.includes(run.scope)),
      },
      compensation: {
        retained: state.slots.compensation.retained.filter((record) => !nested.includes(record.scope)),
        runs: state.slots.compensation.runs.filter((run) => !inside.includes(run.scope)),
      },
    },
  };
}

/**
 * Leave `scope`: clear it and remove the occurrence, its variables and the compensation records it retains, so the
 * Activities completed in a Sub-Process left before its own completion are never compensated: compensation is for
 * completed Activities only (BPMN 2.0.2 §13.5.5, "presumed abort").
 */
export function leaveScope(state: State, scope: ScopeOccurrenceId): State {
  const cleared = clearInside(state, scope);
  return {
    ...cleared,
    scopes: cleared.scopes.filter((candidate) => candidate.id !== scope),
    variables: cleared.variables.filter((vars) => vars.scope !== scope),
    slots: {
      ...cleared.slots,
      compensation: {
        ...cleared.slots.compensation,
        retained: cleared.slots.compensation.retained.filter((record) => record.scope !== scope),
      },
    },
  };
}

/** Variables visible from `scope`, innermost first, up to the root of its process instance. */
export function visible(state: State, scope: ScopeOccurrenceId): readonly Binding[] {
  const result: Binding[] = [];
  let current: ScopeOccurrenceId | null = scope;
  for (let fuel = state.scopes.length; fuel > 0 && current !== null; fuel -= 1) {
    const id: ScopeOccurrenceId = current;
    result.push(...(state.variables.find((vars) => vars.scope === id)?.entries ?? []));
    current = calledRoot(state, id) ? null : occurrence(state, id)?.parent ?? null;
  }
  return result;
}

/** Write `name` in the innermost visible scope that declares it, else in `scope` itself. */
export function write(state: State, scope: ScopeOccurrenceId, name: string, value: Value): State {
  const declares = (id: ScopeOccurrenceId): boolean =>
    state.variables.find((vars) => vars.scope === id)?.entries.some((entry) => entry[0] === name) ?? false;
  const owner = (): ScopeOccurrenceId => {
    let current = scope;
    for (let fuel = state.scopes.length; fuel > 0; fuel -= 1) {
      if (declares(current)) {
        return current;
      }
      if (calledRoot(state, current)) {
        return scope;
      }
      const parent = occurrence(state, current)?.parent ?? null;
      if (parent === null) {
        return scope;
      }
      current = parent;
    }
    return scope;
  };
  const target = owner();
  const replace = (entries: readonly Binding[]): readonly Binding[] =>
    entries.some((entry) => entry[0] === name)
      ? entries.map((entry): Binding => (entry[0] === name ? [name, value] : entry))
      : [...entries, [name, value]];
  if (state.variables.some((vars) => vars.scope === target)) {
    return {
      ...state,
      variables: state.variables.map((vars) =>
        vars.scope === target ? { ...vars, entries: replace(vars.entries) } : vars,
      ),
    };
  }
  return { ...state, variables: [...state.variables, { scope: target, entries: [[name, value]] }] };
}

/**
 * Write an Activity or Scope output seen from `scope`: into the innermost visible scope that declares `name`, else
 * into the root of its process instance, as a CIB Seven `setVariable` without a declaring scope does; the nested
 * scope-data baselines (`nested-scope-data-order-null-risk`) observe an inner Sub-Process output at the root, not
 * in the undeclaring parent.
 */
export function writeOutward(state: State, scope: ScopeOccurrenceId, binding: Binding): State {
  return visible(state, scope).some((entry) => entry[0] === binding[0])
    ? write(state, scope, binding[0], binding[1])
    : write(state, instanceRoot(state, scope), binding[0], binding[1]);
}
