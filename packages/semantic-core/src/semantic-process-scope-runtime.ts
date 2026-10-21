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
 * The two must not drift on child issuance: bounded arming stores this exact child identity beside
 * its deadline in one Activity occurrence record, so a separately written entry would make the
 * applied state disagree with the record selected from the pre-state.
 */
export function enterChildScope(
  state: RuntimeState,
  parent: ScopeOccurrenceId,
  entry: ChildScopeEntry,
): RuntimeState | null {
  const issued = issueChildScope(state, parent, entry);
  return issued === null ? null : { ...issued,
    controlTokens: removeToken(issued.controlTokens, entry.input, parent) };
}

/**
 * CEA-OCCUR-01: enters a merge target's child even while other occurrences of its definition are live. The fresh
 * activation exceeds every issued one, so it never reuses a live identity; equal to {@link enterChildScope} whenever no
 * occurrence of the definition is live.
 */
export function enterConcurrentChildScope(
  state: RuntimeState,
  parent: ScopeOccurrenceId,
  entry: ChildScopeEntry,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) return null;
  // Without the arriving token, removeToken would consume nothing while the child is still issued.
  if (!tokenOwners(state.controlTokens, entry.input).some((owner) => sameScopeOccurrence(owner, parent))) return null;
  const issued = insertChildScope(state, parent, entry, freshChildScope(state, parent, entry.childScopeId));
  return { ...issued, controlTokens: removeToken(issued.controlTokens, entry.input, parent) };
}

/** SMIS-END-01 reuses fresh scope issuance on turnover without consuming another parent token. */
export function issueChildScope(state: RuntimeState, parent: ScopeOccurrenceId,
  entry: Pick<ChildScopeEntry, "childEntry" | "childScopeId">): RuntimeState | null {
  const selected = selectChildScopeEntry(state, parent, entry);
  return selected === null ? null : insertChildScope(state, parent, entry, selected.child);
}

function insertChildScope(state: RuntimeState, parent: ScopeOccurrenceId,
  entry: Pick<ChildScopeEntry, "childEntry" | "childScopeId">, child: ScopeOccurrenceId): RuntimeState {
  return {
    ...state,
    controlTokens: addToken(
      state.controlTokens,
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
      child.activation,
    ),
  };
}

export type SelectedChildScopeEntry = Readonly<{
  child: ScopeOccurrenceId;
}>;

/** Selects the fresh child identity without applying token or scope insertion. */
export function selectChildScopeEntry(
  state: RuntimeState,
  parent: ScopeOccurrenceId,
  entry: Pick<ChildScopeEntry, "childScopeId">,
): SelectedChildScopeEntry | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    state.scopeOccurrences.some(
      ({ id }) => id.definitionScopeId === entry.childScopeId,
    )
  ) {
    return null;
  }
  return { child: freshChildScope(state, parent, entry.childScopeId) };
}

function freshChildScope(state: RuntimeState, parent: ScopeOccurrenceId, childScopeId: string): ScopeOccurrenceId {
  const activation =
    (state.scopeActivations.find(
      ({ elementId }) => elementId === childScopeId,
    )?.count ?? 0) + 1;
  return {
    processInstanceId: parent.processInstanceId,
    definitionScopeId: childScopeId,
    activation,
  };
}

export function completeScope(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.CompleteScope }
  >,
  state: RuntimeState,
): RuntimeState | null {
  const selected = selectScopeCompletion(operation, state);
  return selected === null ? null : applyScopeCompletion(state, selected);
}

/** CEA-QUIESCE-01: completes the named occurrence when it is quiescent, whatever other occurrences of its definition live. */
export function completeScopeOccurrence(
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.CompleteScope }>,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const occurrence = state.scopeOccurrences.find(({ id }) => sameScopeOccurrence(id, owner));
  const selected = occurrence === undefined || occurrence.id.definitionScopeId !== operation.scopeId ? null
    : selectQuiescentScopeCompletion(operation, state, occurrence);
  return selected === null ? null : applyScopeCompletion(state, selected);
}

