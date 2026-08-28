import type { UserTaskInstanceId } from "./contract.js";
import {
  ActivityBodyKind,
  sameActivityOccurrence,
  sameOccurrenceId,
} from "./activity-occurrence.js";
import type {
  ActivityBody,
  ActivityOccurrence,
} from "./activity-occurrence.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";

/** Whether two records compete for one Activity identity, body member, or attached Timer. */
export function activityAssociationsConflict(
  left: ActivityOccurrence,
  right: ActivityOccurrence,
): boolean {
  return sameActivityOccurrence(left.id, right.id) ||
    activityBodiesConflict(left.body, right.body) ||
    left.attachedTimers.some((timer) =>
      right.attachedTimers.some((other) => sameOccurrenceId(timer, other))
    );
}

function activityBodiesConflict(left: ActivityBody, right: ActivityBody): boolean {
  const leftTasks = activityBodyTasks(left);
  const rightTasks = activityBodyTasks(right);
  if (leftTasks.some((task) =>
    rightTasks.some((other) => sameOccurrenceId(task, other))
  )) {
    return true;
  }
  return left.kind === ActivityBodyKind.ChildScope &&
    right.kind === ActivityBodyKind.ChildScope &&
    sameScopeId(left.scope, right.scope);
}

function activityBodyTasks(body: ActivityBody): ReadonlyArray<UserTaskInstanceId> {
  switch (body.kind) {
    case ActivityBodyKind.UserTask:
      return [body.task];
    case ActivityBodyKind.ParallelUserTasks:
      return body.tasks;
    case ActivityBodyKind.ChildScope:
      return [];
  }
}

function sameScopeId(left: ScopeOccurrenceId, right: ScopeOccurrenceId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}
