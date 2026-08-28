/**
 * The sequential Multi-Instance transitions, starting with outer entry.
 *
 * A separate owner because the dispatcher has no room for a transition and because these transitions
 * share one representation: the outer Activity occurrence record holds the body and the lifetime
 * deadline, and the controller beside it holds the snapshot and the accepted results. Neither is a
 * resumable state without the other, which is why one operation owns the controller, the repeated
 * inner task, and the single boundary Timer.
 */
import {
  ActivityBodyKind,
  activityBodyTask,
  activityOccurrenceForAttachedTimer,
  activityOccurrenceForTaskBody,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { replaceActivityBodyTask } from "./activity-body-turnover.js";
import { VariableValueKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  VariableBinding,
} from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { mergeProcessVariableBindings } from "./semantic-process-data.js";

import {
  ControlStateKind,
  addToken,
  compareTimerWaits,
  compareUserTaskWaits,
  nextActivation,
  removeToken,
  sameOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import {
  compareSequentialMultiInstanceControllers,
  sequentialMultiInstanceControllerFor,
} from "./sequential-multi-instance-controller.js";
import {
  admittedSequentialMultiInstanceInputCollection,
  admittedSequentialMultiInstanceIterationResult,
} from "./sequential-multi-instance-command-data-admission.js";
import type { SequentialMultiInstanceController } from "./sequential-multi-instance-controller.js";

/**
 * The exact ordered output collection, published once and never before natural completion.
 *
 * Delegates to the core's one create-or-replace merge, which Lean's `publishProcessCollection` also
 * calls, so every Process publication in both targets carries one canonical binding order. Sorting
 * here instead would install a second canonical order: it can disagree with the shared code-point
 * comparator on any two DataObject IDs differing in case or across `_`, and a locale comparison also
 * varies with the host's ICU data.
 */
function publishedCollection(
  bindings: ReadonlyArray<VariableBinding>,
  name: string,
  items: ReadonlyArray<string>,
): ReadonlyArray<VariableBinding> {
  return mergeProcessVariableBindings(bindings, [
    {
      name,
      value: { kind: VariableValueKind.StringList, value: [...items] },
    },
  ]);
}

/**
 * `SMI-ENTER-01`. Evaluates and snapshots the collection once, then takes one of two arms.
 *
 * The empty arm is not a degenerate case of the other. A zero-item collection generates no inner
 * instance, so there is no body for a record to own and no iteration for a deadline to bound; the
 * transition publishes the empty output collection and follows normal control in one step. Arming a
 * deadline and withdrawing it again in the same transition would be the same observable outcome
 * reached through a state the profile says never becomes stable.
 *
 * The non-empty arm mints three identities from three independent counter families: the inner task's,
 * the outer Timer's, and the outer Activity's. The Activity's is advanced here and never again for
 * this occurrence, which is what makes the body's activation diverge from the handler's on the first
 * iteration boundary.
 */
export enum SequentialMultiInstanceEntryKind {
  Armed = "armed",
  Empty = "empty",
}

export type SelectedSequentialMultiInstanceEntry = Readonly<
  | {
      kind: SequentialMultiInstanceEntryKind.Empty;
      owner: ScopeOccurrenceId;
      resultingTokens: RuntimeState["controlTokens"];
      processBindings: ReadonlyArray<VariableBinding>;
    }
  | {
      kind: SequentialMultiInstanceEntryKind.Armed;
      owner: ScopeOccurrenceId;
      resultingTokens: RuntimeState["controlTokens"];
      record: ActivityOccurrence;
      controller: SequentialMultiInstanceController;
      taskWait: RuntimeState["userTaskWaits"][number];
      timerWait: RuntimeState["timerWaits"][number];
    }
>;

/** Selects the exact entry arm and every value it will install from one pre-state. */
export function selectSequentialMultiInstanceEntry(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): SelectedSequentialMultiInstanceEntry | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const collection = admittedSequentialMultiInstanceInputCollection(
    operation,
    state.variables.process.bindings,
  );
  if (collection === undefined) {
    return null;
  }
  const consumed = removeToken(state.controlTokens, operation.input, owner);

  if (collection.length === 0) {
    return {
      kind: SequentialMultiInstanceEntryKind.Empty,
      owner,
      resultingTokens: addToken(consumed, operation.normalOutput, owner),
      processBindings: publishedCollection(
        state.variables.process.bindings,
        operation.data.output.dataObjectReferenceId,
        [],
      ),
    };
  }

  const taskActivation = nextActivation(state.taskActivations, operation.task.elementId);
  const timerActivation = nextActivation(
    state.timerActivations,
    operation.boundaryTimer.elementId,
  );
  const activityActivation = nextActivation(
    state.activityActivations,
    operation.task.elementId,
  );
  const deadlineMs = state.logicalTimeMs + operation.boundaryTimer.durationMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw new RangeError("Timer deadline exceeds the safe integer boundary");
  }
  const taskId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.task.elementId,
    activation: taskActivation,
  } as const;
  const timerId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.boundaryTimer.elementId,
    activation: timerActivation,
  } as const;
  const activityId = {
    processInstanceId: owner.processInstanceId,
    activityElementId: operation.task.elementId,
    activation: activityActivation,
  } as const;

  const record: ActivityOccurrence = {
    id: activityId,
    owner,
    operationId: operation.id,
    body: { kind: ActivityBodyKind.UserTask, task: taskId },
    attachedTimers: [timerId],
  };
  const controller: SequentialMultiInstanceController = {
    id: activityId,
    snapshot: [...collection],
    outputSlots: [],
  };
  const taskWait: RuntimeState["userTaskWaits"][number] = {
    id: taskId,
    owner,
    name: operation.task.name,
    output: operation.normalOutput,
  };
  const timerWait: RuntimeState["timerWaits"][number] = {
    id: timerId,
    owner,
    deadlineMs,
    output: operation.boundaryTimer.output,
  };
  return {
    kind: SequentialMultiInstanceEntryKind.Armed,
    owner,
    resultingTokens: consumed,
    record,
    controller,
    taskWait,
    timerWait,
  };
}

