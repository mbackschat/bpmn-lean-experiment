import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type ActivityHostMergeName = "claim-direct" | "claim-expert" | "claim-direct-reopened";

/** The state observation at `index`, which a calibrated result must hold there. */
function stateAt(result: MutableScenarioResult, index: number) {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new Error(`Activity host merge calibration requires a state at trace[${index}]`);
  }
  return state;
}

/** Empties the open User Tasks at `index`, where *Review claim* alone must be open with `activation`. */
function reviewNotOpened(index: number, activation: number) {
  return (result: MutableScenarioResult): void => {
    const state = stateAt(result, index);
    const [task, ...rest] = state.openUserTasks;
    if (task?.id.elementId !== "ReviewClaim" || task.id.activation !== activation || rest.length > 0) {
      throw new Error(`Activity host merge calibration requires ReviewClaim#${activation} alone open at trace[${index}]`);
    }
    result.trace[index] = { ...state, openUserTasks: [] };
  };
}

/**
 * ACTH-MERGE-01, wrong algorithm 6: a merge reusing the first arrival's occurrence would reopen *Review claim* as
 * activation 1 after the reopened expert opinion at `trace[10]`.
 */
function reviewReusesOccurrence(result: MutableScenarioResult): void {
  const state = stateAt(result, 10);
  const [task, ...rest] = state.openUserTasks;
  if (task?.id.elementId !== "ReviewClaim" || task.id.activation !== 2 || rest.length > 0) {
    throw new Error("Activity host merge calibration requires ReviewClaim#2 alone open at trace[10]");
  }
  result.trace[10] = { ...state, openUserTasks: [{ ...task, id: { ...task.id, activation: 1 } }] };
}

const cases = {
  // Wrong algorithm 3: a merge waiting for every incoming flow would never open *Review claim* from the direct path.
  "claim-direct": {
    inject: reviewNotOpened(4, 1),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks.length", expected: 1, actual: 0 },
  },
  // Wrong algorithm 4: a lowering that kept the direct input only would strand the arrival from the expert opinion.
  "claim-expert": {
    inject: reviewNotOpened(6, 1),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].openUserTasks.length", expected: 1, actual: 0 },
  },
  "claim-direct-reopened": {
    inject: reviewReusesOccurrence,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[10].openUserTasks[0].id.activation", expected: 2, actual: 1 },
  },
} as const satisfies Record<ActivityHostMergeName, Readonly<{
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the retained claim review model, with no CIB target and no retained answer, so each
 * seeded mutation is the only calibration. The model is serial, so stimulus order is its one schedule.
 */
export const activityHostMergePipelineCases = Object.freeze(
  (Object.keys(cases) as ActivityHostMergeName[]).map((name): PipelineCase => ({
    id: `activity-host-merge-${name}`,
    scenarioRelativePath: `scenarios/activity-host-merge/${name}.scenario.json`,
    bpmnRelativePath: "scenarios/activity-host-merge/claim-review.bpmn",
    sourceOverlayRelativePath: "scenarios/activity-host-merge/claim-review-overlay.json",
    workflowIdPrefix: `activity-host-merge-${name}`,
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
