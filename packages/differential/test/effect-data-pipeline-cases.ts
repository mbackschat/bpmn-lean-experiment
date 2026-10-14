import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type EffectDataName = "credit-assessed" | "credit-null";

function stateAt(result: MutableScenarioResult, index: number): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) throw new Error(`Effect-data calibration requires state at trace[${index}]`);
  return state;
}

/** Drops the second of two equal credit checks from the Notify snapshot: the deduplication a set-shaped copy would introduce. */
function dedupeChecks(result: MutableScenarioResult): void {
  const effect = stateAt(result, 4).openEffects[0];
  const assessment = effect?.id.elementId === "NotifyApplicant" ? effect.arguments[0]?.value : undefined;
  const checks = assessment?.kind === VariableValueKind.Map ? assessment.value[2]?.value : undefined;
  if (checks?.kind !== VariableValueKind.List || checks.value.length !== 3) {
    throw new Error("Effect-data calibration requires the Notify snapshot with three credit checks");
  }
  checks.value.splice(1, 1);
}

/** Publishes the empty-Map receipt as Null: a copy that collapses empty structures would make the two indistinguishable. */
function emptyMapAsNull(result: MutableScenarioResult): void {
  const receipt = stateAt(result, 6).variables.find(({ name }) => name === "receipt");
  if (receipt?.value.kind !== VariableValueKind.Map || receipt.value.value.length !== 0) {
    throw new Error("Effect-data calibration requires the empty-Map receipt at completion");
  }
  receipt.value = { kind: VariableValueKind.Null };
}

const mutations = {
  "credit-assessed": {
    inject: dedupeChecks,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].openEffects[0].arguments[0].value.value[2].value.value.length",
      expected: 3,
      actual: 2,
    },
  },
  "credit-null": {
    inject: emptyMapAsNull,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[6].variables[2].value.kind",
      expected: VariableValueKind.Map,
      actual: VariableValueKind.Null,
    },
  },
} as const;

/** Standards-only schedules: no CIB target and no retained answer, so the mutation is the only calibration. */
export const effectDataPipelineCases = Object.freeze((Object.keys(mutations) as EffectDataName[]).map((name): PipelineCase => ({
  id: `effect-data-${name}`,
  scenarioRelativePath: `scenarios/portable-business-effect-data/${name}.scenario.json`,
  bpmnRelativePath: "scenarios/portable-business-effect-data/credit-decision.bpmn",
  sourceOverlayRelativePath: "scenarios/portable-business-effect-data/source-overlay.json",
  workflowIdPrefix: `effect-data-${name}`,
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.StimulusOrder,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: mutations[name].inject,
  expectedInjectedDisagreement: mutations[name].expected,
})));
