import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import {
  removeScopeOccurrenceSubtree,
} from "./semantic-process-scope-cancellation.js";
import {
  addToken,
  ControlStateKind,
  ownedTokenMultiplicity,
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
  const selected = selectErrorPropagation(operation, state, throwingOwner);
  if (selected === null) {
    return null;
  }
  const cancelled = removeScopeOccurrenceSubtree(state, selected.attached);
  return {
    ...cancelled,
    controlTokens: addToken(
      cancelled.controlTokens,
      operation.handler.output,
      selected.parent,
    ),
  };
}

export type SelectedErrorPropagation = Readonly<{
  attached: RuntimeScopeOccurrence;
  parent: ScopeOccurrenceId;
}>;

/** Selects one exact directly handled Error region without applying interruption. */
export function selectErrorPropagation(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.ThrowError }
  >,
  state: RuntimeState,
  throwingOwner: ScopeOccurrenceId,
): SelectedErrorPropagation | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    throwingOwner.definitionScopeId !== operation.handler.attachedScopeId ||
    operation.error.code !== operation.handler.code ||
    operation.error.errorElementId !==
      operation.handler.origin.errorElementId ||
    ownedTokenMultiplicity(
      state.controlTokens,
      operation.input,
      throwingOwner,
    ) !== 1
  ) {
    return null;
  }
  const attachedOccurrences = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, throwingOwner)
  );
  const attached = attachedOccurrences[0];
  const parent = attached?.parent;
  if (
    attachedOccurrences.length !== 1 ||
    attached === undefined ||
    parent === undefined ||
    parent === null ||
    state.scopeOccurrences.filter(({ id }) =>
      sameScopeOccurrence(id, parent)
    ).length !== 1
  ) {
    return null;
  }
  return { attached, parent };
}
