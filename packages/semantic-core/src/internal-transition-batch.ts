import {
  applyPreparedInternalArming,
  deriveInternalArmingPreparation,
} from "./internal-transition-arming-batch.js";
import type { PreparedInternalArming } from "./internal-transition-arming-batch.js";
import {
  applyPreparedInternalLocalControl,
  deriveInternalLocalControlPreparation,
} from "./internal-transition-local-control-preparation.js";
import type { PreparedInternalLocalControl } from "./internal-transition-local-control-preparation.js";
import {
  applyPreparedInternalScopeCreation,
  deriveInternalScopeCreationPreparation,
} from "./internal-transition-scope-creation-preparation.js";
import type { PreparedInternalScopeCreation } from "./internal-transition-scope-creation-preparation.js";
import {
  applyPreparedInternalRegionalTransition,
  deriveInternalRegionalPreparation,
} from "./internal-transition-regional-preparation.js";
import type { InternalRegionalOperation, PreparedInternalRegionalTransition } from "./internal-transition-regional-preparation.js";
import { applyPreparedInternalEnd, deriveInternalEndPreparation } from "./internal-transition-end-preparation.js";
import type { PreparedInternalEnd } from "./internal-transition-end-preparation.js";
import { applyPreparedInternalExclusiveMerge } from "./internal-transition-merge-preparation.js";
import type { PreparedInternalExclusiveMergeInput } from "./internal-transition-merge-preparation.js";
import {
  internalTransitionFootprintsAreIndependent,
  internalTransitionStateFootprintsAreIndependent,
} from "./internal-transition-footprint.js";
import type { InternalTransitionCandidate } from "./internal-transition-footprint.js";
import { canonicalUniqueInternalAlternatives } from "./internal-transition-alternative.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";

export enum PreparedInternalTransitionFamily {
  Arming = "arming",
  LocalControl = "localControl",
  ScopeCreation = "scopeCreation",
  Regional = "regional",
  OrdinaryEnd = "ordinaryEnd",
  MergeInput = "mergeInput",
}

export type PreparedInternalTransition = Readonly<
  | PreparedInternalArming & { family: PreparedInternalTransitionFamily.Arming }
  | PreparedInternalLocalControl & { family: PreparedInternalTransitionFamily.LocalControl }
  | PreparedInternalScopeCreation & { family: PreparedInternalTransitionFamily.ScopeCreation }
  | PreparedInternalEnd & { family: PreparedInternalTransitionFamily.OrdinaryEnd }
  | PreparedInternalExclusiveMergeInput & { family: PreparedInternalTransitionFamily.MergeInput }
  | PreparedInternalRegionalTransition & {
      family: PreparedInternalTransitionFamily.Regional;
      operation: InternalRegionalOperation;
      owner: ScopeOccurrenceId;
    }
>;

export function deriveInternalTransitionPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): PreparedInternalTransition | null {
  switch (candidate.operation.kind) {
    case SemanticOperationKind.ReachNoneEnd: {
      if (candidate.owner === null) return null;
      const prepared = deriveInternalEndPreparation(program, state, candidate.operation);
      return prepared === null || !sameScopeOccurrence(prepared.owner, candidate.owner)
        ? null : { family: PreparedInternalTransitionFamily.OrdinaryEnd, ...prepared };
    }
    case SemanticOperationKind.ReturnProcess:
    case SemanticOperationKind.CompleteScope:
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.TerminateScope: {
      if (candidate.owner === null) return null;
      const prepared = deriveInternalRegionalPreparation(program, state, candidate.operation);
      return prepared === null || !sameScopeOccurrence(prepared.selection.owner, candidate.owner)
        ? null : { family: PreparedInternalTransitionFamily.Regional,
          operation: prepared.selection.operation, owner: prepared.selection.owner, ...prepared };
    }
    case SemanticOperationKind.EnterScope:
    case SemanticOperationKind.InvokeProcess: {
      if (candidate.owner === null) return null;
      const prepared = deriveInternalScopeCreationPreparation(program, state, candidate.operation);
      return prepared === null || !sameScopeOccurrence(prepared.owner, candidate.owner)
        ? null : { family: PreparedInternalTransitionFamily.ScopeCreation, ...prepared };
    }
    case SemanticOperationKind.Duplicate:
    case SemanticOperationKind.Synchronize:
    case SemanticOperationKind.Choose:
    case SemanticOperationKind.SelectMany:
    case SemanticOperationKind.SynchronizeSelected: {
      if (program.compensationEventSubProcessSnapshots !== undefined || candidate.owner === null) return null;
      const prepared = deriveInternalLocalControlPreparation(program, state, candidate.operation);
      return prepared === null || !sameScopeOccurrence(prepared.owner, candidate.owner)
        ? null : { family: PreparedInternalTransitionFamily.LocalControl, ...prepared };
    }
    default: {
      const prepared = deriveInternalArmingPreparation(program, state, candidate);
      return prepared === null ? null : { family: PreparedInternalTransitionFamily.Arming, ...prepared };
    }
  }
}

