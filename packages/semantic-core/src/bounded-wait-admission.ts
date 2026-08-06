/**
 * Well-formedness of the two bounded-wait operations and the interrupting deadline arm they share.
 *
 * One owner because the arm is one wire shape checked identically for both hosts. The hosts differ
 * only in what the deadline races: a single task occurrence, or a whole child scope reaching
 * quiescence.
 *
 * The boundary Sequence Flow is an ordinary token-carrying control place, unlike an Event-Based
 * Gateway's configuration Flows, so this checks the opposite of that family: `origin` must be exactly
 * the BPMN provenance recorded for `output`. Tying the two together is what makes the lowering fact
 * checkable instead of a comment, and it rejects a program that names a boundary Flow while routing
 * the deadline through some other place.
 */
import { SemanticOperationKind, SemanticOriginKind } from "./semantic-process-contract.js";
import type {
  AwaitBoundedUserTaskOperation,
  EnterBoundedScopeOperation,
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
    !hasOnlyKeys(value.task, ["elementId", "name", "output"]) ||
    !isNonEmptyString(value.task.elementId) ||
    (value.task.name !== null && !isNonEmptyString(value.task.name)) ||
    !isPlaceReference(value.task.output, placeIds) ||
    !isWellFormedBoundaryTimerArm(value.boundaryTimer, placeIds, placeOrigins)
  ) {
    return false;
  }
  return value.input !== value.task.output &&
    value.input !== value.boundaryTimer.output &&
    // Distinct routes are the capsule's separating boundary: one shared output would make the two
    // victories publicly indistinguishable.
    value.task.output !== value.boundaryTimer.output &&
    value.task.elementId !== value.boundaryTimer.elementId &&
    hostElementId(value.origin) === value.task.elementId &&
    placeOrigins.get(value.boundaryTimer.output) ===
      value.boundaryTimer.origin.elementId;
}

/**
 * The scope host's own arm, checked against the same deadline contract.
 *
 * The normal route is deliberately not a field: it is the child scope's `completeScope` parent output,
 * so what is checkable here is that the deadline's route is distinct from the child entry. A shared
 * place would make the two victories publicly indistinguishable, exactly as for the task host.
 */
export function isWellFormedEnterBoundedScopeOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
  scopeOrigins: ReadonlyMap<string, string>,
): value is EnterBoundedScopeOperation {
  if (
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "childEntry",
      "childScopeId",
      "boundaryTimer",
    ]) ||
    value.kind !== SemanticOperationKind.EnterBoundedScope ||
    !isPlaceReference(value.input, placeIds) ||
    !isPlaceReference(value.childEntry, placeIds) ||
    !isNonEmptyString(value.childScopeId) ||
    !scopeOrigins.has(value.childScopeId) ||
    !isWellFormedBoundaryTimerArm(value.boundaryTimer, placeIds, placeOrigins)
  ) {
    return false;
  }
  return value.input !== value.childEntry &&
    value.input !== value.boundaryTimer.output &&
    value.childEntry !== value.boundaryTimer.output &&
    hostElementId(value.origin) !== value.boundaryTimer.elementId &&
    // The host binding its sibling states positively: this operation's origin must be the element
    // that owns the child scope it enters. Without it the operation could name any other element as
    // its host, misattributing every occurrence the transition creates.
    hostElementId(value.origin) === scopeOrigins.get(value.childScopeId) &&
    placeOrigins.get(value.boundaryTimer.output) ===
      value.boundaryTimer.origin.elementId;
}

function isWellFormedBoundaryTimerArm(
  value: unknown,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is {
  elementId: string;
  durationMs: 1000;
  output: string;
  origin: { kind: SemanticOriginKind.BpmnSequenceFlow; elementId: string };
} {
  return isRecord(value) &&
    hasOnlyKeys(value, ["elementId", "durationMs", "output", "origin"]) &&
    isNonEmptyString(value.elementId) &&
    value.durationMs === 1000 &&
    isPlaceReference(value.output, placeIds) &&
    isSequenceFlowOrigin(value.origin) &&
    placeOrigins.get(value.output) === value.origin.elementId;
}

function hostElementId(origin: unknown): string | undefined {
  return isRecord(origin) && isNonEmptyString(origin.elementId)
    ? origin.elementId
    : undefined;
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