export function enterSequentialMultiInstanceUserTask(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const selected = selectSequentialMultiInstanceEntry(operation, state, owner);
  if (selected === null) {
    return null;
  }
  switch (selected.kind) {
    case SequentialMultiInstanceEntryKind.Empty:
      return {
        ...state,
        controlTokens: selected.resultingTokens,
        sequentialMultiInstanceControllers: [
          ...(state.sequentialMultiInstanceControllers ?? []),
        ],
        variables: {
          ...state.variables,
          process: { bindings: selected.processBindings },
        },
      };
    case SequentialMultiInstanceEntryKind.Armed:
      return {
        ...state,
        controlTokens: selected.resultingTokens,
        activityOccurrences: [
          ...state.activityOccurrences,
          selected.record,
        ].sort(compareActivityOccurrences),
        sequentialMultiInstanceControllers: [
          ...(state.sequentialMultiInstanceControllers ?? []),
          selected.controller,
        ].sort(compareSequentialMultiInstanceControllers),
        activityActivations: setActivationCount(
          state.activityActivations,
          operation.task.elementId,
          selected.record.id.activation,
        ),
        userTaskWaits: [
          ...state.userTaskWaits,
          selected.taskWait,
        ].sort(compareUserTaskWaits),
        timerWaits: [
          ...state.timerWaits,
          selected.timerWait,
        ].sort(compareTimerWaits),
        taskActivations: setActivationCount(
          state.taskActivations,
          operation.task.elementId,
          selected.taskWait.id.activation,
        ),
        timerActivations: setActivationCount(
          state.timerActivations,
          operation.boundaryTimer.elementId,
          selected.timerWait.id.activation,
        ),
      };
    default:
      return assertNever(selected);
  }
}

