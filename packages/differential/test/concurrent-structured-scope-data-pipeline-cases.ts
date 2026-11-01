import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { replaceArgument } from "./concurrent-scope-data-pipeline-cases.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type ConcurrentStructuredScopeDataName = "order-review-first" | "order-pick-first" | "loan-valuation-first" | "loan-credit-first";

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;

/** A Process variable value in the mutable result a seeded mutation edits. */
type MutableValue = Extract<MutableScenarioResult["trace"][number], { kind: CanonicalObservationKind.State }>["variables"][number]["value"];

/** The structured `instructions` that *Review route* writes over the declared String. */
const fragile = (): MutableValue => ({ kind: VariableValueKind.Map, value: [{ name: "handling", value: text("fragile") }] });

/**
 * Replaces the Process variable `name` in the state at `trace[index]`, which must hold `original`. Consecutive states
 * share their binding objects, so the mutation replaces this state's array.
 */
function replaceVariable(result: MutableScenarioResult, index: number, name: string,
  change: (value: MutableValue) => MutableValue | undefined): void {
  const state = result.trace[index];
  const position = state?.kind === CanonicalObservationKind.State ? state.variables.findIndex(binding => binding.name === name) : -1;
  if (state?.kind !== CanonicalObservationKind.State || position < 0) {
    throw new Error(`Concurrent structured scope data calibration requires ${name} at trace[${index}]`);
  }
  const replaced = change(state.variables[position]!.value);
  if (replaced === undefined) {
    throw new Error(`Concurrent structured scope data calibration requires the witnessed shape of ${name} at trace[${index}]`);
  }
  state.variables = state.variables.with(position, { name, value: replaced });
}

/** CSSD-SNAPSHOT-01: rewriting open snapshots on a frame write moves *Review route*'s `instructions` into *Pick items*. */
function rewriteOpenSnapshot(result: MutableScenarioResult): void {
  replaceArgument(result, 6, ["PickItems#1", "RateShipment#1"], 0, text("standard"), { name: "instructions", value: fragile() });
}

/** CSSD-VALUE-01: deduplicating list members leaves one of the two equal parcels in `shippedParcels`. */
function deduplicateParcels(result: MutableScenarioResult): void {
  replaceVariable(result, 14, "shippedParcels", value => {
    const parcels = value.kind === VariableValueKind.Map ? value.value[0]?.value : undefined;
    return parcels?.kind === VariableValueKind.List && parcels.value.length === 2
      ? { kind: VariableValueKind.Map, value: [{ name: "parcels", value: { kind: VariableValueKind.List, value: [parcels.value[0]!] } }] }
      : undefined;
  });
}

/** CSSD-REUSE-01: deferring a branch Sub-Process's outputs to the join keeps `valuationFile` out of the Process. */
function deferBranchOutput(result: MutableScenarioResult): void {
  const state = result.trace[8];
  if (state?.kind !== CanonicalObservationKind.State || state.variables.map(({ name }) => name).join() !== "application,valuationFile") {
    throw new Error("Concurrent structured scope data calibration requires application and valuationFile at trace[8]");
  }
  state.variables = state.variables.slice(0, 1);
}

/** CSSD-VALUE-01: dropping a present-null Map entry removes the applicant's `employer` from `creditFile`. */
function dropPresentNull(result: MutableScenarioResult): void {
  replaceVariable(result, 12, "creditFile", value => {
    if (value.kind !== VariableValueKind.Map) return undefined;
    const applicant = value.value.find(({ name }) => name === "applicant")?.value;
    if (applicant?.kind !== VariableValueKind.Map || applicant.value[0]?.name !== "employer") return undefined;
    return { kind: VariableValueKind.Map, value: value.value.map(entry => entry.name === "applicant"
      ? { name: "applicant", value: { kind: VariableValueKind.Map, value: applicant.value.slice(1) } } : entry) };
  });
}

const cases = {
  "order-review-first": {
    model: "order-fulfilment", inject: rewriteOpenSnapshot,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].openEffects[0].arguments[0].value.kind",
      expected: "string", actual: "map" },
  },
  "order-pick-first": {
    model: "order-fulfilment", inject: deduplicateParcels,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[14].variables[3].value.value[0].value.value.length",
      expected: 2, actual: 1 },
  },
  "loan-valuation-first": {
    model: "loan-assessment", inject: deferBranchOutput,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].variables.length", expected: 2, actual: 1 },
  },
  "loan-credit-first": {
    model: "loan-assessment", inject: dropPresentNull,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[12].variables[2].value.value[1].value.value.length",
      expected: 2, actual: 1 },
  },
} as const satisfies Record<ConcurrentStructuredScopeDataName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained models, with no CIB target and no retained answer, so each seeded
 * mutation is the only calibration. Stimulus order realizes each schedule through the testkit's ordered Activity
 * release and ordered completion delivery.
 */
export const concurrentStructuredScopeDataPipelineCases = Object.freeze(
  (Object.keys(cases) as ConcurrentStructuredScopeDataName[]).map((name): PipelineCase => ({
    id: `concurrent-structured-scope-data-${name}`,
    scenarioRelativePath: `scenarios/concurrent-structured-scope-data/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/concurrent-structured-scope-data/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/concurrent-structured-scope-data/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `concurrent-structured-scope-data-${name}`,
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
