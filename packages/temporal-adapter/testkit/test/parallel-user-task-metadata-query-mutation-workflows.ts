/** Test-owned Workflows that independently corrupt the combined open-task Query. */
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
import type {
  CompletedProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  processTerminalReceiptFormatV1,
} from "@bpmn-lean/temporal-protocol";
import {
  allHandlersFinished,
  condition,
  setHandler,
} from "@temporalio/workflow";

import {
  bpmnCompleteUserTaskUpdate,
  bpmnOpenUserTasksQuery,
  bpmnTraceQuery,
} from "@bpmn-lean/temporal-workflow";

const queryMutationKind = {
  MetadataDrop: "metadataDrop",
  SiblingDrop: "siblingDrop",
} as const;
type QueryMutationKind = typeof queryMutationKind[keyof typeof queryMutationKind];

export function runBpmnProcessParallelMetadataDropQueryMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  return runQueryMutation(start, semanticProcess, queryMutationKind.MetadataDrop);
}

export function runBpmnProcessParallelSiblingDropQueryMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  return runQueryMutation(start, semanticProcess, queryMutationKind.SiblingDrop);
}

async function runQueryMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  mutation: QueryMutationKind,
): Promise<CompletedProcessReceipt> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw new TypeError("parallel Query mutation requires admitted source");
  }
  const started = advanceScenario(semanticProcess, initialState, start);
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("parallel Query mutation requires committed start");
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
    () => mutateOpenTasks(projectOpenUserTasks(state), mutation),
  );
  setHandler(
    bpmnCompleteUserTaskUpdate,
    (stimulus) => {
      requireCompletion(stimulus);
      const step = advanceScenario(semanticProcess, state, stimulus);
      if (step.kind !== ScenarioStepKind.Committed) {
        throw new TypeError("parallel Query mutation expected exact completion");
      }
      state = step.state;
      trace.push(...step.observations);
      const completed = completedState(step.observations);
      if (completed !== undefined) {
        receipt = {
          format: processTerminalReceiptFormatV1,
          definition: semanticProcess.identity,
          processId: semanticProcess.processId,
          processInstanceId: start.instanceId,
          finalState: completed,
        };
      }
      return CommandOutcome.Committed;
    },
    { validator: requireCompletion },
  );

  await condition(() => receipt !== undefined);
  await condition(allHandlersFinished);
  if (receipt === undefined) {
    throw new TypeError("parallel Query mutation lost its terminal receipt");
  }
  return receipt;
}

function mutateOpenTasks(
  tasks: ReadonlyArray<OpenUserTask>,
  mutation: QueryMutationKind,
): ReadonlyArray<OpenUserTask> {
  switch (mutation) {
    case queryMutationKind.MetadataDrop:
      return tasks.map(({ id, name, state }) => ({ id, name, state }));
    case queryMutationKind.SiblingDrop:
      return tasks.slice(0, Math.max(0, tasks.length - 1));
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
    throw new TypeError("parallel Query mutation requires one completion");
  }
}

function completedState(
  observations: ReadonlyArray<CanonicalObservation>,
): (StateObservation & { status: ProcessStatus.Completed }) | undefined {
  return observations.find(
    (
      observation,
    ): observation is StateObservation & { status: ProcessStatus.Completed } =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
}
