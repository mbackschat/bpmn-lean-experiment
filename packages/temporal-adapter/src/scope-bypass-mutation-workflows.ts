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

/**
 * Retained defect: the first child completion reaches the semantic core, but the Workflow replaces
 * the correct sibling observation with the enclosing task outside the core.
 */
export async function runBpmnProcessScopeBypassMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<never> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw new TypeError("Scope bypass requires an admitted Process");
  }
  const started = advanceScenario(semanticProcess, initialState, start);
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("Scope bypass requires a committed start");
  }

  let state = started.state;
  const trace: CanonicalObservation[] = [
    deployment.observation,
    ...started.observations,
  ];
  let projectedTasks = projectOpenUserTasks(state);

  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(bpmnOpenUserTasksQuery, () => [...projectedTasks]);
  setHandler(
    bpmnCompleteUserTaskUpdate,
    (stimulus) => {
      requireCompletion(stimulus);
      const coreStep = advanceScenario(semanticProcess, state, stimulus);
      if (coreStep.kind !== ScenarioStepKind.Committed) {
        throw new TypeError(
          "Scope bypass requires one exact committed child completion",
        );
      }
      state = coreStep.state;
      const fabricated = fabricatePrematureExit(coreStep.observations);
      projectedTasks = fabricated.openUserTasks;
      trace.push(
        ...coreStep.observations.map((observation) =>
          observation.kind === CanonicalObservationKind.State
            ? fabricated
            : observation
        ),
      );
      return CommandOutcome.Committed;
    },
    { validator: requireCompletion },
  );

  await condition(() => false);
  throw new TypeError("terminated scope bypass resumed unexpectedly");
}

function requireCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("Scope bypass requires a well-formed User Task completion");
  }
}

function fabricatePrematureExit(
  observations: ReadonlyArray<CanonicalObservation>,
): StateObservation {
  const state = observations.find(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State,
  );
  const sibling = state?.openUserTasks[0];
  const activeWait = state?.activeWaits[0];
  const interaction = state?.enabledInteractions[0];
  if (
    state === undefined ||
    state.openUserTasks.length !== 1 ||
    sibling === undefined ||
    activeWait === undefined ||
    interaction?.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("Scope bypass requires one remaining child User Task");
  }
  const afterScopeId = {
    ...sibling.id,
    elementId: "UserTask_AfterScope",
  };
  return {
    ...state,
    activeWaits: [{
      ...activeWait,
      elementId: "UserTask_AfterScope",
    }],
    openUserTasks: [{
      ...sibling,
      id: afterScopeId,
      name: "After Scope",
    }],
    enabledInteractions: [{
      ...interaction,
      taskId: afterScopeId,
    }],
  };
}
