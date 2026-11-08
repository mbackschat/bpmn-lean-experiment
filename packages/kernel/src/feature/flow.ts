/**
 * Flow: starts and gateways, transcribed from `Kernel/Feature/Flow.lean`.
 *
 * Owns matching on `GatewayKind`. An Exclusive Gateway evaluates its candidates in document order and takes the
 * first true one, else its default (BPMN 2.0.2 §13.4.2).
 */
import {
  GatewayKindTag,
  ValueTag,
  assertNever,
  type ConditionalFlow,
  type FlowId,
  type GatewayPayload,
  type Header,
  type StartPayload,
} from "../il/types.js";
import { EvaluationTag, type Arrival, type Ctx } from "../hooks.js";
import {
  FailureTag,
  committed,
  emit,
  failed,
  root,
  visible,
  type Binding,
  type Outcome,
  type Result,
  type State,
} from "../state.js";

export function startProcess(_ctx: Ctx, _header: Header, payload: StartPayload, state: State): Outcome {
  return payload.subscription === null
    ? committed(emit(state, payload.outgoing, root))
    : failed(FailureTag.Unsupported, "triggered-start");
}

/** The first candidate whose condition holds; an unconditioned candidate holds. */
function firstTrue(
  ctx: Ctx,
  variables: readonly Binding[],
  candidates: readonly ConditionalFlow[],
): Result<FlowId | null> {
  for (const candidate of candidates) {
    if (candidate.condition === null) {
      return committed(candidate.flow);
    }
    const evaluation = ctx.evaluate(variables, candidate.condition);
    switch (evaluation.tag) {
      case EvaluationTag.Value:
        if (evaluation.result.tag !== ValueTag.Bool) {
          return failed(FailureTag.SemanticFailure, "condition-not-boolean");
        }
        if (evaluation.result.value) {
          return committed(candidate.flow);
        }
        continue;
      case EvaluationTag.NeedsHost:
        return failed(FailureTag.Unsupported, "host-evaluation");
      case EvaluationTag.Failure:
        return failed(FailureTag.SemanticFailure, evaluation.code);
    }
    return assertNever(evaluation);
  }
  return committed(null);
}

function exclusive(
  ctx: Ctx,
  candidates: readonly ConditionalFlow[],
  fallback: FlowId | null,
  arrival: Arrival,
  state: State,
): Outcome {
  const chosen = firstTrue(ctx, visible(state, arrival.scope), candidates);
  if (!chosen.ok) {
    return chosen;
  }
  const flow = chosen.value ?? fallback;
  return flow === null
    ? failed(FailureTag.SemanticFailure, "exclusive-gateway-no-outgoing-flow")
    : committed(emit(state, [flow], arrival.scope));
}

export function arriveGateway(
  ctx: Ctx,
  _header: Header,
  payload: GatewayPayload,
  arrival: Arrival,
  state: State,
): Outcome {
  const kind = payload.kind;
  switch (kind.tag) {
    case GatewayKindTag.Exclusive:
      return exclusive(ctx, kind.candidates, kind.default, arrival, state);
    case GatewayKindTag.Parallel:
      return failed(FailureTag.Unsupported, "parallel-gateway");
    case GatewayKindTag.Inclusive:
      return failed(FailureTag.Unsupported, "inclusive-gateway");
    case GatewayKindTag.EventBased:
      return failed(FailureTag.Unsupported, "event-based-gateway");
  }
  return assertNever(kind);
}
