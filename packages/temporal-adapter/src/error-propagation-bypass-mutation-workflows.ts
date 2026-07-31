import {
  CanonicalObservationKind,
  CommandOutcome,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
  isWellFormedStimulus,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  condition,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnCompleteUserTaskUpdate,
  bpmnOpenUserTasksQuery,
  bpmnTraceQuery,
} from "./workflow-implementation.js";

/** Retained defect: a Workflow fabricates recovery without advancing the semantic state, which the next stale command exposes. */
export async function runBpmnProcessErrorPropagationBypassMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<never> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw new TypeError("Error bypass requires an admitted Process");
  }
  const started = advanceScenario(semanticProcess, initialState, start);
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("Error bypass requires a committed start");
  }

  const trace: CanonicalObservation[] = [
    deployment.observation,
    ...started.observations,
  ];
  let state = started.state;
  let projectedTasks = projectOpenUserTasks(started.state);
  let recoveryFabricated = false;

  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(bpmnOpenUserTasksQuery, () => [...projectedTasks]);
  setHandler(
    bpmnCompleteUserTaskUpdate,
    (stimulus) => {
      requireCompletion(stimulus);
      if (!recoveryFabricated) {
        requireTriggerCompletion(stimulus);
        const fabricated = fabricateRecoveryState(trace);
        projectedTasks = fabricated.openUserTasks;
        trace.push(
          {
            kind: CanonicalObservationKind.Command,
            commandId: stimulus.commandId,
            outcome: CommandOutcome.Committed,
          },
          fabricated,
        );
        recoveryFabricated = true;
        return CommandOutcome.Committed;
      }

      const coreStep = advanceScenario(semanticProcess, state, stimulus);
      if (coreStep.kind !== ScenarioStepKind.Committed) {
        throw new TypeError(
          "Error bypass discriminator requires the retained child state to commit",
        );
      }
      state = coreStep.state;
      projectedTasks = projectOpenUserTasks(state);
      trace.push(...coreStep.observations);
      return CommandOutcome.Committed;
    },
    { validator: requireCompletion },
  );

  await condition(() => false);
  throw new TypeError("terminated Error bypass resumed unexpectedly");
}

function requireTriggerCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  if (stimulus.taskId.elementId !== "UserTask_TriggerError") {
    throw new TypeError(
      "Error bypass requires the exact Trigger Error completion",
    );
  }
}

function requireCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("Error bypass requires a well-formed completion");
  }
}

function fabricateRecoveryState(
  trace: ReadonlyArray<CanonicalObservation>,
): StateObservation {
  const waiting = trace.at(-1);
  if (
    waiting?.kind !== CanonicalObservationKind.State ||
    waiting.openUserTasks.length !== 2
  ) {
    throw new TypeError("Error bypass requires both child User Tasks");
  }
  const trigger = waiting.openUserTasks.find(
    ({ id }) => id.elementId === "UserTask_TriggerError",
  );
  const triggerWait = waiting.activeWaits.find(
    ({ elementId }) => elementId === "UserTask_TriggerError",
  );
  const triggerInteraction = waiting.enabledInteractions.find(
    (interaction) =>
      interaction.kind === StimulusKind.CompleteUserTaskInstance &&
      interaction.taskId.elementId === "UserTask_TriggerError",
  );
  if (
    trigger === undefined ||
    triggerWait === undefined ||
    triggerInteraction?.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("Error bypass has no Trigger Error projection");
  }
  const recoveryId = { ...trigger.id, elementId: "UserTask_Recover" };
  return {
    ...waiting,
    activeWaits: [{ ...triggerWait, elementId: "UserTask_Recover" }],
    openUserTasks: [{ ...trigger, id: recoveryId, name: "Recover" }],
    enabledInteractions: [{ ...triggerInteraction, taskId: recoveryId }],
  };
}
