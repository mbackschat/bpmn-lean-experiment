/** Pure transition for the ordinary, non-specialized User Task completion arm. */
import { hasSequentialScopeDefinition } from "./sequential-scope-binding.js";
import { nestedScopeDataProgram, nestedScopePatchAdmitted, writeNestedScopeVariables } from "./nested-scope-data.js";
import { SequentialScopeWriteKind, writeSequentialScopeValues } from "./sequential-scope-data.js";
import { hasParallelScopeDefinition, writeParallelScopeValues } from "./parallel-scope-data.js";
import type {
  CompleteUserTaskInstanceStimulus,
} from "./contract.js";
import type {
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  CompensationCompletionFactKind,
} from "./compensation-activity-retention-contract.js";
import {
  isCompensationRetentionTarget,
  stageCompensationActivityRetention,
} from "./compensation-activity-retention-producers.js";
import {
  mergeProcessVariableBindings,
} from "./semantic-process-data.js";
import {
  SemanticProfileId,
} from "./semantic-process-profile.js";
import {
  ControlStateKind,
  addToken,
  sameOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
} from "./semantic-process-state.js";

export function completeOrdinaryUserTask(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  const wait = state.userTaskWaits.find((candidate) =>
    sameOccurrence(candidate.id, stimulus.taskId)
  );
  if (
    state.control.kind !== ControlStateKind.Running ||
    wait === undefined ||
    (program.identity.semanticProfile === SemanticProfileId.CalledProcessCallActivity &&
      stimulus.submittedValues.length !== 0)
  ) {
    return null;
  }
  const previousActivityActivation = state.activityActivations.find(
    ({ elementId }) => elementId === wait.id.elementId,
  )?.count ?? 0;
  const retentionInput = isCompensationRetentionTarget(program, wait.id.elementId)
    ? {
      ...state,
      activityActivations: setActivationCount(
        state.activityActivations,
        wait.id.elementId,
        Math.max(previousActivityActivation, wait.id.activation),
      ),
    }
    : state;
  const staged = stageCompensationActivityRetention(
    program,
    retentionInput,
    {
      kind: CompensationCompletionFactKind.OrdinaryUserTask,
      activity: {
        processInstanceId: wait.id.processInstanceId,
        activityElementId: wait.id.elementId,
        activation: wait.id.activation,
      },
    },
  );
  if (staged === null) {
    return null;
  }
  if (nestedScopeDataProgram(program) && (wait.id.processInstanceId !== wait.owner.processInstanceId ||
      state.userTaskWaits.filter(candidate => sameOccurrence(candidate.id, stimulus.taskId)).length !== 1 ||
      !nestedScopePatchAdmitted(program, state, wait.owner, stimulus.submittedValues))) return null;
  const parallel = hasParallelScopeDefinition(program, wait.owner);
  if (parallel && (hasSequentialScopeDefinition(program, wait.owner) ||
      wait.id.processInstanceId !== wait.owner.processInstanceId ||
      state.userTaskWaits.filter(candidate => sameOccurrence(candidate.id, stimulus.taskId)).length !== 1)) return null;
  const variables = parallel
    ? writeParallelScopeValues(program, staged, wait.owner, stimulus.submittedValues, SequentialScopeWriteKind.UserTask)
    : hasSequentialScopeDefinition(program, wait.owner)
    ? writeSequentialScopeValues(program, staged, wait.owner, stimulus.submittedValues, SequentialScopeWriteKind.UserTask)
    : nestedScopeDataProgram(program)
    ? writeNestedScopeVariables(program, staged.variables, wait.owner.processInstanceId,
      wait.owner.definitionScopeId, stimulus.submittedValues)
    : { ...staged.variables, process: { bindings: mergeProcessVariableBindings(staged.variables.process.bindings, stimulus.submittedValues) } };
  if (variables === null) return null;
  return {
    ...staged,
    controlTokens: addToken(
      staged.controlTokens,
      wait.output,
      wait.owner,
    ),
    userTaskWaits: staged.userTaskWaits.filter(
      (candidate) => candidate !== wait,
    ),
    variables,
  };
}
