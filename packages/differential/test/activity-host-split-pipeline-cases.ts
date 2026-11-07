import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type ActivityHostSplitName = "intake-archive-first" | "intake-broker-first";

/** The State observation at `index`, whose open User Tasks and effects must be exactly `expected`. */
function stateAt(result: MutableScenarioResult, index: number, expected: readonly string[]) {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State || openWork(state).join() !== expected.join()) {
    throw new Error(`Activity host split calibration requires ${expected.join(", ")} open at trace[${index}]`);
  }
  return state;
}

/**
 * Closes *Notify broker* at `index`, after *Register claim* completes: a host taking its first output in canonical order
 * only, `Flow_ToArchive`, opens *Archive documents* alone.
 */
function registerFirstOutputOnly(index: number) {
  return (result: MutableScenarioResult): void => {
    const state = stateAt(result, index, ["ArchiveDocuments#1", "NotifyBroker#1"]);
    result.trace[index] = { ...state, openEffects: [] };
  };
}

/**
 * Closes *Inform customer* at `index`, after *Review claim* completes: a host taking its first output in canonical order
 * only, `Flow_ToAssessment`, opens *Order assessment* alone.
 */
function reviewFirstOutputOnly(index: number) {
  return (result: MutableScenarioResult): void => {
    const state = stateAt(result, index, ["InformCustomer#1", "OrderAssessment#1"]);
    result.trace[index] = { ...state, openUserTasks: [] };
  };
}

const cases = {
  // ACSP-COMPLETE-01, wrong algorithm 3: a splitting Service Task host taking its first output only.
  "intake-archive-first": {
    inject: registerFirstOutputOnly(4),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openEffects.length", expected: 1, actual: 0 },
  },
  // ACSP-COMPLETE-01, wrong algorithm 3: a splitting User Task host taking its first output only.
  "intake-broker-first": {
    inject: reviewFirstOutputOnly(10),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[10].openUserTasks.length", expected: 1, actual: 0 },
  },
} as const satisfies Record<ActivityHostSplitName, Readonly<{
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the retained insurance claim intake model, with no CIB target and no retained answer, so
 * each seeded mutation is the only calibration. Together they complete each splitting Task's two branches in both
 * orders, which stimulus order realizes through the testkit's ordered Activity release and ordered completion delivery.
 */
export const activityHostSplitPipelineCases = Object.freeze(
  (Object.keys(cases) as ActivityHostSplitName[]).map((name): PipelineCase => ({
    id: `activity-host-split-${name}`,
    scenarioRelativePath: `scenarios/activity-host-split/${name}.scenario.json`,
    bpmnRelativePath: "scenarios/activity-host-split/insurance-claim-intake.bpmn",
    sourceOverlayRelativePath: "scenarios/activity-host-split/insurance-claim-intake-overlay.json",
    workflowIdPrefix: `activity-host-split-${name}`,
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