/**
 * `SMI-ITERATE-01` and `SMI-COMPLETE-01`, which are one transition with two arms.
 *
 * They are one function because the deciding fact is the same read: whether this completion filled
 * the last slot. Splitting them would mean asking that question twice, and the intermediate state
 * between "output stored" and "next instance generated" is exactly the state `SMI-ITERATE-01` forbids
 * from becoming stable.
 *
 * The non-final arm delegates the body swap to the Activity occurrence account's replacement
 * operation, which is what keeps the outer identity, the owner, the operation ID, and the attached
 * lifetime deadline exactly as they were while the inner task identity advances. That is the whole
 * reason this capsule needed the turnover amendment: resetting the deadline per iteration, or
 * re-arming the outer Activity, would both be visible here as a changed handler occurrence.
 *
 * The final arm publishes the ordered collection once, in index order rather than completion order,
 * and removes the controller, the record, and the deadline in the same step.
 */
export function completeSequentialMultiInstanceIteration(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const operation = sequentialMultiInstanceOperationFor(program, stimulus.taskId);
  if (operation === undefined) {
    return null;
  }
  const record = activityOccurrenceForTaskBody(
    state.activityOccurrences,
    stimulus.taskId,
  );
  if (record === undefined) {
    return null;
  }
  const controller = sequentialMultiInstanceControllerFor(
    state.sequentialMultiInstanceControllers ?? [],
    record.id,
  );
  if (controller === undefined) {
    return null;
  }
  const result = admittedSequentialMultiInstanceIterationResult(
    operation,
    controller.outputSlots,
    stimulus.submittedValues,
  );
  if (result === undefined) {
    return null;
  }
  const outputSlots = [...controller.outputSlots, result];
  const others = (state.sequentialMultiInstanceControllers ?? []).filter(
    (candidate) => candidate !== controller,
  );

  if (outputSlots.length < controller.snapshot.length) {
    const replaced = replaceActivityBodyTask(state, record);
    if (replaced === null) {
      return null;
    }
    return {
      ...replaced,
      sequentialMultiInstanceControllers: [
        ...others,
        { ...controller, outputSlots },
      ].sort(compareSequentialMultiInstanceControllers),
    };
  }

  return {
    ...state,
    controlTokens: addToken(
      state.controlTokens,
      operation.normalOutput,
      record.owner,
    ),
    userTaskWaits: state.userTaskWaits.filter(({ id }) =>
      !sameOccurrence(id, stimulus.taskId)
    ),
    // Every Timer the record lists leaves with it. The record's attached-wait conjuncts admit more
    // than one live attached Timer, and a deadline whose Activity occurrence is gone has nothing left
    // that identifies it, so a head-only withdrawal would strand it; Lean's `finalCompletionState`
    // filters this same whole list.
    timerWaits: state.timerWaits.filter(({ id }) =>
      !record.attachedTimers.some((timerId) => sameOccurrence(id, timerId))
    ),
    activityOccurrences: state.activityOccurrences.filter((candidate) =>
      !sameActivityOccurrence(candidate.id, record.id)
    ),
    sequentialMultiInstanceControllers: others,
    variables: {
      ...state.variables,
      process: {
        bindings: publishedCollection(
          state.variables.process.bindings,
          operation.data.output.dataObjectReferenceId,
          outputSlots,
        ),
      },
    },
  };
}

/** The Multi-Instance operation that declares this task element, or `undefined`. */
export function sequentialMultiInstanceOperationFor(
  program: SemanticProcessProgram,
  taskId: { elementId: string },
): AwaitSequentialMultiInstanceUserTaskOperation | undefined {
  const matches = program.operations.filter((operation) =>
    operation.kind ===
      SemanticOperationKind.AwaitSequentialMultiInstanceUserTask &&
    operation.task.elementId === taskId.elementId
  );
  const [operation] = matches;
  return matches.length === 1 &&
      operation !== undefined &&
      operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
    ? operation
    : undefined;
}

