import {
  sameActivityOccurrence,
  type ActivityOccurrenceId,
} from "./activity-occurrence.js";
import {
  CompensationRetentionProgramDefect,
  CompensationRetentionStateDefect,
  type BoundaryCompensationTarget,
  type CompletedCompensableActivity,
  type CompensationActivityRetentionDeclaration,
} from "./compensation-activity-retention-contract.js";
import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
  type RuntimeState,
} from "./semantic-process-state.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
  utf8ByteLength,
} from "./wire.js";

export function canonicalCompensationRecords(
  records: ReadonlyArray<CompletedCompensableActivity>,
): string {
  return JSON.stringify(records.map(({ id, completionOrdinal }) => ({
    completionOrdinal,
    id: {
      activation: id.activation,
      activityElementId: id.activityElementId,
      processInstanceId: id.processInstanceId,
    },
  })));
}

export function canonicalCompensationRecordsUtf8Bytes(
  records: ReadonlyArray<CompletedCompensableActivity>,
): number {
  return utf8ByteLength(canonicalCompensationRecords(records));
}

/** Establishes the closed declaration shape before semantic Program validation dereferences it. */
export function isCompensationActivityRetentionDeclaration(
  value: unknown,
): value is CompensationActivityRetentionDeclaration {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["definitionScopeId", "targets", "limits"]) ||
    !isNonEmptyWireString(value.definitionScopeId) ||
    !Array.isArray(value.targets) ||
    value.targets.length === 0 ||
    !value.targets.every(isBoundaryCompensationTarget) ||
    !isRecord(value.limits) ||
    !hasOnlyKeys(value.limits, ["maxRecords", "maxCanonicalBytes"])
  ) {
    return false;
  }
  return Number.isSafeInteger(value.limits.maxRecords) &&
    Number(value.limits.maxRecords) > 0 &&
    Number.isSafeInteger(value.limits.maxCanonicalBytes) &&
    Number(value.limits.maxCanonicalBytes) >= 2 &&
    Number(value.limits.maxCanonicalBytes) <= 65_536;
}

export function compensationRetentionProgramDefects(
  program: SemanticProcessProgram,
): ReadonlyArray<CompensationRetentionProgramDefect> {
  const declaration = program.compensationActivityRetention;
  if (declaration === undefined) return [];
  const defects: CompensationRetentionProgramDefect[] = [];
  const root = program.definitionScopes.filter(({ parentScopeId }) => parentScopeId === null);
  if (
    program.definitionScopes.length !== 1 ||
    root.length !== 1 ||
    root[0]?.id !== declaration.definitionScopeId ||
    root[0]?.originElementId !== program.processId
  ) {
    defects.push(CompensationRetentionProgramDefect.InvalidRootScope);
  }
  if (
    !Number.isSafeInteger(declaration.limits.maxRecords) ||
    declaration.limits.maxRecords <= 0 ||
    !Number.isSafeInteger(declaration.limits.maxCanonicalBytes) ||
    declaration.limits.maxCanonicalBytes < 2 ||
    declaration.limits.maxCanonicalBytes > 65_536
  ) {
    defects.push(CompensationRetentionProgramDefect.InvalidLimits);
  }
  if (declaration.targets.length === 0) {
    defects.push(CompensationRetentionProgramDefect.EmptyTargets);
  }
  if (!declaration.targets.every(validTarget)) {
    defects.push(CompensationRetentionProgramDefect.InvalidTarget);
  }
  if (!strictlySorted(declaration.targets, compareTargets)) {
    defects.push(CompensationRetentionProgramDefect.UnorderedTargets);
  }
  if (declaration.targets.some((target, index) =>
    declaration.targets.some((other, otherIndex) =>
      index !== otherIndex && target.activityElementId === other.activityElementId
    )
  )) {
    defects.push(CompensationRetentionProgramDefect.DuplicateActivityTarget);
  }
  if (!declaration.targets.every((target) => targetOperationMatches(program, target))) {
    defects.push(CompensationRetentionProgramDefect.TargetOperationMismatch);
  }
  if (
    program.identity.semanticProfile ===
      SemanticProfileId.ServiceTaskIncidentCancellation ||
    program.operations.some(({ kind }) =>
      kind === SemanticOperationKind.InvokeProcess ||
      kind === SemanticOperationKind.ReturnProcess ||
      kind === SemanticOperationKind.TerminateScope
    )
  ) {
    defects.push(CompensationRetentionProgramDefect.UnsupportedLifecycle);
  }
  return defects;
}

