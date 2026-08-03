/**
 * Well-formedness of one bounded User Task operation and its interrupting boundary deadline.
 *
 * The boundary Sequence Flow is an ordinary token-carrying control place, unlike an Event-Based
 * Gateway's configuration Flows, so this checks the opposite of that family: `boundaryTimer.origin`
 * must be exactly the BPMN provenance recorded for `boundaryTimer.output`. Tying the two together is
 * what makes the lowering fact checkable instead of a comment, and it rejects a program that names a
 * boundary Flow while routing the deadline through some other place.
 */
import {
  SemanticOperationKind,
  SemanticOriginKind,
} from "./semantic-process-contract.js";
import type {
  AwaitBoundedUserTaskOperation,
} from "./semantic-process-contract.js";
import { isWellFormedWireString } from "./wire.js";

export function isWellFormedAwaitBoundedUserTaskOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is AwaitBoundedUserTaskOperation {
  if (
    !hasOnlyKeys(value, ["id", "kind", "origin", "input", "task", "boundaryTimer"]) ||
    value.kind !== SemanticOperationKind.AwaitBoundedUserTask ||
    !isPlaceReference(value.input, placeIds) ||
    !isRecord(value.task) ||
    !isRecord(value.boundaryTimer) ||
    !hasOnlyKeys(value.task, ["elementId", "name", "output"]) ||
    !hasOnlyKeys(value.boundaryTimer, [
      "elementId",
      "durationMs",
      "output",
      "origin",
    ]) ||
    !isNonEmptyString(value.task.elementId) ||
    !isNonEmptyString(value.boundaryTimer.elementId) ||
    (value.task.name !== null && !isNonEmptyString(value.task.name)) ||
    !isPlaceReference(value.task.output, placeIds) ||
    !isPlaceReference(value.boundaryTimer.output, placeIds) ||
    !isSequenceFlowOrigin(value.boundaryTimer.origin) ||
    value.boundaryTimer.durationMs !== 1000
  ) {
    return false;
  }
  const activityElementId = isRecord(value.origin) &&
      isNonEmptyString(value.origin.elementId)
    ? value.origin.elementId
    : undefined;
  return value.input !== value.task.output &&
    value.input !== value.boundaryTimer.output &&
    // Distinct routes are the capsule's separating boundary: one shared output would make the two
    // victories publicly indistinguishable.
    value.task.output !== value.boundaryTimer.output &&
    value.task.elementId !== value.boundaryTimer.elementId &&
    activityElementId === value.task.elementId &&
    placeOrigins.get(value.boundaryTimer.output) ===
      value.boundaryTimer.origin.elementId;
}

function isSequenceFlowOrigin(
  value: unknown,
): value is Readonly<{
  kind: SemanticOriginKind.BpmnSequenceFlow;
  elementId: string;
}> {
  return isRecord(value) &&
    hasOnlyKeys(value, ["kind", "elementId"]) &&
    value.kind === SemanticOriginKind.BpmnSequenceFlow &&
    isNonEmptyString(value.elementId);
}

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
