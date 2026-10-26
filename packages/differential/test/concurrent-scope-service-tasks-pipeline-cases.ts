import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type ConcurrentScopeEffectsName = "supplier-review-first" | "supplier-effects-first" | "claim-price-two-first" |
  "claim-fetch-first";

/** The open User Tasks and effects of a State observation as sorted `Element#activation` names. */
export function openWork(state: Pick<MutableStateObservation, "openUserTasks" | "openEffects">): readonly string[] {
  return [...state.openUserTasks, ...state.openEffects]
    .map(({ id }) => `${id.elementId.replace(/^(UserTask|ServiceTask)_/u, "")}#${id.activation}`).toSorted();
}

/** The State observation at `index`, whose open User Tasks and effects must be exactly `expected`. */
function stateAt(result: MutableScenarioResult, index: number, expected: readonly string[]): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State || openWork(state).join() !== expected.join()) {
    throw new Error(`Concurrent scope effects calibration requires ${expected.join(", ")} open at trace[${index}]`);
  }
  return state;
}

/** A later State's open User Task, copied to model a target that opened it early. */
function laterTask(result: MutableScenarioResult, index: number, expected: readonly string[]) {
  const [task] = stateAt(result, index, expected).openUserTasks;
  if (task === undefined) throw new Error(`Concurrent scope effects calibration requires a User Task at trace[${index}]`);
  return task;
}

/**
 * CSE-ISOLATE-01: the join waits for the second effect after the contract review and sanctions screening. A join that
 * fired after the User Task and one effect would already open Approve supplier.
 */
function joinAfterOneEffect(result: MutableScenarioResult): void {
  const approve = laterTask(result, 8, ["ApproveSupplier#1"]);
  stateAt(result, 6, ["VerifyBankAccount#1"]).openUserTasks.push(approve);
}

/** CSE-ISOLATE-01: both effects have committed but the review is open, so the join still waits. */
function joinWithoutReview(result: MutableScenarioResult): void {
  const approve = laterTask(result, 8, ["ApproveSupplier#1"]);
  stateAt(result, 6, ["ReviewContract#1"]).openUserTasks.push(approve);
}

/**
 * CSE-ISOLATE-01: completing Price damage 2 leaves Price damage 1 open in the first Assess occurrence. A completion
 * applied to the other activation would leave activation 2 open instead.
 */
function completeWrongActivation(result: MutableScenarioResult): void {
  const state = stateAt(result, 8, ["ConfirmAssessment#1", "PriceDamage#1"]);
  const [price] = state.openEffects;
  if (price === undefined) throw new Error("Concurrent scope effects calibration requires the open Price damage effect");
  // Trace States share unchanged entries, so the mutation replaces this one instead of editing it in place.
  state.openEffects[0] = { ...price, id: { ...price.id, activation: 2 } };
}

/**
 * CSE-QUIESCE-01: the second Assess occurrence owns only its Price damage wait, so Intake cannot complete and Settle
 * claim is absent. Quiescence that ignored effect waits would complete Assess, then Intake, and open Settle claim.
 */
function quiescenceIgnoringEffects(result: MutableScenarioResult): void {
  const settle = laterTask(result, 14, ["SettleClaim#1"]);
  stateAt(result, 10, ["PriceDamage#2"]).openUserTasks.push(settle);
}

const openUserTaskCount = (index: number, expected: number) => ({
  kind: DisagreementKind.ObservationValue, path: `trace[${index}].openUserTasks.length`, expected, actual: expected + 1,
}) as const;

const cases = {
  "supplier-review-first": { model: "supplier-screening", inject: joinAfterOneEffect, expected: openUserTaskCount(6, 0) },
  "supplier-effects-first": { model: "supplier-screening", inject: joinWithoutReview, expected: openUserTaskCount(6, 1) },
  "claim-price-two-first": {
    model: "claim-intake",
    inject: completeWrongActivation,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].openEffects[0].id.activation", expected: 1, actual: 2 },
  },
  "claim-fetch-first": { model: "claim-intake", inject: quiescenceIgnoringEffects, expected: openUserTaskCount(10, 0) },
} as const satisfies Record<ConcurrentScopeEffectsName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained models, with no CIB target and no retained answer, so each seeded
 * mutation is the only calibration. Stimulus order realizes each schedule's effect-completion order through the
 * testkit's ordered Activity release, so concurrent Activity results commit in the scenario's order.
 */
export const concurrentScopeServiceTasksPipelineCases = Object.freeze(
  (Object.keys(cases) as ConcurrentScopeEffectsName[]).map((name): PipelineCase => ({
    id: `concurrent-scope-effects-${name}`,
    scenarioRelativePath: `scenarios/concurrent-scope-service-tasks/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/concurrent-scope-service-tasks/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/concurrent-scope-service-tasks/${cases[name].model}-handlers.json`,
    workflowIdPrefix: `concurrent-scope-effects-${name}`,
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
