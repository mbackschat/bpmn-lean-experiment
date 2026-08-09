/** Pipeline catalog entries and separating mutations for direct Sub-Process Error propagation. */
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
  CibCaseRelation,
  CibEffectExecutionSchedule,
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  MutableScenarioResult,
  MutableStateObservation,
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

function postTriggerState(
  result: MutableScenarioResult,
  commandOccurrence = 1,
): MutableStateObservation {
  let seen = 0;
  for (let index = 0; index < result.trace.length; index += 1) {
    const observation = result.trace[index];
    if (
      observation?.kind === CanonicalObservationKind.Command &&
      observation.commandId === "complete-trigger-error"
    ) {
      seen += 1;
      if (seen === commandOccurrence) {
        const state = result.trace[index + 1];
        if (state?.kind === CanonicalObservationKind.State) {
          return state;
        }
      }
    }
  }
  throw new Error("Error propagation calibration has no post-trigger state");
}

function mutateWrongNormalRoute(result: MutableScenarioResult): void {
  const state = postTriggerState(result);
  const wait = state.activeWaits[0];
  if (wait?.elementId !== "UserTask_Recover") {
    throw new Error("Error propagation calibration requires Recover");
  }
  state.activeWaits[0] = { ...wait, elementId: "EndEvent_Normal" };
}

function retainCanceledSibling(result: MutableScenarioResult): void {
  const state = postTriggerState(result);
  const recover = state.openUserTasks[0];
  if (recover?.id.elementId !== "UserTask_Recover") {
    throw new Error("Error propagation calibration requires Recover");
  }
  state.openUserTasks.push({
    ...recover,
    id: { ...recover.id, elementId: "UserTask_SiblingWork" },
    name: "Sibling Work",
  });
}

function eraseRecoveryAfterStaleRefusal(result: MutableScenarioResult): void {
  const staleIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      observation.commandId === "refuse-stale-sibling-after-error",
  );
  const state = result.trace[staleIndex + 1];
  if (
    staleIndex < 0 ||
    state?.kind !== CanonicalObservationKind.State ||
    state.activeWaits[0]?.elementId !== "UserTask_Recover"
  ) {
    throw new Error("stale Error schedule requires preserved recovery state");
  }
  state.activeWaits = [];
}

function subprocessErrorCase(
  id: string,
  scenarioFile: string,
  evidenceFile: string,
  injectMutation: PipelineCase["injectMutation"],
  expectedInjectedDisagreement: ObservationValueDisagreement,
): PipelineCase {
  return Object.freeze({
    id,
    scenarioRelativePath:
      `scenarios/subprocess-error-propagation/${scenarioFile}`,
    bpmnRelativePath:
      "scenarios/subprocess-error-propagation/process.bpmn",
    workflowIdPrefix: id,
    cib: Object.freeze({
      evidenceRelativePath:
        `scenarios/subprocess-error-propagation/${evidenceFile}`,
      version: "2.2.0" as const,
      relation: CibCaseRelation.ExactSemantic,
      effectExecutionSchedule: CibEffectExecutionSchedule.None,
    }),
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

export const subprocessErrorPipelineCases = Object.freeze([
  subprocessErrorCase(
    "subprocess-error-propagation-trigger-first",
    "trigger-first.scenario.json",
    "trigger-first.cibseven-evidence.json",
    mutateWrongNormalRoute,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].activeWaits[0].elementId",
      expected: "UserTask_Recover",
      actual: "EndEvent_Normal",
    },
  ),
  subprocessErrorCase(
    "subprocess-error-propagation-sibling-first",
    "sibling-first.scenario.json",
    "sibling-first.cibseven-evidence.json",
    retainCanceledSibling,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[6].openUserTasks.length",
      expected: 1,
      actual: 2,
    },
  ),
  subprocessErrorCase(
    "subprocess-error-propagation-stale-sibling-after-error",
    "stale-sibling-after-error.scenario.json",
    "stale-sibling-after-error.cibseven-evidence.json",
    eraseRecoveryAfterStaleRefusal,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[6].activeWaits.length",
      expected: 1,
      actual: 0,
    },
  ),
]);
