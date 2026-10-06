import { PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { candidateProcessId, operationIsSelectedFromProgram } from "./flow-node-occurrence-candidates.js";
import { InternalOccurrenceKind, operationIsUniqueWaitDeclarer, openWaitAnchorIsAbsent } from "./internal-transition-wait-census.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
import { canonicalUniqueInternalAlternatives, compareInternalAlternatives,
  internalOperationOccurrenceAlternative, resolveInternalOperationOccurrence } from "./internal-transition-alternative.js";
import type { InternalOperationOccurrenceAlternative } from "./internal-transition-alternative.js";
export { internalOccurrenceReservationStateIsValid } from "./internal-operation-occurrence.js";
import { applyInternalOperationOccurrence, deriveInternalOccurrenceFrontier,
  internalOccurrenceReservationStateIsValid, internalOccurrenceKey as occurrenceKey } from "./internal-operation-occurrence.js";
import { applyInternalOrdinaryArmingPatch, deriveInternalOrdinaryArmingPatch,
  InternalOrdinaryArmingPatchKind } from "./internal-transition-ordinary-arming-patch.js";
import type { InternalOrdinaryArmingPatch } from "./internal-transition-ordinary-arming-patch.js";
import { evaluateParallelScopeInputs, hasParallelScopeDefinition } from "./parallel-scope-data.js";
import { LocalDataOwnerKind } from "./local-data-owner.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { AppliedInternalOperationStep } from "./semantic-process-runtime.js";
import { ownedTokenMultiplicity, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { applyInternalLocalControlPatch, deriveInternalLocalControlPositionDelta,
  InternalSelectedBranchPatchKind } from "./internal-transition-local-control-patch.js";
import type { InternalLocalControlPatch } from "./internal-transition-local-control-patch.js";
import { FlowNodeOccurrenceTerminalKind } from "./flow-node-occurrence-lifecycle.js";

export enum InternalOccurrenceControlPatchKind {
  TokenControl = "tokenControl",
}

type OccurrenceControlOperation = Extract<SemanticOperation, { kind:
  | SemanticOperationKind.Duplicate | SemanticOperationKind.Synchronize | SemanticOperationKind.ReachNoneEnd }>;
type OccurrenceControlPatch = InternalLocalControlPatch & Readonly<{
  kind: InternalOccurrenceControlPatchKind.TokenControl;
  endIncrement: 0 | 1;
}>;
type OccurrencePatch = InternalOrdinaryArmingPatch | OccurrenceControlPatch;
type ReservedOccurrenceMember = Readonly<{
  alternative: InternalOperationOccurrenceAlternative;
  base: number | null;
  slot: number | null;
  patch: OccurrencePatch;
  publicationTemplate: InternalPublicationTemplate;
}>;

/** PMIS reservation batches bind the whole predecessor conservatively, including every sibling frame. */
export type InternalOccurrenceBatch = Readonly<{
  programBinding: string;
  predecessorBinding: string;
  members: readonly ReservedOccurrenceMember[];
}>;

/** PMIS reservation normalizes only a complete frontier whose residual owner/place buckets are disjoint. */
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
    const processId = candidateProcessId(program, state, candidate.owner);
    if (operation === null || processId === null || operation.origin.elementId.length === 0 ||
        !operationIsSelectedFromProgram(program, operation, candidate.owner)) return null;
    const alternative = internalOperationOccurrenceAlternative(candidate.operationId, candidate.owner);
    let member: ReservedOccurrenceMember;
    switch (operation.kind) {
      case SemanticOperationKind.Duplicate:
      case SemanticOperationKind.Synchronize:
      case SemanticOperationKind.ReachNoneEnd: {
        const patch = deriveOccurrenceControlPatch(state, operation, candidate.owner);
        const positionDelta = patch === null ? null : deriveInternalLocalControlPositionDelta(program, patch);
        if (patch === null || positionDelta === null) return null;
        const anchor = { kind: InternalPublicationTemplateAnchorKind.TransitionTemplate,
          processId, elementId: operation.origin.elementId, owner: candidate.owner } as const;
        member = { alternative, base: null, slot: null, patch, publicationTemplate: {
          alternative, record: { logicalTimeMs: state.logicalTimeMs, transition: {
            kind: SemanticTransitionKind.InternalOperation, operationId: operation.id, operationKind: operation.kind,
            origin: operation.origin, owner: candidate.owner }, positionDelta },
          lifecycle: { started: [{ anchor, processId, elementId: operation.origin.elementId, owner: candidate.owner }],
            ended: [{ anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed }] },
        } };
        break;
      }
      case SemanticOperationKind.AwaitUserTask:
      case SemanticOperationKind.AwaitEffect: {
        if (ownedTokenMultiplicity(state.controlTokens, operation.input, candidate.owner) !== 1 ||
            (hasParallelScopeDefinition(program, candidate.owner) &&
            evaluateParallelScopeInputs(program, state, candidate.owner, []) === null)) return null;
        const human = operation.kind === SemanticOperationKind.AwaitUserTask;
        const elementId = human ? operation.task.elementId : operation.effect.elementId;
        const places = program.controlPlaces.filter(place => place.id === operation.input);
        const bindings = program.controlPlaceScopes.filter(binding => binding.controlPlaceId === operation.input);
        if (operation.origin.elementId !== elementId || places.length !== 1 || bindings.length !== 1 ||
            bindings[0]?.scopeId !== candidate.owner.definitionScopeId || !operationIsUniqueWaitDeclarer(program, operation,
            human ? InternalOccurrenceKind.UserTask : InternalOccurrenceKind.Effect, elementId)) return null;
        const counters = human ? state.taskActivations : state.effectActivations;
        const base = counters.find(counter => counter.elementId === elementId)?.count ?? 0;
        const domain = JSON.stringify([operation.kind, elementId]);
        const slot = (allocations.get(domain) ?? base) + 1;
        if (!Number.isSafeInteger(slot) || slot < 1) return null;
        const patch = deriveInternalOrdinaryArmingPatch(program, operation, state, candidate.owner, slot);
        if (patch === null || collides(state, patch) || members.some(member =>
            member.patch.kind !== InternalOccurrenceControlPatchKind.TokenControl &&
            occurrenceKey(member.patch.wait.id) === occurrenceKey(patch.wait.id))) return null;
        allocations.set(domain, slot);
        member = { alternative, base, slot, patch, publicationTemplate: {
          alternative, record: { logicalTimeMs: state.logicalTimeMs, transition: {
            kind: SemanticTransitionKind.InternalOperation, operationId: operation.id, operationKind: operation.kind,
            origin: operation.origin, owner: candidate.owner },
            positionDelta: { consumedTokens: [{ sequenceFlowId: places[0]!.origin.elementId, owner: candidate.owner, multiplicity: 1 }],
              producedTokens: [], enteredScopes: [], exitedScopes: [] } },
          lifecycle: { started: [{ anchor: { kind: InternalPublicationTemplateAnchorKind.Wait, id: patch.wait.id },
            processId, elementId, owner: candidate.owner }], ended: [] },
        } };
        break;
      }
      default: return null;
    }
    if (members.some(other => patchesShareTokenBucket(other.patch, member.patch))) return null;
    members.push(member);
  }
  const endIncrement = members.reduce((sum, { patch }) => sum +
    (patch.kind === InternalOccurrenceControlPatchKind.TokenControl ? patch.endIncrement : 0), 0);
  if (!safeEndIncrement(state, endIncrement)) return null;
  // The capsule requires frozen input snapshots; no references into caller-owned Program/state survive.
  return freeze(JSON.parse(JSON.stringify({ programBinding: JSON.stringify(program),
    predecessorBinding: JSON.stringify(state), members })) as InternalOccurrenceBatch);
}

