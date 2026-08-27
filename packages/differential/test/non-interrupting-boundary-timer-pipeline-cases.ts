/** Standards-only non-interrupting boundary deadline cases and public-observation mutations. */
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

const scenarioRoot = "scenarios/non-interrupting-boundary-timer";

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
      `Non-interrupting boundary deadline calibration requires state trace[${index}]`,
    );
  }
  return observation;
}

/**
 * Cancels the monitored task as the interrupting sibling would.
 *
 * This is the whole proposition of the family: firing spawns the handler branch beside a host that
 * stays active, so an implementation that ended its host publishes one open task where this one
 * publishes two. The open-task count carries it at the first observation after firing, before either
 * branch has completed and could confuse the count with ordinary progress.
 */
function cancelTheMonitoredTaskOnFiring(result: MutableScenarioResult): void {
  const afterFiring = stateAt(result, 4);
  const retained = afterFiring.openUserTasks.filter(
    ({ id }) => id.elementId !== "MonitoredTask",
  );
  if (
    afterFiring.openUserTasks.length !== 2 ||
    retained.length !== 1 ||
    retained[0]?.id.elementId !== "HandlerTask" ||
    afterFiring.openTimers.length !== 0
  ) {
    throw new Error(
      "Deadline-first calibration requires both branches open and a consumed deadline",
    );
  }
  afterFiring.openUserTasks = retained;
}

/**
 * Undoes the withdrawal the monitored task's own completion performs.
 *
 * A host that completed the task but left its deadline armed would spawn a handler branch against a
 * task that no longer exists, which is the one way this schedule can fail while still publishing the
 * correct task. It is the mutation the schedule exists for, because its public trace is otherwise
 * identical under both interruption dispositions.
 */
function retainWithdrawnDeadline(result: MutableScenarioResult): void {
  const armed = stateAt(result, 2);
  const afterCompletion = stateAt(result, 4);
  const deadline = armed.openTimers[0];
  if (
    armed.openTimers.length !== 1 ||
    deadline === undefined ||
    afterCompletion.openTimers.length !== 0 ||
    afterCompletion.openUserTasks[0]?.id.elementId !== "NormalTask"
  ) {
    throw new Error(
      "Completion-first calibration requires one withdrawn deadline and NormalTask",
    );
  }
  afterCompletion.openTimers = [deadline];
}

function monitoredDeadlineCase(
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
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation,
    expectedInjectedDisagreement,
  });
}

export const nonInterruptingBoundaryTimerPipelineCases = Object.freeze([
  monitoredDeadlineCase(
    "non-interrupting-boundary-timer-deadline-then-both-branches",
    "deadline-then-both-branches.scenario.json",
    cancelTheMonitoredTaskOnFiring,
    observationValueDisagreement("trace[4].openUserTasks.length", 2, 1),
  ),
  monitoredDeadlineCase(
    "non-interrupting-boundary-timer-completion-before-the-deadline",
    "completion-before-the-deadline.scenario.json",
    retainWithdrawnDeadline,
    observationValueDisagreement("trace[4].openTimers.length", 0, 1),
  ),
]);
