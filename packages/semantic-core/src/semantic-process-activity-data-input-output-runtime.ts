/**
 * One composed User Task lifetime carrying a required direct input and a required direct output.
 *
 * The two associations constrain opposite boundaries of the same Activity occurrence. Entry copies
 * one available Process binding into the occurrence-owned local scope; completion routes one
 * submitted DataOutput into Process scope and disposes that same scope. Keeping this as one runtime
 * owner prevents sequential reuse of the input-only and output-only evaluators from minting two
 * occurrences for one BPMN Activity.
 */
import { writeActivityDataOutputTarget } from "./activity-data-endpoint.js";
import {
  activityOccurrenceForTaskBody,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type {
  ActivityOccurrence,
} from "./activity-occurrence.js";
import { StimulusKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  UserTaskInstanceId,
  VariableBinding,
} from "./contract.js";
import {
  applyInternalDataArmingPatch,
  deriveInternalDataArmingPatch,
} from "./internal-transition-data-arming-patch.js";
import { propertyPathAcceptsValue, propertyPathValuePolicyForProfile } from "./property-path-value-policy.js";
import type { PropertyPathValuePolicy } from "./property-path-value-policy.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitDataInputOutputUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  activityOccurrenceVariableBindings,
  removeActivityOccurrenceVariableScope,
} from "./semantic-process-data.js";
import {
  ControlStateKind,
  addToken,
  sameOccurrence,
  sameScopeOccurrence,
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

/** Arms the one Activity occurrence only when its required Process source is available and in the path's domain. */
export function armDataInputOutputUserTask(
  operation: AwaitDataInputOutputUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  policy: PropertyPathValuePolicy,
): RuntimeState | null {
  const patch = deriveInternalDataArmingPatch(operation, state, owner, policy);
  return patch === null ? null : applyInternalDataArmingPatch(state, patch);
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
  const policy = propertyPathValuePolicyForProfile(program.identity.semanticProfile);
  const filled = filledDeclaredOutput(selected.definition, stimulus, policy);
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
    !propertyPathAcceptsValue(policy, localInput.value)
  ) {
    return null;
  }
  const written = writeActivityDataOutputTarget(
    state, selected.wait.owner, selected.definition.directOutput.target, filled,
  );
  if (written === null) return null;
  const disposed = removeActivityOccurrenceVariableScope(written, selected.record.id);
  if (disposed === null) return null;
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
    variables: disposed,
  };
}

function filledDeclaredOutput(
  definition: AwaitDataInputOutputUserTaskOperation,
  stimulus: CompleteUserTaskInstanceStimulus,
  policy: PropertyPathValuePolicy,
): VariableBinding | undefined {
  const binding = stimulus.submittedValues[0];
  return stimulus.submittedValues.length === 1 && binding !== undefined &&
      binding.name === definition.directOutput.sourceDataOutputId && propertyPathAcceptsValue(policy, binding.value)
    ? cloneVariableBinding(binding)
    : undefined;
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
