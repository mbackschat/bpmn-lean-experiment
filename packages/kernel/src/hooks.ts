/**
 * Kernel hooks, transcribed from `Kernel/Hooks.lean`.
 *
 * The one seam between the generic step and the features. `step.ts` dispatches on element, event role, input and
 * signal and calls the field for that case; `registry.ts` fills the fields from the features. A lifecycle field a
 * registry leaves at its default refuses with `unsupported`, so an unregistered mechanism never silently drops a token;
 * the notification fields default to no-ops. The order in which `step.ts` calls hooks is semantic and owned by it
 * alone. Features never call each other: a feature that needs another feature's mechanism enqueues a `Signal`.
 */
import {
  MappingDialect,
  ValueSourceTag,
  ValueTag,
  assertNever,
  type ActivityPayload,
  type Boundary,
  type ElementId,
  type Envelope,
  type EventPayload,
  type Expression,
  type GatewayPayload,
  type Header,
  type Mapping,
  type MessageTrigger,
  type MultiInstance,
  type Program,
  type ScopePayload,
  type StartPayload,
  type Subscription,
  type Throw,
  type Trigger,
  type Value,
} from "./il/types.js";
import {
  DeliveryTriggerTag,
  FailureTag,
  SignalTag,
  WriteRule,
  committed,
  failed,
  leaveFlows,
  signal,
  visible,
  type Binding,
  type CommandAction,
  type CorrelationMatch,
  type DeliveryTrigger,
  type EffectOutcome,
  type EvalContext,
  type Fired,
  type Leave,
  type MessageChannel,
  type MultiInstanceRun,
  type Occurrence,
  type OccurrenceRef,
  type OpenItem,
  type Origin,
  type Outcome,
  type Parked,
  type Raised,
  type Result,
  type Resume,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type StartTrigger,
  type State,
  type WriteEvent,
} from "./state.js";

/**
 * An in-kernel evaluation. A failure is an absent reference (`unknown-variable`), which `Mapping.dialect` reads, or a
 * JUEL evaluation error (`juel.*`), which rolls the command back (CIB-OP-0004); `unsupported` is a value or Java
 * surface the kernel does not represent, never a semantic outcome
 * ([expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#failure-semantics)).
 */
export enum EvaluationTag {
  Value = "value",
  Failure = "failure",
  Unsupported = "unsupported",
}

export type Evaluation =
  | { readonly tag: EvaluationTag.Value; readonly result: Value }
  | { readonly tag: EvaluationTag.Failure; readonly code: string }
  | { readonly tag: EvaluationTag.Unsupported; readonly code: string };

/**
 * Whether a scope occurrence is a Multi-Instance instance, a compensation handler's context or ordinary. Filled by
 * `step.ts`, which matches `Continuation` and reads the two feature slots that say so.
 */
export enum ScopeRole {
  Ordinary = "ordinary",
  MultiInstanceInstance = "multiInstanceInstance",
  CompensationHandler = "compensationHandler",
}

/** The channel a Message trigger waits on, `null` for a Message named by an expression. */
export function messageTriggerChannel(trigger: MessageTrigger): MessageChannel | null {
  const address = (messageId: string | null): MessageChannel =>
    ({ messageId, interfaceRef: trigger.interfaceRef, operationRef: trigger.operationRef });
  if (trigger.name === null) return address(null);
  switch (trigger.name.tag) {
    case ValueSourceTag.Literal:
      return address(trigger.name.value);
    case ValueSourceTag.Expression:
      return null;
  }
  return assertNever(trigger.name);
}

export function deliveryTriggerChannel(trigger: DeliveryTrigger): MessageChannel | null {
  switch (trigger.tag) {
    case DeliveryTriggerTag.Message:
      return trigger.channel;
    case DeliveryTriggerTag.Signal:
      return null;
  }
  return assertNever(trigger);
}

/**
 * The members of an input collection in order, `null` for a value that is not a collection; a String List's members
 * are Strings.
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

/** Hold an occurrence whose InputSet is unavailable (`FeatureSlots.held`). */
export function hold(state: State, held: Parked): State {
  return { ...state, slots: { ...state.slots, held: [...state.slots.held, held] } };
}

/** What an expression evaluated from `scope` reads. */
export function evalContext(state: State, scope: ScopeOccurrenceId): EvalContext {
  return { variables: visible(state, scope), nowMs: state.logicalTimeMs };
}

/** How a catch trigger catches a raised event: its precedence, lower first, and the variables it writes. */
export interface Catch {
  readonly rank: number;
  readonly writes: readonly Binding[];
}

/**
 * What every hook may read: the program, the evaluator the profile selects, and the cross-owner queries. A feature
 * that needs to inspect a guarded type it does not own asks that type's owner through one of these queries, which
 * `step.ts` fills from the `Hooks` field of the same name.
 */
