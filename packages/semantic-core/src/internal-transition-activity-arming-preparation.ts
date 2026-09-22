import {
  activityAssociationsConflict,
} from "./internal-transition-activity-association.js";
import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import { canonicalUniqueStateAtoms, canonicalUniquePublicationAtoms } from "./internal-transition-footprint-ordering.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import type {
  InternalTransitionStateAtom,
  InternalTransitionFootprint,
} from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind, InternalTransitionPublicationAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { affectedTokenBucketsAreExact, tokenOwnerCensusAtoms } from "./internal-transition-token-preparation.js";
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
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
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
  operation: ActivityArmingOperation;
  owner: ScopeOccurrenceId;
  footprint: InternalTransitionFootprint;
  publicationTemplate: InternalPublicationTemplate;
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
  const processId = candidateProcessId(program, state, owner);
  const inputs = program.controlPlaces.filter(({ id }) => id === operation.input);
  const input = inputs[0];
  const inputOwners = program.controlPlaceScopes.filter(({ controlPlaceId }) =>
    controlPlaceId === operation.input);
  if (processId === null || inputs.length !== 1 || input === undefined ||
      inputOwners.length !== 1 || inputOwners[0]?.scopeId !== owner.definitionScopeId) return null;
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
    ...tokenOwnerCensusAtoms([operation.input]),
    inputToken,
    association,
    ...activationAtoms,
    ...waitAtoms,
    ...anchorAtoms,
  ]);
  const reads = canonicalUniqueStateAtoms([
    ...tokenOwnerCensusAtoms([operation.input]),
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
  const positionDelta = {
    consumedTokens: [{ sequenceFlowId: input.origin.elementId, owner, multiplicity: 1 }],
    producedTokens: [], enteredScopes: [], exitedScopes: [],
  };
  const occurrence = { kind: InternalOccurrenceKind.UserTask, id: selected.taskWait.id } as const;
  const committed = {
    kind: InternalTransitionPublicationAtomKind.CommittedTransition,
    operationId: operation.id, operationKind: operation.kind, origin: operation.origin,
    owner, logicalTimeMs: state.logicalTimeMs, positionDelta,
  } as const;
  // The boundary deadline is a state dependency; E2 starts the Activity's task only
  // (candidateLongLivedStarts, the existing boundary-Timer publication contract).
  const publications = canonicalUniquePublicationAtoms([
    committed,
    { kind: InternalTransitionPublicationAtomKind.FlowNodeLifecycle, occurrence: selected.taskWait.id },
    { kind: InternalTransitionPublicationAtomKind.PublicationPair, operationId: operation.id, occurrence },
  ]);
  const alternative = internalOperationAlternative(operation.id);
  return reads === null || writes === null || publications === null
    ? null
    : {
        alternative,
        operation,
        owner,
        ...selected,
        footprint: { reads, writes, publications,
          publicationSortKey: { operationId: operation.id, occurrenceKind: InternalOccurrenceKind.UserTask,
            ...selected.taskWait.id } },
        publicationTemplate: {
          alternative,
          record: {
            logicalTimeMs: state.logicalTimeMs,
            transition: { kind: SemanticTransitionKind.InternalOperation,
              operationId: operation.id, operationKind: operation.kind, origin: operation.origin, owner },
            positionDelta,
          },
          lifecycle: {
            started: [{ anchor: { kind: InternalPublicationTemplateAnchorKind.Wait, id: selected.taskWait.id },
              processId, elementId: selected.taskWait.id.elementId, owner }],
            ended: [],
          },
        },
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
