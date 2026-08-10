/** Standards-only resumption-bounded cycle case and repeated-occurrence mutation. */
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
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/user-task-cycle";

function resetSecondActivation(result: MutableScenarioResult): void {
  const observation = result.trace[4];
  const task = observation?.kind === CanonicalObservationKind.State
    ? observation.openUserTasks[0]
    : undefined;
  if (
    observation?.kind !== CanonicalObservationKind.State ||
    observation.openUserTasks.length !== 1 ||
    task?.id.elementId !== "Review" ||
    task.id.activation !== 2
  ) {
    throw new Error(
      "Cycle calibration requires Review activation 2 after the repeat route",
    );
  }
  observation.openUserTasks[0] = {
    ...task,
    id: { ...task.id, activation: 1 },
  };
}

const cyclicControlFlowCase = {
  id: "user-task-cycle-repeat-rework-exit",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
  workflowIdPrefix: "user-task-cycle-repeat-rework-exit",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: resetSecondActivation,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[4].openUserTasks[0].id.activation",
    expected: 2,
    actual: 1,
  },
} as const satisfies PipelineCase;

export const cyclicControlFlowPipelineCases = Object.freeze([
  cyclicControlFlowCase,
]);