export interface Ctx {
  readonly program: Program;
  readonly evaluate: (context: EvalContext, expression: Expression) => Evaluation;
  /** Subscriptions: how a catch trigger catches a raised event, or `null` when it does not catch it. */
  readonly catches: (raised: Raised, trigger: Trigger) => Catch | null;
  /** Scopes: the start subscription and interrupting flag of an Event Sub-Process, `null` for another scope. */
  readonly eventStart: (payload: ScopePayload) => readonly [Subscription, boolean] | null;
  /** `step.ts`: what a scope occurrence is, for a search that must not treat it as ordinary. */
  readonly scopeRole: (state: State, scope: ScopeOccurrenceId) => ScopeRole;
}

/**
 * Evaluate each mapping's source against `variables`, in order. A failed source is read by the mapping's dialect: a
 * Data Association's source is unavailable (`null`, BPMN 2.0.2 §10.4.2, which the caller decides on), an `ioParameter`
 * expression rolls the command back with the evaluation's own code (CIB-EXT-0024), and a `callVariable` copy reads null
 * (CIB-EXT-0021). Features share it here because they never import each other. Lean folds from the right, so the last
 * failing mapping's outcome is reported, as here.
 */
export function ctxEvaluateMappings(
  ctx: Ctx,
  context: EvalContext,
  mappings: readonly Mapping[],
): Result<readonly Binding[] | null> {
  let rest: readonly Binding[] | null = [];
  for (let index = mappings.length - 1; index >= 0; index -= 1) {
    const mapping = mappings[index] as Mapping;
    const next = mappingStep(mapping, ctx.evaluate(context, mapping.source), rest);
    if (!next.ok) return next;
    rest = next.value;
  }
  return committed(rest);
}

function mappingStep(mapping: Mapping, evaluation: Evaluation, rest: readonly Binding[] | null): Result<readonly Binding[] | null> {
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return committed(rest === null ? null : [[mapping.target, evaluation.result], ...rest]);
    case EvaluationTag.Unsupported:
      return failed(FailureTag.Unsupported, evaluation.code);
    case EvaluationTag.Failure:
      return unavailableSource(mapping, evaluation.code, rest);
  }
  return assertNever(evaluation);
}

function unavailableSource(mapping: Mapping, code: string, rest: readonly Binding[] | null): Result<readonly Binding[] | null> {
  switch (mapping.dialect) {
    case MappingDialect.DataAssociation:
      return committed(null);
    case MappingDialect.IoParameter:
      return failed(FailureTag.RolledBack, code);
    case MappingDialect.CallVariable:
      return committed(rest === null ? null : [[mapping.target, { tag: ValueTag.Null }], ...rest]);
  }
  return assertNever(mapping.dialect);
}

/** The bindings of `mappings` where an unavailable source has no state to wait in, a semantic failure. */
export function ctxRequireMappings(ctx: Ctx, context: EvalContext, mappings: readonly Mapping[]): Result<readonly Binding[]> {
  const evaluated = ctxEvaluateMappings(ctx, context, mappings);
  if (!evaluated.ok) return evaluated;
  return evaluated.value === null
    ? failed(FailureTag.SemanticFailure, "mapping-source-unavailable")
    : committed(evaluated.value);
}

/**
 * The one way a boundary fires: an interrupting boundary first cancels the occurrence `host` it hangs on, if any; then
 * the boundary's occurrence, the reservation `reserved` or a fresh one, begins and leaves on its flows in `scope`
 * (BPMN 2.0.2 §13.5.3, §10.5.6).
 */
export function boundaryFire(
  boundary: Boundary,
  host: number | null,
  reserved: number | null,
  scope: ScopeOccurrenceId,
  writes: readonly Binding[],
  state: State,
): State {
  const interrupted = boundary.interrupting && host !== null
    ? signal(state, { tag: SignalTag.Cancel, occurrence: host })
    : state;
  const leave = leaveFlows(boundary.outgoing);
  return signal(interrupted, reserved !== null
    ? { tag: SignalTag.Complete, occurrence: reserved, leave, writes, rule: WriteRule.Outward }
    : { tag: SignalTag.Occur, element: boundary.id, scope, leave, writes, rule: WriteRule.Outward });
}

/**
 * What a Scope begins with besides its evaluated inputs. `inner` is the reservation of an Event Sub-Process's start
 * Event, when a subscription triggered it.
 */
export interface ScopeEntry {
  readonly locals: readonly Binding[];
  readonly inner: number | null;
}

/** The default of every lifecycle hook: the mechanism is not registered. */
function refuse(code: string): Outcome {
  return failed(FailureTag.Unsupported, code);
}

