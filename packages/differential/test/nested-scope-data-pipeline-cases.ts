import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { VariableValue } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type NestedScopeDataName = "order-approved" | "order-null-risk" | "claim-limits" | "quote-signed";

type OpenEffect = MutableStateObservation["openEffects"][number];

/** The state observation at `index` and its single open effect, which must be the named wait of this journey. */
function openEffect(result: MutableScenarioResult, index: number, elementId: string): OpenEffect {
  const state = result.trace[index];
  const effect = state?.kind === CanonicalObservationKind.State ? state.openEffects[0] : undefined;
  if (effect?.id.elementId !== elementId) {
    throw new Error(`Nested scope-data calibration requires the ${elementId} wait at trace[${index}]`);
  }
  return effect;
}

function argument(effect: OpenEffect, name: string) {
  const found = effect.arguments.find((binding) => binding.name === name);
  if (found === undefined) throw new Error(`Nested scope-data calibration requires the ${name} argument`);
  return found;
}

/**
 * NSD-WRITE-01: the review completes with `status = "approved"`, which belongs to order approval's frame. A write that
 * lands on the Process instead would show at the publish wait, where the Process `status` is still "open".
 */
function writeToProcess(result: MutableScenarioResult): void {
  const status = argument(openEffect(result, 10, "R"), "status");
  if (status.value.kind !== VariableValueKind.String || status.value.value !== "open") {
    throw new Error("Nested scope-data calibration requires the untouched Process status at the publish wait");
  }
  status.value.value = "approved";
}

/**
 * NSD-READ-01: the compliance scope declares `reviewer = ${status}`, and order approval's `status` ("intake") shadows
 * the Process `status` ("open"). Reading the Process before the frames would publish "open".
 */
function readProcessBeforeFrames(result: MutableScenarioResult): void {
  const reviewer = argument(openEffect(result, 2, "KS"), "reviewer");
  if (reviewer.value.kind !== VariableValueKind.String || reviewer.value.value !== "intake") {
    throw new Error("Nested scope-data calibration requires the shadowing frame value at the compliance wait");
  }
  reviewer.value.value = "open";
}

/** NSD-TASK-01: the accepted allowance-sized patch replaces the frame's claim; losing it would keep the Start claim. */
function dropAllowancePatch(result: MutableScenarioResult): void {
  const claim = argument(openEffect(result, 6, "RecordClaim"), "claim");
  if (claim.value.kind !== VariableValueKind.Map || claim.value.value.length !== 1 ||
      claim.value.value[0]?.name !== "notes") {
    throw new Error("Nested scope-data calibration requires the allowance patch at the record wait");
  }
  claim.value = {
    kind: VariableValueKind.Map,
    value: [
      { name: "amount", value: { kind: VariableValueKind.Decimal, coefficient: "4255", scale: 2 } },
      { name: "memo", value: { kind: VariableValueKind.String, value: "taxi" } },
    ],
  } satisfies VariableValue;
}

/**
 * NSD-OUTPUT-01: Quote preparation outputs its own `preparedQuote`. Reading the output source from the innermost frame
 * would archive the signed quote instead.
 */
function outputFromInnermostFrame(result: MutableScenarioResult): void {
  const finalQuote = argument(openEffect(result, 4, "ArchiveQuote"), "finalQuote");
  const lines = finalQuote.value.kind === VariableValueKind.Map ? finalQuote.value.value[0]?.value : undefined;
  if (lines?.kind !== VariableValueKind.List || lines.value.length !== 2) {
    throw new Error("Nested scope-data calibration requires the prepared quote with two lines at the archive wait");
  }
  lines.value.splice(0, 2);
}

const mutations = {
  "order-approved": {
    inject: writeToProcess,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[10].openEffects[0].arguments[3].value.value",
      expected: "open",
      actual: "approved",
    },
  },
  "order-null-risk": {
    inject: readProcessBeforeFrames,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[2].openEffects[0].arguments[1].value.value",
      expected: "intake",
      actual: "open",
    },
  },
  "claim-limits": {
    inject: dropAllowancePatch,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[6].openEffects[0].arguments[0].value.value.length",
      expected: 1,
      actual: 2,
    },
  },
  "quote-signed": {
    inject: outputFromInnermostFrame,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[4].openEffects[0].arguments[0].value.value[0].value.value.length",
      expected: 2,
      actual: 0,
    },
  },
} as const;

/** The retained model, handler overlay and journey of each case; the three models share no file. */
const files = {
  "order-approved": ["purchase-order", "purchase-order-overlay"],
  "order-null-risk": ["purchase-order", "purchase-order-overlay"],
  "claim-limits": ["expense-claim", "expense-claim-overlay"],
  "quote-signed": ["bulk-quote", "bulk-quote-overlay"],
} as const satisfies Record<NestedScopeDataName, readonly [string, string]>;

/**
 * Standards-only schedules: no CIB target and no retained answer, so the mutation is the only calibration. Every
 * journey interleaves User Task and effect commands in stimulus order, as the serial business-task cases do.
 */
export const nestedScopeDataPipelineCases = Object.freeze((Object.keys(mutations) as NestedScopeDataName[]).map((name): PipelineCase => ({
  id: `nested-scope-data-${name}`,
  scenarioRelativePath: `scenarios/nested-embedded-scope-data/${name}.scenario.json`,
  bpmnRelativePath: `scenarios/nested-embedded-scope-data/${files[name][0]}.bpmn`,
  sourceOverlayRelativePath: `scenarios/nested-embedded-scope-data/${files[name][1]}.json`,
  workflowIdPrefix: `nested-scope-data-${name}`,
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.StimulusOrder,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: mutations[name].inject,
  expectedInjectedDisagreement: mutations[name].expected,
})));
