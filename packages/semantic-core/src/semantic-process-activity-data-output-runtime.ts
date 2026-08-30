/**
 * Executable transitions for one User Task whose accepted completion writes a direct Activity data
 * output.
 *
 * This is the opposite end of the occurrence from the data-input family. Clause 10.4.1 places an
 * Activity's output Data Associations *after* its work completes, so nothing here constrains entry:
 * the token alone activates the task and the OutputSet becomes an obligation only at completion.
 * Reusing the input family's arming would therefore be wrong rather than merely redundant, because
 * it would make a declared output delay an Activity the standard lets start.
 *
 * Availability of the single required output is decided entirely by the command's shape in this
 * slice, so the fill and the requirement fail together. They are kept as separate steps below
 * regardless, because the association is what routes the value: filling under the declared
 * `DataOutput` id and writing under the associated `Property` id are two names on purpose, and code
 * that collapsed them would pass every routed expectation by coincidence.
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
  AwaitDataOutputUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  addActivityOccurrenceVariableScope,
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
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticUserTaskWait,
} from "./semantic-process-state.js";
import { cloneVariableBinding } from "./variable-value.js";

/** A live output-bearing task joined to the definition and the Activity record that own it. */
type DataOutputTask = Readonly<{
  definition: AwaitDataOutputUserTaskOperation;
  record: ActivityOccurrence;
  wait: SemanticUserTaskWait;
}>;

/**
 * `ADOUTPUT-ENTRY-01`. Consumes the incoming token and produces the task occurrence, its Activity
 * record, and an empty occurrence-owned scope.
 *
 * The scope stays empty for the occurrence's whole lifetime. `ADOUTPUT-ATOMIC-01` fuses the fill
 * with the association, so the submitted value reaches Process scope under the associated Property's
 * id without ever being materialized here; a write-then-remove would be dead state.
 *
 * The container is created at entry rather than at completion so that the Activity owns one lifetime
 * rather than two: `ADOUTPUT-ATOMIC-01`'s disposal then removes a scope that has existed for the
 * whole occurrence, every runtime-state invariant that pairs a record with its scope holds while the
 * task is open, and later coverage that must read an output between its production and its copy has
 * the container it needs.
 */
export function armDataOutputUserTask(
  operation: AwaitDataOutputUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
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
    variables: addActivityOccurrenceVariableScope(
      state.variables,
      activityId,
      [],
    ),
  };
}

/** Whether this task identity is declared by exactly one output-bearing entry operation. */
export function isDataOutputTaskDefinition(
  program: SemanticProcessProgram,
  taskId: UserTaskInstanceId,
): boolean {
  return dataOutputDefinition(program, taskId.elementId) !== undefined;
}

/**
 * `ADOUTPUT-FILL-01`, `ADOUTPUT-ROUTE-01`, `ADOUTPUT-ATOMIC-01`, and `ADOUTPUT-REQUIRE-01`. Commits
 * the exact active task, executing its association and disposing its Activity record and local scope
 * in one transition.
 *
 * A submission that does not make the single declared output available is refused rather than
 * committed with a partial write, so the caller observes the unchanged state instead of an Activity
 * that completed without honouring its OutputSet.
 */
export function completeDataOutputUserTask(
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
  const selected = dataOutputTaskFor(program, state, stimulus.taskId);
  if (selected === undefined) {
    return null;
  }
  const filled = filledDeclaredOutput(selected.definition, stimulus);
  if (filled === undefined) {
    return null;
  }
  const routed = associatedProcessBinding(selected.definition, filled);
  const disposed = removeActivityOccurrenceVariableScope(
    state.variables,
    selected.record.id,
  );
  if (disposed === null) {
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
    variables: {
      ...disposed,
      process: {
        bindings: mergeProcessVariableBindings(disposed.process.bindings, [
          routed,
        ]),
      },
    },
  };
}

/**
 * The Activity-local binding this completion writes into the declared `DataOutput`, or `undefined`.
 *
 * Cardinality is checked before the name so an extra undeclared value is refused rather than
 * silently dropped: this profile's OutputSet declares exactly one member, and accepting a superset
 * would let a command introduce output mediation the model never declared.
 */
function filledDeclaredOutput(
  definition: AwaitDataOutputUserTaskOperation,
  stimulus: CompleteUserTaskInstanceStimulus,
): VariableBinding | undefined {
  const submitted = stimulus.submittedValues[0];
  return stimulus.submittedValues.length === 1 && submitted !== undefined &&
      submitted.name === definition.directOutput.sourceDataOutputId
    ? cloneVariableBinding(submitted)
    : undefined;
}

/**
 * Executes the direct association: the local value under the association's target `Property` name.
 *
 * The submitted name is deliberately discarded here. It identified the `DataOutput` inside the
 * Activity, and the association alone decides which Process `Property` receives the value.
 */
function associatedProcessBinding(
  definition: AwaitDataOutputUserTaskOperation,
  filled: VariableBinding,
): VariableBinding {
  return {
    name: definition.directOutput.targetPropertyId,
    value: filled.value,
  };
}

function dataOutputDefinition(
  program: SemanticProcessProgram,
  elementId: string,
): AwaitDataOutputUserTaskOperation | undefined {
  const declarers = program.operations.filter(
    (operation): operation is AwaitDataOutputUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitDataOutputUserTask &&
      operation.task.elementId === elementId,
  );
  return declarers.length === 1 ? declarers[0] : undefined;
}

/** Joins definition, Activity record, and live wait, requiring the record to own this exact body. */
function dataOutputTaskFor(
  program: SemanticProcessProgram,
  state: RuntimeState,
  taskId: UserTaskInstanceId,
): DataOutputTask | undefined {
  const definition = dataOutputDefinition(program, taskId.elementId);
  const wait = state.userTaskWaits.find((candidate) =>
    sameOccurrence(candidate.id, taskId)
  );
  const record = activityOccurrenceForTaskBody(
    state.activityOccurrences,
    taskId,
  );
  return definition === undefined || wait === undefined ||
      record === undefined || record.operationId !== definition.id ||
      record.attachedHandlers.length !== 0
    ? undefined
    : { definition, record, wait };
}
