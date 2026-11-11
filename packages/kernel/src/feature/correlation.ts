/**
 * Correlation, transcribed from `Kernel/Feature/Correlation.lean`: whether a Message delivery or publication reaches a
 * waiting item. A sub-feature of its own, which `feature/subscriptions.ts` and `feature/work.ts` reach through their
 * hooks records and `population.ts` through `Hooks.correlates`: the modeled key under `MessageCorrelation.ModeledKey`,
 * the API criteria under `ApiCriteria`.
 *
 * Message key correlation as the specification bounds it: a criterion names one correlation key and the expression its
 * single property's value is bound to in the subscription's scope; the delivered value is the Message payload's. Both
 * must be non-empty Strings, compared by exact equality, and the criterion is evaluated when a delivery is matched,
 * never when the subscription opens, so the current Property value decides.
 *
 * An API criterion (CIB-EXT-0025, PC-MESSAGE-08) holds for an item waiting in a scope occurrence over the waiting
 * instance's own state.
 */
import {
  MessageCorrelation,
  ValueTag,
  assertNever,
  triggerMessage,
  type CorrelationCriterion,
  type Trigger,
  type Value,
} from "../il/types.js";
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
  targetsRepeat,
  type CorrelationMatch,
  type EvalContext,
  type MessageChannel,
  type OpenItem,
  type Result,
  type ScopeOccurrenceId,
  type State,
} from "../state.js";
import { EvaluationTag, evalContext, subscriptionOf, type Ctx } from "../hooks.js";

/** Exact equality of kind and value: `41` never equals `"41"`, nor `1.0` `1.00`, and list and map entries compare in order. */
function sameKindAndValue(left: Value, right: Value): boolean {
  switch (left.tag) {
    case ValueTag.Null:
      return right.tag === ValueTag.Null;
    case ValueTag.Bool:
    case ValueTag.Int:
    case ValueTag.String:
      return right.tag === left.tag && right.value === left.value;
    case ValueTag.Decimal:
      return right.tag === ValueTag.Decimal && right.coefficient === left.coefficient && right.scale === left.scale;
    case ValueTag.StringList:
      return right.tag === ValueTag.StringList && right.items.length === left.items.length &&
        left.items.every((item, index) => item === right.items[index]);
    case ValueTag.List:
      return right.tag === ValueTag.List && right.items.length === left.items.length &&
        left.items.every((item, index) => sameKindAndValue(item, right.items[index] as Value));
    case ValueTag.Map:
      return right.tag === ValueTag.Map && right.entries.length === left.entries.length &&
        left.entries.every(([name, value], index) => {
          const other = right.entries[index] as readonly [string, Value];
          return name === other[0] && sameKindAndValue(value, other[1]);
        });
  }
  return assertNever(left);
}

/**
 * Whether `criterion` holds for an item waiting in `scope`: `processVariable` names a variable the instance root holds
 * and `localVariable` one `scope` holds itself, never one of an enclosing scope, each with an equal value
 * (`sameKindAndValue`); `businessKey` the instance's own key, a called instance's own; `processInstance` its public
 * identifier. A null matches a present null, and an absent name nothing.
 */
function criterionHolds(state: State, scope: ScopeOccurrenceId, criterion: CorrelationMatch): boolean {
  const instance = instanceRoot(state, scope);
  const holds = (owner: ScopeOccurrenceId, name: string): boolean => {
    const held = state.variables.find((entry) => entry.scope === owner)?.entries.find(([key]) => key === name);
    return held !== undefined && sameKindAndValue(held[1], criterion.expected);
  };
  const names = (actual: string | null): boolean =>
    criterion.expected.tag === ValueTag.String && actual !== null && criterion.expected.value === actual;
  const target = criterion.target;
  switch (target.tag) {
    case CriterionTargetTag.ProcessVariable:
      return holds(instance, target.name);
    case CriterionTargetTag.LocalVariable:
      return holds(scope, target.name);
    case CriterionTargetTag.BusinessKey:
      return names(state.slots.instances.find((entry) => entry.root === instance)?.businessKey ?? null);
    case CriterionTargetTag.ProcessInstance:
      return names(instanceOf(state, scope));
  }
  return assertNever(target);
}

/**
 * Whether every one of a delivery's API `criteria` holds for an item waiting in `scope` (`criterionHolds`), the empty
 * list included; two naming one target are `criteria-duplicate` (`targetsRepeat`).
 */
export function criteriaHold(state: State, scope: ScopeOccurrenceId, criteria: readonly CorrelationMatch[]): Result<boolean> {
  if (targetsRepeat(criteria)) return failed(FailureTag.Rejected, "criteria-duplicate");
  return committed(criteria.every((entry) => criterionHolds(state, scope, entry)));
}

function criteria(trigger: Trigger): readonly CorrelationCriterion[] {
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

/**
 * Whether `correlation` accepts an item waiting in `scope` whose subscription's `trigger` models the keys it binds:
 * under `ModeledKey` as `correlationMatches` says; under `ApiCriteria` as `criteriaHold` says, where admission leaves the
 * trigger without keys (`message.correlation.modeled`). `feature/subscriptions.ts` rechecks a firing with it.
 */
export function correlationAccepts(
  ctx: Ctx,
  state: State,
  scope: ScopeOccurrenceId,
  trigger: Trigger,
  correlation: readonly CorrelationMatch[],
): Result<boolean> {
  switch (ctx.program.options.messageCorrelation) {
    case MessageCorrelation.ModeledKey:
      return correlationMatches(ctx, evalContext(state, scope), criteria(trigger), correlation);
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
  if (criteria(subscription.trigger).length === 0 && ctx.program.options.messageCorrelation === MessageCorrelation.ModeledKey) {
    return committed(false);
  }
  return correlationAccepts(ctx, state, item.scope, subscription.trigger, correlation);
}
