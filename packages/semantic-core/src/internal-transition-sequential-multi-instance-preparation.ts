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
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  admittedSequentialMultiInstanceInputCollection,
} from "./sequential-multi-instance-command-data-admission.js";
import {
  SequentialMultiInstanceEntryKind,
  selectSequentialMultiInstanceEntry,
} from "./semantic-process-sequential-multi-instance-runtime.js";
import type {
  SelectedSequentialMultiInstanceEntry,
} from "./semantic-process-sequential-multi-instance-runtime.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import {
  ControlStateKind,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export { SequentialMultiInstanceEntryKind };

export type PreparedInternalSequentialMultiInstanceEntry =
  SelectedSequentialMultiInstanceEntry & Readonly<{
    alternative: InternalOperationAlternative;
    footprint: InternalTransitionStateFootprint;
  }>;

/** Derives either exact Sequential Multi-Instance entry arm without applying it. */
export function deriveInternalSequentialMultiInstancePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
): PreparedInternalSequentialMultiInstanceEntry | null {
  const owner = onlyTokenOwner(state, operation.input);
  const collection = admittedSequentialMultiInstanceInputCollection(
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
  const selected = selectSequentialMultiInstanceEntry(operation, state, owner);
  const outputPlaces = selected?.kind === SequentialMultiInstanceEntryKind.Empty
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
    kind: InternalTransitionStateAtomKind.SequentialControllersPresence,
  } as const;
  const inputVariable = {
    kind: InternalTransitionStateAtomKind.ProcessVariable,
    name: operation.data.input.dataObjectReferenceId,
  } as const;
  const presenceWrites: ReadonlyArray<InternalTransitionStateAtom> =
    state.sequentialMultiInstanceControllers === undefined
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
    case SequentialMultiInstanceEntryKind.Empty:
      return prepareEmptyEntry(
        operation,
        selected,
        commonReads,
        presenceWrites,
      );
    case SequentialMultiInstanceEntryKind.Armed:
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
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  selected: Extract<
    SelectedSequentialMultiInstanceEntry,
    { kind: SequentialMultiInstanceEntryKind.Empty }
  >,
  commonReads: ReadonlyArray<InternalTransitionStateAtom>,
  presenceWrites: ReadonlyArray<InternalTransitionStateAtom>,
): PreparedInternalSequentialMultiInstanceEntry | null {
  const outputToken = tokenAtom(selected.owner, operation.normalOutput);
  const outputVariable = {
    kind: InternalTransitionStateAtomKind.ProcessVariable,
    name: operation.data.output.dataObjectReferenceId,
  } as const;
  const reads = canonicalUniqueStateAtoms([
    ...commonReads,
    outputToken,
    outputVariable,
  ]);
  const writes = canonicalUniqueStateAtoms([
    tokenAtom(selected.owner, operation.input),
    outputToken,
    outputVariable,
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
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  selected: Extract<
    SelectedSequentialMultiInstanceEntry,
    { kind: SequentialMultiInstanceEntryKind.Armed }
  >,
  commonReads: ReadonlyArray<InternalTransitionStateAtom>,
  presenceWrites: ReadonlyArray<InternalTransitionStateAtom>,
): PreparedInternalSequentialMultiInstanceEntry | null {
  if (
    !safeActivation(selected.record.id.activation) ||
    !safeActivation(selected.taskWait.id.activation) ||
    !safeActivation(selected.timerWait.id.activation) ||
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
    (state.sequentialMultiInstanceControllers ?? []).some(({ id }) =>
      sameActivityOccurrence(id, selected.controller.id)
    ) ||
    !openWaitAnchorIsAbsent(state, selected.taskWait.id) ||
    !openWaitAnchorIsAbsent(state, selected.timerWait.id)
  ) {
    return null;
  }

  const association = {
    kind: InternalTransitionStateAtomKind.ActivityAssociation,
    record: selected.record,
  } as const;
  const controller = {
    kind: InternalTransitionStateAtomKind.SequentialController,
    id: selected.controller.id,
    owner: selected.owner,
  } as const;
  const snapshot = selected.controller.snapshot.map((_, index) => ({
    kind: InternalTransitionStateAtomKind.SequentialControllerSnapshot,
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
    waitAtom(
      InternalOccurrenceKind.UserTask,
      selected.taskWait.id,
      selected.owner,
    ),
    waitAtom(
      InternalOccurrenceKind.Timer,
      selected.timerWait.id,
      selected.owner,
    ),
  ];
  const anchors = [
    openWaitAnchorAtom(selected.taskWait.id, selected.owner),
    openWaitAnchorAtom(selected.timerWait.id, selected.owner),
  ];
  const reads = canonicalUniqueStateAtoms([
    ...commonReads,
    association,
    controller,
    ...snapshot,
    ...activationAtoms,
    ...waits,
    ...anchors,
  ]);
  const writes = canonicalUniqueStateAtoms([
    tokenAtom(selected.owner, operation.input),
    association,
    controller,
    ...snapshot,
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
    `Unsupported Sequential Multi-Instance preparation: ${JSON.stringify(value)}`,
  );
}
