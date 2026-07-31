import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioStepKind,
  StimulusKind,
  advanceScenario,
  deployProcess,
  initialState,
  isWellFormedStimulus,
  projectOpenUserTasks,
  type CanonicalObservation,
  type CompleteUserTaskInstanceStimulus,
  type SemanticProcessProgram,
  type StartProcessStimulus,
  type StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  allHandlersFinished,
  condition,
  setHandler,
} from "@temporalio/workflow";

import type {
  CompletedProcessReceipt,
} from "./contracts.js";
import {
  bpmnCompleteUserTaskUpdate,
  bpmnOpenUserTasksQuery,
  bpmnTraceQuery,
} from "./workflow-implementation.js";

/**
 * Retained defect: control completion reaches the core with an empty patch,
 * while the Workflow fabricates submitted Process variables outside the core
 * and omits the missing core command result from its Query trace.
 */
export async function runBpmnProcessCompletionDataBypassMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw new TypeError("Completion-data bypass requires an admitted Process");
  }
  const started = advanceScenario(semanticProcess, initialState, start);
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("Completion-data bypass requires a committed start");
  }

  let state = started.state;
  const trace: CanonicalObservation[] = [
    deployment.observation,
    ...started.observations,
  ];
  let receipt: CompletedProcessReceipt | undefined;

  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(bpmnOpenUserTasksQuery, () => projectOpenUserTasks(state));
  setHandler(
    bpmnCompleteUserTaskUpdate,
    async (stimulus) => {
      requireCompletion(stimulus);
      const coreStep = advanceScenario(semanticProcess, state, {
        ...stimulus,
        submittedValues: [],
      });
      if (coreStep.kind !== ScenarioStepKind.Committed) {
        throw new TypeError(
          "Completion-data bypass requires one exact committed completion",
        );
      }
      state = coreStep.state;
      const finalState = requireFinalState(coreStep.observations);
      const fabricatedFinalState = {
        ...finalState,
        variables: stimulus.submittedValues,
      };
      trace.push(fabricatedFinalState);
      receipt = {
        definition: semanticProcess.identity,
        processId: semanticProcess.processId,
        processInstanceId: start.instanceId,
        finalState: fabricatedFinalState,
        messageDeliveryRecords: [],
      };
      return CommandOutcome.Committed;
    },
    { validator: requireCompletion },
  );

  await condition(() => receipt !== undefined);
  await condition(allHandlersFinished);
  if (receipt === undefined) {
    throw new TypeError("Completion-data bypass lost its fabricated receipt");
  }
  return receipt;
}

function requireCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError(
      "Completion-data bypass requires one well-formed completion",
    );
  }
}

function requireFinalState(
  observations: ReadonlyArray<CanonicalObservation>,
): StateObservation & { status: ProcessStatus.Completed } {
  const finalState = observations.find(
    (
      observation,
    ): observation is StateObservation & { status: ProcessStatus.Completed } =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  if (finalState === undefined) {
    throw new TypeError("Completion-data bypass has no completed core state");
  }
  return finalState;
}
