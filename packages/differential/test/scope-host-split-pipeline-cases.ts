import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type ScopeHostSplitName = "onboarding-register-first" | "onboarding-workstation-first";

/**
 * Keeps only the first of the open User Tasks at `index`, which must be exactly `expected`, as a split taking its first
 * outgoing flow only would leave them.
 */
function firstFlowOnly(index: number, expected: readonly string[]) {
  return (result: MutableScenarioResult): void => {
    const state = result.trace[index];
    if (state?.kind !== CanonicalObservationKind.State || openWork(state).join() !== expected.join()) {
      throw new Error(`Scope host split calibration requires ${expected.join(", ")} open at trace[${index}]`);
    }
    result.trace[index] = { ...state, openUserTasks: state.openUserTasks.slice(0, 1) };
  };
}

/**
 * Empties the open User Tasks at `index`, where *Confirm IT access* alone must be open: an exit taking its first output
 * only reaches *Notify facilities* and never opens it.
 */
function exitFirstOutputOnly(index: number) {
  return (result: MutableScenarioResult): void => {
    const state = result.trace[index];
    if (state?.kind !== CanonicalObservationKind.State || openWork(state).join() !== "ConfirmItAccess#1") {
      throw new Error(`Scope host split calibration requires ConfirmItAccess#1 alone open at trace[${index}]`);
    }
    result.trace[index] = { ...state, openUserTasks: [] };
  };
}

const cases = {
  // SCPH-START-01, wrong algorithm 3: a body Start split taking its first flow only opens *Issue badge* alone.
  "onboarding-register-first": {
    inject: firstFlowOnly(6, ["IssueBadge#1", "IssueLaptop#1"]),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].openUserTasks.length", expected: 2, actual: 1 },
  },
  // SCPH-EXIT-01, wrong algorithm 3: an exit taking its first output only never opens *Confirm IT access*.
  "onboarding-workstation-first": {
    inject: exitFirstOutputOnly(10),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[10].openUserTasks.length", expected: 1, actual: 0 },
  },
} as const satisfies Record<ScopeHostSplitName, Readonly<{
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the retained employee onboarding model, with no CIB target and no retained answer, so
 * each seeded mutation is the only calibration. Together they complete each split's two branches in both orders, which
 * stimulus order realizes through the testkit's ordered Activity release and ordered completion delivery.
 */
export const scopeHostSplitPipelineCases = Object.freeze(
  (Object.keys(cases) as ScopeHostSplitName[]).map((name): PipelineCase => ({
    id: `scope-host-split-${name}`,
    scenarioRelativePath: `scenarios/scope-host-split/${name}.scenario.json`,
    bpmnRelativePath: "scenarios/scope-host-split/employee-onboarding.bpmn",
    sourceOverlayRelativePath: "scenarios/scope-host-split/employee-onboarding-overlay.json",
    workflowIdPrefix: `scope-host-split-${name}`,
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
