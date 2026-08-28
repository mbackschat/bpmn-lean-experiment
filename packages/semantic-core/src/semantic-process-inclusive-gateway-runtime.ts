/** Executable selected-branch split and join operations for structured Inclusive Gateway regions. */
import type { VariableBinding } from "./contract.js";
import type {
  InclusiveCandidate,
  InclusiveDefaultBranch,
  SelectManyOperation,
  SynchronizeSelectedOperation,
} from "./semantic-process-contract.js";
import { evaluateSimpleBooleanExpressionWithRead } from "./simple-boolean-expression.js";
import {
  addToken,
  compareSelectedBranchSets,
  ownedTokenMultiplicity,
  removeToken,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  SelectedBranchSet,
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
  const selection = selectInclusiveBranches(
    operation,
    state.variables.process.bindings,
  );
  if (selection === null) {
    return null;
  }
  const withoutInput = removeToken(state.controlTokens, operation.input, owner);
  return {
    ...state,
    controlTokens: selection.selected.reduce(
      (tokens, branch) => addToken(tokens, branch.output, owner),
      withoutInput,
    ),
    selectedBranchSets: [
      ...state.selectedBranchSets,
      {
        owner,
        selectionKey: operation.selectionKey,
        expectedInputs: selection.expectedInputs,
      },
    ].sort(compareSelectedBranchSets),
  };
}

export type SelectedInclusiveBranches = Readonly<{
  selected: ReadonlyArray<InclusiveCandidate | InclusiveDefaultBranch>;
  expectedInputs: [string] | [string, string];
  readVariables: ReadonlyArray<string>;
}>;

/** Evaluates every Inclusive candidate and retains its complete deterministic result. */
export function selectInclusiveBranches(
  operation: SelectManyOperation,
  bindings: ReadonlyArray<VariableBinding>,
): SelectedInclusiveBranches | null {
  const readVariables: string[] = [];
  const selectedCandidates = operation.candidates.filter(({ condition }) => {
    const evaluated = evaluateSimpleBooleanExpressionWithRead(
      condition,
      bindings,
    );
    if (
      evaluated.readVariable !== null &&
      !readVariables.includes(evaluated.readVariable)
    ) {
      readVariables.push(evaluated.readVariable);
    }
    return evaluated.value;
  });
  const selected: ReadonlyArray<InclusiveCandidate | InclusiveDefaultBranch> =
    selectedCandidates.length === 0
      ? [operation.defaultBranch]
      : selectedCandidates;
  const expectedInputs = selectedExpectedInputs(selected);
  return expectedInputs === null
    ? null
    : { selected, expectedInputs, readVariables };
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
  const record = selectSynchronizeSelected(operation, state);
  if (record === null) {
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

/** Selects the one exact ready hidden branch record without consuming it. */
export function selectSynchronizeSelected(
  operation: SynchronizeSelectedOperation,
  state: RuntimeState,
): SelectedBranchSet | null {
  const ready = state.selectedBranchSets.filter((record) =>
    record.selectionKey === operation.selectionKey &&
    record.expectedInputs.every((input) =>
      ownedTokenMultiplicity(state.controlTokens, input, record.owner) > 0
    )
  );
  return ready.length === 1 ? ready[0] ?? null : null;
}
