/**
 * Executable control-flow token transitions that own no wait, occurrence, or scope lifecycle.
 *
 * Every operation here moves control tokens within one scope occurrence and touches nothing else,
 * apart from the completed-End counter and the read-only Process bindings a conditional choice needs.
 * That is the boundary: an operation that creates, cancels, or observes a wait belongs to its own
 * family module, and the dispatcher composes both.
 */
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import { evaluateSimpleBooleanExpression } from "./simple-boolean-expression.js";
import {
  addToken,
  removeToken,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export function reachNoneEnd(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.ReachNoneEnd }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    endOccurrences: state.endOccurrences + 1,
  };
}

export function duplicate(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Duplicate }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  return {
    ...state,
    controlTokens: operation.outputs.reduce(
      (tokens, output) => addToken(tokens, output, owner),
      removeToken(state.controlTokens, operation.input, owner),
    ),
  };
}

export function synchronize(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Synchronize }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  const remaining = operation.inputs.reduce(
    (tokens, input) => removeToken(tokens, input, owner),
    state.controlTokens,
  );
  return {
    ...state,
    controlTokens: addToken(remaining, operation.output, owner),
  };
}

export function choose(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Choose }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState {
  const selected = operation.candidates.find(({ condition }) =>
    evaluateSimpleBooleanExpression(
      condition,
      state.variables.process.bindings,
    )
  );
  return {
    ...state,
    controlTokens: addToken(
      removeToken(state.controlTokens, operation.input, owner),
      selected?.output ?? operation.defaultOutput,
      owner,
    ),
  };
}
