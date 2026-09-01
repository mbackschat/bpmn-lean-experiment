import {
  CompensationParentContextAttemptKind,
  CompensationParentContextRetentionKind,
  CompensationParentContextRefusalReason,
  CompensationParentContextRootDisposition,
  type CompensationParentContextAttempt,
  type CompensationParentContextRetention,
} from "./compensation-event-sub-process-snapshot-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
  type RuntimeScopeOccurrence,
  type RuntimeState,
} from "./semantic-process-state.js";
import {
  canonicalCompensationParentContextRetentionsUtf8Bytes,
  compareCompensationParentContextRetentions,
  compensationEventSubProcessSnapshotProgramDefects,
  compensationEventSubProcessSnapshotStateDefects,
} from "./compensation-event-sub-process-snapshot-state-validation.js";
import { cloneVariableBinding, isVariablePatch } from "./variable-value.js";
import { isWellFormedWireString } from "./wire.js";

type NonCapacityRefusalReason = Exclude<
  CompensationParentContextRefusalReason,
  | CompensationParentContextRefusalReason.RecordCapacity
  | CompensationParentContextRefusalReason.CanonicalByteCapacity
>;

export function reserveCompensationParentContext(
  program: SemanticProcessProgram,
  state: RuntimeState,
  parent: RuntimeScopeOccurrence,
): CompensationParentContextAttempt {
  const ready = prevalidate(program, state);
  if (ready !== undefined) return refused(state, ready);
  const declaration = program.compensationEventSubProcessSnapshots;
  const target = declaration?.targets.find(({ parentScopeId }) =>
    parentScopeId === parent.id.definitionScopeId
  );
  if (declaration === undefined || target === undefined) {
    return { kind: CompensationParentContextAttemptKind.Disabled, state };
  }
  if (!validProspectiveParent(program, state, parent)) {
    return refused(state, CompensationParentContextRefusalReason.InvalidState);
  }
  const retentions = state.compensationParentContextRetentions as ReadonlyArray<CompensationParentContextRetention>;
  if (retentions.some((retention) =>
    retention.handlerScopeId === target.handlerScopeId &&
    sameScopeOccurrence(retention.parent.id, parent.id)
  )) {
    return refused(state, CompensationParentContextRefusalReason.DuplicateRetention);
  }
  const reservation: CompensationParentContextRetention = {
    kind: CompensationParentContextRetentionKind.Provisional,
    parent: cloneRuntimeScopeOccurrence(parent),
    handlerScopeId: target.handlerScopeId,
  };
  const prospective: CompensationParentContextRetention[] = [
    ...retentions,
    reservation,
  ];
  prospective.sort(compareCompensationParentContextRetentions);
  const capacity = capacityRefusal(program, prospective);
  if (capacity !== undefined) return refusedWithDetail(state, capacity);
  return {
    kind: CompensationParentContextAttemptKind.Applied,
    state: { ...state, compensationParentContextRetentions: prospective },
  };
}

