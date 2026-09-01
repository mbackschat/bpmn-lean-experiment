import {
  CompensationParentContextRetentionKind,
  CompensationEventSubProcessSnapshotProgramDefect,
  CompensationEventSubProcessSnapshotStateDefect,
  type CompensationParentContextRetention,
  type CompensationEventSubProcessSnapshotDeclaration,
  type CompensationEventSubProcessSnapshotTarget,
} from "./compensation-event-sub-process-snapshot-contract.js";
import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  compareScopeOccurrenceIds,
  ControlStateKind,
  sameScopeOccurrence,
  type RuntimeScopeOccurrence,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { isDenseArray, isVariablePatch } from "./variable-value.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
  utf8ByteLength,
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
  const parentlessScopes = program.definitionScopes.filter(
    ({ parentScopeId }) => parentScopeId === null,
  );
  const operationsByScope = ownedCountByScope(
    program.operationScopes.map(({ scopeId }) => scopeId),
  );
  const placesByScope = ownedCountByScope(
    program.controlPlaceScopes.map(({ scopeId }) => scopeId),
  );
  if (
    parentlessScopes.length !== 1 ||
    parentlessScopes[0]?.id !== root?.id ||
    declaration.targets.some((target) => {
      const parent = program.definitionScopes.find(({ id }) => id === target.parentScopeId);
      return root === undefined ||
        parent === undefined ||
        (parent.id !== root.id && parent.parentScopeId !== root.id);
    })
  ) {
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

export function compensationEventSubProcessSnapshotStateDefects(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<CompensationEventSubProcessSnapshotStateDefect> {
  const declaration = program.compensationEventSubProcessSnapshots;
  const retentions = state.compensationParentContextRetentions;
  if (declaration === undefined || retentions === undefined) {
    return declaration === undefined && retentions === undefined
      ? []
      : [CompensationEventSubProcessSnapshotStateDefect.ProgramPresenceMismatch];
  }
  if (!isDenseArray(retentions)) {
    return [CompensationEventSubProcessSnapshotStateDefect.InvalidRetention];
  }

  const defects: CompensationEventSubProcessSnapshotStateDefect[] = [];
  const validRecords = retentions.every(isCompensationParentContextRetention);
  if (
    !validRecords ||
    !strictlySorted(retentions, compareCompensationParentContextRetentions) ||
    sharesRetentionKey(retentions) ||
    !retentions.every((retention) =>
      targetFor(program, retention) !== undefined &&
      retentionParentMatchesProgram(program, retention)
    )
  ) {
    defects.push(CompensationEventSubProcessSnapshotStateDefect.InvalidRetention);
  }
  if (
    retentions.length > declaration.limits.maxRecords ||
    (validRecords &&
      canonicalCompensationParentContextRetentionsUtf8Bytes(retentions) >
        declaration.limits.maxCanonicalBytes)
  ) {
    defects.push(CompensationEventSubProcessSnapshotStateDefect.InvalidRetention);
  }
  if (validRecords && !validLifecycle(program, state, retentions)) {
    defects.push(CompensationEventSubProcessSnapshotStateDefect.InvalidRetention);
  }
  return [...new Set(defects)];
}

export function compareCompensationParentContextRetentions(
  left: CompensationParentContextRetention,
  right: CompensationParentContextRetention,
): number {
  return compareScopeOccurrenceIds(left.parent.id, right.parent.id) ||
    compareCanonicalStrings(left.handlerScopeId, right.handlerScopeId);
}

export function canonicalCompensationParentContextRetentions(
  retentions: ReadonlyArray<CompensationParentContextRetention>,
): string {
  return canonicalJson(retentions);
}

export function canonicalCompensationParentContextRetentionsUtf8Bytes(
  retentions: ReadonlyArray<CompensationParentContextRetention>,
): number {
  return utf8ByteLength(canonicalCompensationParentContextRetentions(retentions));
}

function validLifecycle(
  program: SemanticProcessProgram,
  state: RuntimeState,
  retentions: ReadonlyArray<CompensationParentContextRetention>,
): boolean {
  switch (state.control.kind) {
    case ControlStateKind.NotStarted:
    case ControlStateKind.Cancelled:
      return retentions.length === 0;
    case ControlStateKind.Running:
      return validRunningLifecycle(program, state, retentions);
    case ControlStateKind.Completed:
      return validCompletedLifecycle(program, state, retentions);
  }
}

function validRunningLifecycle(
  program: SemanticProcessProgram,
  state: RuntimeState,
  retentions: ReadonlyArray<CompensationParentContextRetention>,
): boolean {
  if (
    state.control.kind !== ControlStateKind.Running ||
    !("instanceId" in state.control)
  ) return false;
  const instanceId = state.control.instanceId;
  const rootScopeId = programRootScopeId(program);
  if (rootScopeId === undefined) return false;
  const roots = state.scopeOccurrences.filter(({ id, parent }) =>
    parent === null &&
    id.definitionScopeId === rootScopeId &&
    id.processInstanceId === instanceId
  );
  const root = roots[0];
  if (roots.length !== 1 || root === undefined) return false;

  const selectedLiveParents = state.scopeOccurrences.filter((occurrence) =>
    program.compensationEventSubProcessSnapshots?.targets.some(({ parentScopeId }) =>
      parentScopeId === occurrence.id.definitionScopeId
    )
  );
  if (!selectedLiveParents.every((occurrence) =>
    retentions.filter((retention) =>
      retention.kind === CompensationParentContextRetentionKind.Provisional &&
      sameRuntimeScopeOccurrence(retention.parent, occurrence)
    ).length === 1
  )) {
    return false;
  }

  return retentions.every((retention) => {
    if (retention.kind === CompensationParentContextRetentionKind.Provisional) {
      return state.scopeOccurrences.filter((occurrence) =>
        sameRuntimeScopeOccurrence(occurrence, retention.parent)
      ).length === 1;
    }
    if (
      retention.parent.parent === null ||
      state.scopeOccurrences.some(({ id }) => sameScopeOccurrence(id, retention.parent.id))
    ) {
      return false;
    }
    return sameScopeOccurrence(retention.parent.parent, root.id) &&
      validSnapshotFrames(retention, root.id);
  });
}

function validCompletedLifecycle(
  program: SemanticProcessProgram,
  state: RuntimeState,
  retentions: ReadonlyArray<CompensationParentContextRetention>,
): boolean {
  if (
    state.control.kind !== ControlStateKind.Completed ||
    !("instanceId" in state.control)
  ) return false;
  const instanceId = state.control.instanceId;
  const rootScopeId = programRootScopeId(program);
  if (rootScopeId === undefined || retentions.some(({ kind }) =>
    kind !== CompensationParentContextRetentionKind.Promoted
  )) {
    return false;
  }
  const roots = retentions.filter(({ parent }) =>
    parent.parent === null &&
    parent.id.definitionScopeId === rootScopeId &&
    parent.id.processInstanceId === instanceId
  );
  const rootSelected = program.compensationEventSubProcessSnapshots?.targets.some(
    ({ parentScopeId }) => parentScopeId === rootScopeId,
  ) ?? false;
  if (roots.length !== (rootSelected ? 1 : 0)) return false;
  return retentions.every((retention) => {
    if (retention.kind !== CompensationParentContextRetentionKind.Promoted) return false;
    if (retention.parent.parent === null) {
      return roots.length === 1 && validSnapshotFrames(retention, retention.parent.id);
    }
    const owners = roots.filter(({ parent }) =>
      retention.parent.parent !== null &&
      sameScopeOccurrence(parent.id, retention.parent.parent)
    );
    const owner = owners[0];
    return owners.length === 1 && owner !== undefined &&
      validSnapshotFrames(retention, owner.parent.id);
  });
}

function validSnapshotFrames(
  retention: Extract<CompensationParentContextRetention, { readonly kind: CompensationParentContextRetentionKind.Promoted }>,
  root: ScopeOccurrenceId,
): boolean {
  const frames = retention.snapshot.frames;
  if (!isDenseArray(frames)) return false;
  const expected = retention.parent.parent === null
    ? [retention.parent.id]
    : [root, retention.parent.id];
  return frames.length === expected.length && frames.every((frame, index) =>
    isExactRecord(frame, ["owner", "bindings"]) &&
    validScopeOccurrenceId(frame.owner) &&
    sameScopeOccurrence(frame.owner, expected[index] as ScopeOccurrenceId) &&
    isVariablePatch(frame.bindings) &&
    (index === 0 || frame.bindings.length === 0)
  );
}

function isCompensationParentContextRetention(
  value: CompensationParentContextRetention,
): boolean {
  if (!isRecord(value)) return false;
  const common = validRuntimeScopeOccurrence(value.parent) &&
    isNonEmptyWireString(value.handlerScopeId);
  switch (value.kind) {
    case CompensationParentContextRetentionKind.Provisional:
      return common && isExactRecord(value, ["kind", "parent", "handlerScopeId"]);
    case CompensationParentContextRetentionKind.Promoted:
      return common &&
        isExactRecord(value, ["kind", "parent", "handlerScopeId", "snapshot"]) &&
        isRecord(value.snapshot) &&
        isExactRecord(value.snapshot, ["frames"]) &&
        isDenseArray(value.snapshot.frames) &&
        value.snapshot.frames.every(isCompensationParentContextFrame);
    default:
      return false;
  }
}

function isCompensationParentContextFrame(value: unknown): boolean {
  return isExactRecord(value, ["owner", "bindings"]) &&
    validScopeOccurrenceId(value.owner as ScopeOccurrenceId) &&
    isVariablePatch(value.bindings);
}

function targetFor(
  program: SemanticProcessProgram,
  retention: CompensationParentContextRetention,
): CompensationEventSubProcessSnapshotTarget | undefined {
  return program.compensationEventSubProcessSnapshots?.targets.find(({ parentScopeId, handlerScopeId }) =>
    parentScopeId === retention.parent.id.definitionScopeId &&
    handlerScopeId === retention.handlerScopeId
  );
}

function retentionParentMatchesProgram(
  program: SemanticProcessProgram,
  retention: CompensationParentContextRetention,
): boolean {
  const rootScopeId = programRootScopeId(program);
  if (rootScopeId === undefined) return false;
  if (retention.parent.id.definitionScopeId === rootScopeId) {
    return retention.parent.parent === null && retention.parent.id.activation === 1;
  }
  return retention.parent.parent !== null &&
    retention.parent.parent.definitionScopeId === rootScopeId &&
    retention.parent.parent.processInstanceId === retention.parent.id.processInstanceId &&
    retention.parent.parent.activation === 1;
}

function sharesRetentionKey(
  retentions: ReadonlyArray<CompensationParentContextRetention>,
): boolean {
  return retentions.some((retention, index) =>
    retentions.some((other, otherIndex) =>
      index !== otherIndex &&
      retention.handlerScopeId === other.handlerScopeId &&
      sameScopeOccurrence(retention.parent.id, other.parent.id)
    )
  );
}

function validRuntimeScopeOccurrence(value: RuntimeScopeOccurrence): boolean {
  return isExactRecord(value, ["id", "parent"]) &&
    validScopeOccurrenceId(value.id) &&
    (value.parent === null || validScopeOccurrenceId(value.parent));
}

function validScopeOccurrenceId(value: ScopeOccurrenceId): boolean {
  return isExactRecord(value, ["processInstanceId", "definitionScopeId", "activation"]) &&
    isNonEmptyWireString(value.processInstanceId) &&
    isNonEmptyWireString(value.definitionScopeId) &&
    Number.isSafeInteger(value.activation) &&
    value.activation > 0;
}

function sameRuntimeScopeOccurrence(
  left: RuntimeScopeOccurrence,
  right: RuntimeScopeOccurrence,
): boolean {
  return sameScopeOccurrence(left.id, right.id) &&
    ((left.parent === null && right.parent === null) ||
      (left.parent !== null && right.parent !== null &&
        sameScopeOccurrence(left.parent, right.parent)));
}

function programRootScopeId(program: SemanticProcessProgram): string | undefined {
  const roots = program.definitionScopes.filter(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === program.processId
  );
  return roots.length === 1 ? roots[0]?.id : undefined;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    if (!isWellFormedWireString(value)) throw new TypeError("canonical JSON requires scalar strings");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return joinCanonicalJson("[", value.map(canonicalJson), "]");
  }
  if (isRecord(value)) {
    return joinCanonicalJson(
      "{",
      Object.keys(value)
      .sort(compareCanonicalStrings)
      .map((key) => [
        JSON.stringify(key),
        ":",
        canonicalJson(value[key]),
      ].join("")),
      "}",
    );
  }
  throw new TypeError("canonical JSON requires a closed JSON value");
}

function joinCanonicalJson(
  open: "[" | "{",
  values: ReadonlyArray<string>,
  close: "]" | "}",
): string {
  const parts: string[] = [open];
  for (const [index, value] of values.entries()) {
    if (index > 0) parts.push(",");
    parts.push(value);
  }
  parts.push(close);
  return parts.join("");
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

function isExactRecord(
  value: unknown,
  keys: ReadonlyArray<string>,
): value is Record<string, unknown> {
  return isRecord(value) &&
    Object.keys(value).length === keys.length &&
    hasOnlyKeys(value, keys);
}

function isNonEmptyWireString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
