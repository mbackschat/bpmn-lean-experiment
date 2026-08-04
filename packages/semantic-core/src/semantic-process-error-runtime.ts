import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
} from "./semantic-process-contract.js";
import {
  removeScopeOccurrenceSubtree,
} from "./semantic-process-scope-cancellation.js";
import {
  addToken,
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
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

  const cancelled = removeScopeOccurrenceSubtree(state, attached);
  return {
    ...cancelled,
    controlTokens: addToken(
      cancelled.controlTokens,
      operation.handler.output,
      parent,
    ),
  };
}
