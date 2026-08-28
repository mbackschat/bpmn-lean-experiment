import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import type { InternalMergeInputAlternative } from "./internal-transition-alternative.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type { InternalTransitionStateFootprint } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import type {
  MergeExclusiveOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  exclusiveMergeInputIsApplicable,
  exclusiveMergeInputSelections,
} from "./semantic-process-cyclic-control-flow-runtime.js";
import { ControlStateKind } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

export type PreparedInternalExclusiveMergeInput = Readonly<{
  alternative: InternalMergeInputAlternative;
  footprint: InternalTransitionStateFootprint;
}>;

/**
 * Derives every exact offered merge-input preparation from the pre-state.
 * Empty means disabled; null means the Program or RuntimeState cannot justify an exact preparation.
 */
export function deriveInternalExclusiveMergePreparations(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: MergeExclusiveOperation,
): ReadonlyArray<PreparedInternalExclusiveMergeInput> | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return [];
  }
  const selections = exclusiveMergeInputSelections(operation, state);
  if (selections === null) {
    return null;
  }
  const prepared: PreparedInternalExclusiveMergeInput[] = [];
  for (const { alternative } of selections) {
    const owner = alternative.owner;
    if (
      !operationIsSelectedFromProgram(program, operation, owner) ||
      candidateProcessId(program, state, owner) === null ||
      !exclusiveMergeInputIsApplicable(operation, state, alternative)
    ) {
      return null;
    }
    const input = {
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner,
      placeId: alternative.inputControlPlace,
    } as const;
    const output = {
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner,
      placeId: operation.output,
    } as const;
    const reads = canonicalUniqueStateAtoms([
      {
        kind: InternalTransitionStateAtomKind.RuntimeControl,
        instanceId: state.control.instanceId,
      },
      { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
      input,
      output,
      { kind: InternalTransitionStateAtomKind.LogicalTime },
    ]);
    const writes = canonicalUniqueStateAtoms([input, output]);
    if (reads === null || writes === null) {
      return null;
    }
    prepared.push({ alternative, footprint: { reads, writes } });
  }
  return prepared;
}
