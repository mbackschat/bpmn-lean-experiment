/**
 * Subscriptions: correlation, transcribed from `Kernel/Feature/Subscriptions/Correlation.lean`: whether a Message
 * delivery or publication's correlation accepts a waiting subscription (`Hooks.correlates`, and the recheck
 * `feature/subscriptions.ts` `admitFiring` makes): the modeled key under `MessageCorrelation.ModeledKey`, the API
 * criteria under `ApiCriteria`.
 *
 * Message key correlation as the specification bounds it: a criterion names one correlation key and the expression its
 * single property's value is bound to in the subscription's scope; the delivered value is the Message payload's. Both
 * must be non-empty Strings, compared by exact equality, and the criterion is evaluated when a delivery is matched,
 * never when the subscription opens, so the current Property value decides.
 */
import {
  MessageCorrelation,
  ValueTag,
  assertNever,
  triggerMessage,
  type CorrelationCriterion,
  type Trigger,
  type Value,
} from "../../il/types.js";
import {
  CriterionTargetTag,
  FailureTag,
  committed,
  failed,
  failedWith,
  instanceOf,
  instanceRoot,
  messageChannelEquals,
  openKindView,
  type CorrelationMatch,
  type EvalContext,
  type MessageChannel,
  type OpenItem,
  type Result,
  type ScopeOccurrenceId,
  type State,
} from "../../state.js";
import { EvaluationTag, evalContext, type Ctx } from "../../hooks.js";
import { criteriaHold } from "../../state/criteria.js";
import { subscriptionOf } from "./conditions.js";

export function criteria(trigger: Trigger): readonly CorrelationCriterion[] {
  return triggerMessage(trigger)?.correlation ?? [];
}

/** The key a criterion binds, evaluated in `variables`. */
function keyValue(ctx: Ctx, context: EvalContext, criterion: CorrelationCriterion): Result<string> {
  const evaluation = ctx.evaluate(context, criterion.value);
  switch (evaluation.tag) {
    case EvaluationTag.Value:
      if (evaluation.result.tag !== ValueTag.String) {
        return failed(FailureTag.Unsupported, "correlation-key-type"); // dynamic-only: a key's value type is the run's data
      }
      if (evaluation.result.value === "") {
        return failed(FailureTag.Unsupported, "correlation-key-empty"); // dynamic-only: a key's value is the run's data
      }
      return committed(evaluation.result.value);
    case EvaluationTag.Failure:
      return failed(FailureTag.SemanticFailure, evaluation.code);
    case EvaluationTag.Unsupported:
      return failed(FailureTag.Unsupported, evaluation.code);
  }
  return assertNever(evaluation);
}

/**
 * Whether the delivered `correlation` names exactly the criteria's keys, in order, each with the String its criterion
 * binds, under `MessageCorrelation.ModeledKey`, where a modeled key matches as `processVariable`. Criteria delivered to a
 * wait that models no key, and the other targets, are API criteria, which that reading does not select: `unsupported`,
 * never a mismatch.
 */
function correlationMatches(
  ctx: Ctx,
  context: EvalContext,
  bound: readonly CorrelationCriterion[],
  correlation: readonly CorrelationMatch[],
): Result<boolean> {
  if (bound.length === 0 && correlation.length > 0) {
    return failed(FailureTag.Unsupported, "profile-message-correlation-api-criteria"); // dynamic-only: a delivery's criteria are its caller's
  }
  if (bound.length !== correlation.length) return committed(false);
  for (const [index, criterion] of bound.entries()) {
    const expected = keyValue(ctx, context, criterion);
    if (!expected.ok) return failedWith(expected.failure);
    const matched = criterionMatches(criterion, correlation[index] as CorrelationMatch, expected.value);
    if (!matched.ok || !matched.value) return matched;
  }
  return committed(true);
}

function criterionMatches(criterion: CorrelationCriterion, delivered: CorrelationMatch, expected: string): Result<boolean> {
  const target = delivered.target;
  switch (target.tag) {
    case CriterionTargetTag.ProcessVariable: {
      const value = delivered.expected;
      return committed(criterion.key === target.name && value.tag === ValueTag.String && value.value === expected);
    }
    case CriterionTargetTag.LocalVariable:
    case CriterionTargetTag.BusinessKey:
    case CriterionTargetTag.ProcessInstance:
      return failed(FailureTag.Unsupported, "profile-message-correlation-api-criteria"); // dynamic-only: a delivery's criteria are its caller's
  }
  return assertNever(target);
}

/** `Hooks.correlates`. */
/**
 * Whether `correlation` accepts an item waiting in `scope` whose subscription models the keys `bound`: under
 * `ModeledKey` as `correlationMatches` says; under `ApiCriteria` as `criteriaHold` says, where admission leaves `bound`
 * empty (`message.correlation.modeled`).
 */
export function correlationAccepts(
  ctx: Ctx,
  state: State,
  scope: ScopeOccurrenceId,
  bound: readonly CorrelationCriterion[],
  correlation: readonly CorrelationMatch[],
): Result<boolean> {
  switch (ctx.program.options.messageCorrelation) {
    case MessageCorrelation.ModeledKey:
      return correlationMatches(ctx, evalContext(state, scope), bound, correlation);
    case MessageCorrelation.ApiCriteria:
      return criteriaHold(state, scope, correlation);
  }
  return assertNever(ctx.program.options.messageCorrelation);
}

/** `Hooks.correlates`. Under `ModeledKey` a publication reaches only a subscription that models a key. */
export function correlates(
  ctx: Ctx,
  item: OpenItem,
  channel: MessageChannel,
  correlation: readonly CorrelationMatch[],
  state: State,
): Result<boolean> {
  const waiting = openKindView(item.kind).channel;
  const subscription = subscriptionOf(ctx, item);
  if (waiting === null || subscription === null) return committed(false);
  if (!messageChannelEquals(waiting, channel)) return committed(false);
  const bound = criteria(subscription.trigger);
  if (bound.length === 0 && ctx.program.options.messageCorrelation === MessageCorrelation.ModeledKey) return committed(false);
  return correlationAccepts(ctx, state, item.scope, bound, correlation);
}
