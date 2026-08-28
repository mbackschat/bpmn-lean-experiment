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
import { selectReturnCalledProcess } from "./semantic-process-call-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/** Derives the Call-return state footprint from the exact pre-state without applying the successor. */
export function deriveInternalReturnProcessStateFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): InternalTransitionStateFootprint | null {
  const operation = candidate.operation;
  const owner = candidate.owner;
  if (
    operation.kind !== SemanticOperationKind.ReturnProcess ||
    owner === null ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null
  ) {
    return null;
  }
  const selected = selectReturnCalledProcess(operation, state);
  if (
    selected === null ||
    !sameScopeOccurrence(selected.record.calledRoot, owner)
  ) {
    return null;
  }
  const region = deriveInternalOccurrenceRegion(state, selected.record.calledRoot);
  if (region === null) {
    return null;
  }

  const regionAtom = {
    kind: InternalTransitionStateAtomKind.OccurrenceRegion,
    region,
  } as const;
  const association = {
    kind: InternalTransitionStateAtomKind.CallAssociation,
    record: selected.record,
  } as const;
  const callerOutput = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: selected.record.caller,
    placeId: operation.callerOutput,
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
      parent: null,
    },
    {
      kind: InternalTransitionStateAtomKind.ScopeOccurrence,
      owner: selected.record.caller,
    },
    { kind: InternalTransitionStateAtomKind.LogicalTime },
    regionAtom,
    association,
    callerOutput,
  ]);
  const writes = canonicalUniqueStateAtoms([
    regionAtom,
    association,
    callerOutput,
  ]);
  return reads === null || writes === null ? null : { reads, writes };
}
