import { CanonicalObservationKind, CommandOutcome } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type PassThroughParallelBranchesName = "relocation-packing-first" | "relocation-movers-first" | "invoice-settled";

/**
 * PTPB-PASS-01: *Notify facilities* lowered as a User Task wait would stand open beside *Pack boxes* after the fork
 * closure at `trace[4]`.
 */
function facilitiesWaits(result: MutableScenarioResult): void {
  const state = result.trace[4];
  const open = state?.kind === CanonicalObservationKind.State ? state.openUserTasks : [];
  if (state?.kind !== CanonicalObservationKind.State || open.length !== 1 || open[0]!.id.elementId !== "PackBoxes") {
    throw new Error("Pass-through branch calibration requires PackBoxes alone open at trace[4]");
  }
  result.trace[4] = { ...state,
    openUserTasks: [...open, { ...open[0]!, id: { ...open[0]!.id, elementId: "NotifyFacilities" } }] };
}

/**
 * PTPB-COMMUTE-01: keeping a Merge input dependent on a declared entry makes the fork closure an observable choice,
 * which the profile's scheduling rolls back, so *Approve relocation* at `trace[3]` would not commit.
 */
function forkClosureRollsBack(result: MutableScenarioResult): void {
  const command = result.trace[3];
  if (command?.kind !== CanonicalObservationKind.Command || command.outcome !== CommandOutcome.Committed) {
    throw new Error("Pass-through branch calibration requires a committed command at trace[3]");
  }
  result.trace[3] = { ...command, outcome: CommandOutcome.RolledBack } as typeof command;
}

/**
 * PTPB-PASS-01 in a body fork: *Archive receipt* waiting would keep *Review invoice* open, so its output
 * `reviewVerdict` would be missing from the Process after *Check invoice* at `trace[4]`.
 */
function reviewStaysOpen(result: MutableScenarioResult): void {
  const state = result.trace[4];
  if (state?.kind !== CanonicalObservationKind.State || !state.variables.some(({ name }) => name === "reviewVerdict")) {
    throw new Error("Pass-through branch calibration requires reviewVerdict at trace[4]");
  }
  result.trace[4] = { ...state, variables: state.variables.filter(({ name }) => name !== "reviewVerdict") };
}

const cases = {
  "relocation-packing-first": {
    model: "office-relocation", inject: facilitiesWaits,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks.length", expected: 1, actual: 2 },
  },
  "relocation-movers-first": {
    model: "office-relocation", inject: forkClosureRollsBack,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[3].outcome", expected: "committed",
      actual: "rolledBack" },
  },
  "invoice-settled": {
    model: "invoice-settlement", inject: reviewStaysOpen,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].variables.length", expected: 2, actual: 1 },
  },
} as const satisfies Record<PassThroughParallelBranchesName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained pass-through branch models, with no CIB target and no retained answer,
 * so each seeded mutation is the only calibration. Stimulus order realizes each schedule through the testkit's ordered
 * Activity release and ordered completion delivery.
 */
export const passThroughParallelBranchesPipelineCases = Object.freeze(
  (Object.keys(cases) as PassThroughParallelBranchesName[]).map((name): PipelineCase => ({
    id: `pass-through-parallel-branches-${name}`,
    scenarioRelativePath: `scenarios/pass-through-parallel-branches/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/pass-through-parallel-branches/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/pass-through-parallel-branches/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `pass-through-parallel-branches-${name}`,
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
