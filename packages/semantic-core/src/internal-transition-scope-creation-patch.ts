import type { PublicControlPositionDelta } from "./control-position-projection.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  addToken,
  compareCalledProcessOccurrences,
  compareScopeOccurrenceIds,
  removeToken,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  CalledProcessOccurrence,
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export enum InternalScopeCreationPatchKind {
  ChildScope = "childScope",
  CalledProcess = "calledProcess",
}

export type InternalScopeCreationPatch = Readonly<{
  owner: ScopeOccurrenceId;
  input: string;
  entry: string;
  scope: RuntimeScopeOccurrence;
  counter: Readonly<{ elementId: string; count: number }>;
} & (
  | { kind: InternalScopeCreationPatchKind.ChildScope }
  | { kind: InternalScopeCreationPatchKind.CalledProcess; record: CalledProcessOccurrence }
)>;

/** Applies retained issuance facts without selecting another owner or recomputing a counter. */
export function applyInternalScopeCreationPatch(
  state: RuntimeState,
  patch: InternalScopeCreationPatch,
): RuntimeState {
  const controlTokens = addToken(
    removeToken(state.controlTokens, patch.input, patch.owner), patch.entry, patch.scope.id,
  );
  const scopeOccurrences = [...state.scopeOccurrences, patch.scope].sort(
    ({ id: left }, { id: right }) => compareScopeOccurrenceIds(left, right),
  );
  switch (patch.kind) {
    case InternalScopeCreationPatchKind.ChildScope:
      return { ...state, controlTokens, scopeOccurrences,
        scopeActivations: setActivationCount(state.scopeActivations, patch.counter.elementId, patch.counter.count) };
    case InternalScopeCreationPatchKind.CalledProcess:
      return { ...state, controlTokens, scopeOccurrences,
        calledProcessOccurrences: [...state.calledProcessOccurrences, patch.record].sort(compareCalledProcessOccurrences),
        callActivations: setActivationCount(state.callActivations, patch.counter.elementId, patch.counter.count) };
  }
}

/** Resolves the two differently owned token units and entered scope against immutable provenance. */
export function deriveInternalScopeCreationPositionDelta(
  program: SemanticProcessProgram,
  patch: InternalScopeCreationPatch,
): PublicControlPositionDelta | null {
  const consumed = position(program, patch.input, patch.owner);
  const produced = position(program, patch.entry, patch.scope.id);
  const definitions = program.definitionScopes.filter(({ id }) => id === patch.scope.id.definitionScopeId);
  const definition = definitions[0];
  if (consumed === null || produced === null || definitions.length !== 1 || definition === undefined ||
      definition.originElementId.length === 0 || program.definitionScopes.filter(
        ({ originElementId }) => originElementId === definition.originElementId,
      ).length !== 1) return null;
  return {
    consumedTokens: [consumed], producedTokens: [produced],
    enteredScopes: [{ ...patch.scope, bpmnElementId: definition.originElementId }], exitedScopes: [],
  };
}

function position(program: SemanticProcessProgram, placeId: string, owner: ScopeOccurrenceId) {
  const places = program.controlPlaces.filter(({ id }) => id === placeId);
  const place = places[0];
  const ownership = program.controlPlaceScopes.filter(({ controlPlaceId }) => controlPlaceId === placeId);
  if (places.length !== 1 || place === undefined || place.origin.elementId.length === 0 ||
      program.controlPlaces.filter(({ origin }) => origin.elementId === place.origin.elementId).length !== 1 ||
      ownership.length !== 1 || ownership[0]?.scopeId !== owner.definitionScopeId) return null;
  return { sequenceFlowId: place.origin.elementId, owner, multiplicity: 1 };
}
