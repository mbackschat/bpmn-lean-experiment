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
  attachedTimerWaits,
  sameActivityOccurrence,
  sameOccurrenceId,
  type ActivityOccurrence,
} from "./activity-occurrence.js";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
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
  const [timerId] = record.attachedTimers;
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
    record.attachedTimers.length !== 1 ||
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
