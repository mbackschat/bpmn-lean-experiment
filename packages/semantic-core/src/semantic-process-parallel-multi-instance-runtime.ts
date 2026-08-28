import {
  ActivityBodyKind,
  activityBodyParallelTasks,
  activityOccurrenceForAttachedTimer,
  activityOccurrenceForTaskBody,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { VariableValueKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  VariableBinding,
} from "./contract.js";
import {
  activeParallelInstanceCount,
  compareParallelMultiInstanceControllers,
  ParallelMultiInstanceSlotKind,
  parallelMultiInstanceControllerFor,
} from "./parallel-multi-instance-controller.js";
import type { ParallelMultiInstanceController } from "./parallel-multi-instance-controller.js";
import {
  admittedParallelMultiInstanceChildResult,
  admittedParallelMultiInstanceCompletionPolicy,
  admittedParallelMultiInstanceInputCollection,
} from "./parallel-multi-instance-command-data-admission.js";
import {
  ParallelMultiInstanceCompletionPolicy,
} from "./parallel-multi-instance-contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitParallelMultiInstanceUserTaskOperation,
  CompleteParallelMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { mergeProcessVariableBindings } from "./semantic-process-data.js";
import {
  addToken,
  compareTimerWaits,
  compareUserTaskWaits,
  ControlStateKind,
  nextActivation,
  removeToken,
  sameOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

export enum ParallelMultiInstanceEntryKind {
  Armed = "armed",
  Empty = "empty",
}

export type SelectedParallelMultiInstanceEntry = Readonly<
  | {
      kind: ParallelMultiInstanceEntryKind.Empty;
      owner: ScopeOccurrenceId;
      resultingTokens: RuntimeState["controlTokens"];
      processBindings: ReadonlyArray<VariableBinding>;
    }
  | {
      kind: ParallelMultiInstanceEntryKind.Armed;
      owner: ScopeOccurrenceId;
      resultingTokens: RuntimeState["controlTokens"];
      record: ActivityOccurrence;
      controller: ParallelMultiInstanceController;
      taskWaits: RuntimeState["userTaskWaits"];
      timerWait: RuntimeState["timerWaits"][number];
    }
>;

/** Selects one exact parallel entry arm and every value it installs from the pre-state. */
export function selectParallelMultiInstanceEntry(
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): SelectedParallelMultiInstanceEntry | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const collection = admittedParallelMultiInstanceInputCollection(
    operation,
    state.variables.process.bindings,
  );
  if (collection === undefined) {
    return null;
  }
  const consumed = removeToken(state.controlTokens, operation.input, owner);
  if (collection.length === 0) {
    return {
      kind: ParallelMultiInstanceEntryKind.Empty,
      owner,
      resultingTokens: addToken(consumed, operation.normalOutput, owner),
      processBindings: publishCollection(
        state.variables.process.bindings,
        operation.data.output.dataObjectReferenceId,
        [],
      ),
    };
  }

  const firstTaskActivation = nextActivation(
    state.taskActivations,
    operation.task.elementId,
  );
  const taskIds = collection.map((_, index) => ({
    processInstanceId: owner.processInstanceId,
    elementId: operation.task.elementId,
    activation: firstTaskActivation + index,
  }));
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
  const [firstTask, ...remainingTasks] = taskIds;
  if (firstTask === undefined) {
    return null;
  }

  const record: ActivityOccurrence = {
    id: activityId,
    owner,
    operationId: operation.id,
    body: {
      kind: ActivityBodyKind.ParallelUserTasks,
      tasks: [firstTask, ...remainingTasks],
    },
    attachedTimers: [timerId],
  };
  const controller: ParallelMultiInstanceController = {
    id: activityId,
    snapshot: [...collection],
    slots: taskIds.map((taskId) => ({
      kind: ParallelMultiInstanceSlotKind.Pending,
      taskId,
    })),
  };
  const taskWaits: RuntimeState["userTaskWaits"] = taskIds.map((id) => ({
    id,
    owner,
    name: operation.task.name,
    output: operation.normalOutput,
  }));
  const timerWait: RuntimeState["timerWaits"][number] = {
    id: timerId,
    owner,
    deadlineMs,
    output: operation.boundaryTimer.output,
  };
  return {
    kind: ParallelMultiInstanceEntryKind.Armed,
    owner,
    resultingTokens: consumed,
    record,
    controller,
    taskWaits,
    timerWait,
  };
}

export function enterParallelMultiInstanceUserTask(
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  const selected = selectParallelMultiInstanceEntry(operation, state, owner);
  if (selected === null) {
    return null;
  }
  switch (selected.kind) {
    case ParallelMultiInstanceEntryKind.Empty:
      return {
        ...state,
        controlTokens: selected.resultingTokens,
        parallelMultiInstanceControllers: [
          ...(state.parallelMultiInstanceControllers ?? []),
        ],
        variables: {
          ...state.variables,
          process: { bindings: selected.processBindings },
        },
      };
    case ParallelMultiInstanceEntryKind.Armed: {
      const finalTask = selected.taskWaits.at(-1);
      if (finalTask === undefined) {
        return null;
      }
      return {
        ...state,
        controlTokens: selected.resultingTokens,
        activityOccurrences: [
          ...state.activityOccurrences,
          selected.record,
        ].sort(compareActivityOccurrences),
        parallelMultiInstanceControllers: [
          ...(state.parallelMultiInstanceControllers ?? []),
          selected.controller,
        ].sort(compareParallelMultiInstanceControllers),
        activityActivations: setActivationCount(
          state.activityActivations,
          operation.task.elementId,
          selected.record.id.activation,
        ),
        userTaskWaits: [
          ...state.userTaskWaits,
          ...selected.taskWaits,
        ].sort(compareUserTaskWaits),
        timerWaits: [
          ...state.timerWaits,
          selected.timerWait,
        ].sort(compareTimerWaits),
        taskActivations: setActivationCount(
          state.taskActivations,
          operation.task.elementId,
          finalTask.id.activation,
        ),
        timerActivations: setActivationCount(
          state.timerActivations,
          operation.boundaryTimer.elementId,
          selected.timerWait.id.activation,
        ),
      };
    }
    default:
      return assertNever(selected);
  }
}

export function completeParallelMultiInstanceChild(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const pair = parallelMultiInstanceOperationsForTask(program, stimulus.taskId);
  if (pair === undefined) {
    return null;
  }
  const record = activityOccurrenceForTaskBody(
    state.activityOccurrences,
    stimulus.taskId,
  );
  if (
    record === undefined ||
    record.operationId !== pair.entry.id ||
    activityBodyParallelTasks(record) === undefined
  ) {
    return null;
  }
  const controller = parallelMultiInstanceControllerFor(
    state.parallelMultiInstanceControllers ?? [],
    record.id,
  );
  const slotIndex = controller?.slots.findIndex((slot) =>
    slot.kind === ParallelMultiInstanceSlotKind.Pending &&
    sameOccurrence(slot.taskId, stimulus.taskId)
  ) ?? -1;
  const result = admittedParallelMultiInstanceChildResult(
    pair.entry,
    stimulus.submittedValues,
  );
  const policy = admittedParallelMultiInstanceCompletionPolicy(
    pair.entry,
    state.variables.process.bindings,
  );
  if (
    controller === undefined ||
    slotIndex < 0 ||
    result === undefined ||
    policy === undefined
  ) {
    return null;
  }

  const slots = controller.slots.map((slot, index) =>
    index === slotIndex
      ? {
        kind: ParallelMultiInstanceSlotKind.Completed,
        taskId: stimulus.taskId,
        result,
      } as const
      : slot
  );
  const updatedController = { ...controller, slots };
  const remaining = activeParallelInstanceCount(updatedController);
  if (
    remaining === 0 ||
    policy === ParallelMultiInstanceCompletionPolicy.First
  ) {
    const completedResults = slots.flatMap((slot) =>
      slot.kind === ParallelMultiInstanceSlotKind.Completed ? [slot.result] : []
    );
    return closeParallelMultiInstance(
      state,
      record,
      controller,
      pair.completion.normalOutput,
      remaining === 0
        ? {
          name: pair.entry.data.output.dataObjectReferenceId,
          items: completedResults,
        }
        : undefined,
    );
  }

  const remainingTasks = activityBodyParallelTasks(record)?.filter((taskId) =>
    !sameOccurrence(taskId, stimulus.taskId)
  ) ?? [];
  const [firstTask, ...otherTasks] = remainingTasks;
  if (firstTask === undefined) {
    return null;
  }
  return {
    ...state,
    userTaskWaits: state.userTaskWaits.filter(({ id }) =>
      !sameOccurrence(id, stimulus.taskId)
    ),
    activityOccurrences: state.activityOccurrences.map((candidate) =>
      candidate === record
        ? {
          ...record,
          body: {
            kind: ActivityBodyKind.ParallelUserTasks,
            tasks: [firstTask, ...otherTasks],
          } as const,
        }
        : candidate
    ),
    parallelMultiInstanceControllers: [
      ...(state.parallelMultiInstanceControllers ?? []).filter(
        (candidate) => candidate !== controller,
      ),
      updatedController,
    ].sort(compareParallelMultiInstanceControllers),
  };
}

export function interruptParallelMultiInstance(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: FireTimerStimulus,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const entry = parallelMultiInstanceBoundaryOperationFor(
    program,
    stimulus.timerId,
  );
  const deadline = state.timerWaits.find(({ id }) =>
    sameOccurrence(id, stimulus.timerId)
  );
  const record = activityOccurrenceForAttachedTimer(
    state.activityOccurrences,
    stimulus.timerId,
  );
  const controller = record === undefined
    ? undefined
    : parallelMultiInstanceControllerFor(
        state.parallelMultiInstanceControllers ?? [],
        record.id,
      );
  if (
    entry === undefined ||
    deadline === undefined ||
    record === undefined ||
    record.operationId !== entry.id ||
    controller === undefined ||
    activityBodyParallelTasks(record) === undefined ||
    stimulus.logicalTimeMs !== deadline.deadlineMs
  ) {
    return null;
  }
  return {
    ...closeParallelMultiInstance(
      state,
      record,
      controller,
      entry.boundaryTimer.output,
      undefined,
    ),
    logicalTimeMs: deadline.deadlineMs,
  };
}

export function isParallelMultiInstanceTaskDefinition(
  program: SemanticProcessProgram,
  taskId: { elementId: string },
): boolean {
  return parallelMultiInstanceOperationsForTask(program, taskId) !== undefined;
}

export function isParallelMultiInstanceBoundaryDefinition(
  program: SemanticProcessProgram,
  timerId: { elementId: string },
): boolean {
  return parallelMultiInstanceBoundaryOperationFor(program, timerId) !== undefined;
}

function parallelMultiInstanceOperationsForTask(
  program: SemanticProcessProgram,
  taskId: { elementId: string },
): Readonly<{
  entry: AwaitParallelMultiInstanceUserTaskOperation;
  completion: CompleteParallelMultiInstanceUserTaskOperation;
}> | undefined {
  const completions = program.operations.filter(
    (operation): operation is CompleteParallelMultiInstanceUserTaskOperation =>
      operation.kind ===
        SemanticOperationKind.CompleteParallelMultiInstanceUserTask &&
      operation.taskElementId === taskId.elementId,
  );
  const [completion] = completions;
  if (completions.length !== 1 || completion === undefined) {
    return undefined;
  }
  const entries = program.operations.filter(
    (operation): operation is AwaitParallelMultiInstanceUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask &&
      operation.id === completion.entryOperationId &&
      operation.task.elementId === completion.taskElementId &&
      operation.normalOutput === completion.normalOutput,
  );
  const [entry] = entries;
  return entries.length === 1 && entry !== undefined
    ? { entry, completion }
    : undefined;
}

function parallelMultiInstanceBoundaryOperationFor(
  program: SemanticProcessProgram,
  timerId: { elementId: string },
): AwaitParallelMultiInstanceUserTaskOperation | undefined {
  const matches = program.operations.filter(
    (operation): operation is AwaitParallelMultiInstanceUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask &&
      operation.boundaryTimer.elementId === timerId.elementId,
  );
  const [entry] = matches;
  return matches.length === 1 ? entry : undefined;
}

function closeParallelMultiInstance(
  state: RuntimeState,
  record: RuntimeState["activityOccurrences"][number],
  controller: NonNullable<RuntimeState["parallelMultiInstanceControllers"]>[number],
  output: string,
  completedOutput: Readonly<{
    name: string;
    items: ReadonlyArray<string>;
  }> | undefined,
): RuntimeState {
  return {
    ...state,
    controlTokens: addToken(state.controlTokens, output, record.owner),
    userTaskWaits: state.userTaskWaits.filter(({ id }) =>
      !controller.slots.some((slot) => sameOccurrence(id, slot.taskId))
    ),
    timerWaits: state.timerWaits.filter(({ id }) =>
      !record.attachedTimers.some((timerId) => sameOccurrence(id, timerId))
    ),
    activityOccurrences: state.activityOccurrences.filter((candidate) =>
      !sameActivityOccurrence(candidate.id, record.id)
    ),
    parallelMultiInstanceControllers:
      (state.parallelMultiInstanceControllers ?? []).filter(
        (candidate) => candidate !== controller,
      ),
    ...(completedOutput === undefined
      ? {}
      : {
        variables: {
          ...state.variables,
          process: {
            bindings: publishCollection(
              state.variables.process.bindings,
              completedOutput.name,
              completedOutput.items,
            ),
          },
        },
      }),
  };
}

function publishCollection(
  bindings: ReadonlyArray<VariableBinding>,
  name: string,
  items: ReadonlyArray<string>,
): ReadonlyArray<VariableBinding> {
  return mergeProcessVariableBindings(bindings, [{
    name,
    value: { kind: VariableValueKind.StringList, value: [...items] },
  }]);
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Parallel Multi-Instance entry: ${JSON.stringify(value)}`,
  );
}
