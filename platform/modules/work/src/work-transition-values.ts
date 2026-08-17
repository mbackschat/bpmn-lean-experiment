import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";

import type {
  StoredWorkClaimReleaseAction,
  WorkClaimTransitionInput,
  WorkCompletionBinding,
  WorkReleaseTransitionInput,
  WorkTaskReference,
} from "./work-contracts.js";
import {
  requireAuditMatches,
  requireNonnegativeSafeInteger,
  requirePositiveSafeInteger,
  requireString,
  sameJson,
} from "./work-repository-values.js";

export function sameAuditLogicalEvent(
  left: WorkAuditEvent,
  right: WorkAuditEvent,
): boolean {
  return left.actorId === right.actorId &&
    left.hostingProcessInstanceId === right.hostingProcessInstanceId &&
    sameJson(left.taskId, right.taskId) &&
    sameJson(left.action, right.action);
}

export function isStoredClaimAction(
  action: StoredWorkClaimReleaseAction,
): action is Extract<StoredWorkClaimReleaseAction, { binding: { kind: "claim" } }> {
  return action.binding.kind === "claim";
}

export function isStoredReleaseAction(
  action: StoredWorkClaimReleaseAction,
): action is Extract<StoredWorkClaimReleaseAction, { binding: { kind: "release" } }> {
  return action.binding.kind === "release";
}

export function validateClaimInput(
  input: WorkClaimTransitionInput,
  task: WorkTaskReference,
): void {
  requireString(input.actionId, "actionId");
  requireString(input.actorId, "actorId");
  requireNonnegativeSafeInteger(input.expectedGeneration, "expectedGeneration");
  requireAuditMatches(input.audit.claimed, { actorId: input.actorId, task, actionId: input.actionId, kind: "claim", outcome: "claimed" });
  requireAuditMatches(input.audit.idempotent, { actorId: input.actorId, task, actionId: input.actionId, kind: "claim", outcome: "idempotent" });
  requireAuditMatches(input.audit.conflict, { actorId: input.actorId, task, actionId: input.actionId, kind: "claim", outcome: "conflict" });
}

export function validateReleaseInput(
  input: WorkReleaseTransitionInput,
  task: WorkTaskReference,
): void {
  requireString(input.actionId, "actionId");
  requireString(input.actorId, "actorId");
  requirePositiveSafeInteger(input.generation, "generation");
  requireAuditMatches(input.audit.released, { actorId: input.actorId, task, actionId: input.actionId, kind: "release", outcome: "released" });
  requireAuditMatches(input.audit.idempotent, { actorId: input.actorId, task, actionId: input.actionId, kind: "release", outcome: "idempotent" });
  requireAuditMatches(input.audit.conflict, { actorId: input.actorId, task, actionId: input.actionId, kind: "release", outcome: "conflict" });
}

export function requireCompletionAudit(
  event: WorkAuditEvent,
  binding: WorkCompletionBinding,
  outcome: "reserved" | "committed" | "rejected" | "indeterminate",
): void {
  requireAuditMatches(event, {
    actorId: binding.actorId,
    task: binding.task,
    actionId: binding.actionId,
    kind: "completion",
    outcome,
  });
}
