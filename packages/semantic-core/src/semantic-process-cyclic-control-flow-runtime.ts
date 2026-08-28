/** Exclusive Merge token movement for the resumption-bounded cyclic-control-flow capsule. */
import type {
  MergeExclusiveOperation,
} from "./semantic-process-contract.js";
import {
  canonicalUniqueInternalAlternatives,
  InternalAlternativeKind,
  internalMergeInputAlternative,
} from "./internal-transition-alternative.js";
import type {
  InternalMergeInputAlternative,
} from "./internal-transition-alternative.js";
import {
  addToken,
  removeToken,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/**
 * Executes the selected profile's unique-offer subset and preserves the token's scope owner.
 *
 * Total multiplicity is the discriminator. Returning no successor for multiple offers records
 * evaluator incompleteness outside this profile, not a declarative refusal of BPMN Multi-Merge.
 */
export function mergeExclusive(
  operation: MergeExclusiveOperation,
  state: RuntimeState,
): RuntimeState | null {
  const selected = selectUniqueExclusiveMergeInput(operation, state);
  if (selected === null || selected.multiplicity !== 1) {
    return null;
  }
  return applyExclusiveMergeInput(operation, state, selected.alternative);
}

export type SelectedExclusiveMergeInput = Readonly<{
  alternative: InternalMergeInputAlternative;
  multiplicity: number;
}>;

/** Enumerates exact positive input buckets independently of RuntimeState storage order. */
export function exclusiveMergeInputSelections(
  operation: MergeExclusiveOperation,
  state: RuntimeState,
): ReadonlyArray<SelectedExclusiveMergeInput> | null {
  if (new Set(operation.inputs).size !== operation.inputs.length) {
    return null;
  }
  const offered = state.controlTokens.filter((token) =>
    operation.inputs.includes(token.placeId)
  );
  if (
    offered.some(({ multiplicity }) =>
      !Number.isSafeInteger(multiplicity) || multiplicity <= 0
    )
  ) {
    return null;
  }
  const alternatives = canonicalUniqueInternalAlternatives(
    offered.map(({ placeId, owner }) =>
      internalMergeInputAlternative(operation.id, owner, placeId)
    ),
  );
  if (
    alternatives === null ||
    alternatives.some(({ kind }) => kind !== InternalAlternativeKind.MergeInput)
  ) {
    return null;
  }
  const selections: SelectedExclusiveMergeInput[] = [];
  for (const alternative of alternatives) {
    if (alternative.kind !== InternalAlternativeKind.MergeInput) {
      return null;
    }
    const matches = offered.filter(({ placeId, owner }) =>
      placeId === alternative.inputControlPlace &&
      sameScopeOccurrence(owner, alternative.owner)
    );
    if (matches.length !== 1 || matches[0] === undefined) {
      return null;
    }
    selections.push({
      alternative,
      multiplicity: matches[0].multiplicity,
    });
  }
  return selections;
}

/** Retains the current unscheduled evaluator's exact one-bucket discriminator. */
export function selectUniqueExclusiveMergeInput(
  operation: MergeExclusiveOperation,
  state: RuntimeState,
): SelectedExclusiveMergeInput | null {
  const selections = exclusiveMergeInputSelections(operation, state);
  return selections?.length === 1 ? selections[0] ?? null : null;
}

/** Applies one exact selected merge-input alternative and no list-order policy. */
export function applyExclusiveMergeInput(
  operation: MergeExclusiveOperation,
  state: RuntimeState,
  alternative: InternalMergeInputAlternative,
): RuntimeState | null {
  if (!exclusiveMergeInputIsApplicable(operation, state, alternative)) {
    return null;
  }
  return {
    ...state,
    controlTokens: addToken(
      removeToken(
        state.controlTokens,
        alternative.inputControlPlace,
        alternative.owner,
      ),
      operation.output,
      alternative.owner,
    ),
  };
}

/** Checks the complete selected bucket and output bucket from the exact pre-state. */
export function exclusiveMergeInputIsApplicable(
  operation: MergeExclusiveOperation,
  state: RuntimeState,
  alternative: InternalMergeInputAlternative,
): boolean {
  if (
    alternative.operationId !== operation.id ||
    !operation.inputs.includes(alternative.inputControlPlace)
  ) {
    return false;
  }
  const inputs = state.controlTokens.filter(({ placeId, owner }) =>
    placeId === alternative.inputControlPlace &&
    sameScopeOccurrence(owner, alternative.owner)
  );
  const outputs = state.controlTokens.filter(({ placeId, owner }) =>
    placeId === operation.output && sameScopeOccurrence(owner, alternative.owner)
  );
  if (
    inputs.length !== 1 ||
    inputs[0] === undefined ||
    !Number.isSafeInteger(inputs[0].multiplicity) ||
    inputs[0].multiplicity <= 0 ||
    outputs.length > 1 ||
    outputs.some(({ multiplicity }) =>
      !Number.isSafeInteger(multiplicity) || multiplicity <= 0
    )
  ) {
    return false;
  }
  return true;
}
