/**
 * One composed User Task lifetime carrying a required direct input and a required direct output.
 *
 * The two associations constrain opposite boundaries of the same Activity occurrence. Entry copies
 * one available Process binding into the occurrence-owned local scope; completion routes one
 * submitted DataOutput into Process scope and disposes that same scope. Keeping this as one runtime
 * owner prevents sequential reuse of the input-only and output-only evaluators from minting two
 * occurrences for one BPMN Activity.
 */
import {
  ActivityBodyKind,
  activityOccurrenceForTaskBody,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type {
  ActivityOccurrence,
  ActivityOccurrenceId,
} from "./activity-occurrence.js";
import { StimulusKind, VariableValueKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  UserTaskInstanceId,
  VariableBinding,
} from "./contract.js";
import { matchesActivityLocalDataOwner } from "./local-data-owner.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitDataInputOutputUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addActivityOccurrenceVariableScope,
  activityOccurrenceVariableBindings,
  mergeProcessVariableBindings,
  removeActivityOccurrenceVariableScope,
} from "./semantic-process-data.js";
import {
  ControlStateKind,
  addToken,
  compareUserTaskWaits,
  nextActivation,
  removeToken,
  sameOccurrence,
  sameScopeOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";
import { cloneVariableBinding } from "./variable-value.js";

type DataInputOutputTask = Readonly<{
  definition: AwaitDataInputOutputUserTaskOperation;
  record: ActivityOccurrence;
  wait: SemanticUserTaskWait;
}>;

/** Arms the one Activity occurrence only when its required Process source is available. */
export function armDataInputOutputUserTask(
  operation: AwaitDataInputOutputUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const source = availableSourceBinding(state, operation);
  if (source === undefined) {
    return null;
  }
  const taskId: UserTaskInstanceId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.task.elementId,
    activation: nextActivation(state.taskActivations, operation.task.elementId),
  };
  const activityId: ActivityOccurrenceId = {
    processInstanceId: owner.processInstanceId,
    activityElementId: operation.task.elementId,
    activation: nextActivation(
      state.activityActivations,
      operation.task.elementId,
    ),
  };
  if (
    state.variables.activities.some(({ owner: candidate }) =>
      matchesActivityLocalDataOwner(candidate, activityId)
    )
  ) {
    return null;
  }
  const record: ActivityOccurrence = {
    id: activityId,
    owner,
    operationId: operation.id,
    body: { kind: ActivityBodyKind.UserTask, task: taskId },
    attachedHandlers: [],
  };
  const wait: SemanticUserTaskWait = {
    id: taskId,
    owner,
    name: operation.task.name,
    output: operation.output,
  };
  return {
    ...state,
    controlTokens: removeToken(state.controlTokens, operation.input, owner),
    userTaskWaits: [...state.userTaskWaits, wait].sort(compareUserTaskWaits),
    taskActivations: setActivationCount(
      state.taskActivations,
      taskId.elementId,
      taskId.activation,
    ),
    activityOccurrences: [...state.activityOccurrences, record]
      .sort(compareActivityOccurrences),
    activityActivations: setActivationCount(
      state.activityActivations,
      activityId.activityElementId,
      activityId.activation,
    ),
    variables: addActivityOccurrenceVariableScope(state.variables, activityId, [{
      name: operation.directInput.targetDataInputId,
      value: source.value,
    }]),
  };
}

/** Whether any composed operation declares this task element for command-family routing. */
export function hasDataInputOutputTaskDeclaration(
  program: SemanticProcessProgram,
  taskId: UserTaskInstanceId,
): boolean {
  return program.operations.some(
    (operation) =>
      operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask &&
      operation.task.elementId === taskId.elementId,
  );
}

