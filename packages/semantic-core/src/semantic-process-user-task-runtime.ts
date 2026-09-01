/** Pure transition for the ordinary, non-specialized User Task completion arm. */
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
    variables: {
      ...staged.variables,
      process: {
        bindings: mergeProcessVariableBindings(
          staged.variables.process.bindings,
          stimulus.submittedValues,
        ),
      },
    },
  };
}
