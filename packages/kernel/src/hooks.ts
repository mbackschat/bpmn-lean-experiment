/**
 * Kernel hooks, transcribed from `Kernel/Hooks.lean`: the one seam between the generic step and the features.
 *
 * `step.ts` dispatches on element, event role, input, open-item kind and signal and calls the field for that
 * case; `registry.ts` fills the fields from the features. A field a registry leaves at its default refuses with
 * `unsupported`, so an unregistered mechanism never silently drops a token. The order in which `step.ts` calls
 * hooks is semantic and owned by `step.ts` alone. Features never call each other: a feature that needs another
 * feature's mechanism enqueues a `Signal`.
 */
import {
  assertNever,
  type ActivityPayload,
  type ElementId,
  type EventPayload,
  type Expression,
  type FlowId,
  type GatewayPayload,
  type Header,
  type Mapping,
  type MultiInstance,
  type MultiInstanceMode,
  type Program,
  type ScopePayload,
  type StartPayload,
  type Subscription,
  type Throw,
  type Trigger,
  type Value,
} from "./il/types.js";
import {
  FailureTag,
  committed,
  failed,
  type Binding,
  type CommandAction,
  type EffectOutcome,
  type Fired,
  type MessageChannel,
  type OccurrenceRef,
  type OpenItem,
  type OpenKind,
  type Origin,
  type Outcome,
  type Raised,
  type Result,
  type ScopeOccurrence,
  type ScopeOccurrenceId,
  type State,
  type Token,
} from "./state.js";

export enum EvaluationTag {
  Value = "value",
  NeedsHost = "needsHost",
  Failure = "failure",
}

export type Evaluation =
  | { readonly tag: EvaluationTag.Value; readonly result: Value }
  | { readonly tag: EvaluationTag.NeedsHost }
  | { readonly tag: EvaluationTag.Failure; readonly code: string };

export type Evaluator = (variables: readonly Binding[], expression: Expression) => Evaluation;

/**
 * What every hook may read: the program, the evaluator the profile selects, and the cross-owner queries. A feature
 * that needs to inspect a guarded type it does not own asks that type's owner through one of these queries, which
 * `step.ts` fills from the `Hooks` field of the same name.
 */
export interface Ctx {
  readonly program: Program;
  readonly evaluate: Evaluator;
  /**
   * Subscriptions: the precedence with which a catch trigger catches a raised event, lower first (an exact Error
   * or Escalation code before a catch-all), or `null` when it does not catch it.
   */
  readonly catches: (raised: Raised, trigger: Trigger) => number | null;
  /** Scopes: the start subscription and interrupting flag of an Event Sub-Process, `null` for another scope. */
  readonly eventStart: (payload: ScopePayload) => readonly [Subscription, boolean] | null;
  /** Work: the item one instance of a Multi-Instance Activity opens, `null` for work that has no such item. */
  readonly bodyWait: (payload: ActivityPayload) => OpenKind | null;
}

/**
 * Evaluate each mapping's source against `variables`, in order. A mapping whose source the kernel cannot evaluate
 * refuses the step, never drops the binding. Features share it here because they never import each other.
 */
export function ctxEvaluateMappings(
  ctx: Ctx,
  variables: readonly Binding[],
  mappings: readonly Mapping[],
): Result<readonly Binding[]> {
  const bindings: Binding[] = [];
  for (const mapping of mappings) {
    const binding = mappingBinding(ctx.evaluate(variables, mapping.source), mapping.target);
    if (!binding.ok) {
      return binding;
    }
    bindings.push(binding.value);
  }
  return committed(bindings);
}

function mappingBinding(evaluation: Evaluation, target: string): Result<Binding> {
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      return committed([target, evaluation.result] as const);
    case EvaluationTag.NeedsHost:
      return failed(FailureTag.Unsupported, "host-evaluation");
    case EvaluationTag.Failure:
      return failed(FailureTag.SemanticFailure, evaluation.code);
  }
  return assertNever(evaluation);
}