export function promoteCompensationParentContext(
  program: SemanticProcessProgram,
  state: RuntimeState,
  parent: RuntimeScopeOccurrence,
): CompensationParentContextAttempt {
  const ready = prevalidate(program, state);
  if (ready !== undefined) return refused(state, ready);
  const declaration = program.compensationEventSubProcessSnapshots;
  const target = declaration?.targets.find(({ parentScopeId }) =>
    parentScopeId === parent.id.definitionScopeId
  );
  if (declaration === undefined || target === undefined) {
    return { kind: CompensationParentContextAttemptKind.Disabled, state };
  }
  if (!isVariablePatch(state.variables.process.bindings)) {
    return refused(state, CompensationParentContextRefusalReason.IncompleteContext);
  }
  const retentions = state.compensationParentContextRetentions as ReadonlyArray<CompensationParentContextRetention>;
  const matches = retentions.flatMap((retention, index) =>
    retention.handlerScopeId === target.handlerScopeId &&
      sameScopeOccurrence(retention.parent.id, parent.id)
      ? [{ retention, index }]
      : []
  );
  if (matches.length === 0) {
    return refused(state, CompensationParentContextRefusalReason.MissingRetention);
  }
  if (matches.length !== 1) {
    return refused(state, CompensationParentContextRefusalReason.DuplicateRetention);
  }
  const match = matches[0];
  if (
    match === undefined ||
    match.retention.kind !== CompensationParentContextRetentionKind.Provisional ||
    !sameRuntimeScopeOccurrence(match.retention.parent, parent)
  ) {
    return refused(state, CompensationParentContextRefusalReason.InvalidState);
  }
  const frames = captureFrames(program, state, parent);
  if (frames === undefined) {
    return refused(state, CompensationParentContextRefusalReason.BrokenAncestry);
  }
  const prospective = retentions.map((retention, index) =>
    index === match.index
      ? {
          kind: CompensationParentContextRetentionKind.Promoted,
          parent: cloneRuntimeScopeOccurrence(parent),
          handlerScopeId: target.handlerScopeId,
          snapshot: { frames },
        } as const
      : retention
  );
  const capacity = capacityRefusal(program, prospective);
  if (capacity !== undefined) return refusedWithDetail(state, capacity);
  return {
    kind: CompensationParentContextAttemptKind.Applied,
    state: { ...state, compensationParentContextRetentions: prospective },
  };
}

export function purgeCompensationParentContextForParent(
  state: RuntimeState,
  parent: RuntimeScopeOccurrence,
): RuntimeState {
  const retentions = state.compensationParentContextRetentions;
  if (retentions === undefined) return state;
  const retained = retentions.filter((retention) =>
    retention.kind !== CompensationParentContextRetentionKind.Provisional ||
    !sameScopeOccurrence(retention.parent.id, parent.id)
  );
  return retained.length === retentions.length
    ? state
    : { ...state, compensationParentContextRetentions: retained };
}

export function purgeCompensationParentContextForRoot(
  state: RuntimeState,
  root: RuntimeScopeOccurrence,
  disposition: CompensationParentContextRootDisposition,
): RuntimeState {
  const retentions = state.compensationParentContextRetentions;
  if (retentions === undefined) return state;
  const retained = retentions.filter((retention) => {
    const owned = sameScopeOccurrence(retention.parent.id, root.id) ||
      (retention.parent.parent !== null &&
        sameScopeOccurrence(retention.parent.parent, root.id));
    return !owned ||
      (disposition === CompensationParentContextRootDisposition.RetainPromoted &&
        retention.kind === CompensationParentContextRetentionKind.Promoted);
  });
  return retained.length === retentions.length
    ? state
    : { ...state, compensationParentContextRetentions: retained };
}

function prevalidate(
  program: SemanticProcessProgram,
  state: RuntimeState,
): NonCapacityRefusalReason | undefined {
  if (compensationEventSubProcessSnapshotProgramDefects(program).length > 0) {
    return CompensationParentContextRefusalReason.InvalidProgram;
  }
  return compensationEventSubProcessSnapshotStateDefects(program, state).length === 0
    ? undefined
    : CompensationParentContextRefusalReason.InvalidState;
}

function captureFrames(
  program: SemanticProcessProgram,
  state: RuntimeState,
  parent: RuntimeScopeOccurrence,
) {
  const current = state.scopeOccurrences.filter((occurrence) =>
    sameRuntimeScopeOccurrence(occurrence, parent)
  );
  if (current.length !== 1) return undefined;
  const rootScope = program.definitionScopes.find(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === program.processId
  );
  if (rootScope === undefined) return undefined;
  if (parent.parent === null) {
    if (parent.id.definitionScopeId !== rootScope.id) return undefined;
    return [{
      owner: { ...parent.id },
      bindings: state.variables.process.bindings.map(cloneVariableBinding),
    }];
  }
  const roots = state.scopeOccurrences.filter((occurrence) =>
    occurrence.parent === null &&
    parent.parent !== null &&
    sameScopeOccurrence(occurrence.id, parent.parent)
  );
  const root = roots[0];
  if (roots.length !== 1 || root === undefined || root.id.definitionScopeId !== rootScope.id) {
    return undefined;
  }
  return [
    {
      owner: { ...root.id },
      bindings: state.variables.process.bindings.map(cloneVariableBinding),
    },
    { owner: { ...parent.id }, bindings: [] },
  ];
}

