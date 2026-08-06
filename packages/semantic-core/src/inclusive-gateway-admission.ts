/** Standalone contract and pairing admission for selected-branch synchronization. */
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import {
  isSequenceFlowOrigin,
  isWellFormedSimpleBooleanExpression,
} from "./simple-boolean-choice-admission.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

export function isWellFormedSelectManyOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): boolean {
  if (
    !hasOnlyKeys(value, ["id", "kind", "origin", "input", "candidates", "defaultBranch", "selectionKey"]) ||
    !isPlaceReference(value.input, placeIds) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length !== 2 ||
    !isNonEmptyString(value.selectionKey) ||
    !isWellFormedDefaultBranch(value.defaultBranch, placeIds, placeOrigins)
  ) {
    return false;
  }
  const candidates = value.candidates;
  if (!candidates.every((candidate) => isWellFormedCandidate(candidate, placeIds, placeOrigins))) {
    return false;
  }
  const candidateRecords = candidates.filter(isRecord);
  const outputs = [
    ...candidateRecords.map(({ output }) => output),
    isRecord(value.defaultBranch) ? value.defaultBranch.output : undefined,
  ];
  const expectedInputs = [
    ...candidateRecords.map(({ expectedJoinInput }) => expectedJoinInput),
    isRecord(value.defaultBranch) ? value.defaultBranch.expectedJoinInput : undefined,
  ];
  const origins = candidateRecords.map(({ origin }) =>
    isRecord(origin) ? origin.elementId : undefined
  );
  return new Set(outputs).size === 3 &&
    new Set(expectedInputs).size === 3 &&
    origins.every(
      (origin, index) =>
        typeof origin === "string" &&
        (index === 0 || compareCanonicalStrings(String(origins[index - 1]), origin) < 0),
    );
}

export function isWellFormedSynchronizeSelectedOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
): boolean {
  return hasOnlyKeys(value, ["id", "kind", "origin", "inputs", "output", "selectionKey"]) &&
    isExactSortedPlaceTuple(value.inputs, placeIds, 3) &&
    isPlaceReference(value.output, placeIds) &&
    isNonEmptyString(value.selectionKey);
}

export function inclusiveOperationsArePaired(
  operations: ReadonlyArray<SemanticOperation>,
): boolean {
  const selections = operations.filter(
    (operation): operation is Extract<SemanticOperation, { kind: SemanticOperationKind.SelectMany }> =>
      operation.kind === SemanticOperationKind.SelectMany,
  );
  const joins = operations.filter(
    (operation): operation is Extract<SemanticOperation, { kind: SemanticOperationKind.SynchronizeSelected }> =>
      operation.kind === SemanticOperationKind.SynchronizeSelected,
  );
  if (selections.length === 0 && joins.length === 0) {
    return true;
  }
  if (selections.length !== joins.length) {
    return false;
  }
  return selections.every((selection) => {
    const matching = joins.filter(({ selectionKey }) => selectionKey === selection.selectionKey);
    if (matching.length !== 1 || matching[0] === undefined) {
      return false;
    }
    const expectedInputs = [
      ...selection.candidates.map(({ expectedJoinInput }) => expectedJoinInput),
      selection.defaultBranch.expectedJoinInput,
    ].sort(compareCanonicalStrings);
    return expectedInputs.every((input, index) => matching[0]?.inputs[index] === input);
  }) && joins.every(({ selectionKey }) =>
    selections.filter((selection) => selection.selectionKey === selectionKey).length === 1
  );
}

function isWellFormedCandidate(
  value: unknown,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["condition", "output", "expectedJoinInput", "origin"]) &&
    isWellFormedSimpleBooleanExpression(value.condition) &&
    isPlaceReference(value.output, placeIds) &&
    isPlaceReference(value.expectedJoinInput, placeIds) &&
    isSequenceFlowOrigin(value.origin) &&
    placeOrigins.get(value.output) === value.origin.elementId;
}

function isWellFormedDefaultBranch(
  value: unknown,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["output", "expectedJoinInput", "origin"]) &&
    isPlaceReference(value.output, placeIds) &&
    isPlaceReference(value.expectedJoinInput, placeIds) &&
    isSequenceFlowOrigin(value.origin) &&
    placeOrigins.get(value.output) === value.origin.elementId;
}

function isExactSortedPlaceTuple(
  value: unknown,
  placeIds: ReadonlySet<string>,
  length: number,
): boolean {
  return Array.isArray(value) &&
    value.length === length &&
    value.every(
      (item, index) =>
        isPlaceReference(item, placeIds) &&
        (index === 0 || compareCanonicalStrings(String(value[index - 1]), item) < 0),
    );
}

function isPlaceReference(value: unknown, placeIds: ReadonlySet<string>): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).length === allowed.size && Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
