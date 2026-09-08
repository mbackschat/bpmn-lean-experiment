import type { PublicControlPositionDelta } from "./control-position-projection.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  addToken,
  compareSelectedBranchSets,
  removeToken,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SelectedBranchSet,
} from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

export enum InternalSelectedBranchPatchKind {
  Preserve = "preserve",
  Insert = "insert",
  Remove = "remove",
}

export type InternalSelectedBranchPatch = Readonly<
  | { kind: InternalSelectedBranchPatchKind.Preserve }
  | {
      kind: InternalSelectedBranchPatchKind.Insert | InternalSelectedBranchPatchKind.Remove;
      record: SelectedBranchSet;
    }
>;

export type InternalLocalControlPatch = Readonly<{
  owner: ScopeOccurrenceId;
  consumed: ReadonlyArray<string>;
  produced: ReadonlyArray<string>;
  selectedBranch: InternalSelectedBranchPatch;
}>;

/** Applies retained token units and one keyed branch-set edit, preserving every unrelated field. */
export function applyInternalLocalControlPatch(
  state: RuntimeState,
  patch: InternalLocalControlPatch,
): RuntimeState {
  const remaining = patch.consumed.reduce(
    (tokens, placeId) => removeToken(tokens, placeId, patch.owner),
    state.controlTokens,
  );
  const controlTokens = patch.produced.reduce(
    (tokens, placeId) => addToken(tokens, placeId, patch.owner),
    remaining,
  );
  const branch = patch.selectedBranch;
  switch (branch.kind) {
    case InternalSelectedBranchPatchKind.Preserve:
      return { ...state, controlTokens };
    case InternalSelectedBranchPatchKind.Insert:
      return {
        ...state,
        controlTokens,
        selectedBranchSets: [...state.selectedBranchSets, branch.record].sort(compareSelectedBranchSets),
      };
    case InternalSelectedBranchPatchKind.Remove:
      return {
        ...state,
        controlTokens,
        selectedBranchSets: state.selectedBranchSets.filter((record) =>
          record.selectionKey !== branch.record.selectionKey ||
          !sameScopeOccurrence(record.owner, branch.record.owner)
        ),
      };
  }
}

/** Resolves signed token units against immutable control-place provenance without executing a successor. */
export function deriveInternalLocalControlPositionDelta(
  program: SemanticProcessProgram,
  patch: InternalLocalControlPatch,
): PublicControlPositionDelta | null {
  const counts = new Map<string, number>();
  for (const [places, sign] of [[patch.consumed, -1], [patch.produced, 1]] as const) {
    for (const placeId of places) {
      const matches = program.controlPlaces.filter(({ id }) => id === placeId);
      const place = matches[0];
      const ownership = program.controlPlaceScopes.filter(({ controlPlaceId }) => controlPlaceId === placeId);
      if (
        matches.length !== 1 || place === undefined || place.origin.elementId.length === 0 ||
        program.controlPlaces.filter(({ origin }) => origin.elementId === place.origin.elementId).length !== 1 ||
        ownership.length !== 1 || ownership[0]?.scopeId !== patch.owner.definitionScopeId
      ) return null;
      counts.set(place.origin.elementId, (counts.get(place.origin.elementId) ?? 0) + sign);
    }
  }
  const entries = [...counts].sort(([left], [right]) => compareCanonicalStrings(left, right));
  const positions = (sign: number) => entries.flatMap(([sequenceFlowId, count]) =>
    count * sign > 0 ? [{ sequenceFlowId, owner: patch.owner, multiplicity: count * sign }] : []
  );
  return {
    consumedTokens: positions(-1), producedTokens: positions(1),
    enteredScopes: [], exitedScopes: [],
  };
}
