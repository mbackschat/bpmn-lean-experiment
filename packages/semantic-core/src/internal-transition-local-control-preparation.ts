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
import { selectConditionalBranch } from "./semantic-process-control-flow-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  BpmnSequenceFlowOrigin,
  InclusiveCandidate,
  InclusiveDefaultBranch,
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  selectInclusiveBranches,
  selectSynchronizeSelected,
} from "./semantic-process-inclusive-gateway-runtime.js";
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
  SelectedBranchSet,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export enum InternalLocalControlBranchResultKind {
  ExclusiveChoice = "exclusiveChoice",
  InclusiveSelection = "inclusiveSelection",
  SelectedJoin = "selectedJoin",
}

export type InternalLocalControlBranchResult = Readonly<
  | {
      kind: InternalLocalControlBranchResultKind.ExclusiveChoice;
      output: string;
      origin: BpmnSequenceFlowOrigin;
    }
  | {
      kind: InternalLocalControlBranchResultKind.InclusiveSelection;
      selected: ReadonlyArray<InclusiveCandidate | InclusiveDefaultBranch>;
    }
  | {
      kind: InternalLocalControlBranchResultKind.SelectedJoin;
      record: SelectedBranchSet;
    }
>;

export type PreparedInternalLocalControl = Readonly<{
  alternative: InternalOperationAlternative;
  owner: ScopeOccurrenceId;
  branchResult: InternalLocalControlBranchResult | null;
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
      null,
      [],
      [],
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
      null,
      [],
      [],
    );
}

/** Derives the exact Exclusive Gateway branch and its evaluated variable prefix. */
export function deriveInternalChoosePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.Choose }
  >,
): PreparedInternalLocalControl | null {
  const owner = onlyTokenOwner(state, operation.input);
  if (owner === undefined) {
    return null;
  }
  const selected = selectConditionalBranch(
    operation,
    state.variables.process.bindings,
  );
  return prepareTokenTransformation(
    program,
    state,
    operation,
    owner,
    [operation.input],
    [selected.output],
    {
      kind: InternalLocalControlBranchResultKind.ExclusiveChoice,
      output: selected.output,
      origin: selected.origin,
    },
    selected.readVariables.map((name) => ({
      kind: InternalTransitionStateAtomKind.ProcessVariable,
      name,
    })),
    [],
  );
}

/** Derives every selected Inclusive branch and the hidden branch-set write. */
export function deriveInternalSelectManyPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.SelectMany }
  >,
): PreparedInternalLocalControl | null {
  const owner = onlyTokenOwner(state, operation.input);
  if (
    owner === undefined ||
    state.selectedBranchSets.some((record) =>
      record.selectionKey === operation.selectionKey &&
      sameScopeOccurrence(record.owner, owner)
    )
  ) {
    return null;
  }
  const selected = selectInclusiveBranches(
    operation,
    state.variables.process.bindings,
  );
  if (selected === null) {
    return null;
  }
  const selectedBranch = {
    kind: InternalTransitionStateAtomKind.SelectedBranch,
    owner,
    selectionKey: operation.selectionKey,
  } as const;
  return prepareTokenTransformation(
    program,
    state,
    operation,
    owner,
    [operation.input],
    selected.selected.map(({ output }) => output),
    {
      kind: InternalLocalControlBranchResultKind.InclusiveSelection,
      selected: selected.selected,
    },
    [
      ...selected.readVariables.map((name) => ({
        kind: InternalTransitionStateAtomKind.ProcessVariable,
        name,
      }) as const),
      selectedBranch,
    ],
    [selectedBranch],
  );
}

/** Derives the exact ready Inclusive branch set without consuming it. */
export function deriveInternalSynchronizeSelectedPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.SynchronizeSelected }
  >,
): PreparedInternalLocalControl | null {
  const record = selectSynchronizeSelected(operation, state);
  if (record === null) {
    return null;
  }
  const selectedBranch = {
    kind: InternalTransitionStateAtomKind.SelectedBranch,
    owner: record.owner,
    selectionKey: operation.selectionKey,
  } as const;
  return prepareTokenTransformation(
    program,
    state,
    operation,
    record.owner,
    record.expectedInputs,
    [operation.output],
    {
      kind: InternalLocalControlBranchResultKind.SelectedJoin,
      record,
    },
    [selectedBranch],
    [selectedBranch],
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
        | SemanticOperationKind.Synchronize
        | SemanticOperationKind.Choose
        | SemanticOperationKind.SelectMany
        | SemanticOperationKind.SynchronizeSelected;
    }
  >,
  owner: ScopeOccurrenceId,
  inputs: ReadonlyArray<string>,
  outputs: ReadonlyArray<string>,
  branchResult: InternalLocalControlBranchResult | null,
  extraReads: InternalTransitionStateFootprint["reads"],
  extraWrites: InternalTransitionStateFootprint["writes"],
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
    ...extraReads,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
  ]);
  const writes = canonicalUniqueStateAtoms([...tokens, ...extraWrites]);
  return reads === null || writes === null
    ? null
    : {
      alternative: internalOperationAlternative(operation.id),
      owner,
      branchResult,
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
