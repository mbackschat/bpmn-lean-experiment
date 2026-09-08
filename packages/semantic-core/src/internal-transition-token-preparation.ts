import {
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import type { InternalTransitionStateAtom } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { internalOccurrenceRegionContains } from "./internal-transition-region.js";
import type { InternalOccurrenceRegion } from "./internal-transition-region.js";

/** Shared places across owners need one census atom because canonicalUniqueStateAtoms rejects duplicates. */
export function tokenOwnerCensusAtoms(
  placeIds: ReadonlyArray<string>,
): ReadonlyArray<InternalTransitionStateAtom> {
  return [...new Set(placeIds)].map((placeId) => ({
    kind: InternalTransitionStateAtomKind.TokenOwners,
    placeId,
  }));
}

/** removeScopeOccurrenceContents retains the selected root but removes its tokens, so its places still change census. */
export function regionalTokenOwnerCensusWrites(
  state: RuntimeState,
  region: InternalOccurrenceRegion,
  outputs: ReadonlyArray<string>,
): ReadonlyArray<InternalTransitionStateAtom> {
  return tokenOwnerCensusAtoms([
    ...state.controlTokens.filter(({ owner }) =>
      internalOccurrenceRegionContains(region, owner)
    ).map(({ placeId }) => placeId),
    ...outputs,
  ]);
}

/** Requires one exact input row and at most one existing output row for every affected bucket. */
export function affectedTokenBucketsAreExact(
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  inputs: ReadonlyArray<string>,
  outputs: ReadonlyArray<string>,
): boolean {
  return inputs.every((placeId) =>
    tokenBucketCountIsExact(state, owner, placeId, true)
  ) && outputs.every((placeId) =>
    tokenBucketCountIsExact(state, owner, placeId, false)
  );
}

/** Requires a newly owned bucket to be absent rather than merge with malformed latent state. */
export function tokenBucketIsAbsent(
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  placeId: string,
): boolean {
  return matchingTokenRows(state, owner, placeId).length === 0;
}

function tokenBucketCountIsExact(
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  placeId: string,
  required: boolean,
): boolean {
  const matches = matchingTokenRows(state, owner, placeId);
  return (required ? matches.length === 1 : matches.length <= 1) &&
    matches.every(({ multiplicity }) =>
      Number.isSafeInteger(multiplicity) && multiplicity > 0
    );
}

function matchingTokenRows(
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  placeId: string,
) {
  return state.controlTokens.filter((token) =>
    token.placeId === placeId && sameScopeOccurrence(token.owner, owner)
  );
}
