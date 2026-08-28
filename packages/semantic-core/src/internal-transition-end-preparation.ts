import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type {
  InternalTransitionCandidate,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { selectNoneEnd } from "./semantic-process-control-flow-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/** Derives the ordinary None End state footprint from the exact pre-state. */
export function deriveInternalReachNoneEndStateFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): InternalTransitionStateFootprint | null {
  const operation = candidate.operation;
  const owner = candidate.owner;
  if (
    operation.kind !== SemanticOperationKind.ReachNoneEnd ||
    owner === null ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null
  ) {
    return null;
  }
  const selected = selectNoneEnd(operation, state, owner);
  if (
    selected === null ||
    !sameScopeOccurrence(selected.occurrence.id, owner)
  ) {
    return null;
  }

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
    input,
    endIncrement,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
  ]);
  const writes = canonicalUniqueStateAtoms([input, endIncrement]);
  return reads === null || writes === null ? null : { reads, writes };
}
