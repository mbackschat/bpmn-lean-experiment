import {
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import {
  candidateProcessId,
  operationIsSelectedFromProgram,
} from "./flow-node-occurrence-candidates.js";
import {
  activityAssociationsConflict,
} from "./internal-transition-activity-association.js";
import { internalOperationAlternative } from "./internal-transition-alternative.js";
import type { InternalOperationAlternative } from "./internal-transition-alternative.js";
import {
  stageZeroItemCompensationRetention,
  ZeroItemCompensationRetentionStageKind,
} from "./compensation-activity-retention-producers.js";
import { canonicalUniqueStateAtoms } from "./internal-transition-footprint-ordering.js";
import type {
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "./internal-transition-footprint.js";
import { InternalTransitionStateAtomKind } from "./internal-transition-footprint-vocabulary.js";
import { affectedTokenBucketsAreExact } from "./internal-transition-token-preparation.js";
import {
  InternalOccurrenceKind,
  openWaitAnchorIsAbsent,
  operationIsUniqueWaitDeclarer,
} from "./internal-transition-wait-census.js";
import {
  admittedParallelMultiInstanceInputCollection,
} from "./parallel-multi-instance-command-data-admission.js";
import type {
  AwaitParallelMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  ParallelMultiInstanceEntryKind,
  selectParallelMultiInstanceEntry,
} from "./semantic-process-parallel-multi-instance-runtime.js";
import type {
  SelectedParallelMultiInstanceEntry,
} from "./semantic-process-parallel-multi-instance-runtime.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export { ParallelMultiInstanceEntryKind };

export type PreparedInternalParallelMultiInstanceEntry =
  SelectedParallelMultiInstanceEntry & Readonly<{
    alternative: InternalOperationAlternative;
    footprint: InternalTransitionStateFootprint;
  }>;

/** Derives either exact Parallel Multi-Instance entry arm without applying it. */
export function deriveInternalParallelMultiInstancePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: AwaitParallelMultiInstanceUserTaskOperation,
): PreparedInternalParallelMultiInstanceEntry | null {
  const owner = onlyTokenOwner(state, operation.input);
  const collection = admittedParallelMultiInstanceInputCollection(
    operation,
    state.variables.process.bindings,
  );
  if (
    owner === undefined ||
    collection === undefined ||
    (collection.length > 0 &&
      !Number.isSafeInteger(
        state.logicalTimeMs + operation.boundaryTimer.durationMs,
      ))
  ) {
    return null;
  }
  const selected = selectParallelMultiInstanceEntry(operation, state, owner);
  const outputPlaces = selected?.kind === ParallelMultiInstanceEntryKind.Empty
    ? [operation.normalOutput]
    : [];
  if (
    selected === null ||
    state.control.kind !== ControlStateKind.Running ||
    state.scopeOccurrences.filter(({ id }) =>
      sameScopeOccurrence(id, owner)
    ).length !== 1 ||
    !operationIsSelectedFromProgram(program, operation, owner) ||
    candidateProcessId(program, state, owner) === null ||
    !affectedTokenBucketsAreExact(
      state,
      owner,
      [operation.input],
      outputPlaces,
    )
  ) {
    return null;
  }

  const inputToken = tokenAtom(owner, operation.input);
  const controllerPresence = {
    kind: InternalTransitionStateAtomKind.ParallelControllersPresence,
  } as const;
  const inputVariable = {
    kind: InternalTransitionStateAtomKind.ProcessVariable,
    name: operation.data.input.dataObjectReferenceId,
  } as const;
  const presenceWrites: ReadonlyArray<InternalTransitionStateAtom> =
    state.parallelMultiInstanceControllers === undefined
      ? [controllerPresence]
      : [];
  const commonReads: ReadonlyArray<InternalTransitionStateAtom> = [
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: state.control.instanceId,
    },
    { kind: InternalTransitionStateAtomKind.ScopeOccurrence, owner },
    inputToken,
    inputVariable,
    controllerPresence,
  ];

  switch (selected.kind) {
    case ParallelMultiInstanceEntryKind.Empty:
      return prepareEmptyEntry(
        program,
        state,
        operation,
        selected,
        commonReads,
        presenceWrites,
      );
    case ParallelMultiInstanceEntryKind.Armed:
      return prepareArmedEntry(
        program,
        state,
        operation,
        selected,
        [
          ...commonReads,
          { kind: InternalTransitionStateAtomKind.LogicalTime },
        ],
        presenceWrites,
      );
    default:
      return assertNever(selected);
  }
}

function prepareEmptyEntry(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  selected: Extract<
    SelectedParallelMultiInstanceEntry,
    { kind: ParallelMultiInstanceEntryKind.Empty }
  >,
  commonReads: ReadonlyArray<InternalTransitionStateAtom>,
  presenceWrites: ReadonlyArray<InternalTransitionStateAtom>,
): PreparedInternalParallelMultiInstanceEntry | null {
  const staged = stageZeroItemCompensationRetention(
    program,
    state,
    selected.owner,
    operation.task.elementId,
  );
  if (staged === null) {
    return null;
  }
  const outputToken = tokenAtom(selected.owner, operation.normalOutput);
  const outputVariable = {
    kind: InternalTransitionStateAtomKind.ProcessVariable,
    name: operation.data.output.dataObjectReferenceId,
  } as const;
  const retentionAtoms: ReadonlyArray<InternalTransitionStateAtom> =
    staged.kind === ZeroItemCompensationRetentionStageKind.Staged
      ? [
          activationAtom(
            InternalOccurrenceKind.Activity,
            staged.activity.activityElementId,
          ),
          {
            kind: InternalTransitionStateAtomKind.CompensationActivityRetention,
            owner: staged.retentionOwner,
          },
        ]
      : [];
  const reads = canonicalUniqueStateAtoms([
    ...commonReads,
    outputToken,
    outputVariable,
    ...retentionAtoms,
  ]);
  const writes = canonicalUniqueStateAtoms([
    tokenAtom(selected.owner, operation.input),
    outputToken,
    outputVariable,
    ...retentionAtoms,
    ...presenceWrites,
  ]);
  return reads === null || writes === null
    ? null
    : {
        alternative: internalOperationAlternative(operation.id),
        ...selected,
        footprint: { reads, writes },
      };
}

