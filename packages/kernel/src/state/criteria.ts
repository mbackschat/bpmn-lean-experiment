/**
 * API correlation criteria, transcribed from `Kernel/State/Criteria.lean`: whether a Message delivery's API criterion
 * (`MessageCorrelation.ApiCriteria`, CIB-EXT-0025) holds for an item waiting in a scope occurrence, over the waiting
 * instance's own state (PC-MESSAGE-08). Part of the State layer, above `state.ts`: pure reads that every feature
 * receiving a Message (subscriptions and Receive Tasks) applies alike.
 */
import { ValueTag, assertNever, type Value } from "../il/types.js";
import { FailureTag, committed, failed, instanceOf, instanceRoot, type Result, type State } from "../state.js";
import { CriterionTargetTag, type CorrelationMatch } from "./input.js";
import type { ScopeOccurrenceId } from "./slots.js";

/** Exact equality of kind and value: `41` never equals `"41"`, nor `1.0` `1.00`, and list and map entries compare in order. */
export function sameKindAndValue(left: Value, right: Value): boolean {
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
export function criterionHolds(state: State, scope: ScopeOccurrenceId, criterion: CorrelationMatch): boolean {
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

/** A criterion target's identity, which `criteriaHold` compares for duplicates. */
function targetKey(target: CorrelationMatch["target"]): string {
  switch (target.tag) {
    case CriterionTargetTag.ProcessVariable:
    case CriterionTargetTag.LocalVariable:
      return `${target.tag}:${target.name}`;
    case CriterionTargetTag.BusinessKey:
    case CriterionTargetTag.ProcessInstance:
      return target.tag;
  }
  return assertNever(target);
}

/**
 * Whether every one of a delivery's API `criteria` holds for an item waiting in `scope` (`criterionHolds`), the empty
 * list included. CIB's criteria are a map, so two naming one target are `criteria-duplicate`.
 */
export function criteriaHold(state: State, scope: ScopeOccurrenceId, criteria: readonly CorrelationMatch[]): Result<boolean> {
  const targets = criteria.map((entry) => targetKey(entry.target));
  if (new Set(targets).size !== targets.length) return failed(FailureTag.Rejected, "criteria-duplicate");
  return committed(criteria.every((entry) => criterionHolds(state, scope, entry)));
}
