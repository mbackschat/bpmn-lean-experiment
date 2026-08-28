import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import {
  internalOperationAlternative,
} from "./internal-transition-alternative.js";
import type {
  InternalOperationAlternative,
} from "./internal-transition-alternative.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type { InternalTransitionStateFootprint } from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  commonTokenOwner,
  onlyTokenOwner,
} from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export type PreparedInternalLocalControl = Readonly<{
  alternative: InternalOperationAlternative;
  owner: ScopeOccurrenceId;
  branchResult: null;
  footprint: InternalTransitionStateFootprint;
}>;

/** Derives the exact Parallel Gateway fork preparation without applying token movement. */
export function deriveInternalDuplicatePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Duplicate }
  >,
): PreparedInternalLocalControl | null {
  const owner = onlyTokenOwner(state, operation.input);
  return owner === undefined
    ? null
    : prepareTokenTransformation(
      program,
      state,
      operation,
      owner,
      [operation.input],
      operation.outputs,
    );
}

/** Derives the exact Parallel Gateway join preparation without applying token movement. */
export function deriveInternalSynchronizePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Synchronize }
  >,
): PreparedInternalLocalControl | null {
  const owner = commonTokenOwner(state, operation.inputs);
  return owner === undefined
    ? null
    : prepareTokenTransformation(
      program,
      state,
      operation,
      owner,
      operation.inputs,
      [operation.output],
    );
}

function prepareTokenTransformation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    {
      kind:
        | SemanticOperationKind.Duplicate
        | SemanticOperationKind.Synchronize;
    }
  >,
  owner: ScopeOccurrenceId,
  inputs: ReadonlyArray<string>,
  outputs: ReadonlyArray<string>,
): PreparedInternalLocalControl | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null ||
    !affectedTokenBucketsAreExact(state, owner, inputs, outputs)
  ) {
    return null;
  }
  const tokens = [...inputs, ...outputs].map((placeId) => ({
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId,
  }) as const);
  const reads = canonicalUniqueStateAtoms([
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    ...tokens,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
  ]);
  const writes = canonicalUniqueStateAtoms(tokens);
  return reads === null || writes === null
    ? null
    : {
      alternative: internalOperationAlternative(operation.id),
      owner,
      branchResult: null,
      footprint: { reads, writes },
    };
}

function affectedTokenBucketsAreExact(
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  inputs: ReadonlyArray<string>,
  outputs: ReadonlyArray<string>,
): boolean {
  return inputs.every((placeId) =>
    tokenBucketCountIsExact(state, owner, placeId, true)
  ) && outputs.every((placeId) =>
    tokenBucketCountIsExact(state, owner, placeId, false)
  );
}

function tokenBucketCountIsExact(
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  placeId: string,
  required: boolean,
): boolean {
  const matches = state.controlTokens.filter((token) =>
    token.placeId === placeId && sameScopeOccurrence(token.owner, owner)
  );
  return (required ? matches.length === 1 : matches.length <= 1) &&
    matches.every(({ multiplicity }) =>
      Number.isSafeInteger(multiplicity) && multiplicity > 0
    );
}
