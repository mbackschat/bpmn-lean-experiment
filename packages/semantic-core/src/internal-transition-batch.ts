import {
  applyPreparedInternalArming,
  deriveInternalArmingPreparation,
} from "./internal-transition-arming-batch.js";
import { CallDataKind } from "./call-data-contract.js";
import { applyPreparedInternalCallData, deriveInternalCallDataPreparation } from "./internal-transition-call-data-preparation.js";
import type { PreparedInternalCallData } from "./internal-transition-call-data-preparation.js";
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
  applyPreparedInternalDeclaredScopeEntry,
  deriveInternalDeclaredScopeEntryPreparation,
} from "./internal-transition-declared-entry-preparation.js";
import type { PreparedInternalDeclaredScopeEntry } from "./internal-transition-declared-entry-preparation.js";
import {
  applyPreparedInternalMappedInvocation,
  deriveInternalMappedInvocationPreparation,
} from "./internal-transition-mapped-invocation-preparation.js";
import type { PreparedInternalMappedInvocation } from "./internal-transition-mapped-invocation-preparation.js";
import { nestedScopeRecord } from "./nested-scope-data.js";
import { applyPreparedInternalBoundedScope, deriveInternalBoundedScopePreparation } from "./internal-transition-bounded-scope-preparation.js";
import type { PreparedInternalBoundedScope } from "./internal-transition-bounded-scope-preparation.js";
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
import { repeatableSubscriptionPreparationAdmitted } from "./semantic-process-admission.js";
import { REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";

function boundedScopePreparationAdmitted(
  program: SemanticProcessProgram,
  operation: PreparedInternalBoundedScope["operation"],
): boolean {
  // The approved proof-domain amendment preserves the pre-existing raw bounded-scope path.
  return operation.kind === SemanticOperationKind.EnterBoundedScope &&
    program.identity.semanticProfile !== REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID ||
    repeatableSubscriptionPreparationAdmitted(program);
}

export enum PreparedInternalTransitionFamily {
  CallData = "callData",
  Arming = "arming",
  LocalControl = "localControl",
  ScopeCreation = "scopeCreation",
  DeclaredScopeEntry = "declaredScopeEntry",
  MappedInvocation = "mappedInvocation",
  BoundedScope = "boundedScope",
  Regional = "regional",
  OrdinaryEnd = "ordinaryEnd",
  MergeInput = "mergeInput",
}

export type PreparedInternalTransition = Readonly<
  | PreparedInternalCallData & { family: PreparedInternalTransitionFamily.CallData }
  | PreparedInternalArming & { family: PreparedInternalTransitionFamily.Arming }
  | PreparedInternalLocalControl & { family: PreparedInternalTransitionFamily.LocalControl }
  | PreparedInternalScopeCreation & { family: PreparedInternalTransitionFamily.ScopeCreation }
  | PreparedInternalDeclaredScopeEntry & { family: PreparedInternalTransitionFamily.DeclaredScopeEntry }
  | PreparedInternalMappedInvocation & { family: PreparedInternalTransitionFamily.MappedInvocation }
  | PreparedInternalBoundedScope & { family: PreparedInternalTransitionFamily.BoundedScope; owner: ScopeOccurrenceId }
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
  if (candidate.operation.kind === SemanticOperationKind.InvokeProcess ||
      candidate.operation.kind === SemanticOperationKind.ReturnProcess) {
    switch (candidate.operation.data.kind) {
      case CallDataKind.Scalar: {
        const prepared = deriveInternalCallDataPreparation(program, state, candidate.operation);
        return prepared === null || candidate.owner === null || !sameScopeOccurrence(prepared.owner, candidate.owner)
          ? null : { family: PreparedInternalTransitionFamily.CallData, ...prepared };
      }
      // CMCALL-PREPARE-01 prepares the invocation with its called-root frame; return stays a singleton.
      case CallDataKind.VariableMappings: {
        if (candidate.operation.kind === SemanticOperationKind.ReturnProcess || candidate.owner === null) return null;
        const prepared = deriveInternalMappedInvocationPreparation(program, state, candidate.operation);
        return prepared === null || !sameScopeOccurrence(prepared.owner, candidate.owner)
          ? null : { family: PreparedInternalTransitionFamily.MappedInvocation, ...prepared };
      }
      case CallDataKind.Empty:
        break;
    }
  }
  switch (candidate.operation.kind) {
    case SemanticOperationKind.EnterMonitoredScope:
    case SemanticOperationKind.EnterBoundedScope: {
      if (program.compensationEventSubProcessSnapshots !== undefined || candidate.owner === null) return null;
      if (!boundedScopePreparationAdmitted(program, candidate.operation)) return null;
      const prepared = deriveInternalBoundedScopePreparation(program, state, candidate.operation);
      return prepared === null || !sameScopeOccurrence(prepared.parent, candidate.owner)
        ? null : { family: PreparedInternalTransitionFamily.BoundedScope, owner: prepared.parent, ...prepared };
    }
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
    case SemanticOperationKind.EnterScope: {
      if (candidate.owner === null || nestedScopeRecord(program, candidate.operation.childScopeId) === undefined) {
        return scopeCreationMember(program, state, candidate.operation, candidate.owner);
      }
      const prepared = deriveInternalDeclaredScopeEntryPreparation(program, state, candidate.operation);
      return prepared === null || !sameScopeOccurrence(prepared.owner, candidate.owner)
        ? null : { family: PreparedInternalTransitionFamily.DeclaredScopeEntry, ...prepared };
    }
    case SemanticOperationKind.InvokeProcess:
      return scopeCreationMember(program, state, candidate.operation, candidate.owner);
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

function scopeCreationMember(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: PreparedInternalScopeCreation["operation"],
  owner: ScopeOccurrenceId | null,
): PreparedInternalTransition | null {
  if (owner === null) return null;
  const prepared = deriveInternalScopeCreationPreparation(program, state, operation);
  return prepared === null || !sameScopeOccurrence(prepared.owner, owner)
    ? null : { family: PreparedInternalTransitionFamily.ScopeCreation, ...prepared };
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

/**
 * The frame-inserting families of CSD-PREPARE-01 and CMCALL-PREPARE-01, and their batch premise as Lean's
 * `PreparedInternalTransition.Independent` states it: their commutation is established only beside declared entries,
 * mapped invocations, scope creations, ordinary armings and local control, and a declared entry's also beside a Merge
 * input (PTPB-COMMUTE-01), so any other companion is dependent and never batched with them, so no unproved order is
 * committed.
 */
const frameInserting: ReadonlySet<PreparedInternalTransitionFamily> = new Set([
  PreparedInternalTransitionFamily.DeclaredScopeEntry, PreparedInternalTransitionFamily.MappedInvocation,
]);
const frameInsertingCompanions: ReadonlySet<PreparedInternalTransitionFamily> = new Set([
  ...frameInserting, PreparedInternalTransitionFamily.ScopeCreation,
  PreparedInternalTransitionFamily.Arming, PreparedInternalTransitionFamily.LocalControl,
]);
const declaredEntryCompanions: ReadonlySet<PreparedInternalTransitionFamily> = new Set([
  ...frameInsertingCompanions, PreparedInternalTransitionFamily.MergeInput,
]);

const frameInsertingPremiseHolds = (member: PreparedInternalTransition, companion: PreparedInternalTransition): boolean => {
  switch (member.family) {
    case PreparedInternalTransitionFamily.DeclaredScopeEntry: return declaredEntryCompanions.has(companion.family);
    case PreparedInternalTransitionFamily.MappedInvocation: return frameInsertingCompanions.has(companion.family);
    default: return true;
  }
};

export function preparedInternalTransitionsAreIndependent(
  left: PreparedInternalTransition,
  right: PreparedInternalTransition,
): boolean {
  if (!frameInsertingPremiseHolds(left, right) || !frameInsertingPremiseHolds(right, left)) return false;
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
    case PreparedInternalTransitionFamily.CallData: {
      const { family: _family, ...callData } = prepared;
      return applyPreparedInternalCallData(program, state, callData);
    }
    case PreparedInternalTransitionFamily.BoundedScope: {
      const { family: _family, owner, ...bounded } = prepared;
      if (!boundedScopePreparationAdmitted(program, bounded.operation)) return null;
      if (!sameScopeOccurrence(owner, bounded.parent)) return null;
      return applyPreparedInternalBoundedScope(program, state, bounded);
    }
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
    case PreparedInternalTransitionFamily.DeclaredScopeEntry: {
      const { family: _family, ...declared } = prepared;
      return applyPreparedInternalDeclaredScopeEntry(program, state, declared);
    }
    case PreparedInternalTransitionFamily.MappedInvocation: {
      const { family: _family, ...mapped } = prepared;
      return applyPreparedInternalMappedInvocation(program, state, mapped);
    }
  }
}
