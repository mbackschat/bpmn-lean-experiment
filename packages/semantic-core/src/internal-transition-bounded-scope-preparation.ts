import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import {
  activityAssociationsConflict,
} from "./internal-transition-activity-association.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type {
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import {
  affectedTokenBucketsAreExact,
  tokenBucketIsAbsent,
} from "./internal-transition-token-preparation.js";
import {
  InternalOccurrenceKind,
  openWaitAnchorIsAbsent,
  operationIsUniqueWaitDeclarer,
} from "./internal-transition-wait-census.js";
import {
  selectBoundedScopeArming,
} from "./semantic-process-bounded-scope-runtime.js";
import type {
  SelectedBoundedScopeArming,
} from "./semantic-process-bounded-scope-runtime.js";
import type {
  EnterBoundedScopeOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export type PreparedInternalBoundedScope = SelectedBoundedScopeArming & Readonly<{
  alternative: InternalOperationAlternative;
  parent: ScopeOccurrenceId;
  footprint: InternalTransitionStateFootprint;
}>;

/** Derives one complete bounded Sub-Process arming without applying it. */
export function deriveInternalBoundedScopePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: EnterBoundedScopeOperation,
): PreparedInternalBoundedScope | null {
  const parent = onlyTokenOwner(state, operation.input);
  if (parent === undefined) {
    return null;
  }
  const selected = selectBoundedScopeArming(operation, state, parent);
  const parentRecords = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, parent)
  );
  const parentRecord = parentRecords[0];
  if (
    selected === null ||
    parentRecord === undefined ||
    parentRecords.length !== 1 ||
    !safeActivation(selected.child.id.activation) ||
    !safeActivation(selected.record.id.activation) ||
    !safeActivation(selected.deadline.id.activation) ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, parent) ||
    candidateProcessId(program, state, parent) === null ||
    !affectedTokenBucketsAreExact(state, parent, [operation.input], []) ||
    !tokenBucketIsAbsent(state, selected.child.id, operation.childEntry) ||
    !operationIsUniqueWaitDeclarer(
      program,
      operation,
      InternalOccurrenceKind.Timer,
      operation.boundaryTimer.elementId,
    ) ||
    state.activityOccurrences.some((record) =>
      activityAssociationsConflict(record, selected.record)
    ) ||
    !openWaitAnchorIsAbsent(state, selected.deadline.id)
  ) {
    return null;
  }

  const inputToken = tokenAtom(parent, operation.input);
  const childEntryToken = tokenAtom(selected.child.id, operation.childEntry);
  const childOccurrence = {
    kind: InternalTransitionStateAtomKind.ScopeOccurrence,
    owner: selected.child.id,
  } as const;
  const childParent = {
    kind: InternalTransitionStateAtomKind.ScopeParent,
    occurrence: selected.child.id,
    parent,
  } as const;
  const association = {
    kind: InternalTransitionStateAtomKind.ActivityAssociation,
    record: selected.record,
  } as const;
  const wait = {
    kind: InternalTransitionStateAtomKind.Wait,
    occurrence: {
      kind: InternalOccurrenceKind.Timer,
      id: selected.deadline.id,
    },
    owner: parent,
  } as const;
  const anchor = {
    kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
    occurrence: selected.deadline.id,
    owner: parent,
  } as const;
  const activationAtoms = [
    activationAtom(InternalOccurrenceKind.Activity, operation.origin.elementId),
    activationAtom(InternalOccurrenceKind.Scope, operation.childScopeId),
    activationAtom(
      InternalOccurrenceKind.Timer,
      operation.boundaryTimer.elementId,
    ),
  ];
  const writes = canonicalUniqueStateAtoms([
    inputToken,
    childEntryToken,
    childOccurrence,
    childParent,
    association,
    wait,
    anchor,
    ...activationAtoms,
  ]);
  const reads = canonicalUniqueStateAtoms([
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner: parent },
    {
      kind: InternalTransitionStateAtomKind.ScopeParent,
      occurrence: parent,
      parent: parentRecord.parent,
    },
    { kind: InternalTransitionStateAtomKind.LogicalTime },
    inputToken,
    childEntryToken,
    childOccurrence,
    childParent,
    association,
    wait,
    anchor,
    ...activationAtoms,
  ]);
  return reads === null || writes === null
    ? null
    : {
        alternative: internalOperationAlternative(operation.id),
        parent,
        ...selected,
        footprint: { reads, writes },
      };
}

function safeActivation(activation: number): boolean {
  return Number.isSafeInteger(activation) && activation > 0;
}

function tokenAtom(
  owner: ScopeOccurrenceId,
  placeId: string,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId,
  };
}

function activationAtom(
  occurrenceKind: InternalOccurrenceKind,
  elementId: string,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.Activation,
    occurrenceKind,
    elementId,
  };
}
