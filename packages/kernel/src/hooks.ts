/**
 * Kernel hooks, transcribed from `Kernel/Hooks.lean`: the one seam between the generic step and the features.
 *
 * `step.ts` dispatches on element, event role, input and open-item kind and calls the field for that case;
 * `registry.ts` fills the fields from the features. A field a registry leaves at its default refuses with
 * `unsupported`, so an unregistered mechanism never silently drops a token. The order in which `step.ts` calls
 * hooks is semantic and owned by `step.ts` alone.
 */
import type {
  ActivityPayload,
  EventPayload,
  Expression,
  FlowId,
  GatewayPayload,
  Header,
  Program,
  ScopePayload,
  StartPayload,
  Subscription,
  Throw,
  Value,
} from "./il/types.js";
import {
  FailureTag,
  failed,
  type Binding,
  type OpenItem,
  type Outcome,
  type ScopeOccurrenceId,
  type State,
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

/** What every hook may read: the program and the evaluator the profile selects. */
export interface Ctx {
  readonly program: Program;
  readonly evaluate: Evaluator;
}

/** A token that reached an element, removed from the flow it arrived on. */
export interface Arrival {
  readonly flow: FlowId;
  readonly scope: ScopeOccurrenceId;
}

export interface Hooks {
  readonly startProcess: (ctx: Ctx, header: Header, payload: StartPayload, state: State) => Outcome;
  readonly arriveActivity: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  readonly arriveScope: (ctx: Ctx, header: Header, payload: ScopePayload, arrival: Arrival, state: State) => Outcome;
  readonly arriveGateway: (
    ctx: Ctx,
    header: Header,
    payload: GatewayPayload,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  readonly arriveCatch: (
    ctx: Ctx,
    header: Header,
    payload: EventPayload,
    subscription: Subscription,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  readonly arriveThrow: (
    ctx: Ctx,
    header: Header,
    payload: EventPayload,
    thrown: Throw,
    arrival: Arrival,
    state: State,
  ) => Outcome;
  readonly arriveLink: (ctx: Ctx, header: Header, payload: EventPayload, arrival: Arrival, state: State) => Outcome;
  /** Complete the work of an open User Task with the submitted values. */
  readonly completeUserTask: (
    ctx: Ctx,
    header: Header,
    payload: ActivityPayload,
    item: OpenItem,
    values: readonly Binding[],
    state: State,
  ) => Outcome;
  readonly evaluate: Evaluator;
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
  completeUserTask: refuse("completeUserTask"),
  evaluate: () => ({ tag: EvaluationTag.Failure, code: "no-evaluator" }),
};
