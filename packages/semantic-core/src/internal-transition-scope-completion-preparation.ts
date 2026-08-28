import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type {
  InternalTransitionCandidate,
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { deriveInternalOccurrenceRegion } from "./internal-transition-region.js";
import { InternalOccurrenceKind } from "./internal-transition-wait-census.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  ScopeCompletionWithdrawalKind,
  selectScopeCompletionWithdrawal,
} from "./semantic-process-bounded-scope-runtime.js";
import {
  ScopeCompletionSelectionKind,
  selectScopeCompletion,
} from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

/** Derives the completeScope state footprint from the exact pre-state without applying completion. */
export function deriveInternalCompleteScopeStateFootprint(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): InternalTransitionStateFootprint | null {
  const operation = candidate.operation;
  const owner = candidate.owner;
  if (
    operation.kind !== SemanticOperationKind.CompleteScope ||
    owner === null ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null
  ) {
    return null;
  }
  const selected = selectScopeCompletion(operation, state);
  if (
    selected === null ||
    !sameScopeOccurrence(selected.occurrence.id, owner)
  ) {
    return null;
  }
  const region = deriveInternalOccurrenceRegion(state, owner);
  const withdrawal = selectScopeCompletionWithdrawal(
    program,
    operation.scopeId,
    state,
  );
  if (region === null || withdrawal === null) {
    return null;
  }

  const regionAtom = {
    kind: InternalTransitionStateAtomKind.OccurrenceRegion,
    region,
  } as const;
  const reads: InternalTransitionStateAtom[] = [
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
    { kind: InternalTransitionStateAtomKind.LogicalTime },
    regionAtom,
  ];
  const writes: InternalTransitionStateAtom[] = [regionAtom];

  switch (selected.kind) {
    case ScopeCompletionSelectionKind.Root:
      reads.push({ kind: InternalTransitionStateAtomKind.InitiationPending });
      writes.push({
        kind: InternalTransitionStateAtomKind.RuntimeControl,
        instanceId: state.control.instanceId,
      });
      break;
    case ScopeCompletionSelectionKind.Child: {
      const parentOutput = {
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner: selected.parent,
        placeId: selected.parentOutput,
      } as const;
      reads.push(
        {
          kind: InternalTransitionStateAtomKind.ScopeOccurrence,
          owner: selected.parent,
        },
        parentOutput,
      );
      writes.push(parentOutput);
      break;
    }
  }

  switch (withdrawal.kind) {
    case ScopeCompletionWithdrawalKind.Unbounded:
      break;
    case ScopeCompletionWithdrawalKind.Bounded: {
      const association = {
        kind: InternalTransitionStateAtomKind.ActivityAssociation,
        record: withdrawal.record,
      } as const;
      reads.push(association);
      writes.push(association);
      for (const timer of withdrawal.timerWaits) {
        const wait = {
          kind: InternalTransitionStateAtomKind.Wait,
          occurrence: { kind: InternalOccurrenceKind.Timer, id: timer.id },
          owner: timer.owner,
        } as const;
        const anchor = {
          kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
          occurrence: timer.id,
          owner: timer.owner,
        } as const;
        reads.push(wait, anchor);
        writes.push(wait, anchor);
      }
      break;
    }
  }

  const canonicalReads = canonicalUniqueStateAtoms(reads);
  const canonicalWrites = canonicalUniqueStateAtoms(writes);
  return canonicalReads === null || canonicalWrites === null
    ? null
    : { reads: canonicalReads, writes: canonicalWrites };
}
