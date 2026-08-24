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
 * well-formed state for a program declaring one yields an array, empty before outer entry and after
 * either closing route. A malformed binding yields `null`. That keeps the distinction structural and
 * prevents registration state from becoming an observation-shape rule.
 */
import { activityOccurrenceForTaskBody } from "./activity-occurrence.js";
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
import {
  sequentialMultiInstanceBindingsForState,
  type SequentialMultiInstanceBinding,
} from "./sequential-multi-instance-binding.js";

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
  binding: SequentialMultiInstanceBinding,
): ReadonlyArray<OpenSequentialMultiInstanceIteration> {
  const item = activeSnapshotItem(binding.controller);
  if (item === undefined) {
    return [];
  }
  return [
    {
      loopCounter: completedInstanceCount(binding.controller),
      taskId: binding.taskWait.id,
      taskInput: {
        name: binding.operation.data.input.taskDataInputId,
        value: { kind: VariableValueKind.String, value: item },
      },
      completionBindingName: binding.operation.data.output.taskDataOutputId,
    },
  ];
}

/**
 * Stable Multi-Instance progress, `undefined` when the program declares no such Activity, or `null`
 * when its runtime binding is malformed.
 *
 * A controller whose complete operation/record/body/Timer binding cannot be resolved is refused
 * rather than projected with invented definition facts. The input and output binding names are
 * definition-owned, so there is no honest projection of a malformed controller.
 *
 * `numberOfInstances` is the sum of the two counts published beside it rather than a third reading of
 * the controller. Completed comes from the controller's slots and active from the Activity occurrence
 * record's exact bound User Task body. The program-aware well-formedness conjunct guarantees that
 * this is one active iteration, while summing still makes Table 10.30's identity arithmetic rather
 * than an agreement between two independently stored counters.
 */
export function projectOpenMultiInstances(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<OpenSequentialMultiInstance> | undefined | null {
  const operations = multiInstanceOperations(program);
  if (operations.length === 0) {
    return undefined;
  }
  const bindings = sequentialMultiInstanceBindingsForState(program, state);
  if (bindings === undefined) {
    return null;
  }
  return bindings.map(
    (binding) => {
      const { controller } = binding;
      const iterations = activeIterations(binding);
      return {
        id: controller.id,
        mode: "sequential" as const,
        plannedInstanceCount: controller.snapshot.length,
        // Both normative identities are arithmetic over the three counts published beside them,
        // because both derive generated the same way. Reading `pendingItemCount(controller)` here
        // instead would derive generated twice, as completed plus active for the published field and
        // as completed plus one inside the controller helper. The exact program binding now proves
        // that the open controller has one active User Task, but deriving the published tuple from
        // one root still prevents a future change from relocating disagreement between its fields.
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
      };
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
