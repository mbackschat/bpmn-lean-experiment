/**
 * Executable control-flow token transitions that own no wait, occurrence, or scope lifecycle.
 *
 * Every operation here moves control tokens within one scope occurrence and touches nothing else,
 * apart from the completed-End counter and the read-only Process bindings a conditional choice needs.
 * That is the boundary: an operation that creates, cancels, or observes a wait belongs to its own
 * family module, and the dispatcher composes both.
 */
import type { VariableBinding } from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  BpmnSequenceFlowOrigin,
  SemanticOperation,
} from "./semantic-process-contract.js";
import { evaluateSimpleBooleanExpressionWithRead } from "./simple-boolean-expression.js";
import {
  addToken,
  ControlStateKind,
  ownedTokenMultiplicity,
  removeToken,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
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
): RuntimeState | null {
  const selected = selectNoneEnd(operation, state, owner);
  if (selected === null) {
    return null;
  }
  return {
    ...state,
    controlTokens: removeToken(
      state.controlTokens,
      operation.input,
      selected.occurrence.id,
    ),
    endOccurrences: state.endOccurrences + 1,
  };
}

export type SelectedNoneEnd = Readonly<{
  occurrence: RuntimeScopeOccurrence;
}>;

/** Selects one exact ordinary End offer without consuming it or incrementing the End count. */
export function selectNoneEnd(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.ReachNoneEnd }
  >,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): SelectedNoneEnd | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    ownedTokenMultiplicity(state.controlTokens, operation.input, owner) !== 1
  ) {
    return null;
  }
  const occurrences = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, owner)
  );
  const occurrence = occurrences[0];
  return occurrences.length === 1 && occurrence !== undefined
    ? { occurrence }
    : null;
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
  const selected = selectConditionalBranch(
    operation,
    state.variables.process.bindings,
  );
  return {
    ...state,
    controlTokens: addToken(
      removeToken(state.controlTokens, operation.input, owner),
      selected.output,
      owner,
    ),
  };
}

export type SelectedConditionalBranch = Readonly<{
  output: string;
  origin: BpmnSequenceFlowOrigin;
  readVariables: ReadonlyArray<string>;
}>;

/** Selects the first true branch and retains only the evaluated condition prefix. */
export function selectConditionalBranch(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Choose }
  >,
  bindings: ReadonlyArray<VariableBinding>,
): SelectedConditionalBranch {
  const readVariables: string[] = [];
  for (const candidate of operation.candidates) {
    const evaluated = evaluateSimpleBooleanExpressionWithRead(
      candidate.condition,
      bindings,
    );
    addReadVariable(readVariables, evaluated.readVariable);
    if (evaluated.value) {
      return {
        output: candidate.output,
        origin: candidate.origin,
        readVariables,
      };
    }
  }
  return {
    output: operation.defaultOutput,
    origin: operation.defaultOrigin,
    readVariables,
  };
}

function addReadVariable(
  readVariables: string[],
  name: string | null,
): void {
  if (name !== null && !readVariables.includes(name)) {
    readVariables.push(name);
  }
}
