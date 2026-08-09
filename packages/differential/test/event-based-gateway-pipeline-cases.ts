/** Standards-only Event-Based Gateway winner cases and public-observation mutations. */
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

const scenarioRoot = "scenarios/event-based-gateway-message-timer";

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
    throw new Error(`Event race calibration requires state trace[${index}]`);
  }
  return observation;
}

function retainTimerLoser(result: MutableScenarioResult): void {
  const armed = stateAt(result, 2);
  const selected = stateAt(result, 4);
  const timer = armed.openTimers[0];
  if (
    armed.openTimers.length !== 1 ||
    timer === undefined ||
    selected.openTimers.length !== 0 ||
    selected.openUserTasks.length !== 1 ||
    selected.openUserTasks[0]?.id.elementId !== "MessageTask"
  ) {
    throw new Error(
      "Message-wins calibration requires one withdrawn Timer and MessageTask",
    );
  }
  selected.openTimers = [timer];
}

function selectWrongMessageWinner(result: MutableScenarioResult): void {
  const selected = stateAt(result, 4);
  const task = selected.openUserTasks[0];
  if (
    selected.openUserTasks.length !== 1 ||
    task?.id.elementId !== "TimerTask" ||
    selected.openMessageSubscriptions.length !== 0
  ) {
    throw new Error(
      "Timer-wins calibration requires only TimerTask and no Message loser",
    );
  }
  selected.openUserTasks[0] = {
    ...task,
    id: { ...task.id, elementId: "MessageTask" },
  };
}

function eventRaceCase(
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

export const eventBasedGatewayPipelineCases = Object.freeze([
  eventRaceCase(
    "event-based-gateway-message-wins",
    "message-wins.scenario.json",
    retainTimerLoser,
    observationValueDisagreement(
      "trace[4].openTimers.length",
      0,
      1,
    ),
  ),
  eventRaceCase(
    "event-based-gateway-timer-wins",
    "timer-wins.scenario.json",
    selectWrongMessageWinner,
    observationValueDisagreement(
      "trace[4].openUserTasks[0].id.elementId",
      "TimerTask",
      "MessageTask",
    ),
  ),
]);
