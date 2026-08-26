/** Exact current-open bindings for parallel Multi-Instance task and boundary waits. */
import {
  sameActivityOccurrence,
  type ActivityOccurrence,
} from "./activity-occurrence.js";
import type { BoundaryTimerBinding } from "./flow-node-occurrence-open-set.js";
import {
  parallelMultiInstanceBindingForController,
  parallelMultiInstanceBindingsForState,
} from "./parallel-multi-instance-binding.js";
import type {
  AwaitParallelMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  sameOccurrence,
  type RuntimeState,
  type SemanticTimerWait,
  type SemanticUserTaskWait,
} from "./semantic-process-state.js";

export function parallelMultiInstanceTaskWaitMatches(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  wait: SemanticUserTaskWait,
): boolean {
  const bindings = parallelMultiInstanceBindingsForState(program, state);
  return bindings !== undefined && bindings.some((binding) =>
    binding.operation.id === operation.id && binding.taskWaits.some(({ id }) =>
      sameOccurrence(id, wait.id)
    )
  );
}

export function parallelMultiInstanceBoundaryTimerBinding(
  program: SemanticProcessProgram,
  state: RuntimeState,
  record: ActivityOccurrence,
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  wait: SemanticTimerWait,
): BoundaryTimerBinding | null {
  const controllers = (state.parallelMultiInstanceControllers ?? []).filter(
    ({ id }) => sameActivityOccurrence(id, record.id),
  );
  const [controller] = controllers;
  const binding = controller === undefined ? undefined
    : parallelMultiInstanceBindingForController(program, state, controller);
  return controllers.length !== 1 || binding === undefined ||
      binding.operation.id !== operation.id ||
      !sameOccurrence(binding.timerWait.id, wait.id)
    ? null
    : {
        operation,
        activeTasks: binding.taskWaits.map(({ id }) => id),
      };
}