type CapacityRefusal = {
  readonly reason:
    | CompensationParentContextRefusalReason.RecordCapacity
    | CompensationParentContextRefusalReason.CanonicalByteCapacity;
  readonly bound: number;
  readonly prospective: number;
};

function capacityRefusal(
  program: SemanticProcessProgram,
  prospective: ReadonlyArray<CompensationParentContextRetention>,
): CapacityRefusal | undefined {
  const limits = program.compensationEventSubProcessSnapshots?.limits;
  if (limits === undefined) return undefined;
  if (prospective.length > limits.maxRecords) {
    return {
      reason: CompensationParentContextRefusalReason.RecordCapacity,
      bound: limits.maxRecords,
      prospective: prospective.length,
    };
  }
  const bytes = canonicalCompensationParentContextRetentionsUtf8Bytes(prospective);
  return bytes > limits.maxCanonicalBytes
    ? {
        reason: CompensationParentContextRefusalReason.CanonicalByteCapacity,
        bound: limits.maxCanonicalBytes,
        prospective: bytes,
      }
    : undefined;
}

function refused(
  state: RuntimeState,
  reason: NonCapacityRefusalReason,
): CompensationParentContextAttempt {
  return { kind: CompensationParentContextAttemptKind.Refused, state, detail: { reason } };
}

function refusedWithDetail(
  state: RuntimeState,
  detail: CapacityRefusal,
): CompensationParentContextAttempt {
  return { kind: CompensationParentContextAttemptKind.Refused, state, detail };
}

function cloneRuntimeScopeOccurrence(
  occurrence: RuntimeScopeOccurrence,
): RuntimeScopeOccurrence {
  return {
    id: { ...occurrence.id },
    parent: occurrence.parent === null ? null : { ...occurrence.parent },
  };
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

function validProspectiveParent(
  program: SemanticProcessProgram,
  state: RuntimeState,
  parent: RuntimeScopeOccurrence,
): boolean {
  const ids = [parent.id, ...(parent.parent === null ? [] : [parent.parent])];
  if (!ids.every((id) =>
    isWellFormedWireString(id.processInstanceId) &&
    id.processInstanceId.length > 0 &&
    isWellFormedWireString(id.definitionScopeId) &&
    id.definitionScopeId.length > 0 &&
    Number.isSafeInteger(id.activation) &&
    id.activation > 0
  )) {
    return false;
  }
  const root = program.definitionScopes.find(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === program.processId
  );
  if (root === undefined) return false;
  if (parent.id.definitionScopeId === root.id) {
    return parent.parent === null &&
      parent.id.activation === 1 &&
      state.control.kind === ControlStateKind.NotStarted &&
      state.scopeOccurrences.length === 0;
  }
  if (
    parent.parent === null ||
    parent.parent.definitionScopeId !== root.id ||
    parent.parent.processInstanceId !== parent.id.processInstanceId ||
    parent.parent.activation !== 1 ||
    state.control.kind !== ControlStateKind.Running ||
    !("instanceId" in state.control) ||
    state.control.instanceId !== parent.id.processInstanceId
  ) {
    return false;
  }
  const exactRootLive = state.scopeOccurrences.filter((occurrence) =>
    occurrence.parent === null &&
    sameScopeOccurrence(occurrence.id, parent.parent as typeof occurrence.id)
  ).length === 1;
  const childAlreadyLive = state.scopeOccurrences.some(({ id }) =>
    sameScopeOccurrence(id, parent.id)
  );
  return exactRootLive && !childAlreadyLive;
}
