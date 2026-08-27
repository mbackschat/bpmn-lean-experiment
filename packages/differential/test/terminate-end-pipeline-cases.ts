/** Standards-only Terminate End cases and regional-cancellation mutations. */
import {
  CanonicalObservationKind,
  ProcessStatus,
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

const scenarioRoot = "scenarios/terminate-end-event";

function stateAfterCommand(
  result: MutableScenarioResult,
  commandId: string,
): MutableStateObservation {
  const commandIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      observation.commandId === commandId,
  );
  const state = result.trace[commandIndex + 1];
  if (
    commandIndex < 0 ||
    state?.kind !== CanonicalObservationKind.State
  ) {
    throw new Error(`Terminate End calibration has no state after ${commandId}`);
  }
  return state;
}

function terminateRootInsteadOfChild(result: MutableScenarioResult): void {
  const state = stateAfterCommand(result, "complete-trigger");
  if (
    state.status !== ProcessStatus.Running ||
    state.openUserTasks[0]?.id.elementId !== "UserTask_Outer"
  ) {
    throw new Error("Terminate End calibration requires the Outer wait");
  }
  state.status = ProcessStatus.Completed;
}

function retainCanceledSibling(result: MutableScenarioResult): void {
  const state = stateAfterCommand(result, "complete-trigger");
  const outer = state.openUserTasks[0];
  if (outer?.id.elementId !== "UserTask_Outer") {
    throw new Error("Terminate End calibration requires the Outer wait");
  }
  state.openUserTasks.push({
    ...outer,
    id: { ...outer.id, elementId: "UserTask_Sibling" },
    name: "Sibling",
  });
}

function eraseOuterAfterStaleRefusal(result: MutableScenarioResult): void {
  const state = stateAfterCommand(
    result,
    "refuse-stale-sibling-after-termination",
  );
  if (state.openUserTasks[0]?.id.elementId !== "UserTask_Outer") {
    throw new Error("Terminate End stale refusal must preserve the Outer wait");
  }
  state.openUserTasks = [];
}

function terminateEndCase(
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

export const terminateEndPipelineCases = Object.freeze([
  terminateEndCase(
    "terminate-end-event-trigger-first",
    "trigger-first.scenario.json",
    terminateRootInsteadOfChild,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].status",
      expected: ProcessStatus.Running,
      actual: ProcessStatus.Completed,
    },
  ),
  terminateEndCase(
    "terminate-end-event-sibling-first",
    "sibling-first.scenario.json",
    retainCanceledSibling,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[6].openUserTasks.length",
      expected: 1,
      actual: 2,
    },
  ),
  terminateEndCase(
    "terminate-end-event-stale-sibling-after-termination",
    "stale-sibling-after-termination.scenario.json",
    eraseOuterAfterStaleRefusal,
    {
      kind: DisagreementKind.ObservationValue,
      path: "trace[6].openUserTasks.length",
      expected: 1,
      actual: 0,
    },
  ),
]);
