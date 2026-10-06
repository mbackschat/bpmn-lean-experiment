import { PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { InternalOccurrenceKind, operationIsUniqueWaitDeclarer, openWaitAnchorIsAbsent } from "./internal-transition-wait-census.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
import { canonicalUniqueInternalAlternatives, compareInternalAlternatives,
  internalOperationOccurrenceAlternative, resolveInternalOperationOccurrence } from "./internal-transition-alternative.js";
import type { InternalOperationOccurrenceAlternative } from "./internal-transition-alternative.js";
import { applyInternalOperationOccurrence, deriveInternalOccurrenceFrontier } from "./internal-operation-occurrence.js";
import { applyInternalOrdinaryArmingPatch, deriveInternalOrdinaryArmingPatch,
  InternalOrdinaryArmingPatchKind } from "./internal-transition-ordinary-arming-patch.js";
import type { InternalOrdinaryArmingPatch } from "./internal-transition-ordinary-arming-patch.js";
import { evaluateParallelScopeInputs, hasParallelScopeDefinition } from "./parallel-scope-data.js";
import { LocalDataOwnerKind } from "./local-data-owner.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import type { AppliedInternalOperationStep } from "./semantic-process-runtime.js";
import { ownedTokenMultiplicity, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { isWellFormedWireString } from "./wire.js";

type ReservedOccurrenceMember = Readonly<{
  alternative: InternalOperationOccurrenceAlternative;
  base: number;
  slot: number;
  patch: InternalOrdinaryArmingPatch;
  publicationTemplate: InternalPublicationTemplate;
}>;

/** PMIS reservation batches bind the whole predecessor conservatively, including every sibling frame. */
export type InternalOccurrenceBatch = Readonly<{
  programBinding: string;
  predecessorBinding: string;
  members: readonly ReservedOccurrenceMember[];
}>;

/** Only a complete ordinary human/effect frontier qualifies; residual edits consume distinct owner/place buckets. */
export function prepareInternalOccurrenceBatch(
  program: SemanticProcessProgram, state: RuntimeState,
): InternalOccurrenceBatch | null {
  if (program.identity.semanticProfile !== PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID ||
      !Number.isSafeInteger(state.logicalTimeMs) || state.logicalTimeMs < 0 ||
      !internalOccurrenceReservationStateIsValid(state)) return null;
  const discovered = deriveInternalOccurrenceFrontier(program, state, (selected, predecessor, candidate) => {
    const operation = resolveInternalOperationOccurrence(selected, predecessor, candidate);
    if (operation?.kind !== SemanticOperationKind.AwaitEffect && operation?.kind !== SemanticOperationKind.AwaitUserTask)
      return applyInternalOperationOccurrence(selected, predecessor, candidate);
    if (ownedTokenMultiplicity(predecessor.controlTokens, operation.input, candidate.owner) !== 1) return null;
    // Reservation discovery needs token/data intent, not a provisional wait with an unreserved identity.
    return deriveInternalOrdinaryArmingPatch(selected, operation, predecessor, candidate.owner) === null ? null : predecessor;
  });
  if (discovered === null || discovered.length < 2) return null;
  const alternatives = canonicalUniqueInternalAlternatives(discovered.map(({ candidate }) =>
    internalOperationOccurrenceAlternative(candidate.operationId, candidate.owner)));
  if (alternatives === null) return null;
  const members: ReservedOccurrenceMember[] = [];
  const allocations = new Map<string, number>();
  for (const offer of [...discovered].sort((left, right) => compareInternalAlternatives(
    internalOperationOccurrenceAlternative(left.candidate.operationId, left.candidate.owner),
    internalOperationOccurrenceAlternative(right.candidate.operationId, right.candidate.owner)))) {
    const { candidate } = offer;
    const operation = resolveInternalOperationOccurrence(program, state, candidate);
    if (operation === null || (operation.kind !== SemanticOperationKind.AwaitUserTask &&
        operation.kind !== SemanticOperationKind.AwaitEffect)) return null;
    if (ownedTokenMultiplicity(state.controlTokens, operation.input, candidate.owner) !== 1 ||
        members.some(({ patch }) => patch.input === operation.input && sameScopeOccurrence(patch.owner, candidate.owner))) return null;
    if (hasParallelScopeDefinition(program, candidate.owner) &&
        evaluateParallelScopeInputs(program, state, candidate.owner, []) === null) return null;
    const human = operation.kind === SemanticOperationKind.AwaitUserTask;
    const elementId = human ? operation.task.elementId : operation.effect.elementId;
    const processId = candidateProcessId(program, state, candidate.owner);
    const places = program.controlPlaces.filter(place => place.id === operation.input);
    const bindings = program.controlPlaceScopes.filter(binding => binding.controlPlaceId === operation.input);
    if (operation.origin.elementId !== elementId || processId === null ||
        !operationIsSelectedFromProgram(program, operation, candidate.owner) ||
        places.length !== 1 || bindings.length !== 1 || bindings[0]?.scopeId !== candidate.owner.definitionScopeId ||
        !operationIsUniqueWaitDeclarer(program, operation, human ? InternalOccurrenceKind.UserTask : InternalOccurrenceKind.Effect, elementId)) return null;
    const counters = human ? state.taskActivations : state.effectActivations;
    const base = counters.find(counter => counter.elementId === elementId)?.count ?? 0;
    const domain = JSON.stringify([operation.kind, elementId]);
    const slot = (allocations.get(domain) ?? base) + 1;
    if (!Number.isSafeInteger(slot) || slot < 1) return null;
    const patch = deriveInternalOrdinaryArmingPatch(program, operation, state, candidate.owner, slot);
    if (patch === null || collides(state, patch) || members.some(member => anchor(member.patch) === anchor(patch))) return null;
    allocations.set(domain, slot);
    const alternative = internalOperationOccurrenceAlternative(candidate.operationId, candidate.owner);
    members.push({ alternative, base, slot, patch, publicationTemplate: {
      alternative,
      record: { logicalTimeMs: state.logicalTimeMs, transition: { kind: SemanticTransitionKind.InternalOperation,
        operationId: operation.id, operationKind: operation.kind, origin: operation.origin, owner: candidate.owner },
        positionDelta: { consumedTokens: [{ sequenceFlowId: places[0]!.origin.elementId, owner: candidate.owner, multiplicity: 1 }],
          producedTokens: [], enteredScopes: [], exitedScopes: [] } },
      lifecycle: { started: [{ anchor: { kind: InternalPublicationTemplateAnchorKind.Wait, id: patch.wait.id },
        processId, elementId, owner: candidate.owner }], ended: [] },
    } });
  }
  // The capsule requires frozen input snapshots; no references into caller-owned Program/state survive.
  return freeze(JSON.parse(JSON.stringify({ programBinding: JSON.stringify(program),
    predecessorBinding: JSON.stringify(state), members })) as InternalOccurrenceBatch);
}

/** Revalidates the complete certificate once, then checks each fixed-slot patch against its actual canonical prefix. */
export function applyInternalOccurrenceBatch(
  program: SemanticProcessProgram, predecessor: RuntimeState, certificate: InternalOccurrenceBatch,
): readonly AppliedInternalOperationStep[] | null {
  if (certificate.programBinding !== JSON.stringify(program) || certificate.predecessorBinding !== JSON.stringify(predecessor)) return null;
  const expected = prepareInternalOccurrenceBatch(program, predecessor);
  if (expected === null || JSON.stringify(expected) !== JSON.stringify(certificate)) return null;
  let state = predecessor;
  const steps: AppliedInternalOperationStep[] = [];
  for (const member of certificate.members) {
    const operation = resolveInternalOperationOccurrence(program, state, member.alternative);
    if (operation === null || (operation.kind !== SemanticOperationKind.AwaitUserTask &&
        operation.kind !== SemanticOperationKind.AwaitEffect) ||
        ownedTokenMultiplicity(state.controlTokens, operation.input, member.alternative.owner) !== 1) return null;
    const counters = operation.kind === SemanticOperationKind.AwaitUserTask ? state.taskActivations : state.effectActivations;
    const count = counters.find(counter => counter.elementId === member.patch.wait.id.elementId)?.count ?? 0;
    if (count !== member.slot - 1 || collides(state, member.patch)) return null;
    const patch = deriveInternalOrdinaryArmingPatch(program, operation, state, member.alternative.owner, member.slot);
    if (patch === null || JSON.stringify(patch) !== JSON.stringify(member.patch)) return null;
    state = applyInternalOrdinaryArmingPatch(state, member.patch);
    steps.push({ operation, owner: member.alternative.owner, successor: state });
  }
  return steps;
}

/** Issuance high-water marks must dominate retained anchors before legacy discovery can construct a successor. */
export function internalOccurrenceReservationStateIsValid(state: RuntimeState): boolean {
  if (!validCounters(state.taskActivations) || !validCounters(state.effectActivations) ||
      !uniqueTokenBuckets(state) || !uniqueExistingAnchors(state)) return false;
  const issued = (id: { elementId: string; activation: number }, counters: RuntimeState["taskActivations"]) =>
    Number.isSafeInteger(id.activation) && id.activation > 0 &&
    id.activation <= (counters.find(counter => counter.elementId === id.elementId)?.count ?? 0);
  return state.userTaskWaits.every(wait => issued(wait.id, state.taskActivations)) &&
    [...state.effectWaits, ...state.effectIncidents.map(({ wait }) => wait), ...(state.compensationHandlerEffectWaits ?? [])]
      .every(wait => issued(wait.id, state.effectActivations)) &&
    state.variables.activities.every(({ owner }) => owner.kind !== LocalDataOwnerKind.EffectOccurrence ||
      issued(owner.id, state.effectActivations));
}

function validCounters(counters: RuntimeState["taskActivations"]): boolean {
  return counters.every(({ elementId, count }) => elementId.length > 0 && isWellFormedWireString(elementId) &&
    Number.isSafeInteger(count) && count >= 0) && new Set(counters.map(counter => counter.elementId)).size === counters.length;
}

function uniqueTokenBuckets(state: RuntimeState): boolean {
  return state.controlTokens.every((token, index, all) => Number.isSafeInteger(token.multiplicity) && token.multiplicity > 0 &&
    all.slice(0, index).every(other => other.placeId !== token.placeId || !sameScopeOccurrence(other.owner, token.owner)));
}

function occurrenceKey(id: { processInstanceId: string; elementId: string; activation: number }): string {
  return JSON.stringify([id.processInstanceId, id.elementId, id.activation]);
}

function anchor(patch: InternalOrdinaryArmingPatch): string {
  return occurrenceKey(patch.wait.id);
}

function uniqueExistingAnchors(state: RuntimeState): boolean {
  const waits = [...state.userTaskWaits, ...state.messageWaits, ...state.timerWaits, ...state.effectWaits,
    ...state.effectIncidents.map(({ wait }) => wait), ...(state.compensationHandlerEffectWaits ?? [])];
  const frames = state.variables.activities.map(({ owner }) => JSON.stringify([owner.kind, occurrenceKey(owner.kind === LocalDataOwnerKind.EffectOccurrence
    ? owner.id : { ...owner.id, elementId: owner.id.activityElementId })]));
  return new Set(waits.map(wait => occurrenceKey(wait.id))).size === waits.length && new Set(frames).size === frames.length;
}

function collides(state: RuntimeState, patch: InternalOrdinaryArmingPatch): boolean {
  const key = occurrenceKey(patch.wait.id);
  if (!openWaitAnchorIsAbsent(state, patch.wait.id)) return true;
  switch (patch.kind) {
    case InternalOrdinaryArmingPatchKind.UserTask:
      return state.userTaskWaits.some(wait => occurrenceKey(wait.id) === key) || state.variables.activities.some(({ owner }) =>
        owner.kind === LocalDataOwnerKind.ActivityOccurrence && occurrenceKey({ ...owner.id, elementId: owner.id.activityElementId }) === key);
    case InternalOrdinaryArmingPatchKind.Effect:
      return [...state.effectWaits, ...state.effectIncidents.map(({ wait }) => wait), ...(state.compensationHandlerEffectWaits ?? [])]
        .some(wait => occurrenceKey(wait.id) === key) || state.variables.activities.some(({ owner }) =>
          owner.kind === LocalDataOwnerKind.EffectOccurrence && occurrenceKey(owner.id) === key);
    default: return true;
  }
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