/** A token that reached an element, removed from the flow it arrived on. */
export interface Arrival {
  readonly flow: FlowId;
  readonly scope: ScopeOccurrenceId;
}

export interface Hooks {
  /** Flow: start the process at `header`, already resolved by `step.ts`. */
  readonly startProcess: (ctx: Ctx, header: Header, payload: StartPayload, state: State) => Outcome;
  /** Work. */
  readonly arriveActivity: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  /** Scopes. */
  readonly arriveScope: (ctx: Ctx, header: Header, payload: ScopePayload, arrival: Arrival, state: State) => Outcome;
  /** Flow. */
  readonly arriveGateway: (
    ctx: Ctx,
    header: Header,
    payload: GatewayPayload,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  /** Subscriptions. */
  readonly arriveCatch: (
    ctx: Ctx,
    header: Header,
    payload: EventPayload,
    subscription: Subscription,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  /** Propagation. */
  readonly arriveThrow: (
    ctx: Ctx,
    header: Header,
    payload: EventPayload,
    thrown: Throw,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  /** Flow. */
  readonly arriveLink: (ctx: Ctx, header: Header, payload: EventPayload, arrival: Arrival, state: State) => Outcome;
  /** Scopes: the scope occurrence holds no token, no blocking item, no parked token and no child occurrence. */
  readonly completeScope: (
    ctx: Ctx,
    header: Header,
    payload: ScopePayload,
    occurrence: ScopeOccurrence,
    state: State,
  ) => Outcome;
  /**
   * Work: the root of a called process instance holds no token, no blocking item, no parked token and no child
   * occurrence; the header and payload are its Call Activity's.
   */
  readonly completeCall: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    occurrence: ScopeOccurrence,
    state: State,
  ) => Outcome;
  /** Work: complete an open User Task with the submitted values. */
  readonly completeUserTask: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    item: OpenItem,
    values: readonly Binding[],
    state: State,
  ) => Outcome;
  /** Work: the outcome of an open effect. */
  readonly effectResult: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    item: OpenItem,
    outcome: EffectOutcome,
    state: State,
  ) => Outcome;
  /** Work: retry an open incident or cancel its process (`retryIncident` or `cancelIncidentProcess`). */
  readonly resolveIncident: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    item: OpenItem,
    action: CommandAction,
    state: State,
  ) => Outcome;
  /** Work: a message or timer subscription an Activity opened itself (a Receive Task) fired. */
  readonly triggerActivity: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    item: OpenItem,
    fired: Fired,
    state: State,
  ) => Outcome;
  /**
   * Subscriptions: any other message or timer subscription fired (catch Events, boundaries, Event Sub-Process
   * starts, Event-Based Gateway arms).
   */
  readonly trigger: (ctx: Ctx, item: OpenItem, fired: Fired, state: State) => Outcome;
  /** Subscriptions: `Signal.arm`. */
  readonly arm: (ctx: Ctx, host: number, element: ElementId, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Subscriptions: `Signal.armScope`. */
  readonly armScope: (ctx: Ctx, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Subscriptions: `Signal.armGateway`. */
  readonly armGateway: (ctx: Ctx, gateway: ElementId, scope: ScopeOccurrenceId, state: State) => Outcome;
  /** Propagation: `Signal.raise`. */
  readonly raise: (ctx: Ctx, raised: Raised, origin: Origin, state: State) => Outcome;
  /** Scopes: `Signal.startEventSubProcess`. */
  readonly startEventSubProcess: (
    ctx: Ctx,
    element: ElementId,
    parent: ScopeOccurrenceId,
    variables: readonly Binding[],
    state: State,
  ) => Outcome;
  /** Work: `Signal.startActivity`. */
  readonly startActivity: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    scope: ScopeOccurrenceId,
    state: State,
  ) => Outcome;
  /** Compensation: `Signal.completed`. */
  readonly retain: (
    ctx: Ctx,
    element: ElementId,
    scope: ScopeOccurrenceId,
    snapshot: readonly Binding[],
    state: State,
  ) => Outcome;
  /** Compensation: `Signal.compensate`. */
  readonly compensate: (
    ctx: Ctx,
    scope: ScopeOccurrenceId,
    trigger: OccurrenceRef,
    leave: boolean,
    resume: readonly Token[],
    state: State,
  ) => Outcome;
  /**
   * Compensation: a compensation handler's occurrence holds no token, no blocking item, no parked token and no
   * child occurrence.
   */
  readonly completeCompensation: (ctx: Ctx, occurrence: ScopeOccurrence, state: State) => Outcome;
  /** Compensation: `Signal.compensationFailed`. */
  readonly failCompensation: (
    ctx: Ctx,
    handler: ScopeOccurrenceId,
    code: string,
    message: string | null,
    origin: Origin,
    state: State,
  ) => Outcome;
  readonly evaluate: Evaluator;
  /** Subscriptions: `Ctx.catches`. */
  readonly catches: (raised: Raised, trigger: Trigger) => number | null;
  /** Scopes: `Ctx.eventStart`. */
  readonly eventStart: (payload: ScopePayload) => readonly [Subscription, boolean] | null;
  /** Work: `Ctx.bodyWait`. */
  readonly bodyWait: (payload: ActivityPayload) => OpenKind | null;
  /**
   * Subscriptions: whether the open item is a correlated Message subscription on the channel whose criteria,
   * evaluated in the current state, equal the delivered correlation; `false` for any other item. `population.ts`
   * asks it to find the candidates of a correlated publication.
   */
  readonly correlates: (
    ctx: Ctx,
    item: OpenItem,
    channel: MessageChannel,
    correlation: readonly Binding[],
    state: State,
  ) => Result<boolean>;
  /** MultiInstance: a token reached an Activity with Multi-Instance loop characteristics. */
  readonly arriveMultiInstance: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    loop: MultiInstance,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  /** MultiInstance: complete the open User Task of one instance with the submitted values. */
  readonly completeInstance: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    loop: MultiInstance,
    item: OpenItem,
    values: readonly Binding[],
    state: State,
  ) => Outcome;
  /** MultiInstance: the published `mode` of a Multi-Instance Activity, for `publish.ts`. */
  readonly multiInstanceMode: (mode: MultiInstanceMode) => string;
}

