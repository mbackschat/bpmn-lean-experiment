import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { openWork } from "./concurrent-scope-service-tasks-pipeline-cases.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type Argument = MutableStateObservation["openEffects"][number]["arguments"][number];

type ConcurrentScopeDataName = "claim-fetch-one-first" | "claim-fetch-two-first" | "facility-inspection";

/**
 * Replaces one argument of the open effect at `trace[index]`, whose open work must be exactly `expected` and whose
 * argument must still hold `original`. Trace States share unchanged entries, so the mutation replaces the State, effect
 * and argument list instead of editing them in place.
 */
export function replaceArgument(result: MutableScenarioResult, index: number, expected: readonly string[], effect: number,
  original: Argument["value"], binding: Argument): void {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State || openWork(state).join() !== expected.join()) {
    throw new Error(`Concurrent scope data calibration requires ${expected.join(", ")} open at trace[${index}]`);
  }
  const open = state.openEffects[effect];
  const position = open?.arguments.findIndex(({ name, value }) =>
    name === binding.name && JSON.stringify(value) === JSON.stringify(original)) ?? -1;
  if (open === undefined || position < 0) {
    throw new Error(
      `Concurrent scope data calibration requires argument ${binding.name} = ${JSON.stringify(original)} at trace[${index}]`);
  }
  const values = open.arguments.with(position, binding);
  result.trace[index] = { ...state, openEffects: state.openEffects.with(effect, { ...open, arguments: values }) };
}

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;

/**
 * CSD-CHAIN-01, CSD-ISOLATE-01: resolving `estimate` by definition, or flattening both Price damage occurrences into one
 * frame, would arm the first occurrence's Fetch rates with the second occurrence's "4200".
 */
function resolveByDefinition(result: MutableScenarioResult): void {
  replaceArgument(result, 10, ["FetchRates#1", "FetchRates#2"], 0, text("pending"), { name: "estimate", value: text("4200") });
}

/** NSD-READ-01 over the chain: reading the Process before the frames would arm Fetch rates with the Process "desk". */
function readProcessFirst(result: MutableScenarioResult): void {
  replaceArgument(result, 8, ["AssessDamage#2", "FetchRates#1"], 0, { kind: VariableValueKind.Null },
    { name: "adjuster", value: text("desk") });
}

/**
 * CSD-INIT-01: evaluating Fire safety check's entry against its earlier-executed sibling's frame would initialize its
 * result to the shadowing "pending-electrical", which it outputs to `fireResult`.
 */
function initializeFromSibling(result: MutableScenarioResult): void {
  replaceArgument(result, 6, ["Summarize#1"], 0, text("none"), { name: "fireResult", value: text("pending-electrical") });
}

const argumentValue = (index: number, argument: number, expected: string, actual: string) => ({
  kind: DisagreementKind.ObservationValue, path: `trace[${index}].openEffects[0].arguments[${argument}].value.value`,
  expected, actual,
}) as const;

const cases = {
  "claim-fetch-one-first": {
    model: "claim-damage-assessment", inject: resolveByDefinition, expected: argumentValue(10, 1, "pending", "4200"),
  },
  "claim-fetch-two-first": {
    model: "claim-damage-assessment",
    inject: readProcessFirst,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].openEffects[0].arguments[0].value.kind",
      expected: VariableValueKind.Null, actual: VariableValueKind.String },
  },
  "facility-inspection": {
    model: "facility-inspection", inject: initializeFromSibling, expected: argumentValue(6, 2, "none", "pending-electrical"),
  },
} as const satisfies Record<ConcurrentScopeDataName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained models, with no CIB target and no retained answer, so each seeded
 * mutation is the only calibration. Stimulus order realizes the claim schedules' Fetch rates completion orders through
 * the testkit's ordered Activity release, so the later completer's output wins in the scenario's order.
 */
export const concurrentScopeDataPipelineCases = Object.freeze(
  (Object.keys(cases) as ConcurrentScopeDataName[]).map((name): PipelineCase => ({
    id: `concurrent-scope-data-${name}`,
    scenarioRelativePath: `scenarios/concurrent-scope-data/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/concurrent-scope-data/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/concurrent-scope-data/${cases[name].model}-handlers.json`,
    workflowIdPrefix: `concurrent-scope-data-${name}`,
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
