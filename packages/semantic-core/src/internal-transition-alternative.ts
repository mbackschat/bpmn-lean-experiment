import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { compareScopeOccurrenceIds, sameScopeOccurrence } from "./semantic-process-state.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

/** The exact semantic member selected from one complete internal frontier. */
export enum InternalAlternativeKind {
  Operation = "operation",
  MergeInput = "mergeInput",
  OperationOccurrence = "operationOccurrence",
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
  | InternalMergeInputAlternative
  | InternalOperationOccurrenceAlternative;

export type InternalOperationOccurrenceAlternative = Readonly<{
  kind: InternalAlternativeKind.OperationOccurrence;
  operationId: string;
  owner: ScopeOccurrenceId;
}>;

export function internalOperationOccurrenceAlternative(
  operationId: string, owner: ScopeOccurrenceId,
): InternalOperationOccurrenceAlternative {
  return { kind: InternalAlternativeKind.OperationOccurrence, operationId, owner };
}

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
 * Canonical order is discriminator, operation, owner and finally the Merge input when present.
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
  if (left.kind === InternalAlternativeKind.OperationOccurrence || right.kind === InternalAlternativeKind.OperationOccurrence)
    return ownerOrder;
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
      return alternativeOwnerIsWellFormed(alternative.owner) &&
        isWellFormedWireString(alternative.inputControlPlace) &&
        alternative.inputControlPlace.length > 0;
    case InternalAlternativeKind.OperationOccurrence:
      return alternativeOwnerIsWellFormed(alternative.owner);
    default:
      return assertNever(alternative);
  }
}

function alternativeOwnerIsWellFormed(owner: ScopeOccurrenceId): boolean {
  return isWellFormedWireString(owner.processInstanceId) && owner.processInstanceId.length > 0 &&
    isWellFormedWireString(owner.definitionScopeId) && owner.definitionScopeId.length > 0 &&
    Number.isSafeInteger(owner.activation) && owner.activation > 0;
}

function alternativeKindRank(kind: InternalAlternativeKind): number {
  switch (kind) {
    case InternalAlternativeKind.Operation:
      return 0;
    case InternalAlternativeKind.MergeInput:
      return 1;
    case InternalAlternativeKind.OperationOccurrence:
      return 2;
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled internal alternative: ${JSON.stringify(value)}`);
}

/** PMIS-SELECT-01 carries definition identity and the complete live occurrence without string encoding. */
export type InternalOperationOccurrence = Readonly<{
  operationId: string;
  owner: ScopeOccurrenceId;
}>;

type OccurrenceProgram = Pick<SemanticProcessProgram, "operations" | "operationScopes">;

/** Enumerates eligible owners, not enabled transitions; token/data readiness remains the evaluator's job. */
export function internalOperationOccurrences(program: OccurrenceProgram, state: RuntimeState,
  operationId: string): readonly InternalOperationOccurrence[] | null {
  if (program.operations.filter(operation => operation.id === operationId).length !== 1) return null;
  const bindings = program.operationScopes.filter(binding => binding.operationId === operationId);
  const binding = bindings[0];
  if (bindings.length !== 1 || binding === undefined) return null;
  const owners = state.scopeOccurrences.map(({ id }) => id)
    .filter(owner => owner.definitionScopeId === binding.scopeId).sort(compareScopeOccurrenceIds);
  if (owners.some((owner, index) => index > 0 && sameScopeOccurrence(owners[index - 1]!, owner))) return null;
  return owners.map(owner => ({ operationId, owner }));
}

/** Re-resolves the complete candidate against current state; a live sibling cannot replace its owner. */
export function resolveInternalOperationOccurrence(program: OccurrenceProgram, state: RuntimeState,
  candidate: InternalOperationOccurrence): SemanticOperation | null {
  const candidates = internalOperationOccurrences(program, state, candidate.operationId);
  return candidates?.some(({ owner }) => sameScopeOccurrence(owner, candidate.owner)) === true
    ? program.operations.find(operation => operation.id === candidate.operationId)! : null;
}
