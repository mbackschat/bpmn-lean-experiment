import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type ImplicitSplitMergeName = "claim-approved" | "claim-rejected" | "dispatch-packed-first" | "dispatch-courier-first";

/** The state observation at `index`, which a calibrated result must hold there. */
function stateAt(result: MutableScenarioResult, index: number) {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new Error(`Implicit split and merge calibration requires a state at trace[${index}]`);
  }
  return state;
}

/**
 * PTSM-MERGE-01: a merge waiting for every incoming flow would hold the token that *Archive claim file* received from
 * the one taken branch, leaving the Process running after the last User Task at `trace[6]`.
 */
function mergeWaitsForEveryInput(result: MutableScenarioResult): void {
  const state = stateAt(result, 6);
  if (state.status !== ProcessStatus.Completed) {
    throw new Error("Implicit split and merge calibration requires completion at trace[6]");
  }
  result.trace[6] = { ...state, status: ProcessStatus.Running };
}

/**
 * PTSM-SPLIT-01: a split read as a choice would arm one branch only, so the reservation's closure at `trace[4]` would
 * open one of *Pack equipment* and *Book courier*.
 */
function splitArmsOneBranch(result: MutableScenarioResult): void {
  const state = stateAt(result, 4);
  if (state.openUserTasks.length !== 2) {
    throw new Error("Implicit split and merge calibration requires two open User Tasks at trace[4]");
  }
  result.trace[4] = { ...state, openUserTasks: state.openUserTasks.slice(0, 1) };
}

/**
 * PTSM-SPLIT-01: a choice that took the courier flow alone would leave nothing open once the courier is booked at
 * `trace[6]`, where *Pack equipment* still waits.
 */
function splitSkipsPacking(result: MutableScenarioResult): void {
  const state = stateAt(result, 6);
  if (state.openUserTasks.length !== 1 || state.openUserTasks[0]!.id.elementId !== "PackEquipment") {
    throw new Error("Implicit split and merge calibration requires PackEquipment alone open at trace[6]");
  }
  result.trace[6] = { ...state, openUserTasks: [] };
}

const cases = {
  "claim-approved": {
    model: "claim-archiving", inject: mergeWaitsForEveryInput,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].status", expected: "completed", actual: "running" },
  },
  "claim-rejected": {
    model: "claim-archiving", inject: mergeWaitsForEveryInput,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].status", expected: "completed", actual: "running" },
  },
  "dispatch-packed-first": {
    model: "equipment-dispatch", inject: splitArmsOneBranch,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks.length", expected: 2, actual: 1 },
  },
  "dispatch-courier-first": {
    model: "equipment-dispatch", inject: splitSkipsPacking,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].openUserTasks.length", expected: 1, actual: 0 },
  },
} as const satisfies Record<ImplicitSplitMergeName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained implicit split and merge models, with no CIB target and no retained
 * answer, so each seeded mutation is the only calibration. Stimulus order realizes each schedule through the testkit's
 * ordered Activity release and ordered completion delivery.
 */
export const passThroughImplicitSplitMergePipelineCases = Object.freeze(
  (Object.keys(cases) as ImplicitSplitMergeName[]).map((name): PipelineCase => ({
    id: `pass-through-implicit-split-merge-${name}`,
    scenarioRelativePath: `scenarios/pass-through-implicit-split-merge/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/pass-through-implicit-split-merge/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/pass-through-implicit-split-merge/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `pass-through-implicit-split-merge-${name}`,
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
