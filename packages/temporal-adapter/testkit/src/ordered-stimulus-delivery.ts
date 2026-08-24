/** Delivers a retained completion/Timer scenario in its declared stimulus order. */
import {
  CanonicalObservationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  OpenUserTask,
  Scenario,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import { submitUserTaskCompletionAtWorkflowId } from "@bpmn-lean/temporal-client";
import {
  bpmnOpenUserTasksQueryName,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
  withDeadline,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  TemporalScenarioExecutionOptions,
} from "./contracts.js";
import type { CompletionDeliveryEvidence } from "./completion-delivery.js";
import { assertNever, requireSemanticOutcome } from "./runner-support.js";

const operationDeadlineMs = 5_000;

export async function deliverStimuliInOrder(
  client: WorkflowClient,
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  processInstanceId: string,
  scenario: Scenario,
  options: TemporalScenarioExecutionOptions,
  assertWorkerHealthy: () => void,
  waitForTrace: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
): Promise<CompletionDeliveryEvidence> {
  if (
    options.completionDelivery !== TemporalCompletionDelivery.Ordered ||
    options.executionSchedule !== TemporalExecutionSchedule.StimulusOrder
  ) {
    throw new TypeError("Stimulus-order delivery requires its exact schedule");
  }
  const completionCount = scenario.stimuli.filter(
    ({ kind }) => kind === StimulusKind.CompleteUserTaskInstance,
  ).length;
  const completionOutcomes: CompletionDeliveryEvidence["completionOutcomes"][number][] = [];
  const openUserTasksAfterCompletions: OpenUserTask[][] = [];
  let expectedTraceLength = 3;

  for (const stimulus of scenario.stimuli.slice(1)) {
    assertWorkerHealthy();
    switch (stimulus.kind) {
      case StimulusKind.CompleteUserTaskInstance:
        completionOutcomes.push(
          requireSemanticOutcome(
            await submitUserTaskCompletionAtWorkflowId(
              client,
              handle.workflowId,
              processInstanceId,
              stimulus,
            ),
          ),
        );
        expectedTraceLength += 2;
        await requireCommandAtTraceBoundary(
          handle,
          expectedTraceLength,
          stimulus.commandId,
          waitForTrace,
        );
        if (completionOutcomes.length < completionCount) {
          openUserTasksAfterCompletions.push(
            [...await withDeadline(
              handle.query<ReadonlyArray<OpenUserTask>>(
                bpmnOpenUserTasksQueryName,
              ),
              operationDeadlineMs,
              "Workflow intermediate open User Tasks Query",
            )],
          );
        }
        break;
      case StimulusKind.FireTimer:
        expectedTraceLength += 2;
        await requireCommandAtTraceBoundary(
          handle,
          expectedTraceLength,
          stimulus.commandId,
          waitForTrace,
        );
        break;
      case StimulusKind.DeliverMessage:
      case StimulusKind.CompleteEffect:
      case StimulusKind.ReportEffectFailure:
      case StimulusKind.RetryIncident:
      case StimulusKind.CancelIncidentProcess:
        throw new TypeError(
          `Stimulus-order delivery does not support ${stimulus.kind}`,
        );
      case StimulusKind.StartProcess:
      case StimulusKind.TriggerMessageStart:
      case StimulusKind.TriggerTimerStart:
        throw new TypeError("Only the first stimulus may start the Process");
      default:
        assertNever(stimulus);
    }
  }

  return {
    openUserTasksAfterCompletions,
    completionOutcomes,
    completionClosureResults: [],
    duplicateCompletionOutcome: null,
    postTerminalResult: null,
  };
}

async function requireCommandAtTraceBoundary(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  minimumLength: number,
  commandId: string,
  waitForTrace: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ) => Promise<ReadonlyArray<CanonicalObservation>>,
): Promise<void> {
  const trace = await waitForTrace(handle, minimumLength);
  const command = trace[minimumLength - 2];
  if (
    command?.kind !== CanonicalObservationKind.Command ||
    command.commandId !== commandId
  ) {
    throw new Error(`Workflow did not commit ordered stimulus ${commandId}`);
  }
}
