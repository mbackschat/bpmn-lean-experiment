import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type NoneIntermediateThrowName =
  "warranty-passed" | "warranty-rework" | "onboarding-account-first" | "onboarding-laptop-first";

/** The state observation at `index`, which a calibrated result must hold there. */
function stateAt(result: MutableScenarioResult, index: number) {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new Error(`None Throw calibration requires a state at trace[${index}]`);
  }
  return state;
}

/**
 * NIT-PASS-01: *Fault diagnosed* lowered as a User Task wait would stand open after *Diagnose fault* at `trace[4]`,
 * where *Replace part* is open instead.
 */
function faultDiagnosedWaits(result: MutableScenarioResult): void {
  const state = stateAt(result, 4);
  const [open] = state.openUserTasks;
  if (state.openUserTasks.length !== 1 || open!.id.elementId !== "ReplacePart") {
    throw new Error("None Throw calibration requires ReplacePart alone open at trace[4]");
  }
  result.trace[4] = { ...state, openUserTasks: [{ ...open!, id: { ...open!.id, elementId: "FaultDiagnosed" } }] };
}

/**
 * NIT-PASS-01 on re-entry: reusing the first iteration's occurrences instead of starting fresh ones would reopen
 * *Replace part*'s first activation after the failed test at `trace[10]`.
 */
function reentryReusesActivation(result: MutableScenarioResult): void {
  const state = stateAt(result, 10);
  const [open] = state.openUserTasks;
  if (state.openUserTasks.length !== 1 || open!.id.elementId !== "ReplacePart" || open!.id.activation !== 2) {
    throw new Error("None Throw calibration requires ReplacePart's second activation open at trace[10]");
  }
  result.trace[10] = { ...state, openUserTasks: [{ ...open!, id: { ...open!.id, activation: 1 } }] };
}

/** NIT-PASS-01 on a branch: *Welcome sent* waiting would leave *Order laptop* unopened after the fork at `trace[4]`. */
function welcomeSentWaits(result: MutableScenarioResult): void {
  const state = stateAt(result, 4);
  if (state.openEffects.length !== 1) throw new Error("None Throw calibration requires one open effect at trace[4]");
  result.trace[4] = { ...state, openEffects: [] };
}

/** NIT-PASS-01 after the join: *Onboarding complete* waiting would leave the Process running at `trace[8]`. */
function onboardingCompleteWaits(result: MutableScenarioResult): void {
  const state = stateAt(result, 8);
  if (state.status !== ProcessStatus.Completed) throw new Error("None Throw calibration requires completion at trace[8]");
  result.trace[8] = { ...state, status: ProcessStatus.Running };
}

const cases = {
  "warranty-passed": {
    model: "warranty-repair", inject: faultDiagnosedWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks[0].id.elementId",
      expected: "ReplacePart", actual: "FaultDiagnosed" },
  },
  "warranty-rework": {
    model: "warranty-repair", inject: reentryReusesActivation,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[10].openUserTasks[0].id.activation",
      expected: 2, actual: 1 },
  },
  "onboarding-account-first": {
    model: "onboarding-milestones", inject: welcomeSentWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openEffects.length", expected: 1, actual: 0 },
  },
  "onboarding-laptop-first": {
    model: "onboarding-milestones", inject: onboardingCompleteWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].status", expected: "completed",
      actual: "running" },
  },
} as const satisfies Record<NoneIntermediateThrowName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained None Throw models, with no CIB target and no retained answer, so each
 * seeded mutation is the only calibration. Stimulus order realizes each schedule through the testkit's ordered
 * Activity release and ordered completion delivery.
 */
export const noneIntermediateThrowPipelineCases = Object.freeze(
  (Object.keys(cases) as NoneIntermediateThrowName[]).map((name): PipelineCase => ({
    id: `none-intermediate-throw-${name}`,
    scenarioRelativePath: `scenarios/none-intermediate-throw/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/none-intermediate-throw/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/none-intermediate-throw/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `none-intermediate-throw-${name}`,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: cases[name].inject,
    expectedInjectedDisagreement: cases[name].expected,
  })),
);
