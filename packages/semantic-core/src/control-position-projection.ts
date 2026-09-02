import type { DeepReadonly } from "./deep-readonly.js";
import type {
  ControlPlace,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { calledProcessAssociationsAreValid } from "./semantic-process-call-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

export type PublicControlTokenPosition = DeepReadonly<{
  sequenceFlowId: string;
  owner: ScopeOccurrenceId;
  multiplicity: number;
}>;

export type PublicScopePosition = DeepReadonly<{
  id: ScopeOccurrenceId;
  parent: ScopeOccurrenceId | null;
  bpmnElementId: string;
}>;

export type CurrentControlPositions = DeepReadonly<{
  controlTokens: PublicControlTokenPosition[];
  scopes: PublicScopePosition[];
}>;

export type PublicControlPositionDelta = DeepReadonly<{
  consumedTokens: PublicControlTokenPosition[];
  producedTokens: PublicControlTokenPosition[];
  enteredScopes: PublicScopePosition[];
  exitedScopes: PublicScopePosition[];
}>;

/**
 * Removes private control-place identities while retaining exact BPMN origins,
 * multiplicity, and runtime scope ownership. Malformed or ambiguous input has
 * no public interpretation and returns `null`.
 */
export function projectCurrentControlPositions(
  program: SemanticProcessProgram,
  state: RuntimeState,
): CurrentControlPositions | null {
  const basis = projectionBasis(program);
  if (basis === null || !runtimeScopeForestIsValid(program, state, basis)) {
    return null;
  }

  const scopes = projectScopes(state.scopeOccurrences, basis);
  const controlTokens = projectTokens(state, basis);
  return scopes === null || controlTokens === null
    ? null
    : { controlTokens, scopes };
}

/** Projects one evaluator boundary's exact public token and scope difference. */
export function projectControlPositionDelta(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
): PublicControlPositionDelta | null {
  const beforePositions = projectCurrentControlPositions(program, before);
  const afterPositions = projectCurrentControlPositions(program, after);
  if (beforePositions === null || afterPositions === null) {
    return null;
  }

  const consumedTokens = tokenDifferences(
    beforePositions.controlTokens,
    afterPositions.controlTokens,
  );
  const producedTokens = tokenDifferences(
    afterPositions.controlTokens,
    beforePositions.controlTokens,
  );
  const exitedScopes = beforePositions.scopes.filter((position) =>
    !afterPositions.scopes.some((candidate) => samePublicScope(candidate, position))
  );
  const enteredScopes = afterPositions.scopes.filter((position) =>
    !beforePositions.scopes.some((candidate) => samePublicScope(candidate, position))
  );
  return {
    consumedTokens,
    producedTokens,
    enteredScopes,
    exitedScopes,
  };
}

type ProjectionBasis = Readonly<{
  controlPlaces: ReadonlyMap<string, ControlPlace>;
  controlPlaceScopes: ReadonlyMap<string, string>;
  definitionOrigins: ReadonlyMap<string, string>;
  definitionParents: ReadonlyMap<string, string | null>;
}>;

function projectionBasis(
  program: SemanticProcessProgram,
): ProjectionBasis | null {
  const controlPlaces = uniqueMap(program.controlPlaces, ({ id }) => id);
  const controlOrigins = uniqueMap(
    program.controlPlaces,
    ({ origin }) => origin.elementId,
  );
  const definitions = uniqueMap(program.definitionScopes, ({ id }) => id);
  const definitionOrigins = uniqueMap(
    program.definitionScopes,
    ({ originElementId }) => originElementId,
  );
  if (
    program.processId.length === 0 ||
    controlPlaces === null ||
    controlOrigins === null ||
    definitions === null ||
    definitionOrigins === null ||
    program.definitionScopes.filter(
      ({ parentScopeId, originElementId }) =>
        parentScopeId === null && originElementId === program.processId,
    ).length !== 1 ||
    !definitionForestIsValid(program)
  ) {
    return null;
  }

  const controlPlaceScopes = new Map<string, string>();
  for (const ownership of program.controlPlaceScopes) {
    if (
      controlPlaceScopes.has(ownership.controlPlaceId) ||
      !controlPlaces.has(ownership.controlPlaceId) ||
      !definitions.has(ownership.scopeId)
    ) {
      return null;
    }
    controlPlaceScopes.set(ownership.controlPlaceId, ownership.scopeId);
  }
  if (controlPlaceScopes.size !== controlPlaces.size) {
    return null;
  }

  return {
    controlPlaces,
    controlPlaceScopes,
    definitionOrigins: new Map(
      program.definitionScopes.map(({ id, originElementId }) =>
        [id, originElementId] as const
      ),
    ),
    definitionParents: new Map(
      program.definitionScopes.map(({ id, parentScopeId }) =>
        [id, parentScopeId] as const
      ),
    ),
  };
}

function definitionForestIsValid(program: SemanticProcessProgram): boolean {
  const parents = new Map(
    program.definitionScopes.map(({ id, parentScopeId }) =>
      [id, parentScopeId] as const
    ),
  );
  return program.definitionScopes.every(({ id, parentScopeId }) => {
    if (parentScopeId !== null && !parents.has(parentScopeId)) {
      return false;
    }
    const visited = new Set<string>();
    let cursor: string | null | undefined = id;
    while (cursor !== null && cursor !== undefined) {
      if (visited.has(cursor)) {
        return false;
      }
      visited.add(cursor);
      cursor = parents.get(cursor);
    }
    return cursor === null;
  });
}

function runtimeScopeForestIsValid(
  program: SemanticProcessProgram,
  state: RuntimeState,
  basis: ProjectionBasis,
): boolean {
  if (state.control.kind === ControlStateKind.NotStarted) {
    return state.scopeOccurrences.length === 0 && state.controlTokens.length === 0;
  }
  if (
    (state.control.kind === ControlStateKind.Completed ||
      state.control.kind === ControlStateKind.Cancelled ||
      state.control.kind === ControlStateKind.Failed) &&
    (state.scopeOccurrences.length !== 0 || state.controlTokens.length !== 0)
  ) {
    return false;
  }
  if (hasDuplicateScopeOccurrence(state.scopeOccurrences)) {
    return false;
  }
  const processInstanceId = state.control.instanceId;

  const hostingRoots = state.scopeOccurrences.filter(({ id, parent }) =>
    parent === null &&
    id.processInstanceId === processInstanceId &&
    basis.definitionOrigins.get(id.definitionScopeId) === program.processId
  );
  if (
    state.control.kind === ControlStateKind.Running &&
    (!calledProcessAssociationsAreValid(state) || hostingRoots.length !== 1)
  ) {
    return false;
  }

  return state.scopeOccurrences.every((occurrence) =>
    scopeOccurrenceIsValid(program, state, processInstanceId, occurrence, basis)
  );
}

function scopeOccurrenceIsValid(
  program: SemanticProcessProgram,
  state: RuntimeState,
  processInstanceId: string,
  occurrence: RuntimeScopeOccurrence,
  basis: ProjectionBasis,
): boolean {
  const definitionParent = basis.definitionParents.get(
    occurrence.id.definitionScopeId,
  );
  if (
    definitionParent === undefined ||
    occurrence.id.processInstanceId.length === 0 ||
    !Number.isSafeInteger(occurrence.id.activation) ||
    occurrence.id.activation <= 0
  ) {
    return false;
  }

  if (occurrence.parent !== null) {
    const parents = state.scopeOccurrences.filter(({ id }) =>
      sameScopeOccurrence(id, occurrence.parent!)
    );
    return parents.length === 1 &&
      definitionParent === occurrence.parent.definitionScopeId &&
      occurrence.id.processInstanceId === occurrence.parent.processInstanceId;
  }
  if (definitionParent !== null) {
    return false;
  }

  const isHostingRoot =
    occurrence.id.processInstanceId === processInstanceId &&
    basis.definitionOrigins.get(occurrence.id.definitionScopeId) ===
      program.processId;
  const isCalledRoot = state.calledProcessOccurrences.some((record) =>
    sameScopeOccurrence(record.calledRoot, occurrence.id) &&
    record.calledProcessId === basis.definitionOrigins.get(
      occurrence.id.definitionScopeId,
    )
  );
  return isHostingRoot !== isCalledRoot;
}

function projectScopes(
  occurrences: ReadonlyArray<RuntimeScopeOccurrence>,
  basis: ProjectionBasis,
): ReadonlyArray<PublicScopePosition> | null {
  const projected: PublicScopePosition[] = [];
  for (const occurrence of occurrences) {
    const bpmnElementId = basis.definitionOrigins.get(
      occurrence.id.definitionScopeId,
    );
    if (bpmnElementId === undefined) {
      return null;
    }
    projected.push({
      id: occurrence.id,
      parent: occurrence.parent,
      bpmnElementId,
    });
  }
  return projected.sort(comparePublicScopes);
}

function projectTokens(
  state: RuntimeState,
  basis: ProjectionBasis,
): ReadonlyArray<PublicControlTokenPosition> | null {
  const seen = new Set<string>();
  const projected: PublicControlTokenPosition[] = [];
  for (const token of state.controlTokens) {
    const place = basis.controlPlaces.get(token.placeId);
    const ownerOccurrences = state.scopeOccurrences.filter(({ id }) =>
      sameScopeOccurrence(id, token.owner)
    );
    if (
      place === undefined ||
      ownerOccurrences.length !== 1 ||
      basis.controlPlaceScopes.get(token.placeId) !==
        token.owner.definitionScopeId ||
      !Number.isSafeInteger(token.multiplicity) ||
      token.multiplicity <= 0
    ) {
      return null;
    }
    const key = tokenIdentityKey(place.origin.elementId, token.owner);
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    projected.push({
      sequenceFlowId: place.origin.elementId,
      owner: token.owner,
      multiplicity: token.multiplicity,
    });
  }
  return projected.sort(comparePublicTokens);
}

function tokenDifferences(
  minuend: ReadonlyArray<PublicControlTokenPosition>,
  subtrahend: ReadonlyArray<PublicControlTokenPosition>,
): ReadonlyArray<PublicControlTokenPosition> {
  return minuend.flatMap((position) => {
    const other = subtrahend.find((candidate) =>
      samePublicTokenIdentity(candidate, position)
    );
    const difference = position.multiplicity - (other?.multiplicity ?? 0);
    return difference > 0 ? [{ ...position, multiplicity: difference }] : [];
  }).sort(comparePublicTokens);
}

function comparePublicTokens(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): number {
  const flowOrder = compareCanonicalStrings(
    left.sequenceFlowId,
    right.sequenceFlowId,
  );
  return flowOrder !== 0
    ? flowOrder
    : compareScopeIds(left.owner, right.owner);
}

function comparePublicScopes(
  left: PublicScopePosition,
  right: PublicScopePosition,
): number {
  const idOrder = compareScopeIds(left.id, right.id);
  if (idOrder !== 0) {
    return idOrder;
  }
  const parentOrder = compareNullableScopeIds(left.parent, right.parent);
  return parentOrder !== 0
    ? parentOrder
    : compareCanonicalStrings(left.bpmnElementId, right.bpmnElementId);
}

function compareScopeIds(
  left: ScopeOccurrenceId,
  right: ScopeOccurrenceId,
): number {
  const instanceOrder = compareCanonicalStrings(
    left.processInstanceId,
    right.processInstanceId,
  );
  if (instanceOrder !== 0) {
    return instanceOrder;
  }
  const scopeOrder = compareCanonicalStrings(
    left.definitionScopeId,
    right.definitionScopeId,
  );
  return scopeOrder !== 0 ? scopeOrder : left.activation - right.activation;
}

function compareNullableScopeIds(
  left: ScopeOccurrenceId | null,
  right: ScopeOccurrenceId | null,
): number {
  if (left === null || right === null) {
    return left === right ? 0 : left === null ? -1 : 1;
  }
  return compareScopeIds(left, right);
}

function samePublicTokenIdentity(
  left: PublicControlTokenPosition,
  right: PublicControlTokenPosition,
): boolean {
  return left.sequenceFlowId === right.sequenceFlowId &&
    sameScopeOccurrence(left.owner, right.owner);
}

function samePublicScope(
  left: PublicScopePosition,
  right: PublicScopePosition,
): boolean {
  return sameScopeOccurrence(left.id, right.id) &&
    left.bpmnElementId === right.bpmnElementId &&
    (
      left.parent === null || right.parent === null
        ? left.parent === right.parent
        : sameScopeOccurrence(left.parent, right.parent)
    );
}

function hasDuplicateScopeOccurrence(
  occurrences: ReadonlyArray<RuntimeScopeOccurrence>,
): boolean {
  return occurrences.some((occurrence, index) =>
    occurrences.findIndex((candidate) =>
      sameScopeOccurrence(candidate.id, occurrence.id)
    ) !== index
  );
}

function tokenIdentityKey(
  sequenceFlowId: string,
  owner: ScopeOccurrenceId,
): string {
  return JSON.stringify([
    sequenceFlowId,
    owner.processInstanceId,
    owner.definitionScopeId,
    owner.activation,
  ]);
}

function uniqueMap<T>(
  values: ReadonlyArray<T>,
  key: (value: T) => string,
): ReadonlyMap<string, T> | null {
  const entries = new Map<string, T>();
  for (const value of values) {
    const candidate = key(value);
    if (candidate.length === 0 || entries.has(candidate)) {
      return null;
    }
    entries.set(candidate, value);
  }
  return entries;
}
