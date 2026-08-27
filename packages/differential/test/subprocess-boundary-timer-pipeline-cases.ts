/** Standards-only interrupting Sub-Process boundary deadline cases and public-observation mutations. */
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

const scenarioRoot = "scenarios/subprocess-boundary-timer";

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
      `Bounded scope deadline calibration requires state trace[${index}]`,
    );
  }
  return observation;
}

/**
 * Undoes the withdrawal that `SPTIMER-QUIESCE-01` performs in the completing transition.
 *
 * A host that completed the child scope but left its deadline armed would later fire a deadline
 * against a scope occurrence that no longer exists, so retaining it is the failure this case detects.
 */
function retainWithdrawnDeadline(result: MutableScenarioResult): void {
  const armed = stateAt(result, 2);
  const afterVictory = stateAt(result, 4);
  const deadline = armed.openTimers[0];
  if (
    armed.openTimers.length !== 1 ||
    deadline === undefined ||
    afterVictory.openTimers.length !== 0 ||
    afterVictory.openUserTasks[0]?.id.elementId !== "AfterScope"
  ) {
    throw new Error(
      "Scope-completes calibration requires one withdrawn deadline and AfterScope",
    );
  }
  afterVictory.openTimers = [deadline];
}

/**
 * Leaves the interrupted child region's User Task alive beside the boundary route's own task.
 *
 * This is the failure mode unique to a *scope* host rather than an Activity host: a deadline that
 * consumed its occurrence and followed the boundary Flow while never terminating the live child
 * region would satisfy the route assertion, so `SPTIMER-INTERRUPT-01` needs its own discriminator.
 */
function retainCancelledChildRegion(result: MutableScenarioResult): void {
  const armed = stateAt(result, 2);
  const afterVictory = stateAt(result, 4);
  const childTask = armed.openUserTasks[0];
  const escalation = afterVictory.openUserTasks[0];
  if (
    childTask?.id.elementId !== "ChildTask" ||
    afterVictory.openUserTasks.length !== 1 ||
    escalation?.id.elementId !== "EscalationTask" ||
    afterVictory.openTimers.length !== 0
  ) {
    throw new Error(
      "Deadline-wins calibration requires a cancelled ChildTask and only EscalationTask",
    );
  }
  afterVictory.openUserTasks.push(childTask);
}

function boundedScopeDeadlineCase(
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

export const subprocessBoundaryTimerPipelineCases = Object.freeze([
  boundedScopeDeadlineCase(
    "subprocess-boundary-timer-scope-completes",
    "scope-completes.scenario.json",
    retainWithdrawnDeadline,
    observationValueDisagreement("trace[4].openTimers.length", 0, 1),
  ),
  boundedScopeDeadlineCase(
    "subprocess-boundary-timer-deadline-wins",
    "deadline-wins.scenario.json",
    retainCancelledChildRegion,
    observationValueDisagreement("trace[4].openUserTasks.length", 1, 2),
  ),
]);
