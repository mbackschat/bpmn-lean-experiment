import { CanonicalObservationKind, CommandOutcome, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { replaceArgument } from "./concurrent-scope-data-pipeline-cases.ts";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type ScopeReentryName = "claim-rework-then-approve" | "claim-rework-then-reject" | "contract-revise-then-sign"
  | "contract-revise-then-withdraw";

const text = (value: string) => ({ kind: VariableValueKind.String, value }) as const;

/** The open User Task at `trace[index]`, which must be the only one and must be `elementId`. */
function onlyOpenTask(result: MutableScenarioResult, index: number, elementId: string) {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State || state.openUserTasks.length !== 1 ||
      state.openUserTasks[0]!.id.elementId !== elementId) {
    throw new Error(`Scope re-entry calibration requires ${elementId} alone open at trace[${index}]`);
  }
  return { state, task: state.openUserTasks[0]! };
}

/**
 * SRE-INIT-01: a completion that kept *Assess claim*'s frame would hand iteration 2's *Price repair* iteration 1's
 * `notes`, "photos missing", instead of the `claimSummary` the fresh frame copies.
 */
function keepFrame(result: MutableScenarioResult): void {
  replaceArgument(result, 10, ["PriceRepair#2"], 0, text("hail damage"), { name: "damage", value: text("photos missing") });
}

/** SRE-FRESH-01: identity by element only would reopen *Inspect damage* under its first activation. */
function reuseActivation(result: MutableScenarioResult): void {
  const { state, task } = onlyOpenTask(result, 6, "InspectDamage");
  if (task.id.activation !== 2) throw new Error("Scope re-entry calibration requires InspectDamage#2 at trace[6]");
  result.trace[6] = { ...state, openUserTasks: [{ ...task, id: { ...task.id, activation: 1 } }] };
}

/** SRE-STALE-01: accepting the first review's late verdict would let it settle the second iteration. */
function acceptStaleReview(result: MutableScenarioResult): void {
  const command = result.trace[9];
  if (command?.kind !== CanonicalObservationKind.Command || command.commandId !== "complete-stale-review-clauses" ||
      command.outcome !== CommandOutcome.Rejected) {
    throw new Error("Scope re-entry calibration requires the stale review rejected at trace[9]");
  }
  command.outcome = CommandOutcome.Committed;
}

/** SRE-FRESH-01: identity by element only would reuse the first *Legal review* instance for the second Call. */
function reuseCalledInstance(result: MutableScenarioResult): void {
  const { state, task } = onlyOpenTask(result, 8, "ReviewClauses");
  if (!task.id.processInstanceId.endsWith(":LegalReview:2")) {
    throw new Error("Scope re-entry calibration requires the second Legal review instance at trace[8]");
  }
  result.trace[8] = { ...state, openUserTasks: [{ ...task,
    id: { ...task.id, processInstanceId: task.id.processInstanceId.replace(/:2$/u, ":1") } }] };
}

const cases = {
  "claim-rework-then-approve": {
    model: "claim-rework", inject: keepFrame,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[10].openEffects[0].arguments[0].value.value",
      expected: "hail damage", actual: "photos missing" },
  },
  "claim-rework-then-reject": {
    model: "claim-rework", inject: reuseActivation,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[6].openUserTasks[0].id.activation", expected: 2, actual: 1 },
  },
  "contract-revise-then-sign": {
    model: "contract-revision", inject: acceptStaleReview,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[9].outcome", expected: "rejected", actual: "committed" },
  },
  "contract-revise-then-withdraw": {
    model: "contract-revision", inject: reuseCalledInstance,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[8].openUserTasks[0].id.processInstanceId",
      expected: "call:10:Instance_1:11:LegalReview:2", actual: "call:10:Instance_1:11:LegalReview:1" },
  },
} as const satisfies Record<ScopeReentryName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained scope re-entry models, with no CIB target and no retained answer, so
 * each seeded mutation is the only calibration. Each schedule re-enters its Sub-Process once; the contract schedules
 * also re-invoke the called Process.
 */
export const scopeReentryPipelineCases = Object.freeze(
  (Object.keys(cases) as ScopeReentryName[]).map((name): PipelineCase => ({
    id: `scope-reentry-${name}`,
    scenarioRelativePath: `scenarios/scope-reentry/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/scope-reentry/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/scope-reentry/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `scope-reentry-${name}`,
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
