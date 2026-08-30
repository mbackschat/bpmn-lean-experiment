/**
 * The exact program-to-runtime binding of one open sequential Multi-Instance controller.
 *
 * A controller is not meaningful by identity and counts alone. It resumes one declared operation
 * through one Activity occurrence, whose current body is the operation's active User Task and whose
 * one attached Timer is the operation's outer lifetime deadline. This resolver is shared by state
 * admission, public projection, and the Temporal host so those boundaries cannot accept different
 * meanings for the same committed state.
 */
import {
  activityBodyTaskWait,
  attachedTimerOccurrences,
  attachedTimerWaits,
  sameActivityOccurrence,
  sameOccurrenceId,
  type ActivityOccurrence,
} from "./activity-occurrence.js";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  RuntimeState,
  SemanticTimerWait,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";
import {
  sequentialMultiInstanceOperationFor,
} from "./semantic-process-sequential-multi-instance-runtime.js";
import type { SequentialMultiInstanceController } from "./sequential-multi-instance-controller.js";

export type SequentialMultiInstanceBinding = Readonly<{
  controller: SequentialMultiInstanceController;
  operation: AwaitSequentialMultiInstanceUserTaskOperation;
  record: ActivityOccurrence;
  taskWait: SemanticUserTaskWait;
  timerWait: SemanticTimerWait;
}>;

function sameOwner(
  left: { readonly processInstanceId: string; readonly definitionScopeId: string; readonly activation: number },
  right: { readonly processInstanceId: string; readonly definitionScopeId: string; readonly activation: number },
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.definitionScopeId === right.definitionScopeId &&
    left.activation === right.activation;
}

/** Resolve every load-bearing fact of one open controller, or refuse the whole binding. */
export function sequentialMultiInstanceBindingForController(
  program: SemanticProcessProgram,
  state: RuntimeState,
  controller: SequentialMultiInstanceController,
): SequentialMultiInstanceBinding | undefined {
  const operation = sequentialMultiInstanceOperationFor(program, {
    elementId: controller.id.activityElementId,
  });
  const records = state.activityOccurrences.filter((record) =>
    sameActivityOccurrence(record.id, controller.id)
  );
  const [record] = records;
  if (operation === undefined || records.length !== 1 || record === undefined) {
    return undefined;
  }

  const ownerships = program.operationScopes.filter(({ operationId }) =>
    operationId === operation.id
  );
  const taskWait = activityBodyTaskWait(record, state.userTaskWaits);
  const timerWaits = attachedTimerWaits(record, state.timerWaits);
  const [timerId] = attachedTimerOccurrences(record);
  const [timerWait] = timerWaits;
  if (
    record.operationId !== operation.id ||
    ownerships.length !== 1 ||
    ownerships[0]?.scopeId !== record.owner.definitionScopeId ||
    record.id.processInstanceId !== record.owner.processInstanceId ||
    taskWait === undefined ||
    taskWait.id.elementId !== operation.task.elementId ||
    taskWait.name !== operation.task.name ||
    taskWait.metadata !== undefined ||
    taskWait.output !== operation.normalOutput ||
    !sameOwner(taskWait.owner, record.owner) ||
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

  return { controller, operation, record, taskWait, timerWait };
}

/**
 * Resolve the complete bidirectional SMI state binding, or refuse the state.
 *
 * Forward controller resolution is not enough: an empty controller array makes a universal check
 * vacuously true, and record-local lookup cannot see a second operation-owned task or Timer outside
 * the record. For each SMI operation, the record, resolved-controller, task-wait, and Timer-wait
 * cardinalities must therefore agree exactly.
 *
 * Program admission separately owns missing or duplicate operation-scope bindings. When no matching
 * runtime artifact exists, this resolver needs no scope fact and returns an empty binding. Once any
 * matching record, controller, task wait, or Timer wait exists, the unique scope becomes load-bearing
 * and its absence makes the runtime binding malformed.
 */
export function sequentialMultiInstanceBindingsForState(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<SequentialMultiInstanceBinding> | undefined {
  const controllers = state.sequentialMultiInstanceControllers ?? [];
  const bindings: SequentialMultiInstanceBinding[] = [];
  for (const controller of controllers) {
    const binding = sequentialMultiInstanceBindingForController(program, state, controller);
    if (binding === undefined) {
      return undefined;
    }
    bindings.push(binding);
  }

  const operations = program.operations.filter(
    (operation): operation is AwaitSequentialMultiInstanceUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  for (const operation of operations) {
    const records = state.activityOccurrences.filter(({ operationId }) =>
      operationId === operation.id
    );
    const operationBindings = bindings.filter(({ operation: candidate }) =>
      candidate.id === operation.id
    );
    const operationTaskWaits = state.userTaskWaits.filter(({ id }) =>
      id.elementId === operation.task.elementId
    );
    const operationTimerWaits = state.timerWaits.filter(({ id }) =>
      id.elementId === operation.boundaryTimer.elementId
    );
    const ownerships = program.operationScopes.filter(({ operationId }) =>
      operationId === operation.id
    );
    const [ownership] = ownerships;
    if (ownerships.length !== 1 || ownership === undefined) {
      if (
        records.length !== 0 ||
        operationBindings.length !== 0 ||
        operationTaskWaits.length !== 0 ||
        operationTimerWaits.length !== 0
      ) {
        return undefined;
      }
      continue;
    }

    const taskWaits = operationTaskWaits.filter(({ owner }) =>
      owner.definitionScopeId === ownership.scopeId
    );
    const timerWaits = operationTimerWaits.filter(({ owner }) =>
      owner.definitionScopeId === ownership.scopeId
    );
    if (
      records.length !== operationBindings.length ||
      taskWaits.length !== operationBindings.length ||
      timerWaits.length !== operationBindings.length
    ) {
      return undefined;
    }
  }

  return bindings;
}
