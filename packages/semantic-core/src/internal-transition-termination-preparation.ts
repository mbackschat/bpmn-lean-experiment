import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type {
  InternalTransitionCandidate,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { deriveInternalOccurrenceRegion } from "./internal-transition-region.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { selectScopeTermination } from "./semantic-process-termination-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/** Derives the terminateScope state footprint from the exact pre-state without applying termination. */
export function deriveInternalTerminateScopeStateFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): InternalTransitionStateFootprint | null {
  const operation = candidate.operation;
  const owner = candidate.owner;
  if (
    operation.kind !== SemanticOperationKind.TerminateScope ||
    owner === null ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null
  ) {
    return null;
  }
  const selected = selectScopeTermination(operation, state, owner);
  const region = deriveInternalOccurrenceRegion(state, owner);
  if (
    selected === null ||
    region === null ||
    !sameScopeOccurrence(selected.occurrence.id, owner)
  ) {
    return null;
  }

  const regionAtom = {
    kind: InternalTransitionStateAtomKind.OccurrenceRegion,
    region,
  } as const;
  const input = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId: operation.input,
  } as const;
  const endIncrement = {
    kind: InternalTransitionStateAtomKind.EndIncrement,
  } as const;
  const reads = canonicalUniqueStateAtoms([
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    {
      kind: InternalTransitionStateAtomKind.ScopeParent,
      occurrence: owner,
      parent: selected.occurrence.parent,
    },
    input,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
    regionAtom,
    endIncrement,
  ]);
  const writes = canonicalUniqueStateAtoms([
    input,
    regionAtom,
    endIncrement,
  ]);
  return reads === null || writes === null ? null : { reads, writes };
}
