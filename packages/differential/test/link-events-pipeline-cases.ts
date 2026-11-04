import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type LinkEventsName = "warranty-passed" | "warranty-rework" | "onboarding-account-first" | "onboarding-laptop-first";

/** The state observation at `index`, which a calibrated result must hold there. */
function stateAt(result: MutableScenarioResult, index: number) {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) throw new Error(`Link calibration requires a state at trace[${index}]`);
  return state;
}

/** LNK-CONT-01: a catch lowered to a wait would stand open after the *Order spare part* result at `trace[8]`. */
function testingCatchWaits(result: MutableScenarioResult): void {
  const state = stateAt(result, 8);
  const [open] = state.openUserTasks;
  if (state.openUserTasks.length !== 1 || open!.id.elementId !== "TestDevice") {
    throw new Error("Link calibration requires TestDevice alone open at trace[8]");
  }
  result.trace[8] = { ...state, openUserTasks: [{ ...open!, id: { ...open!.id, elementId: "CatchToTesting" } }] };
}

/** LNK-CONT-01 on the Go To loop: a throw lowered to a wait would leave *Replace part* unopened after the failed test. */
function backToRepairWaits(result: MutableScenarioResult): void {
  const state = stateAt(result, 10);
  const [open] = state.openUserTasks;
  if (state.openUserTasks.length !== 1 || open!.id.elementId !== "ReplacePart" || open!.id.activation !== 2) {
    throw new Error("Link calibration requires ReplacePart's second activation open at trace[10]");
  }
  result.trace[10] = { ...state, openUserTasks: [{ ...open!, id: { ...open!.id, elementId: "ThrowBackToRepair" } }] };
}

/** LNK-CONT-01 on a branch: a waiting *Welcome track* pair would leave *Order laptop* unopened after the fork. */
function welcomeTrackWaits(result: MutableScenarioResult): void {
  const state = stateAt(result, 4);
  if (state.openEffects.length !== 1) throw new Error("Link calibration requires one open effect at trace[4]");
  result.trace[4] = { ...state, openEffects: [] };
}

/** LNK-CONT-01 after the join: a waiting *All set* pair would leave the Process running at `trace[8]`. */
function allSetWaits(result: MutableScenarioResult): void {
  const state = stateAt(result, 8);
  if (state.status !== ProcessStatus.Completed) throw new Error("Link calibration requires completion at trace[8]");
  result.trace[8] = { ...state, status: ProcessStatus.Running };
}

const cases = {
  "warranty-passed": {
    model: "warranty-repair", inject: testingCatchWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].openUserTasks[0].id.elementId",
      expected: "TestDevice", actual: "CatchToTesting" },
  },
  "warranty-rework": {
    model: "warranty-repair", inject: backToRepairWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[10].openUserTasks[0].id.elementId",
      expected: "ReplacePart", actual: "ThrowBackToRepair" },
  },
  "onboarding-account-first": {
    model: "onboarding-milestones", inject: welcomeTrackWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openEffects.length", expected: 1, actual: 0 },
  },
  "onboarding-laptop-first": {
    model: "onboarding-milestones", inject: allSetWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].status", expected: "completed", actual: "running" },
  },
} as const satisfies Record<LinkEventsName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two Link models, with no CIB target and no retained answer. Each model binds its
 * explicit-flow twin's overlay, copied byte for byte into the Link directory; stimulus order realizes each schedule as for the twins.
 */
export const linkEventsPipelineCases = Object.freeze(
  (Object.keys(cases) as LinkEventsName[]).map((name): PipelineCase => ({
    id: `link-events-${name}`,
    scenarioRelativePath: `scenarios/link-events/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/link-events/${cases[name].model}-links.bpmn`,
    sourceOverlayRelativePath: `scenarios/link-events/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `link-events-${name}`,
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
