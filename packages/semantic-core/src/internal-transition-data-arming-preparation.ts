import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { activityAssociationsConflict } from "./internal-transition-activity-association.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import { deriveInternalDataArmingPatch } from "./internal-transition-data-arming-patch.js";
import type { InternalDataArmingOperation, InternalDataArmingPatch } from "./internal-transition-data-arming-patch.js";
import { canonicalUniquePublicationAtoms, canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type { InternalTransitionCandidate, InternalTransitionFootprint } from "./internal-transition-footprint.js";
import { InternalTransitionPublicationAtomKind, InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { affectedTokenBucketsAreExact, tokenOwnerCensusAtoms } from "./internal-transition-token-preparation.js";
import { InternalOccurrenceKind, openWaitAnchorIsAbsent, operationIsUniqueWaitDeclarer } from "./internal-transition-wait-census.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import { ControlStateKind, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";

export type PreparedInternalDataArming = Readonly<{
  alternative: InternalOperationAlternative;
  operation: InternalDataArmingOperation;
  owner: ScopeOccurrenceId;
  patch: InternalDataArmingPatch;
  footprint: InternalTransitionFootprint;
  publicationTemplate: InternalPublicationTemplate;
}>;

/** Derives data arming and its full publication exclusively from the exact pre-state. */
export function deriveInternalDataArmingPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  candidate: InternalTransitionCandidate,
): PreparedInternalDataArming | null {
  const { operation, owner } = candidate;
  switch (operation.kind) {
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitDataInputOutputUserTask:
    case SemanticOperationKind.AwaitDataOutputUserTask:
      break;
    default:
      return null;
  }
  if (
    owner === null ||
    state.control.kind !== ControlStateKind.Running ||
    owner.processInstanceId !== state.control.instanceId ||
    !operationIsSelectedFromProgram(program, operation, owner)
  ) return null;
  const selectedOwner = onlyTokenOwner(state, operation.input);
  const processId = candidateProcessId(program, state, owner);
  const inputs = program.controlPlaces.filter(({ id }) => id === operation.input);
  const input = inputs[0];
  const inputOwners = program.controlPlaceScopes.filter(({ controlPlaceId }) =>
    controlPlaceId === operation.input
  );
  if (
    selectedOwner === undefined || !sameScopeOccurrence(selectedOwner, owner) ||
    processId === null || inputs.length !== 1 || input === undefined ||
    inputOwners.length !== 1 || inputOwners[0]?.scopeId !== owner.definitionScopeId ||
    !affectedTokenBucketsAreExact(state, owner, [operation.input], []) ||
    !operationIsUniqueWaitDeclarer(program, operation, InternalOccurrenceKind.UserTask, operation.task.elementId)
  ) return null;
  const patch = deriveInternalDataArmingPatch(operation, state, owner);
  if (
    patch === null ||
    !safeActivation(patch.wait.id.activation) || !safeActivation(patch.record.id.activation) ||
    !openWaitAnchorIsAbsent(state, patch.wait.id) ||
    state.activityOccurrences.some((record) => activityAssociationsConflict(record, patch.record))
  ) return null;

  const occurrence = { kind: InternalOccurrenceKind.UserTask, id: patch.wait.id } as const;
  const activity = {
    kind: InternalOccurrenceKind.Activity,
    id: {
      processInstanceId: patch.record.id.processInstanceId,
      elementId: patch.record.id.activityElementId,
      activation: patch.record.id.activation,
    },
  } as const;
  const token = { kind: InternalTransitionStateAtomKind.ControlToken, owner, placeId: operation.input } as const;
  const association = { kind: InternalTransitionStateAtomKind.ActivityAssociation, record: patch.record } as const;
  const counters = [InternalOccurrenceKind.UserTask, InternalOccurrenceKind.Activity].map((occurrenceKind) => ({
    kind: InternalTransitionStateAtomKind.Activation, occurrenceKind, elementId: operation.task.elementId,
  } as const));
  const wait = { kind: InternalTransitionStateAtomKind.Wait, occurrence, owner } as const;
  const anchor = { kind: InternalTransitionStateAtomKind.OpenWaitAnchor, occurrence: patch.wait.id, owner } as const;
  const scope = { kind: InternalTransitionStateAtomKind.ActivityVariableScope, occurrence: activity, owner } as const;
  const reads = canonicalUniqueStateAtoms([
    ...tokenOwnerCensusAtoms([operation.input]),
    { kind: InternalTransitionStateAtomKind.RuntimeControl, instanceId: state.control.instanceId },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    { kind: InternalTransitionStateAtomKind.LogicalTime },
    ...(operation.kind === SemanticOperationKind.AwaitDataOutputUserTask ? [] : [{
      kind: InternalTransitionStateAtomKind.ProcessVariable,
      name: operation.directInput.sourcePropertyId,
    } as const]),
    token, association, ...counters, wait, anchor, scope,
  ]);
  const writes = canonicalUniqueStateAtoms([
    ...tokenOwnerCensusAtoms([operation.input]),
    token, association, ...counters, wait, anchor, scope,
    ...patch.bindings.map(({ name }) => ({
      kind: InternalTransitionStateAtomKind.ActivityVariable, occurrence: activity, owner, name,
    } as const)),
  ]);
  const positionDelta = {
    consumedTokens: [{ sequenceFlowId: input.origin.elementId, owner, multiplicity: 1 }],
    producedTokens: [], enteredScopes: [], exitedScopes: [],
  };
  const committed = {
    kind: InternalTransitionPublicationAtomKind.CommittedTransition,
    operationId: operation.id, operationKind: operation.kind, origin: operation.origin,
    owner, logicalTimeMs: state.logicalTimeMs, positionDelta,
  } as const;
  const publications = canonicalUniquePublicationAtoms([
    committed,
    { kind: InternalTransitionPublicationAtomKind.FlowNodeLifecycle, occurrence: patch.wait.id },
    { kind: InternalTransitionPublicationAtomKind.PublicationPair, operationId: operation.id, occurrence },
  ]);
  if (reads === null || writes === null || publications === null) return null;
  const alternative = internalOperationAlternative(operation.id);
  return {
    alternative, operation, owner, patch,
    footprint: {
      reads, writes, publications,
      publicationSortKey: { operationId: operation.id, occurrenceKind: InternalOccurrenceKind.UserTask, ...patch.wait.id },
    },
    publicationTemplate: {
      alternative,
      record: {
        logicalTimeMs: committed.logicalTimeMs,
        transition: {
          kind: SemanticTransitionKind.InternalOperation,
          operationId: operation.id, operationKind: operation.kind, origin: operation.origin, owner,
        },
        positionDelta,
      },
      lifecycle: {
        started: [{
          anchor: { kind: InternalPublicationTemplateAnchorKind.Wait, id: patch.wait.id },
          processId, elementId: patch.wait.id.elementId, owner,
        }],
        ended: [],
      },
    },
  };
}

function safeActivation(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
