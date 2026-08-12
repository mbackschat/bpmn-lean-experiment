/** Test-owned Workflow that drops metadata only from the open-task Query. */
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
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  allHandlersFinished,
  condition,
  setHandler,
} from "@temporalio/workflow";

import type {
  CompletedProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  bpmnCompleteUserTaskUpdate,
  bpmnOpenUserTasksQuery,
  bpmnTraceQuery,
} from "@bpmn-lean/temporal-workflow";

export async function runBpmnProcessUserTaskMetadataQueryMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw new TypeError("metadata Query mutation requires admitted source");
  }
  const started = advanceScenario(semanticProcess, initialState, start);
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("metadata Query mutation requires committed start");
  }

  let state = started.state;
  const trace: CanonicalObservation[] = [
    deployment.observation,
    ...started.observations,
  ];
  let receipt: CompletedProcessReceipt | undefined;

  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(
    bpmnOpenUserTasksQuery,
    () => projectOpenUserTasks(state).map(dropMetadata),
  );
  setHandler(
    bpmnCompleteUserTaskUpdate,
    async (stimulus) => {
      requireCompletion(stimulus);
      const step = advanceScenario(semanticProcess, state, stimulus);
      if (step.kind !== ScenarioStepKind.Committed) {
        throw new TypeError("metadata Query mutation expected completion");
      }
      state = step.state;
      trace.push(...step.observations);
      receipt = {
        definition: semanticProcess.identity,
        processId: semanticProcess.processId,
        processInstanceId: start.instanceId,
        finalState: requireFinalState(step.observations),
        messageDeliveryRecords: [],
      };
      return CommandOutcome.Committed;
    },
    { validator: requireCompletion },
  );

  await condition(() => receipt !== undefined);
  await condition(allHandlersFinished);
  if (receipt === undefined) {
    throw new TypeError("metadata Query mutation lost its terminal receipt");
  }
  return receipt;
}

function dropMetadata(task: OpenUserTask): OpenUserTask {
  return {
    id: task.id,
    name: task.name,
    state: task.state,
  };
}

function requireCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError("metadata Query mutation requires one completion");
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
    throw new TypeError("metadata Query mutation has no completed core state");
  }
  return finalState;
}
