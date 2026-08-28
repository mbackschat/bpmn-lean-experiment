import type { ScopeOccurrenceId } from "./semantic-process-state.js";
import { compareScopeOccurrenceIds } from "./semantic-process-state.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

/** The exact semantic member selected from one complete internal frontier. */
export enum InternalAlternativeKind {
  Operation = "operation",
  MergeInput = "mergeInput",
}

export type InternalOperationAlternative = Readonly<{
  kind: InternalAlternativeKind.Operation;
  operationId: string;
}>;

export type InternalMergeInputAlternative = Readonly<{
  kind: InternalAlternativeKind.MergeInput;
  operationId: string;
  owner: ScopeOccurrenceId;
  inputControlPlace: string;
}>;

export type InternalAlternative =
  | InternalOperationAlternative
  | InternalMergeInputAlternative;

export function internalOperationAlternative(
  operationId: string,
): InternalOperationAlternative {
  return {
    kind: InternalAlternativeKind.Operation,
    operationId,
  };
}

export function internalMergeInputAlternative(
  operationId: string,
  owner: ScopeOccurrenceId,
  inputControlPlace: string,
): InternalMergeInputAlternative {
  return {
    kind: InternalAlternativeKind.MergeInput,
    operationId,
    owner,
    inputControlPlace,
  };
}

/**
 * Canonical order is discriminator first, then operation identity and the complete merge-input key.
 * It deliberately does not inherit enum spelling or collection order.
 */
export function compareInternalAlternatives(
  left: InternalAlternative,
  right: InternalAlternative,
): number {
  const kindOrder = alternativeKindRank(left.kind) -
    alternativeKindRank(right.kind);
  if (kindOrder !== 0) {
    return kindOrder;
  }
  const operationOrder = compareCanonicalStrings(
    left.operationId,
    right.operationId,
  );
  if (operationOrder !== 0) {
    return operationOrder;
  }
  if (
    left.kind === InternalAlternativeKind.Operation ||
    right.kind === InternalAlternativeKind.Operation
  ) {
    return 0;
  }
  const ownerOrder = compareScopeOccurrenceIds(left.owner, right.owner);
  return ownerOrder !== 0
    ? ownerOrder
    : compareCanonicalStrings(
      left.inputControlPlace,
      right.inputControlPlace,
    );
}

/** Sorts exact alternatives and refuses malformed or duplicate semantic keys. */
export function canonicalUniqueInternalAlternatives(
  alternatives: ReadonlyArray<InternalAlternative>,
): ReadonlyArray<InternalAlternative> | null {
  if (!alternatives.every(internalAlternativeIsWellFormed)) {
    return null;
  }
  const sorted = [...alternatives].sort(compareInternalAlternatives);
  return sorted.some((alternative, index) =>
      index > 0 &&
      compareInternalAlternatives(sorted[index - 1]!, alternative) === 0
    )
    ? null
    : sorted;
}

function internalAlternativeIsWellFormed(
  alternative: InternalAlternative,
): boolean {
  if (
    !isWellFormedWireString(alternative.operationId) ||
    alternative.operationId.length === 0
  ) {
    return false;
  }
  switch (alternative.kind) {
    case InternalAlternativeKind.Operation:
      return true;
    case InternalAlternativeKind.MergeInput:
      return isWellFormedWireString(alternative.owner.processInstanceId) &&
        alternative.owner.processInstanceId.length > 0 &&
        isWellFormedWireString(alternative.owner.definitionScopeId) &&
        alternative.owner.definitionScopeId.length > 0 &&
        Number.isSafeInteger(alternative.owner.activation) &&
        alternative.owner.activation > 0 &&
        isWellFormedWireString(alternative.inputControlPlace) &&
        alternative.inputControlPlace.length > 0;
    default:
      return assertNever(alternative);
  }
}

function alternativeKindRank(kind: InternalAlternativeKind): number {
  switch (kind) {
    case InternalAlternativeKind.Operation:
      return 0;
    case InternalAlternativeKind.MergeInput:
      return 1;
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled internal alternative: ${JSON.stringify(value)}`);
}