/** Whether this task occurrence belongs to a sequential Multi-Instance Activity. */
export function isSequentialMultiInstanceTaskDefinition(
  program: SemanticProcessProgram,
  taskId: { elementId: string },
): boolean {
  return sequentialMultiInstanceOperationFor(program, taskId) !== undefined;
}
/**
 * `SMI-CANCEL-01`. The exact outer deadline interrupts the whole repetition.
 *
 * Interruption is not a completion with a different output. It withdraws the one active inner task,
 * generates no pending item, discards every accepted result, removes the controller and the record,
 * and enables only the boundary path. Nothing is published to Process scope, which is the resolution
 * this profile selected: a partial collection would be observable state that no clause defines, and
 * BPMN's own caution against exposing the output collection before every item is written applies most
 * sharply to the case where the remaining items never will be.
 *
 * The counters this discards are the reason the controller stores none. There is no stable state in
 * which a terminated count is nonzero, so nothing has to be decremented, transitioned, or projected:
 * the record and the controller leave together in the transition that terminates the active instance.
 */
export function interruptSequentialMultiInstance(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: FireTimerStimulus,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const operation = sequentialMultiInstanceBoundaryOperationFor(
    program,
    stimulus.timerId,
  );
  if (operation === undefined) {
    return null;
  }
  const deadline = state.timerWaits.find(({ id }) =>
    sameOccurrence(id, stimulus.timerId)
  );
  const record = activityOccurrenceForAttachedTimer(
    state.activityOccurrences,
    stimulus.timerId,
  );
  if (deadline === undefined || record === undefined) {
    return null;
  }
  const controller = sequentialMultiInstanceControllerFor(
    state.sequentialMultiInstanceControllers ?? [],
    record.id,
  );
  const activeTask = activityBodyTask(record);
  if (controller === undefined || activeTask === undefined) {
    return null;
  }
  // The firing instant is the deadline, never the submitted logical time: the host derives the instant
  // from committed state, so a stimulus naming a different time is describing a different transition.
  if (stimulus.logicalTimeMs !== deadline.deadlineMs) {
    return null;
  }
  return {
    ...state,
    logicalTimeMs: deadline.deadlineMs,
    controlTokens: addToken(
      state.controlTokens,
      operation.boundaryTimer.output,
      record.owner,
    ),
    userTaskWaits: state.userTaskWaits.filter(({ id }) =>
      !sameOccurrence(id, activeTask)
    ),
    // Every Timer the record lists leaves with it, the fired one included: removing an Activity
    // occurrence record must leave no wait that record named still live, and the record's conjuncts
    // admit more than one live attached Timer. The fired deadline is a member of this list by
    // construction, since the record was located through it.
    timerWaits: state.timerWaits.filter(({ id }) =>
      !record.attachedTimers.some((timerId) => sameOccurrence(id, timerId))
    ),
    activityOccurrences: state.activityOccurrences.filter((candidate) =>
      !sameActivityOccurrence(candidate.id, record.id)
    ),
    sequentialMultiInstanceControllers:
      (state.sequentialMultiInstanceControllers ?? []).filter(
        (candidate) => candidate !== controller,
      ),
  };
}

/** The Multi-Instance operation whose lifetime deadline this Timer occurrence is, or `undefined`. */
export function sequentialMultiInstanceBoundaryOperationFor(
  program: SemanticProcessProgram,
  timerId: { elementId: string },
): AwaitSequentialMultiInstanceUserTaskOperation | undefined {
  const matches = program.operations.filter((operation) =>
    operation.kind ===
      SemanticOperationKind.AwaitSequentialMultiInstanceUserTask &&
    operation.boundaryTimer.elementId === timerId.elementId
  );
  const [operation] = matches;
  return matches.length === 1 &&
      operation !== undefined &&
      operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
    ? operation
    : undefined;
}

/** Whether this Timer occurrence is a sequential Multi-Instance Activity's lifetime deadline. */
export function isSequentialMultiInstanceBoundaryDefinition(
  program: SemanticProcessProgram,
  timerId: { elementId: string },
): boolean {
  return sequentialMultiInstanceBoundaryOperationFor(program, timerId) !==
    undefined;
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Sequential Multi-Instance entry: ${JSON.stringify(value)}`,
  );
}
