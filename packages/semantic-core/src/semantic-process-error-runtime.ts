import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
} from "./semantic-process-contract.js";
import {
  addToken,
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

/** Atomically catches one exact Error and removes all live owners in its attached scope subtree. */
export function throwError(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.ThrowError }
  >,
  state: RuntimeState,
  throwingOwner: ScopeOccurrenceId,
): RuntimeState | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    throwingOwner.definitionScopeId !== operation.handler.attachedScopeId ||
    operation.error.code !== operation.handler.code ||
    operation.error.errorElementId !==
      operation.handler.origin.errorElementId
  ) {
    return null;
  }
  const attached = state.scopeOccurrences.find(({ id }) =>
    sameScopeOccurrence(id, throwingOwner)
  );
  const parent = attached?.parent;
  if (
    attached === undefined ||
    parent === undefined ||
    parent === null ||
    !state.scopeOccurrences.some(({ id }) => sameScopeOccurrence(id, parent))
  ) {
    return null;
  }

  const interrupted = interruptedOccurrences(state.scopeOccurrences, attached);
  const isInterrupted = (owner: ScopeOccurrenceId): boolean =>
    interrupted.some(({ id }) => sameScopeOccurrence(id, owner));
  const interruptedEffects = state.effectWaits
    .filter(({ owner }) => isInterrupted(owner))
    .map(({ id }) => id);
  return {
    ...state,
    controlTokens: addToken(
      state.controlTokens.filter(({ owner }) => !isInterrupted(owner)),
      operation.handler.output,
      parent,
    ),
    scopeOccurrences: state.scopeOccurrences.filter(
      ({ id }) => !isInterrupted(id),
    ),
    userTaskWaits: state.userTaskWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    messageWaits: state.messageWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    timerWaits: state.timerWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    effectWaits: state.effectWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    selectedBranchSets: state.selectedBranchSets.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    eventRaces: state.eventRaces.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    variables: {
      ...state.variables,
      activities: state.variables.activities.filter(
        ({ owner }) =>
          !interruptedEffects.some((effectId) => sameOccurrence(owner, effectId)),
      ),
    },
  };
}

function interruptedOccurrences(
  occurrences: ReadonlyArray<RuntimeScopeOccurrence>,
  root: RuntimeScopeOccurrence,
): ReadonlyArray<RuntimeScopeOccurrence> {
  const interrupted = [root];
  for (let index = 0; index < interrupted.length; index += 1) {
    const parent = interrupted[index];
    if (parent === undefined) {
      continue;
    }
    for (const candidate of occurrences) {
      if (
        candidate.parent !== null &&
        sameScopeOccurrence(candidate.parent, parent.id) &&
        !interrupted.some(({ id }) => sameScopeOccurrence(id, candidate.id))
      ) {
        interrupted.push(candidate);
      }
    }
  }
  return interrupted;
}
