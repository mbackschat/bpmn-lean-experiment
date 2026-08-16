/** Three standards-profile M6 terminal cases and independent value mutations. */
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
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  MutableScenarioResult,
  MutableStateObservation,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/expense-exception-review";

function finalBinding(result: MutableScenarioResult, name: string) {
  const finalState = [...result.trace].reverse().find(
    (observation): observation is MutableStateObservation =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
  const index = finalState?.variables.findIndex((binding) => binding.name === name) ?? -1;
  const binding = finalState?.variables[index];
  if (finalState === undefined || binding === undefined) {
    throw new Error(`structured Human Work calibration requires final ${name}`);
  }
  return { binding, index };
}

function mutateApprovedAmount(result: MutableScenarioResult): void {
  const { binding } = finalBinding(result, "approvedAmount");
  if (binding.value.kind !== VariableValueKind.Integer) {
    throw new Error("Approve calibration requires one integer amount");
  }
  binding.value = {
    kind: VariableValueKind.String,
    value: String(binding.value.value),
  };
}

function reorderRiskFlags(result: MutableScenarioResult): void {
  const { binding } = finalBinding(result, "riskFlags");
  if (
    binding.value.kind !== VariableValueKind.StringList ||
    binding.value.value.length !== 2
  ) {
    throw new Error("Request-changes calibration requires two ordered risk flags");
  }
  binding.value.value.reverse();
}

function mutateAbortResolution(result: MutableScenarioResult): void {
  const { binding } = finalBinding(result, "resolution");
  if (
    binding.value.kind !== VariableValueKind.String ||
    binding.value.value !== "aborted"
  ) {
    throw new Error("Abort calibration requires its terminal resolution marker");
  }
  binding.value.value = "approved";
}

function structuredCase(
  id: string,
  scenarioFile: string,
  injectMutation: PipelineCase["injectMutation"],
  path: string,
  expected: unknown,
  actual: unknown,
): PipelineCase {
  return {
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
    replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
    injectMutation,
    expectedInjectedDisagreement: {
      kind: DisagreementKind.ObservationValue,
      path,
      expected,
      actual,
    },
  };
}

export const structuredHumanWorkPipelineCases = Object.freeze([
  structuredCase(
    "expense-exception-review-approve",
    "approve.scenario.json",
    mutateApprovedAmount,
    "trace[4].variables[0].value.kind",
    "integer",
    "string",
  ),
  structuredCase(
    "expense-exception-review-request-changes",
    "request-changes.scenario.json",
    reorderRiskFlags,
    "trace[4].variables[6].value.value[0]",
    "receipt",
    "policy",
  ),
  structuredCase(
    "expense-exception-review-abort",
    "abort.scenario.json",
    mutateAbortResolution,
    "trace[4].variables[4].value.value",
    "aborted",
    "approved",
  ),
]);
