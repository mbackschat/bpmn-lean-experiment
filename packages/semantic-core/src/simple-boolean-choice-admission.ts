/**
 * Exact program admission for the first Simple Boolean conditional-choice
 * execution surface.
 */
import {
  SemanticOperationKind,
  SemanticOriginKind,
  SimpleBooleanExpressionKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
} from "./semantic-process-contract.js";
import {
  isWellFormedWireString,
  utf8ByteLength,
} from "./wire.js";

export function isWellFormedChooseOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): boolean {
  if (
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "candidates",
      "defaultOutput",
      "defaultOrigin",
    ]) ||
    !isPlaceReference(value.input, placeIds) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length !== 2 ||
    !isPlaceReference(value.defaultOutput, placeIds) ||
    !isSequenceFlowOrigin(value.defaultOrigin) ||
    placeOrigins.get(value.defaultOutput) !==
      value.defaultOrigin.elementId
  ) {
    return false;
  }
  const candidates = value.candidates;
  if (
    !candidates.every((candidate) =>
      isWellFormedConditionalCandidate(
        candidate,
        placeIds,
        placeOrigins,
      )
    )
  ) {
    return false;
  }
  const candidateOutputs = candidates.map((candidate) =>
    isRecord(candidate) ? candidate.output : undefined
  );
  return (
    new Set(candidateOutputs).size === 2 &&
    !candidateOutputs.includes(value.defaultOutput)
  );
}

function isWellFormedConditionalCandidate(
  value: unknown,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["condition", "origin", "output"]) &&
    isWellFormedSimpleBooleanExpression(value.condition) &&
    isPlaceReference(value.output, placeIds) &&
    isSequenceFlowOrigin(value.origin) &&
    placeOrigins.get(value.output) === value.origin.elementId
  );
}

function isWellFormedSimpleBooleanExpression(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.kind) {
    case SimpleBooleanExpressionKind.Literal:
      return (
        hasOnlyKeys(value, ["kind", "value"]) &&
        typeof value.value === "boolean"
      );
    case SimpleBooleanExpressionKind.IsPresent:
    case SimpleBooleanExpressionKind.IsNull:
      return (
        hasOnlyKeys(value, ["kind", "variable"]) &&
        isSimpleBooleanVariableName(value.variable)
      );
    case SimpleBooleanExpressionKind.StringEquals:
      return (
        hasOnlyKeys(value, ["kind", "value", "variable"]) &&
        isSimpleBooleanVariableName(value.variable) &&
        isWellFormedWireString(value.value) &&
        utf8ByteLength(value.value) <= 128
      );
    default:
      return false;
  }
}

function isSimpleBooleanVariableName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u.test(value)
  );
}

function isSequenceFlowOrigin(
  value: unknown,
): value is Readonly<{ elementId: string }> {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["kind", "elementId"]) &&
    value.kind === SemanticOriginKind.BpmnSequenceFlow &&
    isNonEmptyString(value.elementId)
  );
}

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return (
    Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
