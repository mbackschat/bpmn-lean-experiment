import type { InternalTransitionStateAtom } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { canonicalStateAtomSet } from "./internal-transition-footprint-ordering.js";
import { internalOccurrenceRegionContains } from "./internal-transition-region.js";
import type { InternalOccurrenceRegion } from "./internal-transition-region.js";
import { sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, SelectedBranchSet } from "./semantic-process-state.js";

export function selectedBranchOwnerCensusAtom(selectionKey: string): InternalTransitionStateAtom {
  return { kind: InternalTransitionStateAtomKind.SelectedBranchOwners, selectionKey };
}

/** selectSynchronizeSelected reads every same-key record; repeated runtime records share dependency atoms. */
export function selectedJoinReadinessAtoms(
  state: RuntimeState,
  selected: SelectedBranchSet,
  output: string,
): ReadonlyArray<InternalTransitionStateAtom> {
  return canonicalStateAtomSet([
    selectedBranchOwnerCensusAtom(selected.selectionKey),
    ...state.selectedBranchSets.filter(({ selectionKey }) => selectionKey === selected.selectionKey)
      .flatMap((record): InternalTransitionStateAtom[] => [
        { kind: InternalTransitionStateAtomKind.SelectedBranch, owner: record.owner, selectionKey: record.selectionKey },
        ...[...new Set(record.expectedInputs)].filter((placeId) =>
          // The selected owner's consumed/output buckets already belong to the token transformation frame.
          !sameScopeOccurrence(record.owner, selected.owner) ||
          (!selected.expectedInputs.includes(placeId) && placeId !== output)
        ).map((placeId) => ({
          kind: InternalTransitionStateAtomKind.ControlToken,
          owner: record.owner,
          placeId,
        }) as const),
      ]),
  ]);
}

/** removeScopeOccurrenceContents purges selected records even at its retained root. */
export function regionalSelectedBranchOwnerCensusWrites(
  state: RuntimeState,
  region: InternalOccurrenceRegion,
): ReadonlyArray<InternalTransitionStateAtom> {
  return [...new Set(state.selectedBranchSets.filter(({ owner }) =>
    internalOccurrenceRegionContains(region, owner)
  ).map(({ selectionKey }) => selectionKey))].map(selectedBranchOwnerCensusAtom);
}
