import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type NoneEndFanInName = "travel-rejected" | "travel-by-phone" | "travel-booked";

/**
 * NEF-END-01's two wrong algorithms leave the Process running where the arriving token should have ended it: an End
 * that joins its incoming flows waits for flows no token will take, and a lowering of only the first incoming flow
 * strands a token arriving on any other. Either way the completed state at `index` would read running.
 */
function leaveRunning(index: number) {
  return (result: MutableScenarioResult): void => {
    const state = result.trace[index];
    if (state?.kind !== CanonicalObservationKind.State || state.status !== ProcessStatus.Completed) {
      throw new Error(`None End fan-in calibration requires a completed state at trace[${index}]`);
    }
    result.trace[index] = { ...state, status: ProcessStatus.Running };
  };
}

const ended = (index: number) => ({
  inject: leaveRunning(index),
  expected: { kind: DisagreementKind.ObservationValue as const, path: `trace[${index}].status`,
    expected: ProcessStatus.Completed, actual: ProcessStatus.Running },
});

const cases = {
  // The checked graph orders the End's flows by id: Flow_Booked, Flow_Called, Flow_Reject. A joining End strands every
  // journey; a lowering of only the first flow strands the rejected and phone journeys and keeps the booked one.
  "travel-rejected": ended(4),
  "travel-by-phone": ended(6),
  "travel-booked": ended(6),
} as const satisfies Record<NoneEndFanInName, Readonly<{
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the retained travel request model, with no CIB target and no retained answer, so each
 * seeded mutation is the only calibration. The CIB probe calibrates the same three journeys separately.
 */
export const noneEndFanInPipelineCases = Object.freeze(
  (Object.keys(cases) as NoneEndFanInName[]).map((name): PipelineCase => ({
    id: `none-end-fan-in-${name}`,
    scenarioRelativePath: `scenarios/none-end-fan-in/${name}.scenario.json`,
    bpmnRelativePath: "scenarios/none-end-fan-in/travel-request.bpmn",
    sourceOverlayRelativePath: "scenarios/none-end-fan-in/travel-request-overlay.json",
    workflowIdPrefix: `none-end-fan-in-${name}`,
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