function applyScopeCompletion(state: RuntimeState, selected: SelectedScopeCompletion): RuntimeState {
  switch (selected.kind) {
    case ScopeCompletionSelectionKind.Root:
      return {
        ...state,
        control: {
          kind: ControlStateKind.Completed,
          instanceId: selected.instanceId,
        },
        scopeOccurrences: [],
        variables: { ...state.variables, scopes: [] },
        ...(state.eventSubProcessMessageSubscriptions === undefined ? {} : {
          eventSubProcessMessageSubscriptions: state.eventSubProcessMessageSubscriptions.filter(
            ({ owner }) => !sameScopeOccurrence(owner, selected.occurrence.id),
          ),
        }),
        ...(state.compensationActivityRetentions === undefined
          ? {}
          : {
              compensationActivityRetentions:
                state.compensationActivityRetentions.filter(
                  ({ owner }) => !sameScopeOccurrence(owner, selected.occurrence.id),
                ),
            }),
      };
    case ScopeCompletionSelectionKind.Child:
      return {
        ...state,
        ...(state.eventSubProcessMessageSubscriptions === undefined ? {} : {
          eventSubProcessMessageSubscriptions: state.eventSubProcessMessageSubscriptions.filter(
            ({ owner }) => !sameScopeOccurrence(owner, selected.occurrence.id),
          ),
        }),
        controlTokens: addToken(
          state.controlTokens,
          selected.parentOutput,
          selected.parent,
        ),
        variables: { ...state.variables, scopes: state.variables.scopes.filter(
          ({ owner }) => !sameScopeOccurrence(owner, selected.occurrence.id),
        ) },
        scopeOccurrences: state.scopeOccurrences.filter(
          (candidate) => candidate !== selected.occurrence,
        ),
      };
  }
}

export enum ScopeCompletionSelectionKind {
  Root = "root",
  Child = "child",
}

export type SelectedScopeCompletion = Readonly<
  | {
      kind: ScopeCompletionSelectionKind.Root;
      instanceId: string;
      occurrence: RuntimeScopeOccurrence;
      parent: null;
    }
  | {
      kind: ScopeCompletionSelectionKind.Child;
      instanceId: string;
      occurrence: RuntimeScopeOccurrence;
      parent: ScopeOccurrenceId;
      parentOutput: string;
    }
>;

/** Selects the exact quiescent occurrence and continuation facts without applying completion. */
export function selectScopeCompletion(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.CompleteScope }
  >,
  state: RuntimeState,
): SelectedScopeCompletion | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const occurrences = state.scopeOccurrences.filter(
    ({ id }) => id.definitionScopeId === operation.scopeId,
  );
  const occurrence = occurrences[0];
  return occurrences.length === 1 && occurrence !== undefined
    ? selectQuiescentScopeCompletion(operation, state, occurrence) : null;
}

/** The completion facts of one already-selected occurrence; shared by definition- and occurrence-addressed completion. */
function selectQuiescentScopeCompletion(
  operation: Extract<SemanticOperation, { kind: SemanticOperationKind.CompleteScope }>,
  state: RuntimeState,
  occurrence: RuntimeScopeOccurrence,
): SelectedScopeCompletion | null {
  if (state.control.kind !== ControlStateKind.Running || !isScopeOccurrenceQuiescent(state, occurrence)) {
    return null;
  }
  if (occurrence.parent === null) {
    return operation.parentOutput === null && !state.initiationPending
      ? {
          kind: ScopeCompletionSelectionKind.Root,
          instanceId: state.control.instanceId,
          occurrence,
          parent: null,
        }
      : null;
  }
  const parent = occurrence.parent;
  return operation.parentOutput !== null &&
      state.scopeOccurrences.some(({ id }) => sameScopeOccurrence(id, parent))
    ? {
        kind: ScopeCompletionSelectionKind.Child,
        instanceId: state.control.instanceId,
        occurrence,
        parent,
        parentOutput: operation.parentOutput,
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
    !(state.compensationTriggers ?? []).some((trigger) =>
      trigger.lifecycle === "active" && owned(trigger.owner)
    ) &&
    !state.scopeOccurrences.some(({ parent }) =>
      parent !== null && owned(parent)
    );
}