export interface Hooks {
  /** Subscriptions: a start Event's occurrence began, fired by the trigger. */
  readonly arriveStart: (ctx: Ctx, header: Header, payload: StartPayload, trigger: StartTrigger, occurrence: Occurrence, state: State) => Outcome;
  /** Work: an Activity's occurrence began. */
  readonly arriveActivity: (ctx: Ctx, header: Header, payload: ActivityPayload, occurrence: Occurrence, state: State) => Outcome;
  /** MultiInstance: the body occurrence of an element with Multi-Instance loop characteristics began. */
  readonly arriveMultiInstance: (
    ctx: Ctx, header: Header, envelope: Envelope, loop: MultiInstance, occurrence: Occurrence, state: State) => Outcome;
  /** Scopes. */
  readonly arriveScope: (
    ctx: Ctx, header: Header, payload: ScopePayload, occurrence: Occurrence, entry: ScopeEntry, state: State) => Outcome;
  /** Flow. */
  readonly arriveGateway: (ctx: Ctx, header: Header, payload: GatewayPayload, occurrence: Occurrence, state: State) => Outcome;
  /** Subscriptions. */
  readonly arriveCatch: (
    ctx: Ctx, header: Header, payload: EventPayload, subscription: Subscription, occurrence: Occurrence, state: State) => Outcome;
  /** Propagation. */
  readonly arriveThrow: (
    ctx: Ctx, header: Header, payload: EventPayload, thrown: Throw, occurrence: Occurrence, state: State) => Outcome;
  /** Flow. */
  readonly arriveLink: (ctx: Ctx, header: Header, payload: EventPayload, occurrence: Occurrence, state: State) => Outcome;
  /** Scopes: the scope occurrence of a Scope element is idle. The last argument is its owning occurrence. */
  readonly completeScope: (
    ctx: Ctx, header: Header, payload: ScopePayload, scope: ScopeOccurrence, owner: Occurrence, state: State) => Outcome;
  /** Work: the root of a called process instance is idle; the header and payload are its Call Activity's. */
  readonly completeCall: (
    ctx: Ctx, header: Header, payload: ActivityPayload, root: ScopeOccurrence, owner: Occurrence, state: State) => Outcome;
  /** MultiInstance: the scope occurrence of a Multi-Instance body is idle. */
  readonly completeBody: (
    ctx: Ctx, header: Header, envelope: Envelope, loop: MultiInstance, occurrence: Occurrence, state: State) => Outcome;
  /** Work: complete an open User Task with the submitted values. */
  readonly completeUserTask: (
    ctx: Ctx, header: Header, payload: ActivityPayload, item: OpenItem, values: readonly Binding[], state: State) => Outcome;
  /** Work: the outcome of an open effect. */
  readonly effectResult: (ctx: Ctx, item: OpenItem, outcome: EffectOutcome, state: State) => Outcome;
  /** Work: retry an open incident or cancel its process. */
  readonly resolveIncident: (ctx: Ctx, item: OpenItem, action: CommandAction, state: State) => Outcome;
  /** Work: a message or timer subscription an Activity opened itself (a Receive Task) fired. */
  readonly triggerActivity: (
    ctx: Ctx, header: Header, payload: ActivityPayload, item: OpenItem, fired: Fired, state: State) => Outcome;
  /** Subscriptions: any other message or timer subscription fired. */
  readonly trigger: (ctx: Ctx, item: OpenItem, fired: Fired, state: State) => Outcome;
  /** Subscriptions: `Signal.arm`. */
  readonly arm: (ctx: Ctx, host: number, element: ElementId, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Subscriptions: `Signal.armScope`. */
  readonly armScope: (ctx: Ctx, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Subscriptions: `Signal.armGateway`. */
  readonly armGateway: (ctx: Ctx, occurrence: number, gateway: ElementId, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Propagation: `Signal.raise`. */
  readonly raise: (ctx: Ctx, raised: Raised, origin: Origin, state: State) => Outcome;
  /** Compensation: `Signal.compensate`. */
  readonly compensate: (
    ctx: Ctx,
    scope: ScopeOccurrenceId,
    activity: ElementId | null,
    trigger: OccurrenceRef,
    leave: number | null,
    resume: Resume | null,
    state: State,
  ) => Outcome;
  /** Compensation: `Signal.compensationFailed`. */
  readonly failCompensation: (
    ctx: Ctx, handler: ScopeOccurrenceId, code: string, message: string | null, origin: Origin, state: State) => Outcome;
  // The completion pipeline, in the order `step.ts` runs it
  /** Subscriptions: disarm the items attached to the completing occurrence. */
  readonly leave: (ctx: Ctx, occurrence: Occurrence, state: State) => Outcome;
  /**
   * Flow: resolve a completion's outgoing flows when the profile evaluates its conditions before its output writes
   * (`ConditionOrder.beforeOutputs`); otherwise the leave is unchanged and `outflow` resolves it.
   */
  readonly select: (ctx: Ctx, occurrence: Occurrence, leave: Leave, state: State) => Result<Leave>;
  /** Data: apply writes from a scope occurrence: a completion's, and `Signal.write`. */
  readonly writeOutputs: (ctx: Ctx, scope: ScopeOccurrenceId, writes: readonly Binding[], rule: WriteRule, state: State) => Outcome;
  /** Data: `Signal.remove`. */
  readonly removeVariables: (ctx: Ctx, scope: ScopeOccurrenceId, names: readonly string[], state: State) => Outcome;
  /** Compensation: retain the completed occurrence when its element has a handler. */
  readonly completed: (ctx: Ctx, occurrence: Occurrence, state: State) => Outcome;
  /** Flow: leave through flows. */
  readonly outflow: (ctx: Ctx, occurrence: Occurrence, leave: Leave, state: State) => Outcome;
  /** MultiInstance: one instance of the body occurrence completed. */
  readonly instanceCompleted: (ctx: Ctx, body: number, occurrence: Occurrence, writes: readonly Binding[], state: State) => Outcome;
  /** Compensation: a handler of the run in that scope occurrence completed. */
  readonly handlerCompleted: (ctx: Ctx, run: ScopeOccurrenceId, occurrence: Occurrence, state: State) => Outcome;
  // Notifications
  /** A generic cancellation removed the occurrence; a feature that must react has this one place. */
  readonly cancelled: (ctx: Ctx, occurrence: Occurrence, state: State) => Outcome;
  /** Subscriptions: variables were written (PC-CONDITION-01). */
  readonly written: (ctx: Ctx, writes: readonly WriteEvent[], state: State) => Outcome;
  // Queries and the evaluator
  readonly evaluate: (context: EvalContext, expression: Expression) => Evaluation;
  /** Subscriptions: `Ctx.catches`. */
  readonly catches: (raised: Raised, trigger: Trigger) => Catch | null;
  /** Scopes: `Ctx.eventStart`. */
  readonly eventStart: (payload: ScopePayload) => readonly [Subscription, boolean] | null;
  /**
   * Subscriptions: the root start Event an input selects: the one it names, else the one its trigger fires (a none
   * trigger, the sole none start). `population.ts` asks it too.
   */
  readonly selectStart: (ctx: Ctx, named: ElementId | null, trigger: StartTrigger) => ElementId | null;
  /**
   * Subscriptions: whether the open item is a correlated Message subscription on the channel whose criteria, evaluated
   * in the current state, equal the delivered correlation; `false` for any other item. `population.ts` asks it to find
   * the candidates of a correlated publication.
   */
  readonly correlates: (
    ctx: Ctx, item: OpenItem, channel: MessageChannel, correlation: readonly CorrelationMatch[], state: State) => Result<boolean>;
}

export const defaultHooks: Hooks = {
  arriveStart: () => refuse("start"),
  arriveActivity: () => refuse("activity"),
  arriveMultiInstance: () => refuse("multiInstance"),
  arriveScope: () => refuse("scope"),
  arriveGateway: () => refuse("gateway"),
  arriveCatch: () => refuse("catchEvent"),
  arriveThrow: () => refuse("throwEvent"),
  arriveLink: () => refuse("linkEvent"),
  completeScope: () => refuse("completeScope"),
  completeCall: () => refuse("completeCall"),
  completeBody: () => refuse("completeBody"),
  completeUserTask: () => refuse("completeUserTask"),
  effectResult: () => refuse("effectResult"),
  resolveIncident: () => refuse("resolveIncident"),
  triggerActivity: () => refuse("triggerActivity"),
  trigger: () => refuse("trigger"),
  arm: () => refuse("arm"),
  armScope: () => refuse("armScope"),
  armGateway: () => refuse("armGateway"),
  raise: () => refuse("raise"),
  compensate: () => refuse("compensate"),
  failCompensation: () => refuse("failCompensation"),
  leave: () => refuse("leave"),
  select: () => failed(FailureTag.Unsupported, "select"), // dynamic-only: a registry without the hook
  writeOutputs: () => refuse("writeOutputs"),
  removeVariables: () => refuse("removeVariables"),
  completed: () => refuse("completed"),
  outflow: () => refuse("outflow"),
  instanceCompleted: () => refuse("instanceCompleted"),
  handlerCompleted: () => refuse("handlerCompleted"),
  cancelled: (_ctx, _occurrence, state) => committed(state),
  written: (_ctx, _writes, state) => committed(state),
  evaluate: () => ({ tag: EvaluationTag.Failure, code: "no-evaluator" }),
  catches: () => null,
  eventStart: () => null,
  selectStart: () => null,
  correlates: () => failed(FailureTag.Unsupported, "correlates"), // dynamic-only: a registry without the hook
};
