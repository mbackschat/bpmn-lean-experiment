/**
 * The public selected-input collection one open User Task occurrence publishes.
 *
 * Derived from the committed Activity record and its occurrence-owned local scope, never from the
 * start payload, the definition, or a difference between two states: those are the three sources a
 * consumer must not reconstruct this from, so the engine must not read them either.
 *
 * Absence is the answer for every task whose Activity owns no local data, which is what keeps every
 * existing profile's canonical observation bytes unchanged.
 */
import {
  activityOccurrenceForTaskBody,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import type { UserTaskInstanceId, VariableBinding } from "./contract.js";
import {
  activityOccurrenceVariableBindings,
} from "./semantic-process-data.js";
import type { ScopedVariables } from "./semantic-process-state.js";

/**
 * The one-element input collection for this task occurrence, or `undefined` when it owns no local
 * data.
 *
 * A scope of any cardinality other than one answers absence, exactly as owning no scope does: an
 * empty scope is no local data, and a larger one is a state this profile's single required scalar
 * DataInput cannot describe, so publishing its first binding would present partial data as the
 * complete selected InputSet. Refusing instead would make an unrepresentable state an infrastructure
 * failure, which the semantic invariants keep separate from a semantic outcome, and would diverge
 * from the reference interpreter, whose `selectedTaskInputs?` answers `none` for both.
 */
export function projectSelectedTaskInputs(
  activityOccurrences: ReadonlyArray<ActivityOccurrence>,
  variables: ScopedVariables,
  task: UserTaskInstanceId,
): [VariableBinding] | undefined {
  const record = activityOccurrenceForTaskBody(activityOccurrences, task);
  if (record === undefined) {
    return undefined;
  }
  const bindings = activityOccurrenceVariableBindings(variables, record.id);
  if (bindings === undefined) {
    return undefined;
  }
  const only = bindings[0];
  return bindings.length === 1 && only !== undefined ? [only] : undefined;
}
