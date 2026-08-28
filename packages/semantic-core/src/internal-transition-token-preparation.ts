import {
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

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
