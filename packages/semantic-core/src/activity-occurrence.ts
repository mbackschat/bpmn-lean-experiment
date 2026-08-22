/**
 * One runtime record per Activity occurrence that owns runtime state beyond its body.
 *
 * The record exists because ownership in `RuntimeState` points one way: every token and wait names
 * its scope occurrence, and nothing names the Activity occurrence between the scope and the wait. An
 * Activity's body and the handler attached to it were therefore siblings under one scope, recoverable
 * only by matching two independently keyed activation counters for equality. That coincidence holds
 * exactly while each element is armed once per arming of the other, and it fails silently rather than
 * ambiguously: a diverged pair yields a different sibling or none.
 *
 * Existence is a property of the *program*, not of the state. A record exists for an Activity whose
 * program gives it a wait-producing attached handler, and it then lives exactly as long as its body.
 * The distinction is load-bearing: firing a non-interrupting deadline empties `attachedTimers` while
 * the host task is still live, so a state-level condition would delete the record at the moment it is
 * still the only thing identifying the host.
 */
import type {
  OccurrenceId,
  TimerOccurrenceId,
  UserTaskInstanceId,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

/**
 * One activation of one admitted BPMN Activity.
 *
 * Deliberately *not* an `OccurrenceId` alias. `UserTaskInstanceId`, `MessageSubscriptionId`,
 * `TimerOccurrenceId`, and `EffectOccurrenceId` are all aliases of one `{ processInstanceId,
 * elementId, activation }` shape, so an alias here would be substitutable for a task identity in
 * TypeScript and indistinguishable from one on the wire. That substitution is the hazard rather than a
 * theoretical one: for a bounded User Task the Activity element *is* the task element, so an aliased
 * identity would be an equal triple, and under Multi-Instance it would equal the first inner
 * iteration's task identity. Naming the field `activityElementId` makes the two incompatible at
 * compile time at no runtime cost.
 */
export type ActivityOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  activityElementId: string;
  activation: number;
}>;

/** The runtime shape an Activity occurrence's body takes. A new arm, never a flag. */
export enum ActivityBodyKind {
  UserTask = "userTask",
  ChildScope = "childScope",
}

export type ActivityBody =
  | DeepReadonly<{ kind: ActivityBodyKind.UserTask; task: UserTaskInstanceId }>
  | DeepReadonly<{ kind: ActivityBodyKind.ChildScope; scope: ScopeOccurrenceId }>;

/**
 * What one Activity occurrence owns.
 *
 * `owner` is the scope occurrence containing the Activity node, and every wait this record lists
 * shares it. That is what makes a bounded Sub-Process's deadline parent-owned by derivation rather
 * than by the mechanical argument its capsule had to use, namely that a child-owned deadline would
 * leave the child permanently non-quiescent.
 *
 * `attachedTimers` names Timer occurrences and not a union of handler families, because Timer is the
 * only attached-handler family that produces a wait. A union arm would not add safety either, since
 * every wait identity is the same structural shape; what prevents a foreign identity here is the
 * well-formedness conjunct requiring each entry to resolve in `timerWaits`.
 */
export type ActivityOccurrence = DeepReadonly<{
  id: ActivityOccurrenceId;
  owner: ScopeOccurrenceId;
  operationId: string;
  body: ActivityBody;
  attachedTimers: TimerOccurrenceId[];
}>;

export function sameActivityOccurrence(
  left: ActivityOccurrenceId,
  right: ActivityOccurrenceId,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.activityElementId === right.activityElementId &&
    left.activation === right.activation;
}

/** Canonical order: Process instance, then Activity element, then activation. */
export function compareActivityOccurrences(
  left: ActivityOccurrence,
  right: ActivityOccurrence,
): number {
  const instance = compareCanonicalStrings(
    left.id.processInstanceId,
    right.id.processInstanceId,
  );
  if (instance !== 0) return instance;
  const element = compareCanonicalStrings(
    left.id.activityElementId,
    right.id.activityElementId,
  );
  return element !== 0 ? element : left.id.activation - right.id.activation;
}

function bodyNames(body: ActivityBody, occurrence: OccurrenceId): boolean {
  switch (body.kind) {
    case ActivityBodyKind.UserTask:
      return body.task.processInstanceId === occurrence.processInstanceId &&
        body.task.elementId === occurrence.elementId &&
        body.task.activation === occurrence.activation;
    case ActivityBodyKind.ChildScope:
      return false;
  }
}

/**
 * The record owning one User Task occurrence as its body, or `undefined`.
 *
 * Returns `undefined` rather than repairing an ambiguous state: two records naming one body is
 * invalid before evaluation, so a caller that silently took the first would hide the defect the
 * uniqueness conjunct exists to reject.
 */
export function activityOccurrenceForTaskBody(
  occurrences: ReadonlyArray<ActivityOccurrence>,
  task: UserTaskInstanceId,
): ActivityOccurrence | undefined {
  return only(occurrences.filter((record) => bodyNames(record.body, task)));
}

/** The record owning one child scope occurrence as its body, or `undefined`. */
export function activityOccurrenceForScopeBody(
  occurrences: ReadonlyArray<ActivityOccurrence>,
  scope: ScopeOccurrenceId,
): ActivityOccurrence | undefined {
  return only(occurrences.filter((record) =>
    record.body.kind === ActivityBodyKind.ChildScope &&
    record.body.scope.processInstanceId === scope.processInstanceId &&
    record.body.scope.definitionScopeId === scope.definitionScopeId &&
    record.body.scope.activation === scope.activation
  ));
}

/** The record listing one attached Timer occurrence, or `undefined`. */
export function activityOccurrenceForAttachedTimer(
  occurrences: ReadonlyArray<ActivityOccurrence>,
  timer: TimerOccurrenceId,
): ActivityOccurrence | undefined {
  return only(occurrences.filter((record) =>
    record.attachedTimers.some((candidate) =>
      candidate.processInstanceId === timer.processInstanceId &&
      candidate.elementId === timer.elementId &&
      candidate.activation === timer.activation
    )
  ));
}

function only<T>(values: ReadonlyArray<T>): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}