/** Revalidates the complete certificate once, then checks each fixed patch against its actual canonical prefix. */
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
    if (operation === null) return null;
    const retained = member.patch;
    switch (retained.kind) {
      case InternalOccurrenceControlPatchKind.TokenControl: {
        if (operation.kind !== SemanticOperationKind.Duplicate && operation.kind !== SemanticOperationKind.Synchronize &&
            operation.kind !== SemanticOperationKind.ReachNoneEnd) return null;
        const patch = deriveOccurrenceControlPatch(state, operation, member.alternative.owner);
        if (member.base !== null || member.slot !== null || patch === null || JSON.stringify(patch) !== JSON.stringify(retained)) return null;
        const successor = applyInternalLocalControlPatch(state, retained);
        state = retained.endIncrement === 0 ? successor : { ...successor, endOccurrences: state.endOccurrences + retained.endIncrement };
        break;
      }
      default: {
        if ((operation.kind !== SemanticOperationKind.AwaitUserTask && operation.kind !== SemanticOperationKind.AwaitEffect) ||
            member.slot === null || ownedTokenMultiplicity(state.controlTokens, operation.input, member.alternative.owner) !== 1) return null;
        const counters = operation.kind === SemanticOperationKind.AwaitUserTask ? state.taskActivations : state.effectActivations;
        const count = counters.find(counter => counter.elementId === retained.wait.id.elementId)?.count ?? 0;
        if (count !== member.slot - 1 || collides(state, retained)) return null;
        const patch = deriveInternalOrdinaryArmingPatch(program, operation, state, member.alternative.owner, member.slot);
        if (patch === null || JSON.stringify(patch) !== JSON.stringify(retained)) return null;
        state = applyInternalOrdinaryArmingPatch(state, retained);
      }
    }
    steps.push({ operation, owner: member.alternative.owner, successor: state });
  }
  return steps;
}

