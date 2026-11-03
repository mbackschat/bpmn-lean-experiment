import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type SingleScopeModelName = "purchase-approval-first" | "purchase-budget-first" | "invoice-valid" | "invoice-corrected";

/** The state observation at `index` whose only open User Task is `elementId`'s activation `activation`. */
function openTaskAt(result: MutableScenarioResult, index: number, elementId: string, activation = 1) {
  const state = result.trace[index];
  const open = state?.kind === CanonicalObservationKind.State ? state.openUserTasks : [];
  if (state?.kind !== CanonicalObservationKind.State || open.length !== 1 || open[0]!.id.elementId !== elementId ||
    open[0]!.id.activation !== activation) {
    throw new Error(`Single-scope calibration requires ${elementId}#${activation} alone open at trace[${index}]`);
  }
  return { state, task: open[0]! };
}

/** Moves the open User Task at `index` to `elementId`, the wait a wrong lowering of that element would leave. */
function waitsAt(index: number, open: string, waiting: string): PipelineCase["injectMutation"] {
  return (result) => {
    const { state, task } = openTaskAt(result, index, open);
    result.trace[index] = { ...state, openUserTasks: [{ ...task, id: { ...task.id, elementId: waiting } }] };
  };
}

/**
 * SSM-ADMIT-01 on the re-entry route: reusing the first round's occurrence instead of a fresh one would reopen *Review
 * invoice*'s first activation after the invalid verdict at `trace[6]`.
 */
function reentryReusesActivation(result: MutableScenarioResult): void {
  const { state, task } = openTaskAt(result, 6, "ReviewInvoice", 2);
  result.trace[6] = { ...state, openUserTasks: [{ ...task, id: { ...task.id, activation: 1 } }] };
}

const cases = {
  // The Manual *Collect signature* lowered as a wait at the root fork would stand open instead of *Approve purchase*.
  "purchase-approval-first": {
    model: "purchase-request", inject: waitsAt(4, "ApprovePurchase", "CollectSignature"),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks[0].id.elementId",
      expected: "ApprovePurchase", actual: "CollectSignature" },
  },
  // *Purchase approved* lowered as a wait after the root join would stand open instead of *Place order*.
  "purchase-budget-first": {
    model: "purchase-request", inject: waitsAt(8, "PlaceOrder", "PurchaseApproved"),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].openUserTasks[0].id.elementId",
      expected: "PlaceOrder", actual: "PurchaseApproved" },
  },
  // *Invoice cleared* lowered as a wait after the root Choice would stand open instead of *Pay invoice*.
  "invoice-valid": {
    model: "invoice-clearing", inject: waitsAt(6, "PayInvoice", "InvoiceCleared"),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].openUserTasks[0].id.elementId",
      expected: "PayInvoice", actual: "InvoiceCleared" },
  },
  "invoice-corrected": {
    model: "invoice-clearing", inject: reentryReusesActivation,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].openUserTasks[0].id.activation",
      expected: 2, actual: 1 },
  },
} as const satisfies Record<SingleScopeModelName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained single-scope models, with no CIB target and no retained answer, so each
 * seeded mutation is the only calibration. Stimulus order realizes each schedule through the testkit's ordered
 * Activity release and ordered completion delivery.
 */
export const singleScopeModelsPipelineCases = Object.freeze(
  (Object.keys(cases) as SingleScopeModelName[]).map((name): PipelineCase => ({
    id: `single-scope-models-${name}`,
    scenarioRelativePath: `scenarios/single-scope-models/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/single-scope-models/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/single-scope-models/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `single-scope-models-${name}`,
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
