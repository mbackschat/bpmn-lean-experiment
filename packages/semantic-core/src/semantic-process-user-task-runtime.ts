/** Pure transition for the ordinary, non-specialized User Task completion arm. */
import type {
  CompleteUserTaskInstanceStimulus,
} from "./contract.js";
import type {
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
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
  return {
    ...state,
    controlTokens: addToken(
      state.controlTokens,
      wait.output,
      wait.owner,
    ),
    userTaskWaits: state.userTaskWaits.filter(
      (candidate) => candidate !== wait,
    ),
    variables: {
      ...state.variables,
      process: {
        bindings: mergeProcessVariableBindings(
          state.variables.process.bindings,
          stimulus.submittedValues,
        ),
      },
    },
  };
}
