import { evaluateParallelScopeInputs, hasParallelScopeDefinition } from "./parallel-scope-data.js";
import { hasSequentialScopeDefinition } from "./sequential-scope-binding.js";
import { LocalDataOwnerKind } from "./local-data-owner.js";
import { createUserTaskWait, createEffectWait } from "./semantic-process-wait-runtime.js";
import { applyParallelScopeOperation } from "./parallel-scope-runtime.js";
import { applyInternalInitiationPatch } from "./internal-transition-initiation-patch.js";
import { completeScope, completeScopeOccurrence, enterConcurrentChildScope, selectScopeCompletion } from "./semantic-process-scope-runtime.js";
import { isMergeTargetOperation } from "./merge-target-operations.js";
import { completeDeclaredScope } from "./nested-scope-data.js";
import { duplicate, synchronize, reachNoneEnd } from "./semantic-process-control-flow-runtime.js";
import { resolveInternalOperationOccurrence, internalOperationOccurrences } from "./internal-transition-alternative.js";
import type { InternalOperationOccurrence } from "./internal-transition-alternative.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { ControlStateKind, nextActivation, ownedTokenMultiplicity, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";
import { compareCanonicalStrings, isWellFormedWireString } from "./wire.js";

/** PMIS-SELECT-01 revalidates owner and token readiness before applying an occurrence-addressed step. */
export function applyInternalOperationOccurrence(
  program: SemanticProcessProgram,
  state: RuntimeState, candidate: InternalOperationOccurrence,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) return null;
  const operation = resolveInternalOperationOccurrence(program, state, candidate);
  if (operation === null) return null;
  const { owner } = candidate;
  const unit = (input: string) => ownedTokenMultiplicity(state.controlTokens, input, owner) === 1;
  switch (operation.kind) {
    case SemanticOperationKind.Initiate: {
      const roots = state.scopeOccurrences.filter(scope => scope.parent === null);
      return state.initiationPending && roots.length === 1 && sameScopeOccurrence(roots[0]!.id, owner)
        ? applyInternalInitiationPatch(state, { owner, outputs: [operation.output] }) : null;
    }
    case SemanticOperationKind.EnterScope:
      return isMergeTargetOperation(program, operation) && unit(operation.input)
        ? enterConcurrentChildScope(state, owner, operation) : null;
    case SemanticOperationKind.CompleteScope: {
      // CEA-QUIESCE-01 confines lookup by occurrence to merge targets; every other completion keeps the declared-scope wrapper.
      if (isMergeTargetOperation(program, operation)) return completeScopeOccurrence(operation, state, owner);
      const selected = selectScopeCompletion(operation, state);
      return selected !== null && sameScopeOccurrence(selected.occurrence.id, owner) ? completeDeclaredScope(program, operation, state, (written) => completeScope(operation, written)) : null;
    }
    case SemanticOperationKind.EnterParallelMultiInstanceScope:
    case SemanticOperationKind.CompleteParallelMultiInstanceScope:
      return applyParallelScopeOperation(program, operation.id, state, owner);
    case SemanticOperationKind.AwaitEffect:
    case SemanticOperationKind.AwaitUserTask: {
      if (!unit(operation.input) || !internalOccurrenceReservationStateIsValid(state)) return null;
      // PMIS-DATA-01 binds every sibling even when a human wait has no input mappings.
      if (hasParallelScopeDefinition(program, owner) && (hasSequentialScopeDefinition(program, owner) ||
          evaluateParallelScopeInputs(program, state, owner, []) === null)) return null;
      const human = operation.kind === SemanticOperationKind.AwaitUserTask;
      const activation = nextActivation(human ? state.taskActivations : state.effectActivations,
        human ? operation.task.elementId : operation.effect.elementId);
      if (!Number.isSafeInteger(activation) || activation < 1) return null;
      return human ? createUserTaskWait(program, operation, state, owner) : createEffectWait(program, operation, state, owner);
    }
    case SemanticOperationKind.Duplicate:
      return unit(operation.input) ? duplicate(operation, state, owner) : null;
    case SemanticOperationKind.Synchronize:
      return operation.inputs.length > 0 && new Set(operation.inputs).size === operation.inputs.length &&
        operation.inputs.every(unit) ? synchronize(operation, state, owner) : null;
    case SemanticOperationKind.ReachNoneEnd:
      return unit(operation.input) ? reachNoneEnd(operation, state, owner) : null;
    default:
      return null;
  }
}

export type InternalOccurrenceOffer = Readonly<{
  candidate: InternalOperationOccurrence;
  successor: RuntimeState;
}>;

/** PMIS-SELECT-01 requires complete discovery; an unsupported operation kind refuses the frontier. */
export function deriveInternalOccurrenceFrontier(
  program: SemanticProcessProgram, state: RuntimeState,
  evaluate = applyInternalOperationOccurrence,
): readonly InternalOccurrenceOffer[] | null {
  const offers: InternalOccurrenceOffer[] = [];
  for (const operation of [...program.operations].sort((left, right) => compareCanonicalStrings(left.id, right.id))) {
    switch (operation.kind) {
      case SemanticOperationKind.Initiate:
      case SemanticOperationKind.CompleteScope:
      case SemanticOperationKind.EnterParallelMultiInstanceScope:
      case SemanticOperationKind.CompleteParallelMultiInstanceScope:
      case SemanticOperationKind.AwaitEffect:
      case SemanticOperationKind.AwaitUserTask:
      case SemanticOperationKind.Duplicate:
      case SemanticOperationKind.Synchronize:
      case SemanticOperationKind.ReachNoneEnd: {
        const candidates = internalOperationOccurrences(program, state, operation.id);
        if (candidates === null) return null;
        for (const candidate of candidates) {
          const successor = evaluate(program, state, candidate);
          // PMIS-SELECT-01 requires complete discovery: failed arming cannot erase an enabled wait.
          if (successor === null &&
              (operation.kind === SemanticOperationKind.AwaitUserTask || operation.kind === SemanticOperationKind.AwaitEffect) &&
              ownedTokenMultiplicity(state.controlTokens, operation.input, candidate.owner) > 0) return null;
          if (successor !== null) offers.push({ candidate, successor });
        }
        break;
      }
      default: return null;
    }
  }
  return offers;
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

export function internalOccurrenceKey(id: { processInstanceId: string; elementId: string; activation: number }): string {
  return JSON.stringify([id.processInstanceId, id.elementId, id.activation]);
}

function uniqueExistingAnchors(state: RuntimeState): boolean {
  const waits = [...state.userTaskWaits, ...state.messageWaits, ...state.timerWaits, ...state.effectWaits,
    ...state.effectIncidents.map(({ wait }) => wait), ...(state.compensationHandlerEffectWaits ?? [])];
  const frames = state.variables.activities.map(({ owner }) => JSON.stringify([owner.kind, internalOccurrenceKey(owner.kind === LocalDataOwnerKind.EffectOccurrence
    ? owner.id : { ...owner.id, elementId: owner.id.activityElementId })]));
  return new Set(waits.map(wait => internalOccurrenceKey(wait.id))).size === waits.length && new Set(frames).size === frames.length;
}
