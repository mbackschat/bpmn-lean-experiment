/** Exact Boolean Process-data case and its anti-stringification mutation. */
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

const scenarioRoot = "scenarios/user-task-boolean-completion";

function stringifyFinalBoolean(result: MutableScenarioResult): void {
  const finalState = [...result.trace].reverse().find(
    (observation): observation is MutableStateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  const binding = finalState?.variables.find(
    ({ name }) => name === "approved",
  );
  if (binding?.value.kind !== VariableValueKind.Boolean) {
    throw new Error(
      "Boolean Process-data calibration requires one final Boolean binding",
    );
  }
  binding.value = {
    kind: VariableValueKind.String,
    value: String(binding.value.value),
  };
}

const booleanProcessDataCase = {
  id: "user-task-boolean-completion",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath:
    "scenarios/user-task-discovery-completion/process.bpmn",
  workflowIdPrefix: "user-task-boolean-completion",
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
  replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
  injectMutation: stringifyFinalBoolean,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[4].variables[0].value.kind",
    expected: VariableValueKind.Boolean,
    actual: VariableValueKind.String,
  },
} as const satisfies PipelineCase;

export const booleanProcessDataPipelineCases = Object.freeze([
  booleanProcessDataCase,
]);
