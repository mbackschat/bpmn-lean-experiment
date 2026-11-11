/**
 * API correlation criteria a command may carry, transcribed from `Kernel/State/Criteria.lean`: which API criteria
 * (CIB-EXT-0025, PC-MESSAGE-08) a delivery or publication is refused for, decided for the command before any waiting item
 * or start is asked. Part of the State layer, above `state.ts`, so `feature/correlation.ts` and the population share one
 * rule.
 */
import { MessageCorrelation, ValueTag, assertNever, type Value } from "../il/types.js";
import { FailureTag, type Failure } from "../state.js";
import { type CorrelationMatch, type CriterionTarget, CriterionTargetTag } from "./input.js";

/** Structural equality of two criterion targets, Lean's derived `DecidableEq`. */
function criterionTargetEquals(left: CriterionTarget, right: CriterionTarget): boolean {
  switch (left.tag) {
    case CriterionTargetTag.ProcessVariable:
    case CriterionTargetTag.LocalVariable:
      return right.tag === left.tag && right.name === left.name;
    case CriterionTargetTag.BusinessKey:
    case CriterionTargetTag.ProcessInstance:
      return right.tag === left.tag;
  }
  return assertNever(left);
}

/**
 * Whether two of `criteria` name one target. CIB's criteria are a map, so a delivery or publication naming one target
 * twice is `criteria-duplicate`.
 */
export function targetsRepeat(criteria: readonly CorrelationMatch[]): boolean {
  return criteria.some((criterion, index) =>
    criteria.slice(0, index).some((earlier) => criterionTargetEquals(earlier.target, criterion.target)));
}

/**
 * Whether CIB's variable query can compare a criterion's value: it refuses a value whose serializer is no primitive type
 * ("Object values cannot be used to query", `SingleQueryVariableValueCondition.java:83-85`), and the runner hands a
 * Decimal, a String list, a list and a map over as `BigDecimal`, `ArrayList` and `LinkedHashMap` (CIB-CFG-0009).
 */
export function queryable(value: Value): boolean {
  switch (value.tag) {
    case ValueTag.Null:
    case ValueTag.Bool:
    case ValueTag.Int:
    case ValueTag.String:
      return true;
    case ValueTag.Decimal:
    case ValueTag.StringList:
    case ValueTag.List:
    case ValueTag.Map:
      return false;
  }
  return assertNever(value);
}

/** Whether a criterion names a variable, whose value CIB's variable query compares. */
export function namesVariable(criterion: CorrelationMatch): boolean {
  switch (criterion.target.tag) {
    case CriterionTargetTag.ProcessVariable:
    case CriterionTargetTag.LocalVariable:
      return true;
    case CriterionTargetTag.BusinessKey:
    case CriterionTargetTag.ProcessInstance:
      return false;
  }
  return assertNever(criterion.target);
}

/**
 * Why a delivery's or publication's API `criteria` are refused under any of `readings`, or `null`; `startOnly` is a
 * publication that reaches only root Message starts. Two naming one target are `rejected criteria-duplicate` under every
 * reading. Under `ApiCriteria` a start-only publication carrying a variable criterion is `rejected criteria-start-only`,
 * as CIB fails it (`MessageCorrelationBuilderImpl.java:249-257`, `:332-336`); otherwise a variable criterion whose value
 * is not `queryable` is `unsupported`, since CIB rolls such a correlation back. Under `ModeledKey`, which matches a
 * criterion only as a modeled key, any other target is `unsupported`. The refusal reads the criteria, the mode and the
 * readings alone, so it is the command's: a caller decides it before asking any waiting item, never per item.
 */
export function criteriaRefusal(
  readings: readonly MessageCorrelation[],
  startOnly: boolean,
  criteria: readonly CorrelationMatch[],
): Failure | null {
  if (targetsRepeat(criteria)) return { tag: FailureTag.Rejected, code: "criteria-duplicate" };
  for (const reading of readings) {
    const refusal = readingRefusal(reading, startOnly, criteria);
    if (refusal !== null) return refusal;
  }
  return null;
}

function readingRefusal(reading: MessageCorrelation, startOnly: boolean, criteria: readonly CorrelationMatch[]): Failure | null {
  switch (reading) {
    case MessageCorrelation.ApiCriteria:
      if (startOnly && criteria.some(namesVariable)) return { tag: FailureTag.Rejected, code: "criteria-start-only" };
      return criteria.some((criterion) => namesVariable(criterion) && !queryable(criterion.expected))
        // dynamic-only: a delivery's criteria are its caller's.
        ? { tag: FailureTag.Unsupported, code: "correlation-criterion-not-primitive" }
        : null;
    case MessageCorrelation.ModeledKey:
      return criteria.some((criterion) => criterion.target.tag !== CriterionTargetTag.ProcessVariable)
        // dynamic-only: a delivery's criteria are its caller's.
        ? { tag: FailureTag.Unsupported, code: "profile-message-correlation-api-criteria" }
        : null;
  }
  return assertNever(reading);
}

/**
 * Why a publication whose `criteria` reach a root Message start of a deployment under `reading` is refused, or `null`.
 * Under `ApiCriteria` a business-key or process-instance criterion is `unsupported`: CIB starts the instance under a
 * business-key criterion's key (`AbstractCorrelateMessageCmd.java:85`) and ignores a process-instance criterion when it
 * seeks a start (`DefaultCorrelationHandler.java:148-165`), neither of which the kernel reproduces. A variable criterion
 * reaches the start as in CIB, which uses it only to seek a waiting execution (`DefaultCorrelationHandler.java:46-72`) and
 * starts with the delivered variables alone (`AbstractCorrelateMessageCmd.java:81-95`). Under `ModeledKey` a criterion
 * names a modeled key, which a start does not read.
 */
export function startCriteriaRefusal(reading: MessageCorrelation, criteria: readonly CorrelationMatch[]): Failure | null {
  switch (reading) {
    case MessageCorrelation.ApiCriteria:
      return criteria.every(namesVariable)
        ? null
        // dynamic-only: a publication's criteria are its caller's.
        : { tag: FailureTag.Unsupported, code: "start-criterion-not-variable" };
    case MessageCorrelation.ModeledKey:
      return null;
  }
  return assertNever(reading);
}
