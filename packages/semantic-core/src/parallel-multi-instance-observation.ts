/** Public progress derived from the exact indexed parallel controller binding. */
import { VariableValueKind } from "./contract.js";
import type {
  OpenParallelMultiInstance,
  OpenParallelMultiInstanceIteration,
} from "./contract.js";
import {
  ParallelMultiInstanceSlotKind,
  completedParallelInstanceCount,
} from "./parallel-multi-instance-controller.js";
import {
  parallelMultiInstanceBindingsForState,
  type ParallelMultiInstanceBinding,
} from "./parallel-multi-instance-binding.js";
import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import type { RuntimeState } from "./semantic-process-state.js";

function activeIterations(
  binding: ParallelMultiInstanceBinding,
): ReadonlyArray<OpenParallelMultiInstanceIteration> {
  return binding.controller.slots.flatMap((slot, loopCounter) => {
    if (slot.kind !== ParallelMultiInstanceSlotKind.Pending) return [];
    return [{
      loopCounter,
      taskId: slot.taskId,
      taskInput: {
        name: binding.operation.data.input.taskDataInputId,
        value: {
          kind: VariableValueKind.String,
          value: binding.controller.snapshot[loopCounter]!,
        },
      },
      completionBindingName:
        binding.operation.data.output.taskDataOutputId,
    }];
  });
}

export function projectOpenParallelMultiInstances(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<OpenParallelMultiInstance> | undefined | null {
  const declaresParallel = program.operations.some(({ kind }) =>
    kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  );
  if (!declaresParallel) return undefined;
  const bindings = parallelMultiInstanceBindingsForState(program, state);
  if (bindings === undefined) return null;
  return bindings.map((binding) => {
    const active = activeIterations(binding);
    const completed = completedParallelInstanceCount(binding.controller);
    return {
      id: binding.controller.id,
      mode: "parallel" as const,
      plannedInstanceCount: binding.controller.slots.length,
      pendingItemCount: 0 as const,
      numberOfInstances: active.length + completed,
      numberOfActiveInstances: active.length,
      numberOfCompletedInstances: completed,
      numberOfTerminatedInstances: 0 as const,
      activeIterations: [...active],
    };
  });
}
