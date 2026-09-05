import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation } from "./semantic-process-contract.js";
import {
  armDataInputUserTask,
} from "./semantic-process-activity-data-input-runtime.js";
import {
  armDataOutputUserTask,
} from "./semantic-process-activity-data-output-runtime.js";
import { onlyTokenOwner } from "./semantic-process-scope-runtime.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

type ActivityDataOperation = Extract<
  SemanticOperation,
  {
    kind:
      | SemanticOperationKind.AwaitDataInputUserTask
      | SemanticOperationKind.AwaitDataOutputUserTask;
  }
>;

export function applyActivityDataOperation(
  operation: ActivityDataOperation,
  state: RuntimeState,
  captureOwner: (owner: ScopeOccurrenceId) => void,
): RuntimeState | null {
  const owner = onlyTokenOwner(state, operation.input);
  if (owner === undefined) {
    return null;
  }
  const successor = applySelectedActivityDataOperation(operation, state, owner);
  if (successor === null) {
    return null;
  }
  captureOwner(owner);
  return successor;
}

function applySelectedActivityDataOperation(
  operation: ActivityDataOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  switch (operation.kind) {
    case SemanticOperationKind.AwaitDataInputUserTask:
      return armDataInputUserTask(operation, state, owner);
    case SemanticOperationKind.AwaitDataOutputUserTask:
      return armDataOutputUserTask(operation, state, owner);
  }
}
