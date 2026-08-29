/**
 * Executable transitions for one User Task whose entry fills a direct Activity data input.
 *
 * Clause 10.4.2 makes an InputSet unavailable while any of its Data Association sources is
 * unavailable, and the Activity then waits. That is the whole content of this family: the incoming
 * token alone does not enable the Activity, and the enabling fact is a Process binding this module
 * reads but never writes. Once the source is available the associations execute *before* the Activity
 * begins, so arming and copying are one transition rather than two.
 *
 * Availability is decided at the representation level, which is a recorded profile interpretation
 * rather than a normative rule: a missing canonical binding is unavailable, and a present binding
 * whose value arm is null is available and is copied as explicit null. A truthiness test here would
 * make a valid null-valued source behave as a permanently unavailable one.
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
import { StimulusKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  UserTaskInstanceId,
  VariableBinding,
} from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitDataInputUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addActivityOccurrenceVariableScope,
  removeActivityOccurrenceVariableScope,
} from "./semantic-process-data.js";
import {
  ControlStateKind,
  addToken,
  compareUserTaskWaits,
  nextActivation,
  removeToken,
  sameOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";
import { cloneVariableBinding } from "./variable-value.js";

/** A live data-bearing task joined to the definition and the Activity record that own it. */
type DataInputTask = Readonly<{
  definition: AwaitDataInputUserTaskOperation;
  record: ActivityOccurrence;
  wait: SemanticUserTaskWait;
}>;

/**
 * `ADINPUT-READY-01` and `ADINPUT-COPY-01`. Atomically consumes the incoming token and produces the
 * task occurrence, its Activity record, and the occurrence-owned copy of the source value.
 *
 * Returns `null` while the source Property is unbound, which is the family's stable ready state
 * rather than an error: the token stays where it is and nothing else about the state changes.
 */
export function armDataInputUserTask(
  operation: AwaitDataInputUserTaskOperation,
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
  const record: ActivityOccurrence = {
    id: activityId,
    owner,
    operationId: operation.id,
    body: { kind: ActivityBodyKind.UserTask, task: taskId },
    attachedTimers: [],
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
    variables: addActivityOccurrenceVariableScope(state.variables, activityId, [
      {
        name: operation.directInput.targetDataInputId,
        value: source.value,
      },
    ]),
  };
}

/** Whether this task identity is declared by exactly one data-bearing entry operation. */
export function isDataInputTaskDefinition(
  program: SemanticProcessProgram,
  taskId: UserTaskInstanceId,
): boolean {
  return dataInputDefinition(program, taskId.elementId) !== undefined;
}

/**
 * `ADINPUT-COMPLETE-01`. Commits the exact active task, disposing its Activity record and local
 * scope in the same transition and leaving Process data untouched.
 *
 * A non-empty submission is refused rather than ignored: this profile's OutputSet is empty, so
 * accepting a value would silently add the output mediation the capsule excludes.
 */
export function completeDataInputUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance ||
    stimulus.submittedValues.length !== 0 ||
    state.control.kind !== ControlStateKind.Running
  ) {
    return null;
  }
  const selected = dataInputTaskFor(program, state, stimulus.taskId);
  if (selected === undefined) {
    return null;
  }
  const variables = removeActivityOccurrenceVariableScope(
    state.variables,
    selected.record.id,
  );
  if (variables === null) {
    return null;
  }
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
    variables,
  };
}

/**
 * The exact present Process binding this operation's association reads, or `undefined`.
 *
 * A duplicated name is treated as unavailable rather than resolved by order: two bindings under one
 * name is an invalid Process scope, and picking either would make the copied value depend on
 * collection order instead of on the model.
 */
function availableSourceBinding(
  state: RuntimeState,
  operation: AwaitDataInputUserTaskOperation,
): VariableBinding | undefined {
  const matching = state.variables.process.bindings.filter(
    ({ name }) => name === operation.directInput.sourcePropertyId,
  );
  const binding = matching[0];
  return matching.length === 1 && binding !== undefined
    ? cloneVariableBinding(binding)
    : undefined;
}

function dataInputDefinition(
  program: SemanticProcessProgram,
  elementId: string,
): AwaitDataInputUserTaskOperation | undefined {
  const declarers = program.operations.filter(
    (operation): operation is AwaitDataInputUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitDataInputUserTask &&
      operation.task.elementId === elementId,
  );
  return declarers.length === 1 ? declarers[0] : undefined;
}

/** Joins definition, Activity record, and live wait, requiring the record to own this exact body. */
function dataInputTaskFor(
  program: SemanticProcessProgram,
  state: RuntimeState,
  taskId: UserTaskInstanceId,
): DataInputTask | undefined {
  const definition = dataInputDefinition(program, taskId.elementId);
  const wait = state.userTaskWaits.find((candidate) =>
    sameOccurrence(candidate.id, taskId)
  );
  const record = activityOccurrenceForTaskBody(
    state.activityOccurrences,
    taskId,
  );
  return definition === undefined || wait === undefined ||
      record === undefined || record.operationId !== definition.id ||
      record.attachedTimers.length !== 0
    ? undefined
    : { definition, record, wait };
}
