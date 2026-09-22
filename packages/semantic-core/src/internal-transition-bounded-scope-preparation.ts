import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { deriveInternalScopeCreationPositionDelta, InternalScopeCreationPatchKind } from "./internal-transition-scope-creation-patch.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
import {
  activityAssociationsConflict,
} from "./internal-transition-activity-association.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type {
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { compensationSnapshotReservationAtoms } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import {
  affectedTokenBucketsAreExact,
  tokenBucketIsAbsent,
  tokenOwnerCensusAtoms,
} from "./internal-transition-token-preparation.js";
import {
  InternalOccurrenceKind,
  openWaitAnchorIsAbsent,
  operationDeclaresWait,
  operationIsUniqueWaitDeclarer,
} from "./internal-transition-wait-census.js";
import {
  applySelectedBoundedScopeArming,
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
  operation: EnterBoundedScopeOperation;
  parent: ScopeOccurrenceId;
  footprint: InternalTransitionStateFootprint;
  publicationTemplate: InternalPublicationTemplate;
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
  const processId = candidateProcessId(program, state, parent);
  if (
    selected === null ||
    parentRecord === undefined ||
    parentRecords.length !== 1 ||
    !safeActivation(selected.child.id.activation) ||
    !safeActivation(selected.record.id.activation) ||
    !safeActivation(selected.deadline.id.activation) ||
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, parent) ||
    program.operations.some((candidate) =>
      operationDeclaresWait(candidate, InternalOccurrenceKind.UserTask, operation.origin.elementId)
    ) ||
    processId === null ||
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
  const snapshotAtoms = compensationSnapshotReservationAtoms(
    program,
    selected.child,
  );
  const writes = canonicalUniqueStateAtoms([
    ...tokenOwnerCensusAtoms([operation.input, operation.childEntry]),
    inputToken,
    childEntryToken,
    childOccurrence,
    childParent,
    association,
    wait,
    anchor,
    ...activationAtoms,
    ...snapshotAtoms,
  ]);
  const reads = canonicalUniqueStateAtoms([
    ...tokenOwnerCensusAtoms([operation.input]),
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
    ...snapshotAtoms,
  ]);
  const positionDelta = deriveInternalScopeCreationPositionDelta(program, {
    kind: InternalScopeCreationPatchKind.ChildScope,
    owner: parent, input: operation.input, entry: operation.childEntry,
    scope: selected.child,
    counter: { elementId: operation.childScopeId, count: selected.child.id.activation },
  });
  const alternative = internalOperationAlternative(operation.id);
  return reads === null || writes === null || positionDelta === null
    ? null
    : {
        alternative,
        operation,
        parent,
        ...selected,
        footprint: { reads, writes },
        publicationTemplate: {
          alternative,
          record: {
            logicalTimeMs: state.logicalTimeMs,
            transition: { kind: SemanticTransitionKind.InternalOperation,
              operationId: operation.id, operationKind: operation.kind, origin: operation.origin, owner: parent },
            positionDelta,
          },
          lifecycle: {
            started: [{ anchor: { kind: InternalPublicationTemplateAnchorKind.Scope, id: selected.child.id },
              processId, elementId: operation.origin.elementId, owner: parent }],
            ended: [],
          },
        },
      };
}

export function applyPreparedInternalBoundedScope(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalBoundedScope,
): RuntimeState | null {
  if (program.compensationEventSubProcessSnapshots !== undefined) return null;
  const current = deriveInternalBoundedScopePreparation(program, state, prepared.operation);
  // INTERNAL-COMMUTATION retains the whole preparation, including three counters and publication.
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  return applySelectedBoundedScopeArming(prepared.operation, state, prepared.parent, prepared);
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
