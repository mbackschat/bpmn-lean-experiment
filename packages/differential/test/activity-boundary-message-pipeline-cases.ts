/** Standards-only interrupting Activity boundary Message cases and loser-withdrawal mutations. */
import {
  CanonicalObservationKind,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
} from "@bpmn-lean/differential";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-testkit";

import {
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  MutableScenarioResult,
  MutableStateObservation,
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/activity-boundary-message";

function stateAt(
  result: MutableScenarioResult,
  index: number,
): MutableStateObservation {
  const observation = result.trace[index];
  if (observation?.kind !== CanonicalObservationKind.State) {
    throw new Error(
      `Activity boundary Message calibration requires state trace[${index}]`,
    );
  }
  return observation;
}

/** Restores the subscription that exact task completion must withdraw. */
function retainLosingSubscription(result: MutableScenarioResult): void {
  const armed = stateAt(result, 2);
  const afterVictory = stateAt(result, 4);
  const subscription = armed.openMessageSubscriptions[0];
  if (
    armed.openMessageSubscriptions.length !== 1 ||
    subscription === undefined ||
    afterVictory.openMessageSubscriptions.length !== 0 ||
    afterVictory.openUserTasks[0]?.id.elementId !== "RecordReviewCompletion"
  ) {
    throw new Error(
      "Task-wins calibration requires one withdrawn subscription and RecordReviewCompletion",
    );
  }
  afterVictory.openMessageSubscriptions = [subscription];
}

/** Restores the host task that exact boundary Message delivery must cancel. */
function retainLosingTask(result: MutableScenarioResult): void {
  const armed = stateAt(result, 2);
  const afterVictory = stateAt(result, 4);
  const task = armed.openUserTasks[0];
  if (
    armed.openUserTasks.length !== 1 ||
    task === undefined ||
    afterVictory.openUserTasks.length !== 1 ||
    afterVictory.openUserTasks[0]?.id.elementId !== "HandleWithdrawal"
  ) {
    throw new Error(
      "Message-wins calibration requires one cancelled host task and HandleWithdrawal",
    );
  }
  afterVictory.openUserTasks = [task, ...afterVictory.openUserTasks];
}

function boundaryMessageCase(
  id: PipelineCase["id"],
  scenarioFile: string,
  injectMutation: PipelineCase["injectMutation"],
  expectedInjectedDisagreement: ObservationValueDisagreement,
): PipelineCase {
  return Object.freeze({
    id,
    scenarioRelativePath: `${scenarioRoot}/${scenarioFile}`,
    bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
    workflowIdPrefix: id,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation,
    expectedInjectedDisagreement,
  });
}

export const activityBoundaryMessagePipelineCases = Object.freeze([
  boundaryMessageCase(
    "activity-boundary-message-task-wins",
    "task-wins.scenario.json",
    retainLosingSubscription,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].openMessageSubscriptions.length",
      expected: 0,
      actual: 1,
    },
  ),
  boundaryMessageCase(
    "activity-boundary-message-message-wins",
    "message-wins.scenario.json",
    retainLosingTask,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].openUserTasks.length",
      expected: 1,
      actual: 2,
    },
  ),
]);
