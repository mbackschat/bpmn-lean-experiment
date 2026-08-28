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
import { selectErrorPropagation } from "./semantic-process-error-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/** Derives the Throw Error state footprint from the exact pre-state without applying interruption. */
export function deriveInternalThrowErrorStateFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): InternalTransitionStateFootprint | null {
  const operation = candidate.operation;
  const owner = candidate.owner;
  if (
    operation.kind !== SemanticOperationKind.ThrowError ||
    owner === null ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null
  ) {
    return null;
  }
  const selected = selectErrorPropagation(operation, state, owner);
  if (
    selected === null ||
    !sameScopeOccurrence(selected.attached.id, owner)
  ) {
    return null;
  }
  const region = deriveInternalOccurrenceRegion(state, owner);
  if (region === null) {
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
  const parentOutput = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: selected.parent,
    placeId: operation.handler.output,
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
      parent: selected.parent,
    },
    {
      kind: InternalTransitionStateAtomKind.ScopeOccurrence,
      owner: selected.parent,
    },
    input,
    parentOutput,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
    regionAtom,
  ]);
  const writes = canonicalUniqueStateAtoms([
    input,
    parentOutput,
    regionAtom,
  ]);
  return reads === null || writes === null ? null : { reads, writes };
}