/** The default of every hook: the mechanism is not registered. */
function refuse(code: string): () => Outcome {
  return () => failed(FailureTag.Unsupported, code);
}

export const defaultHooks: Hooks = {
  startProcess: refuse("start"),
  arriveActivity: refuse("activity"),
  arriveScope: refuse("scope"),
  arriveGateway: refuse("gateway"),
  arriveCatch: refuse("catchEvent"),
  arriveThrow: refuse("throwEvent"),
  arriveLink: refuse("linkEvent"),
  completeScope: refuse("completeScope"),
  completeCall: refuse("completeCall"),
  completeUserTask: refuse("completeUserTask"),
  effectResult: refuse("effectResult"),
  resolveIncident: refuse("resolveIncident"),
  triggerActivity: refuse("triggerActivity"),
  trigger: refuse("trigger"),
  arm: refuse("arm"),
  armScope: refuse("armScope"),
  armGateway: refuse("armGateway"),
  raise: refuse("raise"),
  startEventSubProcess: refuse("startEventSubProcess"),
  startActivity: refuse("startActivity"),
  retain: refuse("retain"),
  compensate: refuse("compensate"),
  completeCompensation: refuse("completeCompensation"),
  failCompensation: refuse("failCompensation"),
  evaluate: () => ({ tag: EvaluationTag.Failure, code: "no-evaluator" }),
  catches: () => null,
  eventStart: () => null,
  bodyWait: () => null,
  correlates: () => failed(FailureTag.Unsupported, "correlates"),
  arriveMultiInstance: refuse("multiInstance"),
  completeInstance: refuse("completeInstance"),
  multiInstanceMode: () => "unregistered",
};
