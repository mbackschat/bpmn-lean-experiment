import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { replaceArgument } from "./concurrent-scope-data-pipeline-cases.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type RootParallelForksName = "onboarding-documents-while-laptop-open" | "onboarding-documents-first" | "onboarding-laptop-first";

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;
const employee = (department: string) => ({ kind: VariableValueKind.Map,
  value: [{ name: "department", value: text(department) }, { name: "name", value: text("Grace") }] }) as const;

/** RPF-VALUE-01: rewriting open snapshots on a Process write moves *Collect documents*' `employee` into *Order laptop*. */
function rewriteOpenSnapshot(result: MutableScenarioResult): void {
  replaceArgument(result, 6, ["OrderLaptop#1"], 0, employee("Sales"), { name: "employee", value: employee("Finance") });
}

/** RPF-ROOT-01: a join continuing on its first token opens *Hold welcome meeting* beside *Prepare workstation*. */
function joinOnFirstToken(result: MutableScenarioResult): void {
  const state = result.trace[4];
  const open = state?.kind === CanonicalObservationKind.State ? state.openUserTasks : [];
  if (state?.kind !== CanonicalObservationKind.State || open.length !== 1 || open[0]!.id.elementId !== "PrepareWorkstation") {
    throw new Error("Root Parallel forks calibration requires PrepareWorkstation alone open at trace[4]");
  }
  result.trace[4] = { ...state,
    openUserTasks: [...open, { ...open[0]!, id: { ...open[0]!.id, elementId: "HoldWelcomeMeeting" } }] };
}

/** RPF-WRITE-01: keeping the first committed write leaves *Order laptop*'s stage after *Collect documents* commits. */
function keepFirstWrite(result: MutableScenarioResult): void {
  const state = result.trace[8];
  const position = state?.kind === CanonicalObservationKind.State
    ? state.variables.findIndex(({ name, value }) => name === "onboardingStage" &&
      JSON.stringify(value) === JSON.stringify(text("documents-filed"))) : -1;
  if (state?.kind !== CanonicalObservationKind.State || position < 0) {
    throw new Error("Root Parallel forks calibration requires onboardingStage documents-filed at trace[8]");
  }
  result.trace[8] = { ...state,
    variables: state.variables.with(position, { name: "onboardingStage", value: text("equipment-ordered") }) };
}

const cases = {
  "onboarding-documents-while-laptop-open": {
    inject: rewriteOpenSnapshot,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].openEffects[0].arguments[0].value.value[0].value.value",
      expected: "Sales", actual: "Finance" },
  },
  "onboarding-documents-first": {
    inject: joinOnFirstToken,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks.length", expected: 1, actual: 2 },
  },
  "onboarding-laptop-first": {
    inject: keepFirstWrite,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].variables[2].value.value",
      expected: "documents-filed", actual: "equipment-ordered" },
  },
} as const satisfies Record<RootParallelForksName, Readonly<{
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the retained employee onboarding model, with no CIB target and no retained answer, so
 * each seeded mutation is the only calibration. Stimulus order realizes each schedule through the testkit's ordered
 * Activity release and ordered completion delivery.
 */
export const rootParallelForksPipelineCases = Object.freeze(
  (Object.keys(cases) as RootParallelForksName[]).map((name): PipelineCase => ({
    id: `root-parallel-forks-${name}`,
    scenarioRelativePath: `scenarios/root-parallel-forks/${name}.scenario.json`,
    bpmnRelativePath: "scenarios/root-parallel-forks/employee-onboarding.bpmn",
    sourceOverlayRelativePath: "scenarios/root-parallel-forks/employee-onboarding-overlay.json",
    workflowIdPrefix: `root-parallel-forks-${name}`,
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
