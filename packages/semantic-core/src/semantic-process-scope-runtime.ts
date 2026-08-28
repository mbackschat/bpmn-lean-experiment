import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import {
  addToken,
  compareScopeOccurrenceIds,
  ControlStateKind,
  removeToken,
  sameScopeOccurrence,
  setActivationCount,
  tokenOwners,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function onlyTokenOwner(
  state: RuntimeState,
  placeId: string,
): ScopeOccurrenceId | undefined {
  const owners = tokenOwners(state.controlTokens, placeId);
  return owners.length === 1 ? owners[0] : undefined;
}

export function commonTokenOwner(
  state: RuntimeState,
  placeIds: ReadonlyArray<string>,
): ScopeOccurrenceId | undefined {
  const owners = placeIds.map((placeId) => onlyTokenOwner(state, placeId));
  const first = owners[0];
  return first !== undefined &&
      owners.every(
        (owner) => owner !== undefined && sameScopeOccurrence(owner, first),
      )
    ? first
    : undefined;
}

export function enterScope(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.EnterScope }
  >,
  state: RuntimeState,
  parent: ScopeOccurrenceId,
): RuntimeState | null {
  return enterChildScope(state, parent, operation);
}

/** The entry an operation names when it consumes a token at a scope-hosting Activity. */
export type ChildScopeEntry = Readonly<{
  input: string;
  childEntry: string;
  childScopeId: string;
}>;

/**
 * Atomically replaces the host Activity's token with a fresh child scope occurrence and its entry
 * token, refusing a second live occurrence of the same definition scope.
 *
 * Shared with the bounded-scope family, which arms a deadline on top of exactly this state change.
 * The two must not drift on activation ordinals: the deadline is paired to the child occurrence by
 * their equal counters, so a separately written entry would silently break that recovery.
 */
export function enterChildScope(
  state: RuntimeState,
  parent: ScopeOccurrenceId,
  entry: ChildScopeEntry,
): RuntimeState | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    state.scopeOccurrences.some(
      ({ id }) => id.definitionScopeId === entry.childScopeId,
    )
  ) {
    return null;
  }
  const activation =
    (state.scopeActivations.find(
      ({ elementId }) => elementId === entry.childScopeId,
    )?.count ?? 0) + 1;
  const child = {
    processInstanceId: state.control.instanceId,
    definitionScopeId: entry.childScopeId,
    activation,
  };
  return {
    ...state,
    controlTokens: addToken(
      removeToken(state.controlTokens, entry.input, parent),
      entry.childEntry,
      child,
    ),
    scopeOccurrences: [
      ...state.scopeOccurrences,
      { id: child, parent },
    ].sort(({ id: left }, { id: right }) =>
      compareScopeOccurrenceIds(left, right)
    ),
    scopeActivations: setActivationCount(
      state.scopeActivations,
      entry.childScopeId,
      activation,
    ),
  };
}

export function completeScope(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.CompleteScope }
  >,
  state: RuntimeState,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const occurrences = state.scopeOccurrences.filter(
    ({ id }) => id.definitionScopeId === operation.scopeId,
  );
  const occurrence = occurrences[0];
  if (
    occurrences.length !== 1 ||
    occurrence === undefined ||
    !isScopeOccurrenceQuiescent(state, occurrence)
  ) {
    return null;
  }
  if (occurrence.parent === null) {
    return operation.parentOutput === null && !state.initiationPending
      ? {
          ...state,
          control: {
            kind: ControlStateKind.Completed,
            instanceId: state.control.instanceId,
          },
          scopeOccurrences: [],
        }
      : null;
  }
  const parent = occurrence.parent;
  return operation.parentOutput !== null &&
      state.scopeOccurrences.some(({ id }) => sameScopeOccurrence(id, parent))
    ? {
        ...state,
        controlTokens: addToken(
          state.controlTokens,
          operation.parentOutput,
          parent,
        ),
        scopeOccurrences: state.scopeOccurrences.filter(
          (candidate) => candidate !== occurrence,
        ),
      }
    : null;
}

export function isScopeOccurrenceQuiescent(
  state: RuntimeState,
  occurrence: RuntimeScopeOccurrence,
): boolean {
  const owned = (owner: ScopeOccurrenceId): boolean =>
    sameScopeOccurrence(owner, occurrence.id);
  return !state.controlTokens.some(({ owner }) => owned(owner)) &&
    !state.userTaskWaits.some(({ owner }) => owned(owner)) &&
    !state.messageWaits.some(({ owner }) => owned(owner)) &&
    !state.timerWaits.some(({ owner }) => owned(owner)) &&
    !state.effectWaits.some(({ owner }) => owned(owner)) &&
    !state.effectIncidents.some(({ wait }) => owned(wait.owner)) &&
    !state.selectedBranchSets.some(({ owner }) => owned(owner)) &&
    !state.eventRaces.some(({ owner }) => owned(owner)) &&
    !state.calledProcessOccurrences.some(({ caller }) => owned(caller)) &&
    !state.scopeOccurrences.some(({ parent }) =>
      parent !== null && owned(parent)
    );
}
