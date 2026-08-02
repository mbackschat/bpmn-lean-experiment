/** Standards-only called-Process Call Activity case and public identity-erasure mutation. */
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
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/called-process-call-activity";
const callerInstanceId = "CallActivityInstance_1";
const calledInstanceId =
  "call:22:CallActivityInstance_1:18:Call_CalledProcess:1";

function eraseCalledProcessIdentity(result: MutableScenarioResult): void {
  const observation = result.trace[2];
  const task = observation?.kind === CanonicalObservationKind.State
    ? observation.openUserTasks[0]
    : undefined;
  if (
    observation?.kind !== CanonicalObservationKind.State ||
    observation.instanceId !== callerInstanceId ||
    observation.openUserTasks.length !== 1 ||
    task?.id.processInstanceId !== calledInstanceId ||
    task.id.elementId !== "CalledTask"
  ) {
    throw new Error(
      "Call Activity calibration requires one called-owned task under the unchanged caller observation",
    );
  }
  observation.openUserTasks[0] = {
    ...task,
    id: { ...task.id, processInstanceId: callerInstanceId },
  };
}

const callActivityCase = {
  id: "called-process-call-activity",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
  workflowIdPrefix: "called-process-call-activity",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: eraseCalledProcessIdentity,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].openUserTasks[0].id.processInstanceId",
    expected: calledInstanceId,
    actual: callerInstanceId,
  },
} as const satisfies PipelineCase;

export const callActivityPipelineCases = Object.freeze([callActivityCase]);