function prepareArmedEntry(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  selected: Extract<
    SelectedParallelMultiInstanceEntry,
    { kind: ParallelMultiInstanceEntryKind.Armed }
  >,
  commonReads: ReadonlyArray<InternalTransitionStateAtom>,
  presenceWrites: ReadonlyArray<InternalTransitionStateAtom>,
): PreparedInternalParallelMultiInstanceEntry | null {
  if (
    !safeActivation(selected.record.id.activation) ||
    !safeActivation(selected.timerWait.id.activation) ||
    selected.taskWaits.length === 0 ||
    selected.taskWaits.some(({ id }) => !safeActivation(id.activation)) ||
    !operationIsUniqueWaitDeclarer(
      program,
      operation,
      InternalOccurrenceKind.UserTask,
      operation.task.elementId,
    ) ||
    !operationIsUniqueWaitDeclarer(
      program,
      operation,
      InternalOccurrenceKind.Timer,
      operation.boundaryTimer.elementId,
    ) ||
    state.activityOccurrences.some((record) =>
      activityAssociationsConflict(record, selected.record)
    ) ||
    (state.parallelMultiInstanceControllers ?? []).some(({ id }) =>
      sameActivityOccurrence(id, selected.controller.id)
    ) ||
    selected.taskWaits.some(({ id }) => !openWaitAnchorIsAbsent(state, id)) ||
    !openWaitAnchorIsAbsent(state, selected.timerWait.id)
  ) {
    return null;
  }

  const association = {
    kind: InternalTransitionStateAtomKind.ActivityAssociation,
    record: selected.record,
  } as const;
  const controller = {
    kind: InternalTransitionStateAtomKind.ParallelController,
    id: selected.controller.id,
    owner: selected.owner,
  } as const;
  const snapshot = selected.controller.snapshot.map((_, index) => ({
    kind: InternalTransitionStateAtomKind.ParallelControllerSnapshot,
    id: selected.controller.id,
    owner: selected.owner,
    index,
  } as const));
  const slots = selected.controller.slots.map((_, index) => ({
    kind: InternalTransitionStateAtomKind.ParallelControllerSlot,
    id: selected.controller.id,
    owner: selected.owner,
    index,
  } as const));
  const activationAtoms = [
    activationAtom(InternalOccurrenceKind.Activity, operation.task.elementId),
    activationAtom(InternalOccurrenceKind.UserTask, operation.task.elementId),
    activationAtom(
      InternalOccurrenceKind.Timer,
      operation.boundaryTimer.elementId,
    ),
  ];
  const waits = [
    ...selected.taskWaits.map(({ id }) =>
      waitAtom(InternalOccurrenceKind.UserTask, id, selected.owner)
    ),
    waitAtom(
      InternalOccurrenceKind.Timer,
      selected.timerWait.id,
      selected.owner,
    ),
  ];
  const anchors = [
    ...selected.taskWaits.map(({ id }) => openWaitAnchorAtom(id, selected.owner)),
    openWaitAnchorAtom(selected.timerWait.id, selected.owner),
  ];
  const reads = canonicalUniqueStateAtoms([
    ...commonReads,
    association,
    controller,
    ...snapshot,
    ...slots,
    ...activationAtoms,
    ...waits,
    ...anchors,
  ]);
  const writes = canonicalUniqueStateAtoms([
    tokenAtom(selected.owner, operation.input),
    association,
    controller,
    ...snapshot,
    ...slots,
    ...activationAtoms,
    ...waits,
    ...anchors,
    ...presenceWrites,
  ]);
  return reads === null || writes === null
    ? null
    : {
        alternative: internalOperationAlternative(operation.id),
        ...selected,
        footprint: { reads, writes },
      };
}

function safeActivation(activation: number): boolean {
  return Number.isSafeInteger(activation) && activation > 0;
}

function tokenAtom(
  owner: ScopeOccurrenceId,
  placeId: string,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner,
    placeId,
  };
}

function activationAtom(
  occurrenceKind: InternalOccurrenceKind,
  elementId: string,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.Activation,
    occurrenceKind,
    elementId,
  };
}

function waitAtom(
  kind: InternalOccurrenceKind.UserTask | InternalOccurrenceKind.Timer,
  id: RuntimeState["userTaskWaits"][number]["id"],
  owner: ScopeOccurrenceId,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.Wait,
    occurrence: { kind, id },
    owner,
  };
}

function openWaitAnchorAtom(
  occurrence: RuntimeState["userTaskWaits"][number]["id"],
  owner: ScopeOccurrenceId,
): InternalTransitionStateAtom {
  return {
    kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
    occurrence,
    owner,
  };
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Parallel Multi-Instance preparation: ${JSON.stringify(value)}`,
  );
}