/** Routes one exact submitted DataOutput and disposes the Activity occurrence in the same step. */
export function completeDataInputOutputUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance ||
    state.control.kind !== ControlStateKind.Running
  ) {
    return null;
  }
  const selected = dataInputOutputTaskFor(program, state, stimulus.taskId);
  if (selected === undefined) {
    return null;
  }
  const filled = filledDeclaredOutput(selected.definition, stimulus);
  if (filled === undefined) {
    return null;
  }
  const localBindings = activityOccurrenceVariableBindings(
    state.variables,
    selected.record.id,
  );
  const localInput = localBindings?.[0];
  if (
    localBindings?.length !== 1 || localInput === undefined ||
    localInput.name !== selected.definition.directInput.targetDataInputId ||
    !supported(localInput)
  ) {
    return null;
  }
  const disposed = removeActivityOccurrenceVariableScope(
    state.variables,
    selected.record.id,
  );
  if (disposed === null) {
    return null;
  }
  const routed = {
    name: selected.definition.directOutput.targetPropertyId,
    value: filled.value,
  };
  return {
    ...state,
    controlTokens: addToken(
      state.controlTokens,
      selected.wait.output,
      selected.wait.owner,
    ),
    userTaskWaits: state.userTaskWaits.filter(
      (candidate) => candidate !== selected.wait,
    ),
    activityOccurrences: state.activityOccurrences.filter(
      (candidate) => !sameActivityOccurrence(candidate.id, selected.record.id),
    ),
    variables: {
      ...disposed,
      process: {
        bindings: mergeProcessVariableBindings(
          disposed.process.bindings,
          [routed],
        ),
      },
    },
  };
}

function availableSourceBinding(
  state: RuntimeState,
  operation: AwaitDataInputOutputUserTaskOperation,
): VariableBinding | undefined {
  const matching = state.variables.process.bindings.filter(
    ({ name }) => name === operation.directInput.sourcePropertyId,
  );
  const binding = matching[0];
  return matching.length === 1 && binding !== undefined && supported(binding)
    ? cloneVariableBinding(binding)
    : undefined;
}

function filledDeclaredOutput(
  definition: AwaitDataInputOutputUserTaskOperation,
  stimulus: CompleteUserTaskInstanceStimulus,
): VariableBinding | undefined {
  const binding = stimulus.submittedValues[0];
  return stimulus.submittedValues.length === 1 && binding !== undefined &&
      binding.name === definition.directOutput.sourceDataOutputId && supported(binding)
    ? cloneVariableBinding(binding)
    : undefined;
}

function supported(binding: VariableBinding): boolean {
  switch (binding.value.kind) {
    case VariableValueKind.String:
    case VariableValueKind.Null:
      return true;
    case VariableValueKind.Boolean:
    case VariableValueKind.Integer:
    case VariableValueKind.StringList:
      return false;
  }
}

function dataInputOutputTaskFor(
  program: SemanticProcessProgram,
  state: RuntimeState,
  taskId: UserTaskInstanceId,
): DataInputOutputTask | undefined {
  const declarers = program.operations.filter(
    (operation): operation is AwaitDataInputOutputUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask &&
      operation.task.elementId === taskId.elementId,
  );
  const definition = declarers[0];
  const waits = state.userTaskWaits.filter(({ id }) =>
    sameOccurrence(id, taskId)
  );
  const wait = waits[0];
  const record = activityOccurrenceForTaskBody(state.activityOccurrences, taskId);
  const scopeBindings = program.operationScopes.filter(
    ({ operationId }) => operationId === definition?.id,
  );
  return declarers.length !== 1 || definition === undefined ||
      waits.length !== 1 || wait === undefined || record === undefined ||
      record.operationId !== definition.id || record.attachedHandlers.length !== 0 ||
      !sameScopeOccurrence(record.owner, wait.owner) ||
      wait.id.processInstanceId !== wait.owner.processInstanceId ||
      record.id.processInstanceId !== wait.owner.processInstanceId ||
      record.id.activityElementId !== definition.task.elementId ||
      wait.name !== definition.task.name || wait.output !== definition.output ||
      scopeBindings.length !== 1 || scopeBindings[0]?.scopeId !== wait.owner.definitionScopeId
    ? undefined
    : { definition, record, wait };
}
