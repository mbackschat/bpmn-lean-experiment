import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type ConcurrentActivationsName = "audit-interleaved-and-stale" | "audit-reversed" | "intake-reverse-assessments";

/**
 * The State observation that follows `commandId`, whose open User Tasks must be exactly `expected`, written as
 * `Element#activation` in sorted order.
 */
function stateAfter(result: MutableScenarioResult, commandId: string, expected: readonly string[]): MutableStateObservation {
  const index = result.trace.findIndex(
    (observation) => observation.kind === CanonicalObservationKind.Command && observation.commandId === commandId,
  );
  if (index < 0) throw new Error(`Concurrent activations calibration requires the ${commandId} command`);
  const state = result.trace[index + 1];
  if (state?.kind !== CanonicalObservationKind.State ||
      state.openUserTasks.map(({ id }) => `${id.elementId.slice("UserTask_".length)}#${id.activation}`).toSorted().join() !==
        expected.join()) {
    throw new Error(`Concurrent activations calibration requires ${expected.join(", ")} open after ${commandId}`);
  }
  return state;
}

/**
 * CEA-ISOLATE-01: completing Fix finding activation 2 advances only the second Remediation, so the first one's Fix finding
 * stays open beside Verify fix. A completion applied to the other activation would leave Fix finding activation 2 open.
 */
function completeWrongActivation(result: MutableScenarioResult): void {
  const state = stateAfter(result, "complete-fix-finding-2", ["FixFinding#1", "VerifyFix#1"]);
  const [fix] = state.openUserTasks;
  if (fix?.id.elementId !== "UserTask_FixFinding") throw new Error("Concurrent activations calibration requires Fix finding first");
  state.openUserTasks[0] = { ...fix, id: { ...fix.id, activation: 2 } };
}

/**
 * CEA-MERGE-01: the first review to finish passes the merge on its own and opens Fix finding while the other review is
 * still open. A merge that waited for both inputs, like a join, would leave only Review controls.
 */
function joinAtMerge(result: MutableScenarioResult): void {
  const state = stateAfter(result, "complete-review-payments", ["FixFinding#1", "ReviewControls#1"]);
  state.openUserTasks = state.openUserTasks.filter(({ id }) => id.elementId === "UserTask_ReviewControls");
}

/**
 * CEA-OCCUR-01: every finished check starts its own Assess activation, so two Score applicant occurrences are open beside
 * Check income. A merge target that deduplicated into the live activation would show only the first.
 */
function deduplicateActivation(result: MutableScenarioResult): void {
  const state = stateAfter(result, "complete-check-address", ["CheckIncome#1", "ScoreApplicant#1", "ScoreApplicant#2"]);
  state.openUserTasks = state.openUserTasks.filter(({ id }) => id.activation === 1);
}

const cases = {
  "audit-interleaved-and-stale": {
    model: "audit-remediation",
    inject: completeWrongActivation,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[8].openUserTasks[0].id.activation",
      expected: 1,
      actual: 2,
    },
  },
  "audit-reversed": {
    model: "audit-remediation",
    inject: joinAtMerge,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].openUserTasks.length",
      expected: 2,
      actual: 1,
    },
  },
  "intake-reverse-assessments": {
    model: "credit-intake",
    inject: deduplicateActivation,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[8].openUserTasks.length",
      expected: 3,
      actual: 2,
    },
  },
} as const satisfies Record<ConcurrentActivationsName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over two retained models, with no CIB target and no retained answer, so each seeded
 * mutation is the only calibration. Every command is a User Task completion, so the host delivers them in order.
 */
export const concurrentEmbeddedActivationsPipelineCases = Object.freeze(
  (Object.keys(cases) as ConcurrentActivationsName[]).map((name): PipelineCase => ({
    id: `concurrent-activations-${name}`,
    scenarioRelativePath: `scenarios/concurrent-embedded-activations/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/concurrent-embedded-activations/${cases[name].model}.bpmn`,
    workflowIdPrefix: `concurrent-activations-${name}`,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: cases[name].inject,
    expectedInjectedDisagreement: cases[name].expected,
  })),
);
