/** Test-only Workflow that incorrectly terminates the root for a nested Terminate End. */
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

export async function runBpmnProcessGlobalTerminationMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  const deployment = deployProcess(start, semanticProcess);
  if (deployment.outcome !== CommandOutcome.Committed) {
    throw new TypeError("Terminate mutation requires an admitted Process");
  }
  const started = advanceScenario(semanticProcess, initialState, start);
  if (started.kind !== ScenarioStepKind.Committed) {
    throw new TypeError("Terminate mutation requires a committed start");
  }

  const trace: CanonicalObservation[] = [
    deployment.observation,
    ...started.observations,
  ];
  let projectedTasks = projectOpenUserTasks(started.state);
  let receipt: CompletedProcessReceipt | undefined;

  setHandler(bpmnTraceQuery, () => [...trace]);
  setHandler(bpmnOpenUserTasksQuery, () => [...projectedTasks]);
  setHandler(
    bpmnCompleteUserTaskUpdate,
    (stimulus) => {
      requireTriggerCompletion(stimulus);
      const completed = fabricateRootCompletion(trace);
      projectedTasks = [];
      trace.push(
        {
          kind: CanonicalObservationKind.Command,
          commandId: stimulus.commandId,
          outcome: CommandOutcome.Committed,
        },
        completed,
      );
      receipt = {
        format: processTerminalReceiptFormatV1,
        definition: semanticProcess.identity,
        processId: semanticProcess.processId,
        processInstanceId: start.instanceId,
        finalState: completed,
      };
      return CommandOutcome.Committed;
    },
    { validator: requireTriggerCompletion },
  );

  await condition(() => receipt !== undefined);
  await condition(allHandlersFinished);
  if (receipt === undefined) {
    throw new TypeError("Terminate mutation lost its completed receipt");
  }
  return receipt;
}

function requireTriggerCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CompleteUserTaskInstance ||
    value.taskId.elementId !== "UserTask_Trigger"
  ) {
    throw new TypeError(
      "Terminate mutation requires the exact Trigger completion",
    );
  }
}

function fabricateRootCompletion(
  trace: ReadonlyArray<CanonicalObservation>,
): StateObservation & { readonly status: ProcessStatus.Completed } {
  const waiting = trace.at(-1);
  if (
    waiting?.kind !== CanonicalObservationKind.State ||
    waiting.status !== ProcessStatus.Running ||
    waiting.openUserTasks.length !== 2
  ) {
    throw new TypeError(
      "Terminate mutation requires both child User Tasks",
    );
  }
  return {
    ...waiting,
    status: ProcessStatus.Completed,
    activeWaits: [],
    openUserTasks: [],
    openTimers: [],
    openEffects: [],
    enabledInteractions: [],
  };
}
