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
import { FlowNodeOccurrenceTerminalKind } from "./flow-node-occurrence-lifecycle.js";
import { InternalPublicationTemplateAnchorKind } from "./internal-publication-template.js";
import type { InternalPublicationTemplate } from "./internal-publication-template.js";
import {
  applyInternalLocalControlPatch,
  deriveInternalLocalControlPositionDelta,
  InternalSelectedBranchPatchKind,
} from "./internal-transition-local-control-patch.js";
import type {
  InternalLocalControlPatch,
  InternalSelectedBranchPatch,
} from "./internal-transition-local-control-patch.js";
import { SemanticTransitionKind } from "./semantic-transition-trace.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { affectedTokenBucketsAreExact, tokenOwnerCensusAtoms } from "./internal-transition-token-preparation.js";
import { selectedBranchOwnerCensusAtom, selectedJoinReadinessAtoms } from "./internal-transition-selected-branch-preparation.js";
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
  ownedTokenMultiplicity,
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
  operation: InternalLocalControlOperation;
  owner: ScopeOccurrenceId;
  branchResult: InternalLocalControlBranchResult | null;
  footprint: InternalTransitionStateFootprint;
  patch: InternalLocalControlPatch;
  publicationTemplate: InternalPublicationTemplate;
}>;

export type InternalLocalControlOperation = Extract<SemanticOperation, {
  kind:
    | SemanticOperationKind.Duplicate
    | SemanticOperationKind.Synchronize
    | SemanticOperationKind.Choose
    | SemanticOperationKind.SelectMany
    | SemanticOperationKind.SynchronizeSelected;
}>;

export function deriveInternalLocalControlPreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: InternalLocalControlOperation,
): PreparedInternalLocalControl | null {
  switch (operation.kind) {
    case SemanticOperationKind.Duplicate:
      return deriveInternalDuplicatePreparation(program, state, operation);
    case SemanticOperationKind.Synchronize:
      return deriveInternalSynchronizePreparation(program, state, operation);
    case SemanticOperationKind.Choose:
      return deriveInternalChoosePreparation(program, state, operation);
    case SemanticOperationKind.SelectMany:
      return deriveInternalSelectManyPreparation(program, state, operation);
    case SemanticOperationKind.SynchronizeSelected:
      return deriveInternalSynchronizeSelectedPreparation(program, state, operation);
  }
}

export function applyPreparedInternalLocalControl(
  program: SemanticProcessProgram,
  state: RuntimeState,
  prepared: PreparedInternalLocalControl,
): RuntimeState | null {
  const current = deriveInternalLocalControlPreparation(program, state, prepared.operation);
  // INTERNAL-COMMUTATION requires the complete branch, patch, and publication frame, not just operation identity.
  if (current === null || JSON.stringify(current) !== JSON.stringify(prepared)) return null;
  return applyInternalLocalControlPatch(state, prepared.patch);
}

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
      [operation.input],
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
      operation.inputs,
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
    [operation.input],
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
    [operation.input],
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
    [selectedBranch, selectedBranchOwnerCensusAtom(operation.selectionKey)],
    {
      kind: InternalSelectedBranchPatchKind.Insert,
      record: { owner, selectionKey: operation.selectionKey, expectedInputs: selected.expectedInputs },
    },
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
  if (state.selectedBranchSets.filter((candidate) =>
    candidate.selectionKey === record.selectionKey && sameScopeOccurrence(candidate.owner, record.owner)
  ).length !== 1) return null;
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
    [],
    {
      kind: InternalLocalControlBranchResultKind.SelectedJoin,
      record,
    },
    selectedJoinReadinessAtoms(state, record, operation.output),
    [selectedBranch, selectedBranchOwnerCensusAtom(operation.selectionKey)],
    { kind: InternalSelectedBranchPatchKind.Remove, record },
  );
}

function prepareTokenTransformation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: InternalLocalControlOperation,
  owner: ScopeOccurrenceId,
  inputs: ReadonlyArray<string>,
  outputs: ReadonlyArray<string>,
  censusReads: ReadonlyArray<string>,
  branchResult: InternalLocalControlBranchResult | null,
  extraReads: InternalTransitionStateFootprint["reads"],
  extraWrites: InternalTransitionStateFootprint["writes"],
  selectedBranch: InternalSelectedBranchPatch = { kind: InternalSelectedBranchPatchKind.Preserve },
): PreparedInternalLocalControl | null {
  const processId = candidateProcessId(program, state, owner);
  if (
    state.control.kind !== ControlStateKind.Running ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    processId === null || operation.origin.elementId.length === 0 ||
    !Number.isSafeInteger(state.logicalTimeMs) || state.logicalTimeMs < 0 ||
    !affectedTokenBucketsAreExact(state, owner, inputs, outputs)
  ) {
    return null;
  }
  if (![...new Set([...inputs, ...outputs])].every((placeId) => {
    const remaining = ownedTokenMultiplicity(state.controlTokens, placeId, owner) -
      inputs.filter((input) => input === placeId).length;
    const produced = remaining + outputs.filter((output) => output === placeId).length;
    return remaining >= 0 && Number.isSafeInteger(produced) && produced >= 0;
  })) return null;
  const tokens = [...inputs, ...outputs].map((placeId) => ({
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId,
  }) as const);
  const reads = canonicalUniqueStateAtoms([
    ...tokenOwnerCensusAtoms(censusReads),
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    ...tokens,
    ...extraReads,
    { kind: InternalTransitionStateAtomKind.LogicalTime },
  ]);
  const writes = canonicalUniqueStateAtoms([
    ...tokens, ...tokenOwnerCensusAtoms([...inputs, ...outputs]), ...extraWrites,
  ]);
  const patch: InternalLocalControlPatch = { owner, consumed: inputs, produced: outputs, selectedBranch };
  const positionDelta = deriveInternalLocalControlPositionDelta(program, patch);
  const alternative = internalOperationAlternative(operation.id);
  const anchor = {
    kind: InternalPublicationTemplateAnchorKind.TransitionTemplate,
    processId, elementId: operation.origin.elementId, owner,
  } as const;
  return reads === null || writes === null || positionDelta === null
    ? null
    : {
      alternative,
      operation,
      owner,
      branchResult,
      footprint: { reads, writes },
      patch,
      publicationTemplate: {
        alternative,
        record: {
          logicalTimeMs: state.logicalTimeMs,
          transition: {
            kind: SemanticTransitionKind.InternalOperation,
            operationId: operation.id, operationKind: operation.kind,
            origin: operation.origin, owner,
          },
          positionDelta,
        },
        lifecycle: {
          started: [{ anchor, processId, elementId: operation.origin.elementId, owner }],
          ended: [{ anchor, terminal: FlowNodeOccurrenceTerminalKind.Completed }],
        },
      },
    };
}
