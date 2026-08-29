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
 * An Activity-owned scope holding no binding is no local data, exactly as owning no scope is: the
 * runtime representation admits an empty scope for a family that has not copied into it, and a
 * projection describes the states that exist rather than constraining which ones may.
 *
 * Throws for a scope holding more than one binding. This profile admits one required scalar
 * DataInput, so a larger collection is a state the account cannot describe, and truncating it would
 * present partial data as the complete selected InputSet.
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
  if (bindings.length > 1) {
    throw new TypeError(
      "Cannot publish an Activity data-input collection of more than one binding",
    );
  }
  const only = bindings[0];
  return only === undefined ? undefined : [only];
}
