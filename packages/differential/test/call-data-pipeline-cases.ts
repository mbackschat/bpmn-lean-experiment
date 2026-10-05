import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { PipelineCase } from "./pipeline-types.ts";

export const callDataPipelineCases = Object.freeze((["string", "null"] as const).map((kind): PipelineCase => {
  const caller = `SupplierOnboarding_${kind}`;
  const called = `call:${caller.length}:${caller}:17:Call_DueDiligence:1`;
  return {
    id: `call-data-supplier-${kind}`,
    scenarioRelativePath: `scenarios/call-activity-data-boundaries/${kind}.scenario.json`,
    bpmnRelativePath: "scenarios/call-activity-data-boundaries/process.bpmn",
    workflowIdPrefix: `call-data-supplier-${kind}`,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation(result) {
      const observation = result.trace[2];
      const task = observation?.kind === CanonicalObservationKind.State ? observation.openUserTasks[0] : undefined;
      if (observation?.kind !== CanonicalObservationKind.State || !task || task.id.processInstanceId !== called || task.id.elementId !== "Task_AssessSupplier") {
        throw new Error("Scalar Call calibration requires the called-owned due diligence task");
      }
      observation.openUserTasks[0] = { ...task, id: { ...task.id, processInstanceId: caller } };
    },
    expectedInjectedDisagreement: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].openUserTasks[0].id.processInstanceId",
      expected: called,
      actual: caller,
    },
  };
}));
