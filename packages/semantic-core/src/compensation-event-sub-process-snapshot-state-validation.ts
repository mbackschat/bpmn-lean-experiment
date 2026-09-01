import {
  CompensationEventSubProcessSnapshotProgramDefect,
  type CompensationEventSubProcessSnapshotDeclaration,
  type CompensationEventSubProcessSnapshotTarget,
} from "./compensation-event-sub-process-snapshot-contract.js";
import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

export function isCompensationEventSubProcessSnapshotDeclaration(
  value: unknown,
): value is CompensationEventSubProcessSnapshotDeclaration {
  return isRecord(value) &&
    hasOnlyKeys(value, ["targets", "limits"]) &&
    Array.isArray(value.targets) &&
    value.targets.length > 0 &&
    value.targets.every(isSnapshotTarget) &&
    isRecord(value.limits) &&
    hasOnlyKeys(value.limits, ["maxRecords", "maxCanonicalBytes"]) &&
    Number.isSafeInteger(value.limits.maxRecords) &&
    Number(value.limits.maxRecords) > 0 &&
    Number.isSafeInteger(value.limits.maxCanonicalBytes) &&
    Number(value.limits.maxCanonicalBytes) >= 2 &&
    Number(value.limits.maxCanonicalBytes) <= 65_536;
}

export function compensationEventSubProcessSnapshotProgramDefects(
  program: SemanticProcessProgram,
): ReadonlyArray<CompensationEventSubProcessSnapshotProgramDefect> {
  const declaration = program.compensationEventSubProcessSnapshots;
  if (declaration === undefined) return [];

  const defects: CompensationEventSubProcessSnapshotProgramDefect[] = [];
  if (
    !Number.isSafeInteger(declaration.limits.maxRecords) ||
    declaration.limits.maxRecords <= 0 ||
    !Number.isSafeInteger(declaration.limits.maxCanonicalBytes) ||
    declaration.limits.maxCanonicalBytes < 2 ||
    declaration.limits.maxCanonicalBytes > 65_536
  ) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.InvalidLimits);
  }
  if (declaration.targets.length === 0) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.EmptyTargets);
  }
  if (!declaration.targets.every(isSnapshotTarget)) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.InvalidTarget);
  }
  if (!strictlySorted(declaration.targets, compareTargets)) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.UnorderedTargets);
  }
  if (hasDuplicate(declaration.targets.map(({ parentScopeId }) => parentScopeId))) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.DuplicateParentTarget);
  }
  if (hasDuplicate(declaration.targets.map(({ handlerScopeId }) => handlerScopeId))) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.DuplicateHandlerTarget);
  }

  const root = program.definitionScopes.find(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === program.processId
  );
  const operationsByScope = ownedCountByScope(
    program.operationScopes.map(({ scopeId }) => scopeId),
  );
  const placesByScope = ownedCountByScope(
    program.controlPlaceScopes.map(({ scopeId }) => scopeId),
  );
  if (declaration.targets.some((target) => {
    const parent = program.definitionScopes.find(({ id }) => id === target.parentScopeId);
    return root === undefined ||
      parent === undefined ||
      (parent.id !== root.id && parent.parentScopeId !== root.id);
  })) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.ParentScopeMismatch);
  }
  if (declaration.targets.some((target) => {
    const handler = program.definitionScopes.find(({ id }) => id === target.handlerScopeId);
    return handler === undefined ||
      handler.id === target.parentScopeId ||
      handler.parentScopeId !== target.parentScopeId;
  })) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.HandlerScopeMismatch);
  }
  if (declaration.targets.some((target) =>
    (operationsByScope.get(target.handlerScopeId) ?? 0) !== 0 ||
      (placesByScope.get(target.handlerScopeId) ?? 0) !== 0 ||
      program.operations.some((operation) =>
        ((operation.kind === SemanticOperationKind.EnterScope ||
            operation.kind === SemanticOperationKind.EnterBoundedScope) &&
          operation.childScopeId === target.handlerScopeId) ||
        (operation.kind === SemanticOperationKind.CompleteScope &&
          operation.scopeId === target.handlerScopeId)
      )
  )) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.HandlerNotDormant);
  }
  if (declaration.targets.some((target) => {
    const parent = program.definitionScopes.find(({ id }) => id === target.parentScopeId);
    return (
      parent !== undefined &&
      root !== undefined &&
      parent.id !== root.id &&
      program.operations.filter((operation) =>
        (operation.kind === SemanticOperationKind.EnterScope ||
          operation.kind === SemanticOperationKind.EnterBoundedScope) &&
          operation.childScopeId === parent.id
      ).length !== 1
    );
  })) {
    defects.push(CompensationEventSubProcessSnapshotProgramDefect.ParentEntryMismatch);
  }
  return defects;
}

function isSnapshotTarget(value: unknown): value is CompensationEventSubProcessSnapshotTarget {
  return isRecord(value) &&
    hasOnlyKeys(value, ["parentScopeId", "handlerScopeId"]) &&
    isWellFormedWireString(value.parentScopeId) &&
    value.parentScopeId.length > 0 &&
    isWellFormedWireString(value.handlerScopeId) &&
    value.handlerScopeId.length > 0;
}

function compareTargets(
  left: CompensationEventSubProcessSnapshotTarget,
  right: CompensationEventSubProcessSnapshotTarget,
): number {
  return compareCanonicalStrings(left.parentScopeId, right.parentScopeId) ||
    compareCanonicalStrings(left.handlerScopeId, right.handlerScopeId);
}

function strictlySorted<T>(
  values: ReadonlyArray<T>,
  compare: (left: T, right: T) => number,
): boolean {
  return values.every((value, index) =>
    index === 0 || compare(values[index - 1] as T, value) < 0
  );
}

function hasDuplicate(values: ReadonlyArray<string>): boolean {
  return new Set(values).size !== values.length;
}

function ownedCountByScope(
  scopeIds: ReadonlyArray<string>,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const scopeId of scopeIds) {
    result.set(scopeId, (result.get(scopeId) ?? 0) + 1);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
