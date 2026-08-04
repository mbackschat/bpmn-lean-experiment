/** Standards-only interrupting Activity boundary deadline cases and public-observation mutations. */
import {
  CanonicalObservationKind,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
} from "@bpmn-lean/differential";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-adapter";

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

const scenarioRoot = "scenarios/activity-boundary-timer";

function observationValueDisagreement(
  path: string,
  expected: unknown,
  actual: unknown,
): ObservationValueDisagreement {
  return {
    kind: DisagreementKind.ObservationValue,
    path,
    expected,
    actual,
  };
}

function stateAt(
  result: MutableScenarioResult,
  index: number,
): MutableStateObservation {
  const observation = result.trace[index];
  if (observation?.kind !== CanonicalObservationKind.State) {
    throw new Error(
      `Activity boundary deadline calibration requires state trace[${index}]`,
    );
  }
  return observation;
}

/**
 * Undoes the withdrawal the Activity's own victory performs.
 *
 * A host that completed the task but left its deadline armed would eventually fire a deadline
 * against a task that no longer exists, so retaining it is the failure this case must detect.
 */
function retainWithdrawnDeadline(result: MutableScenarioResult): void {
  const armed = stateAt(result, 2);
  const afterVictory = stateAt(result, 4);
  const deadline = armed.openTimers[0];
  if (
    armed.openTimers.length !== 1 ||
    deadline === undefined ||
    afterVictory.openTimers.length !== 0 ||
    afterVictory.openUserTasks[0]?.id.elementId !== "NormalTask"
  ) {
    throw new Error(
      "Activity-wins calibration requires one withdrawn deadline and NormalTask",
    );
  }
  afterVictory.openTimers = [deadline];
}

/**
 * Sends the deadline victory down the normal route instead of the boundary route.
 *
 * This is the discriminator between the two victories: without it a host that always continued
 * along the Activity's own outgoing flow would satisfy every other assertion in this case.
 */
function routeDeadlineToTheNormalFollowOn(
  result: MutableScenarioResult,
): void {
  const afterVictory = stateAt(result, 4);
  const task = afterVictory.openUserTasks[0];
  if (
    afterVictory.openUserTasks.length !== 1 ||
    task?.id.elementId !== "BoundaryTask" ||
    afterVictory.openTimers.length !== 0
  ) {
    throw new Error(
      "Deadline-wins calibration requires only BoundaryTask and a consumed deadline",
    );
  }
  afterVictory.openUserTasks[0] = {
    ...task,
    id: { ...task.id, elementId: "NormalTask" },
  };
}

function boundaryDeadlineCase(
  id: string,
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
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation,
    expectedInjectedDisagreement,
  });
}

export const activityBoundaryTimerPipelineCases = Object.freeze([
  boundaryDeadlineCase(
    "activity-boundary-timer-activity-wins",
    "activity-wins.scenario.json",
    retainWithdrawnDeadline,
    observationValueDisagreement("trace[4].openTimers.length", 0, 1),
  ),
  boundaryDeadlineCase(
    "activity-boundary-timer-deadline-wins",
    "deadline-wins.scenario.json",
    routeDeadlineToTheNormalFollowOn,
    observationValueDisagreement(
      "trace[4].openUserTasks[0].id.elementId",
      "BoundaryTask",
      "NormalTask",
    ),
  ),
]);
