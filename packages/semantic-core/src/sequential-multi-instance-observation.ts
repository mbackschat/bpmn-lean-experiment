/**
 * The public progress projection for open sequential Multi-Instance Activities.
 *
 * `SMI-OBSERVE-01`. Every field is derived from committed state and immutable definition facts, never
 * from a future command, a host identity, or a difference between two states. The private snapshot and
 * the output slots are not projected at all: what a consumer sees of the collection is the one item the
 * active iteration carries as its task input, which it already needs to complete that task.
 *
 * Presence is decided by the program rather than by the profile identity. A program declaring no
 * Multi-Instance Activity yields `undefined`, so its canonical observation bytes are unchanged, and a
 * program declaring one always yields an array, empty before outer entry and after either closing
 * route. That makes the distinction structural instead of resting on a registration this profile does
 * not yet have.
 */
import {
  activityBodyTask,
  activityOccurrenceForTaskBody,
} from "./activity-occurrence.js";
import { VariableValueKind } from "./contract.js";
import type {
  OpenSequentialMultiInstance,
  OpenSequentialMultiInstanceIteration,
} from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";
import {
  activeSnapshotItem,
  completedInstanceCount,
} from "./sequential-multi-instance-controller.js";
import type { SequentialMultiInstanceController } from "./sequential-multi-instance-controller.js";

function multiInstanceOperations(
  program: SemanticProcessProgram,
): ReadonlyArray<AwaitSequentialMultiInstanceUserTaskOperation> {
  return program.operations.filter(
    (operation): operation is AwaitSequentialMultiInstanceUserTaskOperation =>
      operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
}

/**
 * The one active iteration, or none.
 *
 * Read through the Activity occurrence record's body rather than through the controller, because the
 * record is what owns the current inner task identity; the controller contributes only the loop
 * counter and the snapshot item that counter selects.
 */
function activeIterations(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  state: RuntimeState,
  controller: SequentialMultiInstanceController,
): ReadonlyArray<OpenSequentialMultiInstanceIteration> {
  const record = state.activityOccurrences.find((candidate) =>
    candidate.id.processInstanceId === controller.id.processInstanceId &&
    candidate.id.activityElementId === controller.id.activityElementId &&
    candidate.id.activation === controller.id.activation
  );
  const taskId = record === undefined ? undefined : activityBodyTask(record);
  const item = activeSnapshotItem(controller);
  if (taskId === undefined || item === undefined) {
    return [];
  }
  return [
    {
      loopCounter: completedInstanceCount(controller),
      taskId,
      taskInput: {
        name: operation.data.input.taskDataInputId,
        value: { kind: VariableValueKind.String, value: item },
      },
      completionBindingName: operation.data.output.taskDataOutputId,
    },
  ];
}

/**
 * Stable Multi-Instance progress, or `undefined` when the program declares no such Activity.
 *
 * A controller whose operation cannot be resolved is skipped rather than projected with invented
 * definition facts: the input and output binding names are definition-owned, so there is no honest
 * projection of an iteration whose operation is missing, and the well-formedness conjuncts already
 * refuse a controller with no record.
 *
 * `numberOfInstances` is the sum of the two counts published beside it rather than a third reading of
 * the controller. Completed comes from the controller's slots and active from the Activity occurrence
 * record's body, so a generated count derived from the controller alone can contradict both: a record
 * whose body is not a User Task yields no active iteration while the controller still shows filled
 * slots, and body kind is deliberately not a well-formedness conjunct in either language. Summing is
 * what makes Table 10.30's identity arithmetic rather than an agreement between two structures.
 */
export function projectOpenMultiInstances(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<OpenSequentialMultiInstance> | undefined {
  const operations = multiInstanceOperations(program);
  if (operations.length === 0) {
    return undefined;
  }
  return (state.sequentialMultiInstanceControllers ?? []).flatMap(
    (controller) => {
      const operation = operations.find((candidate) =>
        candidate.task.elementId === controller.id.activityElementId
      );
      if (operation === undefined) {
        return [];
      }
      const iterations = activeIterations(operation, state, controller);
      return [
        {
          id: controller.id,
          mode: "sequential" as const,
          plannedInstanceCount: controller.snapshot.length,
          // Both normative identities are arithmetic over the three counts published beside them,
          // because both derive generated the same way. Reading `pendingItemCount(controller)` here
          // instead would derive generated twice, as completed plus active for the published field and
          // as completed plus one inside the controller helper, and those disagree on exactly the state
          // that made the first identity fail: a controller bound to a record whose body is not a Task
          // has no active instance, which no conjunct refuses. The controller helper stays as it is,
          // because it is the controller-only representation fact Lean's counter law shares.
          pendingItemCount: Math.max(
            0,
            controller.snapshot.length -
              (completedInstanceCount(controller) + iterations.length),
          ),
          numberOfInstances: completedInstanceCount(controller) +
            iterations.length,
          numberOfActiveInstances: iterations.length,
          numberOfCompletedInstances: completedInstanceCount(controller),
          numberOfTerminatedInstances: 0,
          activeIterations: [...iterations],
        },
      ];
    },
  );
}

/** Whether this task occurrence is the active inner instance of an open controller. */
export function isActiveMultiInstanceIteration(
  state: RuntimeState,
  taskId: Parameters<typeof activityOccurrenceForTaskBody>[1],
): boolean {
  const record = activityOccurrenceForTaskBody(state.activityOccurrences, taskId);
  return record !== undefined &&
    (state.sequentialMultiInstanceControllers ?? []).some((controller) =>
      controller.id.processInstanceId === record.id.processInstanceId &&
      controller.id.activityElementId === record.id.activityElementId &&
      controller.id.activation === record.id.activation
    );
}