/** INTERNAL-COMMUTATION requires every member and every pair from the same complete predecessor frontier. */
export function prepareInternalTransitionBatch(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidates: ReadonlyArray<InternalTransitionCandidate>,
): ReadonlyArray<PreparedInternalTransition> | null {
  if (candidates.length < 2) return null;
  const prepared: PreparedInternalTransition[] = [];
  for (const candidate of candidates) {
    const member = deriveInternalTransitionPreparation(program, state, candidate);
    if (member === null) return null;
    prepared.push(member);
  }
  if (canonicalUniqueInternalAlternatives(prepared.map(({ alternative }) => alternative)) === null) return null;
  for (let left = 0; left < prepared.length; left += 1) {
    for (let right = left + 1; right < prepared.length; right += 1) {
      const first = prepared[left]!;
      const second = prepared[right]!;
      // Instantaneous local-control anchors acquire distinct indices from the unique alternatives above.
      if (!preparedInternalTransitionsAreIndependent(first, second)) return null;
    }
  }
  return prepared;
}

export function preparedInternalTransitionsAreIndependent(
  left: PreparedInternalTransition,
  right: PreparedInternalTransition,
): boolean {
  return left.family === PreparedInternalTransitionFamily.Arming && right.family === PreparedInternalTransitionFamily.Arming
    ? internalTransitionFootprintsAreIndependent(left.footprint, right.footprint)
    : internalTransitionStateFootprintsAreIndependent(left.footprint, right.footprint);
}

export function applyPreparedInternalTransition(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalTransition,
): RuntimeState | null {
  switch (prepared.family) {
    case PreparedInternalTransitionFamily.MergeInput: {
      const { family: _family, ...merge } = prepared;
      return applyPreparedInternalExclusiveMerge(program, state, merge);
    }
    case PreparedInternalTransitionFamily.OrdinaryEnd: {
      const { family: _family, ...end } = prepared;
      return applyPreparedInternalEnd(program, state, end);
    }
    case PreparedInternalTransitionFamily.Regional: {
      const { family: _family, operation, owner, ...regional } = prepared;
      // Closure consumes these common fields; bind them to the complete regional artifact before execution.
      if (!sameScopeOccurrence(owner, regional.selection.owner) ||
          JSON.stringify(operation) !== JSON.stringify(regional.selection.operation)) return null;
      return applyPreparedInternalRegionalTransition(program, state, regional);
    }
    case PreparedInternalTransitionFamily.Arming: {
      const { family: _family, ...arming } = prepared;
      return applyPreparedInternalArming(program, state, arming);
    }
    case PreparedInternalTransitionFamily.LocalControl: {
      if (program.compensationEventSubProcessSnapshots !== undefined) return null;
      const { family: _family, ...localControl } = prepared;
      return applyPreparedInternalLocalControl(program, state, localControl);
    }
    case PreparedInternalTransitionFamily.ScopeCreation: {
      const { family: _family, ...scopeCreation } = prepared;
      return applyPreparedInternalScopeCreation(program, state, scopeCreation);
    }
  }
}
