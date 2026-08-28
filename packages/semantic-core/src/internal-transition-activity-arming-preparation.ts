import {
  activityAssociationsConflict,
} from "./internal-transition-activity-association.js";
import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type {
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { affectedTokenBucketsAreExact } from "./internal-transition-token-preparation.js";
import {
  InternalOccurrenceKind,
  openWaitAnchorIsAbsent,
  operationIsUniqueWaitDeclarer,
} from "./internal-transition-wait-census.js";
import {
  selectActivityArming,
} from "./semantic-process-activity-arming.js";
import type {
  ActivityArmingOperation,
  SelectedActivityArming,
} from "./semantic-process-activity-arming.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export type PreparedInternalActivityArming = SelectedActivityArming & Readonly<{
  alternative: InternalOperationAlternative;
  owner: ScopeOccurrenceId;
  footprint: InternalTransitionStateFootprint;
}>;

/** Derives one complete boundary-task Activity arming without applying it. */
export function deriveInternalActivityArmingPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: ActivityArmingOperation,
): PreparedInternalActivityArming | null {
  const owner = onlyTokenOwner(state, operation.input);
  if (owner === undefined) {
    return null;
  }
  const selected = selectActivityArming(operation, state, owner);
  if (
    selected === null ||
    !safeActivation(selected.record.id.activation) ||
    !safeActivation(selected.taskWait.id.activation) ||
    !safeActivation(selected.timerWait.id.activation) ||
    state.control.kind !== ControlStateKind.Running ||
    state.scopeOccurrences.filter(({ id }) =>
      sameScopeOccurrence(id, owner)
    ).length !== 1 ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null ||
    !affectedTokenBucketsAreExact(state, owner, [operation.input], []) ||
    !operationIsUniqueWaitDeclarer(
      program,
      operation,
      InternalOccurrenceKind.UserTask,
      operation.task.elementId,
    ) ||
    !operationIsUniqueWaitDeclarer(
      program,
      operation,
      InternalOccurrenceKind.Timer,
      operation.boundaryTimer.elementId,
    ) ||
    state.activityOccurrences.some((record) =>
      activityAssociationsConflict(record, selected.record)
    ) ||
    !openWaitAnchorIsAbsent(state, selected.taskWait.id) ||
    !openWaitAnchorIsAbsent(state, selected.timerWait.id)
  ) {
    return null;
  }

  const inputToken = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId: operation.input,
  } as const;
  const association = {
    kind: InternalTransitionStateAtomKind.ActivityAssociation,
    record: selected.record,
  } as const;
  const activationAtoms = [
    activationAtom(InternalOccurrenceKind.Activity, operation.task.elementId),
    activationAtom(InternalOccurrenceKind.UserTask, operation.task.elementId),
    activationAtom(
      InternalOccurrenceKind.Timer,
      operation.boundaryTimer.elementId,
    ),
  ];
  const waitAtoms = [
    waitAtom(InternalOccurrenceKind.UserTask, selected.taskWait.id, owner),
    waitAtom(InternalOccurrenceKind.Timer, selected.timerWait.id, owner),
  ];
  const anchorAtoms = [
    openWaitAnchorAtom(selected.taskWait.id, owner),
    openWaitAnchorAtom(selected.timerWait.id, owner),
  ];
  const writes = canonicalUniqueStateAtoms([
    inputToken,
    association,
    ...activationAtoms,
    ...waitAtoms,
    ...anchorAtoms,
  ]);
  const reads = canonicalUniqueStateAtoms([
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    { kind: InternalTransitionStateAtomKind.LogicalTime },
    inputToken,
    association,
    ...activationAtoms,
    ...waitAtoms,
    ...anchorAtoms,
  ]);
  return reads === null || writes === null
    ? null
    : {
        alternative: internalOperationAlternative(operation.id),
        owner,
        ...selected,
        footprint: { reads, writes },
      };
}

function safeActivation(activation: number): boolean {
  return Number.isSafeInteger(activation) && activation > 0;
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

function waitAtom(
  kind: InternalOccurrenceKind.UserTask | InternalOccurrenceKind.Timer,
  id: RuntimeState["userTaskWaits"][number]["id"],
  owner: ScopeOccurrenceId,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.Wait,
    occurrence: { kind, id },
    owner,
  };
}

function openWaitAnchorAtom(
  occurrence: RuntimeState["userTaskWaits"][number]["id"],
  owner: ScopeOccurrenceId,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
    occurrence,
    owner,
  };
}
