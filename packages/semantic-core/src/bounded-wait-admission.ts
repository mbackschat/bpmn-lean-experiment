/**
 * Well-formedness of the three boundary-deadline operations and the deadline arm they share.
 *
 * One owner because the arm is one wire shape checked identically for every host. The hosts differ
 * in what the deadline accompanies — a single task occurrence, a whole child scope reaching
 * quiescence, or a task that keeps running past it — and in whether firing ends that host. None of
 * those differences reaches the arm, which is why interruption is not a field here: it is carried by
 * the operation kind and, before lowering, by the checked node's own disposition.
 *
 * The boundary Sequence Flow is an ordinary token-carrying control place, unlike an Event-Based
 * Gateway's configuration Flows, so this checks the opposite of that family: `origin` must be exactly
 * the BPMN provenance recorded for `output`. Tying the two together is what makes the lowering fact
 * checkable instead of a comment, and it rejects a program that names a boundary Flow while routing
 * the deadline through some other place.
 */
import { SemanticOperationKind, SemanticOriginKind } from "./semantic-process-contract.js";
import type {
  AdmittedBoundaryTimerDurationMs,
  AwaitBoundedUserTaskOperation,
  AwaitMonitoredUserTaskOperation,
  EnterBoundedScopeOperation,
} from "./semantic-process-contract.js";
import { isWellFormedWireString } from "./wire.js";

export function isWellFormedAwaitBoundedUserTaskOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is AwaitBoundedUserTaskOperation {
  return isWellFormedTaskHostedDeadline(
    value,
    placeIds,
    placeOrigins,
    SemanticOperationKind.AwaitBoundedUserTask,
  );
}

export function isWellFormedAwaitMonitoredUserTaskOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is AwaitMonitoredUserTaskOperation {
  return isWellFormedTaskHostedDeadline(
    value,
    placeIds,
    placeOrigins,
    SemanticOperationKind.AwaitMonitoredUserTask,
  );
}

/**
 * The shape both User Task hosts share, discriminated only by the operation kind they must carry.
 *
 * The kind is a parameter rather than a union member so neither family can admit the other's
 * program: the two profiles pin disjoint interruption dispositions, and this is the layer at which
 * that separation survives lowering.
 */
function isWellFormedTaskHostedDeadline<
  Operation extends
    | AwaitBoundedUserTaskOperation
    | AwaitMonitoredUserTaskOperation,
>(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
  kind: Operation["kind"],
): value is Operation {
  if (
    !hasOnlyKeys(value, ["id", "kind", "origin", "input", "task", "boundaryTimer"]) ||
    value.kind !== kind ||
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
    // Distinct routes are the separating boundary for both hosts, for different reasons: one shared
    // output would make the interrupting family's two victories publicly indistinguishable, and
    // would merge the monitored family's two concurrent branches into one place.
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

export function isWellFormedBoundaryTimerArm(
  value: unknown,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is {
  elementId: string;
  durationMs: AdmittedBoundaryTimerDurationMs;
  output: string;
  origin: { kind: SemanticOriginKind.BpmnSequenceFlow; elementId: string };
} {
  return isRecord(value) &&
    hasOnlyKeys(value, ["elementId", "durationMs", "output", "origin"]) &&
    isNonEmptyString(value.elementId) &&
    isAdmittedBoundaryTimerDurationMs(value.durationMs) &&
    isPlaceReference(value.output, placeIds) &&
    isSequenceFlowOrigin(value.origin) &&
    placeOrigins.get(value.output) === value.origin.elementId;
}

function isAdmittedBoundaryTimerDurationMs(
  value: unknown,
): value is AdmittedBoundaryTimerDurationMs {
  return value === 1000 || value === 5000;
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
