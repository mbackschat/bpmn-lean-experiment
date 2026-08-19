/** Exact Process-data plus standard-notation case and its retained semantic-result mutation. */
import {
  CanonicalObservationKind,
  ProcessStatus,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
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
  PipelineCase,
} from "./pipeline-types.ts";
import { mutateOpenTaskActivation } from "./user-task-pipeline-mutation.ts";

const scenarioRoot = "scenarios/user-task-process-data-preserved-notation";

const preservedNotationCase = {
  id: "user-task-preserved-notation",
  scenarioRelativePath:
    "scenarios/user-task-preserved-notation/scenario.json",
  bpmnRelativePath: "scenarios/user-task-preserved-notation/process.bpmn",
  workflowIdPrefix: "user-task-preserved-notation",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: mutateOpenTaskActivation,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].openUserTasks[0].id.activation",
    expected: 1,
    actual: 2,
  },
} as const satisfies PipelineCase;

function replaceFinalDecision(result: MutableScenarioResult): void {
  const finalState = [...result.trace].reverse().find(
    (observation): observation is MutableStateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  const binding = finalState?.variables.find(
    ({ name }) => name === "decision",
  );
  if (binding?.value.kind !== VariableValueKind.String) {
    throw new Error(
      "interchange composition requires one final String decision binding",
    );
  }
  binding.value = {
    kind: VariableValueKind.String,
    value: "rejected",
  };
}

const interchangeAdmissionCase = {
  id: "user-task-process-data-preserved-notation",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: "scenarios/user-task-preserved-notation/process.bpmn",
  workflowIdPrefix: "user-task-process-data-preserved-notation",
  cib: {
    evidenceRelativePath: `${scenarioRoot}/cibseven-evidence.json`,
    version: "2.2.0",
    relation: CibCaseRelation.ExactSemantic,
    effectExecutionSchedule: CibEffectExecutionSchedule.None,
  },
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: replaceFinalDecision,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[4].variables[0].value.value",
    expected: "approved",
    actual: "rejected",
  },
} as const satisfies PipelineCase;

export const interchangeAdmissionPipelineCases = Object.freeze([
  preservedNotationCase,
  interchangeAdmissionCase,
]);
