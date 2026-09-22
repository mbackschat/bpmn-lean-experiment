import { ActivityBodyKind, compareActivityOccurrences } from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import { VariableValueKind } from "./contract.js";
import type { VariableBinding } from "./contract.js";
import { matchesActivityLocalDataOwner } from "./local-data-owner.js";
import { addActivityOccurrenceVariableScope } from "./semantic-process-data.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitDataInputUserTaskOperation,
  AwaitDataInputOutputUserTaskOperation,
  AwaitDataOutputUserTaskOperation,
} from "./semantic-process-contract.js";
import { ControlStateKind, nextActivation, setActivationCount } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId, SemanticUserTaskWait } from "./semantic-process-state.js";
import { cloneVariableBinding } from "./variable-value.js";
import {
  applyInternalOrdinaryArmingPatch,
  InternalOrdinaryArmingPatchKind,
} from "./internal-transition-ordinary-arming-patch.js";

export type InternalDataArmingOperation =
  | AwaitDataInputUserTaskOperation
  | AwaitDataInputOutputUserTaskOperation
  | AwaitDataOutputUserTaskOperation;

type ArmingBindings = readonly [] | readonly [VariableBinding];

export type InternalDataArmingPatch = Readonly<{
  owner: ScopeOccurrenceId;
  input: string;
  wait: SemanticUserTaskWait;
  record: ActivityOccurrence;
  bindings: ArmingBindings;
}>;

/** Selects one joined task/Activity lifetime and its operation-specific local data before mutation. */
export function deriveInternalDataArmingPatch(
  operation: InternalDataArmingOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): InternalDataArmingPatch | null {
  if (state.control.kind !== ControlStateKind.Running) return null;
  const bindings = deriveArmingBindings(operation, state);
  if (bindings === null) return null;
  const taskId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.task.elementId,
    activation: nextActivation(state.taskActivations, operation.task.elementId),
  };
  const activityId = {
    processInstanceId: owner.processInstanceId,
    activityElementId: operation.task.elementId,
    activation: nextActivation(state.activityActivations, operation.task.elementId),
  };
  if (state.variables.activities.some(({ owner: candidate }) =>
    matchesActivityLocalDataOwner(candidate, activityId)
  )) return null;
  return {
    owner,
    input: operation.input,
    wait: { id: taskId, owner, name: operation.task.name, output: operation.output },
    record: {
      id: activityId, owner, operationId: operation.id,
      body: { kind: ActivityBodyKind.UserTask, task: taskId }, attachedHandlers: [],
    },
    bindings,
  };
}

/** Applies keyed edits so an already prepared sibling lifetime survives this insertion. */
export function applyInternalDataArmingPatch(
  state: RuntimeState,
  patch: InternalDataArmingPatch,
): RuntimeState {
  const armed = applyInternalOrdinaryArmingPatch(state, {
    kind: InternalOrdinaryArmingPatchKind.UserTask,
    owner: patch.owner,
    input: patch.input,
    wait: patch.wait,
  });
  return {
    ...armed,
    activityOccurrences: [...state.activityOccurrences, patch.record].sort(compareActivityOccurrences),
    activityActivations: setActivationCount(
      state.activityActivations,
      patch.record.id.activityElementId,
      patch.record.id.activation,
    ),
    variables: addActivityOccurrenceVariableScope(state.variables, patch.record.id, patch.bindings),
  };
}

function deriveArmingBindings(operation: InternalDataArmingOperation, state: RuntimeState): ArmingBindings | null {
  switch (operation.kind) {
    case SemanticOperationKind.AwaitDataOutputUserTask:
      return [];
    case SemanticOperationKind.AwaitDataInputUserTask:
    case SemanticOperationKind.AwaitDataInputOutputUserTask: {
      const matching = state.variables.process.bindings.filter(
        ({ name }) => name === operation.directInput.sourcePropertyId,
      );
      const source = matching[0];
      if (matching.length !== 1 || source === undefined) return null;
      switch (source.value.kind) {
        case VariableValueKind.String:
        case VariableValueKind.Null:
          return [{ name: operation.directInput.targetDataInputId, value: cloneVariableBinding(source).value }];
        case VariableValueKind.Boolean:
        case VariableValueKind.Integer:
        case VariableValueKind.StringList:
          return null;
      }
    }
  }
}
