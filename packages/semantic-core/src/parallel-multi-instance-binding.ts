/** The complete program-to-runtime binding of every open parallel Multi-Instance controller. */
import {
  activityBodyParallelTasks,
  attachedTimerOccurrences,
  attachedTimerWaits,
  sameActivityOccurrence,
  sameOccurrenceId,
  type ActivityOccurrence,
} from "./activity-occurrence.js";
import {
  ParallelMultiInstanceSlotKind,
  type ParallelMultiInstanceController,
} from "./parallel-multi-instance-controller.js";
import {
  SemanticOperationKind,
  type AwaitParallelMultiInstanceUserTaskOperation,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import type {
  RuntimeState,
  SemanticTimerWait,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";
import { utf8ByteLength } from "./wire.js";

export type ParallelMultiInstanceBinding = Readonly<{
  controller: ParallelMultiInstanceController;
  operation: AwaitParallelMultiInstanceUserTaskOperation;
  record: ActivityOccurrence;
  taskWaits: ReadonlyArray<SemanticUserTaskWait>;
  timerWait: SemanticTimerWait;
}>;

function sameOwner(
  left: Readonly<{
    processInstanceId: string;
    definitionScopeId: string;
    activation: number;
  }>,
  right: Readonly<{
    processInstanceId: string;
    definitionScopeId: string;
    activation: number;
  }>,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}

export function parallelMultiInstanceBindingForController(
  program: SemanticProcessProgram,
  state: RuntimeState,
  controller: ParallelMultiInstanceController,
): ParallelMultiInstanceBinding | undefined {
  const operations = program.operations.filter(
    (operation): operation is AwaitParallelMultiInstanceUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask &&
      operation.task.elementId === controller.id.activityElementId,
  );
  const records = state.activityOccurrences.filter((record) =>
    sameActivityOccurrence(record.id, controller.id)
  );
  const [operation] = operations;
  const [record] = records;
  if (
    operations.length !== 1 ||
    operation === undefined ||
    records.length !== 1 ||
    record === undefined
  ) {
    return undefined;
  }
  const ownerships = program.operationScopes.filter(({ operationId }) =>
    operationId === operation.id
  );
  const [ownership] = ownerships;
  const bodyTasks = activityBodyParallelTasks(record);
  const pending = controller.slots.flatMap((slot) =>
    slot.kind === ParallelMultiInstanceSlotKind.Pending ? [slot.taskId] : []
  );
  const taskWaits = pending.flatMap((taskId) => {
    const matches = state.userTaskWaits.filter(({ id }) =>
      sameOccurrenceId(id, taskId)
    );
    return matches.length === 1 && matches[0] !== undefined ? [matches[0]] : [];
  });
  const timerWaits = attachedTimerWaits(record, state.timerWaits);
  const [timerId] = attachedTimerOccurrences(record);
  const [timerWait] = timerWaits;
  const allTaskIdsUnique = controller.slots.every((slot, index) =>
    controller.slots.every((other, otherIndex) =>
      index === otherIndex || !sameOccurrenceId(slot.taskId, other.taskId)
    )
  );
  const firstActivation = controller.slots[0]?.taskId.activation;
  if (
    ownerships.length !== 1 ||
    ownership === undefined ||
    record.operationId !== operation.id ||
    ownership.scopeId !== record.owner.definitionScopeId ||
    record.id.processInstanceId !== record.owner.processInstanceId ||
    controller.snapshot.length === 0 ||
    controller.slots.length !== controller.snapshot.length ||
    pending.length === 0 ||
    bodyTasks === undefined ||
    bodyTasks.length !== pending.length ||
    !bodyTasks.every((taskId, index) =>
      pending[index] !== undefined && sameOccurrenceId(taskId, pending[index])
    ) ||
    taskWaits.length !== pending.length ||
    !taskWaits.every((wait, index) =>
      pending[index] !== undefined &&
      sameOccurrenceId(wait.id, pending[index]) &&
      wait.name === operation.task.name &&
      wait.metadata === undefined &&
      wait.output === operation.normalOutput &&
      sameOwner(wait.owner, record.owner)
    ) ||
    !allTaskIdsUnique ||
    firstActivation === undefined ||
    !controller.slots.every((slot, index) =>
      slot.taskId.processInstanceId === record.id.processInstanceId &&
      slot.taskId.elementId === operation.task.elementId &&
      slot.taskId.activation === firstActivation + index &&
      (slot.kind !== ParallelMultiInstanceSlotKind.Completed ||
        utf8ByteLength(slot.result) <= operation.limits.maximumItemUtf8Bytes)
    ) ||
    record.attachedHandlers.length !== 1 ||
    timerWaits.length !== 1 ||
    timerId === undefined ||
    timerWait === undefined ||
    timerId.processInstanceId !== record.id.processInstanceId ||
    timerId.elementId !== operation.boundaryTimer.elementId ||
    !sameOccurrenceId(timerWait.id, timerId) ||
    timerWait.output !== operation.boundaryTimer.output ||
    !sameOwner(timerWait.owner, record.owner)
  ) {
    return undefined;
  }
  return { controller, operation, record, taskWaits, timerWait };
}

export function parallelMultiInstanceBindingsForState(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<ParallelMultiInstanceBinding> | undefined {
  const controllers = state.parallelMultiInstanceControllers ?? [];
  const bindings: ParallelMultiInstanceBinding[] = [];
  for (const controller of controllers) {
    const binding = parallelMultiInstanceBindingForController(program, state, controller);
    if (binding === undefined) {
      return undefined;
    }
    bindings.push(binding);
  }
  const operations = program.operations.filter(
    (operation): operation is AwaitParallelMultiInstanceUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
  );
  for (const operation of operations) {
    const ownerships = program.operationScopes.filter(({ operationId }) =>
      operationId === operation.id
    );
    const [ownership] = ownerships;
    const records = state.activityOccurrences.filter(({ operationId }) =>
      operationId === operation.id
    );
    const operationBindings = bindings.filter(({ operation: candidate }) =>
      candidate.id === operation.id
    );
    const taskWaits = state.userTaskWaits.filter(({ id, owner }) =>
      id.elementId === operation.task.elementId &&
      owner.definitionScopeId === ownership?.scopeId
    );
    const timerWaits = state.timerWaits.filter(({ id, owner }) =>
      id.elementId === operation.boundaryTimer.elementId &&
      owner.definitionScopeId === ownership?.scopeId
    );
    const boundTaskCount = operationBindings.reduce(
      (count, binding) => count + binding.taskWaits.length,
      0,
    );
    if (
      ownerships.length !== 1 ||
      ownership === undefined ||
      records.length !== operationBindings.length ||
      taskWaits.length !== boundTaskCount ||
      timerWaits.length !== operationBindings.length
    ) {
      return undefined;
    }
  }
  return bindings;
}
