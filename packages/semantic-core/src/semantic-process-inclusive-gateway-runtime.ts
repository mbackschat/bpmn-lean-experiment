/** Executable selected-branch split and join operations for structured Inclusive Gateway regions. */
import type {
  SelectManyOperation,
  SynchronizeSelectedOperation,
} from "./semantic-process-contract.js";
import { evaluateSimpleBooleanExpression } from "./simple-boolean-expression.js";
import {
  addToken,
  compareSelectedBranchSets,
  ownedTokenMultiplicity,
  removeToken,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

export function selectMany(
  operation: SelectManyOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  if (state.selectedBranchSets.some((record) =>
    record.selectionKey === operation.selectionKey && sameScopeOccurrence(record.owner, owner)
  )) {
    return null;
  }
  const selectedCandidates = operation.candidates.filter(({ condition }) =>
    evaluateSimpleBooleanExpression(condition, state.variables.process.bindings)
  );
  const selected = selectedCandidates.length === 0
    ? [operation.defaultBranch]
    : selectedCandidates;
  const expectedInputs = selectedExpectedInputs(selected);
  if (expectedInputs === null) {
    return null;
  }
  const withoutInput = removeToken(state.controlTokens, operation.input, owner);
  return {
    ...state,
    controlTokens: selected.reduce(
      (tokens, branch) => addToken(tokens, branch.output, owner),
      withoutInput,
    ),
    selectedBranchSets: [
      ...state.selectedBranchSets,
      { owner, selectionKey: operation.selectionKey, expectedInputs },
    ].sort(compareSelectedBranchSets),
  };
}

function selectedExpectedInputs(
  selected: ReadonlyArray<Readonly<{ expectedJoinInput: string }>>,
): [string] | [string, string] | null {
  const first = selected[0];
  const second = selected[1];
  if (first === undefined || selected.length > 2) {
    return null;
  }
  if (second === undefined) {
    return [first.expectedJoinInput];
  }
  return compareCanonicalStrings(first.expectedJoinInput, second.expectedJoinInput) <= 0
    ? [first.expectedJoinInput, second.expectedJoinInput]
    : [second.expectedJoinInput, first.expectedJoinInput];
}

export function synchronizeSelected(
  operation: SynchronizeSelectedOperation,
  state: RuntimeState,
): RuntimeState | null {
  const ready = state.selectedBranchSets.filter((record) =>
    record.selectionKey === operation.selectionKey &&
    record.expectedInputs.every((input) =>
      ownedTokenMultiplicity(state.controlTokens, input, record.owner) > 0
    )
  );
  const record = ready[0];
  if (ready.length !== 1 || record === undefined) {
    return null;
  }
  const remaining = record.expectedInputs.reduce(
    (tokens, input) => removeToken(tokens, input, record.owner),
    state.controlTokens,
  );
  return {
    ...state,
    controlTokens: addToken(remaining, operation.output, record.owner),
    selectedBranchSets: state.selectedBranchSets.filter((candidate) => candidate !== record),
  };
}