function deriveOccurrenceControlPatch(
  state: RuntimeState, operation: OccurrenceControlOperation, owner: ScopeOccurrenceId,
): OccurrenceControlPatch | null {
  let consumed: readonly string[];
  let produced: readonly string[];
  let endIncrement: 0 | 1 = 0;
  switch (operation.kind) {
    case SemanticOperationKind.Duplicate: consumed = [operation.input]; produced = operation.outputs; break;
    case SemanticOperationKind.Synchronize: consumed = operation.inputs; produced = [operation.output]; break;
    case SemanticOperationKind.ReachNoneEnd: consumed = [operation.input]; produced = []; endIncrement = 1; break;
  }
  if ((operation.kind === SemanticOperationKind.Duplicate && produced.length === 0) ||
      new Set(produced).size !== produced.length || consumed.length === 0 || new Set(consumed).size !== consumed.length ||
      !consumed.every(place => ownedTokenMultiplicity(state.controlTokens, place, owner) === 1) ||
      !safeEndIncrement(state, endIncrement)) return null;
  for (const place of new Set([...consumed, ...produced])) {
    const remaining = ownedTokenMultiplicity(state.controlTokens, place, owner) - consumed.filter(input => input === place).length;
    const resulting = remaining + produced.filter(output => output === place).length;
    if (remaining < 0 || !Number.isSafeInteger(resulting) || resulting < 0) return null;
  }
  return { kind: InternalOccurrenceControlPatchKind.TokenControl, owner, consumed, produced,
    selectedBranch: { kind: InternalSelectedBranchPatchKind.Preserve }, endIncrement };
}

function safeEndIncrement(state: RuntimeState, increment: number): boolean {
  return increment === 0 || (Number.isSafeInteger(state.endOccurrences) && state.endOccurrences >= 0 &&
    Number.isSafeInteger(state.endOccurrences + increment));
}

function patchesShareTokenBucket(left: OccurrencePatch, right: OccurrencePatch): boolean {
  const places = (patch: OccurrencePatch) => patch.kind === InternalOccurrenceControlPatchKind.TokenControl
    ? [...patch.consumed, ...patch.produced] : [patch.input];
  return sameScopeOccurrence(left.owner, right.owner) && places(left).some(place => places(right).includes(place));
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
