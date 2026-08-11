import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import {
  removeScopeOccurrenceContents,
} from "./semantic-process-scope-cancellation.js";
import {
  ControlStateKind,
  ownedTokenMultiplicity,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

/** Clears one exact live containing-scope occurrence and retains it quiescent for completion. */
export function terminateScope(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.TerminateScope }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    owner.processInstanceId !== state.control.instanceId ||
    owner.definitionScopeId !== operation.scopeId ||
    ownedTokenMultiplicity(state.controlTokens, operation.input, owner) !== 1
  ) {
    return null;
  }
  const selected = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, owner)
  );
  const occurrence = selected[0];
  if (selected.length !== 1 || occurrence === undefined) {
    return null;
  }

  const terminated = removeScopeOccurrenceContents(state, occurrence);
  return {
    ...terminated,
    endOccurrences: state.endOccurrences + 1,
  };
}
