import { isPristineRuntimeState } from "./pristine-runtime-state.js";
import { ActivityBodyKind, sameActivityOccurrence } from "./activity-occurrence.js";
import { CallDataKind } from "./call-data-contract.js";
import { callDataProgramGraph } from "./call-data-program-admission.js";
import { VariableValueKind } from "./contract.js";
import type { VariableBinding } from "./contract.js";
import { matchesActivityLocalDataOwner } from "./local-data-owner.js";
import { calledProcessAssociationsAreValid } from "./semantic-process-call-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { AwaitDataInputOutputUserTaskOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { ControlStateKind, sameOccurrence, sameScopeOccurrence } from "./semantic-process-state.js";
import type { CalledProcessOccurrence, RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import { CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { isVariablePatch } from "./variable-value.js";

/**
 * CDATA-OWNER-01 and CDATA-OUTPUT-01 validate the selected serial Call's stored data and lifetime joins.
 * Input immutability and caller preservation require predecessor/successor laws; this state predicate
 * establishes neither history fact. Other profiles keep their existing committed-state contract.
 */
export function callDataStateIsValid(program: SemanticProcessProgram, state: RuntimeState): boolean {
  if (program.identity.semanticProfile !== CALL_ACTIVITY_DATA_BOUNDARIES_CHECKPOINT_PROFILE_ID) return true;
  if (state.control.kind === ControlStateKind.NotStarted) {
    return isPristineRuntimeState(state);
  }
  if (!callDataProgramGraph(program) || state.variables.scopes.length !== 0) return false;
  const invoke = program.operations.find((operation) => operation.kind === SemanticOperationKind.InvokeProcess);
  const complete = program.operations.find((operation) => operation.kind === SemanticOperationKind.CompleteScope);
  const tasks = program.operations.filter((operation) => operation.kind === SemanticOperationKind.AwaitDataInputOutputUserTask);
  if (invoke?.data.kind !== CallDataKind.Scalar || complete === undefined || invoke.data.directInput.source.kind !== "property") return false;
  const { data } = invoke;
  const request = invoke.data.directInput.source.propertyId;
  const caller: ScopeOccurrenceId = { processInstanceId: state.control.instanceId, definitionScopeId: complete.scopeId, activation: 1 };
  if (!scalarBindings(state.variables.process.bindings) ||
      !state.variables.process.bindings.every(({ name }) => data.callerProperties.includes(name)) ||
      !state.variables.process.bindings.some(({ name }) => name === request)) return false;
  if (state.control.kind !== ControlStateKind.Running) {
    return state.variables.processInterfaces.length === 0 && state.calledProcessOccurrences.length === 0 &&
      state.userTaskWaits.length === 0 && state.activityOccurrences.length === 0 && state.variables.activities.length === 0;
  }
  if (!calledProcessAssociationsAreValid(state) || state.calledProcessOccurrences.length > 1 ||
      state.variables.processInterfaces.length !== state.calledProcessOccurrences.length ||
      state.scopeOccurrences.length !== state.calledProcessOccurrences.length + 1 ||
      state.scopeOccurrences.filter(({ id, parent }) => parent === null && sameScopeOccurrence(id, caller)).length !== 1) return false;
  const record = state.calledProcessOccurrences[0];
  if (record !== undefined) {
    const portScope = state.variables.processInterfaces[0];
    const calledTask = tasks.find((task) => task.input === invoke.calledEntry);
    if (portScope === undefined || calledTask === undefined ||
        !sameScopeOccurrence(record.caller, caller) || record.id.elementId !== invoke.origin.elementId || record.id.activation !== 1 ||
        selectedCounter(state.callActivations, invoke.origin.elementId) !== 1 ||
        record.calledProcessId !== invoke.calledProcessId || record.calledRoot.definitionScopeId !== invoke.calledRootScopeId ||
        record.returnOperationId !== invoke.returnOperationId || !sameScopeOccurrence(portScope.owner, record.calledRoot) ||
        !singletonScalar(portScope.inputs, data.called.input.id) || !scalarBindings(portScope.outputs) ||
        portScope.outputs.length > 1 || portScope.outputs.some(({ name }) => name !== data.called.output.id) ||
        !calledOutputLifetime(state, calledTask, record, portScope.outputs.length)) return false;
  }
  return taskDataJoins(program, state, tasks, caller, record);
}


function calledOutputLifetime(
  state: RuntimeState,
  task: AwaitDataInputOutputUserTaskOperation,
  record: CalledProcessOccurrence,
  outputs: number,
): boolean {
  const activation = selectedCounter(state.taskActivations, task.task.elementId);
  const waits = state.userTaskWaits.filter(({ id }) => id.elementId === task.task.elementId);
  if (waits.length > 1 || waits.some(({ owner }) => !sameScopeOccurrence(owner, record.calledRoot))) return false;
  switch (activation) {
    case 0: return waits.length === 0 && outputs === 0;
    case 1: return outputs === (waits.length === 1 ? 0 : 1);
    default: return false;
  }
}

/** Bidirectional cardinality precedes content checks so an orphan or malformed duplicate cannot disappear in filtering. */
function taskDataJoins(
  program: SemanticProcessProgram,
  state: RuntimeState,
  tasks: readonly AwaitDataInputOutputUserTaskOperation[],
  caller: ScopeOccurrenceId,
  call: CalledProcessOccurrence | undefined,
): boolean {
  if (state.userTaskWaits.length > 1 || state.activityOccurrences.length !== state.userTaskWaits.length ||
      state.variables.activities.length !== state.userTaskWaits.length) return false;
  return state.userTaskWaits.every((wait) => {
    const definitions = tasks.filter(({ task }) => task.elementId === wait.id.elementId);
    const task = definitions[0];
    const activities = state.activityOccurrences.filter(({ body }) => body.kind === ActivityBodyKind.UserTask && sameOccurrence(body.task, wait.id));
    const activity = activities[0];
    if (definitions.length !== 1 || task === undefined || activities.length !== 1 || activity === undefined) return false;
    const expectedOwner = task.directInput.source.kind === "processDataInput" ? call?.calledRoot : caller;
    const bindings = program.operationScopes.filter(({ operationId }) => operationId === task.id);
    const locals = state.variables.activities.filter(({ owner }) => matchesActivityLocalDataOwner(owner, activity.id));
    const local = locals[0];
    return expectedOwner !== undefined && sameScopeOccurrence(wait.owner, expectedOwner) &&
      sameScopeOccurrence(activity.owner, expectedOwner) &&
      (task.directInput.source.kind !== "property" || call === undefined) &&
      bindings.length === 1 && bindings[0]?.scopeId === expectedOwner.definitionScopeId &&
      wait.id.processInstanceId === expectedOwner.processInstanceId && wait.id.activation === 1 &&
      wait.name === task.task.name && wait.output === task.output &&
      activity.operationId === task.id && activity.attachedHandlers.length === 0 &&
      sameActivityOccurrence(activity.id, { processInstanceId: expectedOwner.processInstanceId, activityElementId: task.task.elementId, activation: 1 }) &&
      selectedCounter(state.taskActivations, task.task.elementId) === 1 && selectedCounter(state.activityActivations, task.task.elementId) === 1 &&
      locals.length === 1 && local !== undefined && singletonScalar(local.bindings, task.directInput.targetDataInputId);
  });
}

function selectedCounter(counters: RuntimeState["taskActivations"], elementId: string): number | undefined {
  const matches = counters.filter((counter) => counter.elementId === elementId);
  return matches.length === 0 ? 0 : matches.length === 1 ? matches[0]?.count : undefined;
}

function singletonScalar(bindings: readonly VariableBinding[], portId: string): boolean {
  return bindings.length === 1 && bindings[0]?.name === portId && scalarBindings(bindings);
}

function scalarBindings(bindings: readonly VariableBinding[]): boolean {
  return isVariablePatch(bindings) && bindings.every(({ value }) => {
    switch (value.kind) {
      case VariableValueKind.String:
      case VariableValueKind.Null: return true;
      case VariableValueKind.Boolean:
      case VariableValueKind.Integer:
      case VariableValueKind.StringList:
      case VariableValueKind.Decimal:
      case VariableValueKind.List:
      case VariableValueKind.Map: return false;
    }
  });
}