export function compensationRetentionStateDefects(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<CompensationRetentionStateDefect> {
  const declaration = program.compensationActivityRetention;
  const retentions = state.compensationActivityRetentions;
  if (declaration === undefined) {
    return retentions === undefined
      ? []
      : [CompensationRetentionStateDefect.ProgramPresenceMismatch];
  }
  if (retentions === undefined) {
    return [CompensationRetentionStateDefect.ProgramPresenceMismatch];
  }
  if (state.control.kind !== ControlStateKind.Running) {
    return retentions.length === 0
      ? []
      : [CompensationRetentionStateDefect.RegisterCardinalityMismatch];
  }
  const root = state.scopeOccurrences.filter(({ parent }) => parent === null);
  const retention = retentions[0];
  if (retentions.length !== 1 || root.length !== 1 || retention === undefined) {
    return [CompensationRetentionStateDefect.RegisterCardinalityMismatch];
  }

  const defects: CompensationRetentionStateDefect[] = [];
  if (
    root[0] === undefined ||
    !sameScopeOccurrence(retention.owner, root[0].id) ||
    retention.owner.definitionScopeId !== declaration.definitionScopeId ||
    retention.owner.activation !== 1
  ) {
    defects.push(CompensationRetentionStateDefect.RegisterOwnerMismatch);
  }
  if (!validChronology(retention.nextCompletionOrdinal, retention.records)) {
    defects.push(CompensationRetentionStateDefect.InvalidChronology);
  }
  if (retention.records.some((record, index) =>
    retention.records.some((other, otherIndex) =>
      index !== otherIndex && sameActivityOccurrence(record.id, other.id)
    )
  )) {
    defects.push(CompensationRetentionStateDefect.DuplicateActivity);
  }
  const targets = new Set(declaration.targets.map(({ activityElementId }) => activityElementId));
  const recordsValid = retention.records.every(({ id }) =>
    validActivityOccurrence(id) &&
    id.processInstanceId === retention.owner.processInstanceId &&
    targets.has(id.activityElementId)
  );
  if (!recordsValid) {
    defects.push(CompensationRetentionStateDefect.UndeclaredActivity);
  }
  if (
    retention.records.length > declaration.limits.maxRecords ||
    (recordsValid &&
      canonicalCompensationRecordsUtf8Bytes(retention.records) >
        declaration.limits.maxCanonicalBytes)
  ) {
    defects.push(CompensationRetentionStateDefect.CapacityExceeded);
  }
  return defects;
}

function validTarget(target: BoundaryCompensationTarget): boolean {
  const identities = [
    target.activityElementId,
    target.boundaryEventElementId,
    target.compensationActivityElementId,
  ];
  return identities.every((identity) =>
    isWellFormedWireString(identity) && identity.length > 0
  ) && new Set(identities).size === identities.length;
}

function isBoundaryCompensationTarget(
  value: unknown,
): value is BoundaryCompensationTarget {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "activityElementId",
      "boundaryEventElementId",
      "compensationActivityElementId",
    ]) &&
    isNonEmptyWireString(value.activityElementId) &&
    isNonEmptyWireString(value.boundaryEventElementId) &&
    isNonEmptyWireString(value.compensationActivityElementId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length &&
    actual.every((key) => expected.includes(key));
}

function isNonEmptyWireString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function targetOperationMatches(
  program: SemanticProcessProgram,
  target: BoundaryCompensationTarget,
): boolean {
  const operations = program.operations.filter((operation) =>
    operation.origin.elementId === target.activityElementId &&
    "task" in operation &&
    operation.task.elementId === target.activityElementId
  );
  const operation = operations[0];
  if (
    operations.length !== 1 ||
    operation === undefined ||
    (
      operation.kind !== SemanticOperationKind.AwaitUserTask &&
      operation.kind !== SemanticOperationKind.AwaitSequentialMultiInstanceUserTask &&
      operation.kind !== SemanticOperationKind.AwaitParallelMultiInstanceUserTask
    )
  ) {
    return false;
  }
  const ownership = program.operationScopes.filter(
    ({ operationId }) => operationId === operation.id,
  );
  return ownership.length === 1 &&
    ownership[0]?.scopeId === program.compensationActivityRetention?.definitionScopeId;
}

function compareTargets(
  left: BoundaryCompensationTarget,
  right: BoundaryCompensationTarget,
): number {
  return compareCanonicalStrings(left.activityElementId, right.activityElementId) ||
    compareCanonicalStrings(left.boundaryEventElementId, right.boundaryEventElementId) ||
    compareCanonicalStrings(
      left.compensationActivityElementId,
      right.compensationActivityElementId,
    );
}

function strictlySorted<T>(
  values: ReadonlyArray<T>,
  compare: (left: T, right: T) => number,
): boolean {
  return values.every((value, index) =>
    index === 0 || compare(values[index - 1] as T, value) < 0
  );
}

function validChronology(
  nextCompletionOrdinal: number,
  records: ReadonlyArray<CompletedCompensableActivity>,
): boolean {
  return Number.isSafeInteger(nextCompletionOrdinal) &&
    nextCompletionOrdinal > 0 &&
    records.length === nextCompletionOrdinal - 1 &&
    records.every(({ completionOrdinal }, index) =>
      completionOrdinal === index + 1
    );
}

function validActivityOccurrence(id: ActivityOccurrenceId): boolean {
  return isWellFormedWireString(id.processInstanceId) &&
    id.processInstanceId.length > 0 &&
    isWellFormedWireString(id.activityElementId) &&
    id.activityElementId.length > 0 &&
    Number.isSafeInteger(id.activation) &&
    id.activation > 0;
}
