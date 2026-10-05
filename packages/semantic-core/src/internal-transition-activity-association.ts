import {
  activityBodyTaskClaims,
  activityBodyScopeClaims,
  sameActivityOccurrence,
  sameOccurrenceId,
} from "./activity-occurrence.js";
import type {
  ActivityBody,
  ActivityOccurrence,
} from "./activity-occurrence.js";
import type { ScopeOccurrenceId } from "./semantic-process-state.js";

/** Whether two records compete for one Activity identity, body member, or attached handler. */
export function activityAssociationsConflict(
  left: ActivityOccurrence,
  right: ActivityOccurrence,
): boolean {
  return sameActivityOccurrence(left.id, right.id) ||
    activityBodiesConflict(left.body, right.body) ||
    left.attachedHandlers.some((handler) =>
      right.attachedHandlers.some((other) =>
        handler.kind === other.kind && sameOccurrenceId(handler.occurrence, other.occurrence)
      )
    );
}

function activityBodiesConflict(left: ActivityBody, right: ActivityBody): boolean {
  const leftTasks = activityBodyTaskClaims(left);
  const rightTasks = activityBodyTaskClaims(right);
  if (leftTasks.some((task) =>
    rightTasks.some((other) => sameOccurrenceId(task, other))
  )) {
    return true;
  }
  return activityBodyScopeClaims(left).some((scope) =>
    activityBodyScopeClaims(right).some((other) => sameScopeId(scope, other)));
}

function sameScopeId(left: ScopeOccurrenceId, right: ScopeOccurrenceId): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}
