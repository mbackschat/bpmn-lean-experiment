/**
 * Test-only Workflow that collapses User Task occurrence identity to the BPMN element ID.
 *
 * The production Workflow forwards the exact stimulus. This hostile host rewrites a stale
 * activation to the currently open activation before the semantic core sees it, demonstrating why
 * durable transport must preserve the complete occurrence identity rather than only the element.
 */
import {
  CanonicalObservationKind,
  CommandOutcome,
  ScenarioStepKind,
  advanceScenario,
  initialState,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  RuntimeState,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  bpmnCompleteUserTaskUpdateName,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnCompleteUserTaskUpdateArguments,
} from "@bpmn-lean/temporal-protocol";
import {
  condition,
  defineUpdate,
  setHandler,
} from "@temporalio/workflow";

const completionUpdate = defineUpdate<
  CommandOutcome,
  BpmnCompleteUserTaskUpdateArguments
>(bpmnCompleteUserTaskUpdateName);

export async function runElementIdentityCycleMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<void> {
  return runIdentityMutation(start, semanticProcess, "elementIdOnly");
}

export async function runResetActivationCycleMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<void> {
  return runIdentityMutation(start, semanticProcess, "resetActivation");
}

async function runIdentityMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  mutation: "elementIdOnly" | "resetActivation",
): Promise<void> {
  let state: RuntimeState = initialState;
  const started = advanceScenario(semanticProcess, state, start);
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("identity mutation requires one admitted cycle start");
  }
  state = started.state;

  setHandler(completionUpdate, (stimulus) => {
    const mutatedState = mutation === "resetActivation"
      ? resetCurrentActivation(state, stimulus.taskId.elementId)
      : state;
    const mutatedStimulus = mutation === "elementIdOnly"
      ? collapseToCurrentElementOccurrence(mutatedState, stimulus)
      : stimulus;
    const step = advanceScenario(semanticProcess, mutatedState, mutatedStimulus);
    switch (step.kind) {
      case ScenarioStepKind.Committed:
      case ScenarioStepKind.Terminal:
        state = step.state;
        return commandOutcome(step.observations, stimulus.commandId);
      case ScenarioStepKind.HarnessFailure:
        throw new TypeError("identity mutation exceeded semantic closure");
      default:
        return assertNever(step);
    }
  });

  await condition(() => false);
}

function resetCurrentActivation(
  state: RuntimeState,
  elementId: string,
): RuntimeState {
  return {
    ...state,
    userTaskWaits: state.userTaskWaits.map((wait) =>
      wait.id.elementId === elementId
        ? { ...wait, id: { ...wait.id, activation: 1 } }
        : wait
    ),
  };
}

function collapseToCurrentElementOccurrence(
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): CompleteUserTaskInstanceStimulus {
  const current = projectOpenUserTasks(state).find(
    ({ id }) => id.elementId === stimulus.taskId.elementId,
  );
  return current === undefined ? stimulus : { ...stimulus, taskId: current.id };
}

function commandOutcome(
  observations: ReturnType<typeof advanceScenario>["observations"],
  commandId: string,
): CommandOutcome {
  const command = observations.find(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      observation.commandId === commandId,
  );
  if (command?.kind !== CanonicalObservationKind.Command) {
    throw new TypeError(`identity mutation lost command outcome ${commandId}`);
  }
  return command.outcome;
}

function assertNever(value: never): never {
  throw new TypeError(`unhandled scenario step ${JSON.stringify(value)}`);
}
