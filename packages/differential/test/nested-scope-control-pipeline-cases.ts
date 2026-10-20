import { CanonicalObservationKind, CommandOutcome } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type NestedScopeControlName = "onboarding-setup-first" | "onboarding-equipment-first" | "audit-early-and-stale";

/** The index of the command observation for `commandId`, which must be present in the trace. */
function commandIndex(result: MutableScenarioResult, commandId: string): number {
  const index = result.trace.findIndex(
    (observation) => observation.kind === CanonicalObservationKind.Command && observation.commandId === commandId,
  );
  if (index < 0) throw new Error(`Nested scope-control calibration requires the ${commandId} command`);
  return index;
}

/** The State observation that follows `commandId`, whose open User Tasks must be exactly `expected` in sorted order. */
function stateAfter(result: MutableScenarioResult, commandId: string, expected: readonly string[]): MutableStateObservation {
  const state = result.trace[commandIndex(result, commandId) + 1];
  if (state?.kind !== CanonicalObservationKind.State ||
      state.openUserTasks.map(({ id }) => id.elementId).toSorted().join() !== expected.join()) {
    throw new Error(`Nested scope-control calibration requires ${expected.join(", ")} open after ${commandId}`);
  }
  return state;
}

/**
 * NSC-JOIN-01: with Order equipment completed and only Grant VPN still open inside the nested Accounts scope, the root
 * join has a token from the equipment branch alone. A join that fired on the first arrival, or that took a nested
 * completion for the missing branch, would open Welcome meeting here.
 */
function joinRootEarly(result: MutableScenarioResult): void {
  const state = stateAfter(result, "complete-order-equipment", ["UserTask_GrantVpn"]);
  const [grantVpn] = state.openUserTasks;
  if (grantVpn === undefined) throw new Error("Nested scope-control calibration requires the Grant VPN task");
  state.openUserTasks[0] = { ...grantVpn, id: { ...grantVpn.id, elementId: "UserTask_WelcomeMeeting" }, name: "Welcome meeting" };
}

/**
 * NSC-ENTER-01: confirming the start date enters Workplace setup and, in the same closure, its nested Accounts scope, so
 * Assign desk, Create mailbox and Grant VPN open together. A missing nested entry would leave only Assign desk.
 */
function omitNestedEntry(result: MutableScenarioResult): void {
  const state = stateAfter(result, "complete-confirm-start-date", ["UserTask_AssignDesk", "UserTask_CreateMailbox", "UserTask_GrantVpn"]);
  state.openUserTasks = state.openUserTasks.filter(({ id }) => id.elementId === "UserTask_AssignDesk");
}

/**
 * NSC-REFUSE-01: Review findings is not yet open while the Interviews scope is still running, so its early completion
 * is rejected. A gate that accepted the command for an absent task occurrence would report it committed.
 */
function acceptEarlyCompletion(result: MutableScenarioResult): void {
  const command = result.trace[commandIndex(result, "complete-review-findings-early")];
  if (command?.kind !== CanonicalObservationKind.Command || command.outcome !== CommandOutcome.Rejected) {
    throw new Error("Nested scope-control calibration requires the early completion to be rejected");
  }
  command.outcome = CommandOutcome.Committed;
}

const cases = {
  "onboarding-setup-first": {
    model: "employee-onboarding",
    inject: joinRootEarly,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[10].openUserTasks[0].id.elementId",
      expected: "UserTask_GrantVpn",
      actual: "UserTask_WelcomeMeeting",
    },
  },
  "onboarding-equipment-first": {
    model: "employee-onboarding",
    inject: omitNestedEntry,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[6].openUserTasks.length",
      expected: 3,
      actual: 1,
    },
  },
  "audit-early-and-stale": {
    model: "internal-audit",
    inject: acceptEarlyCompletion,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[7].outcome",
      expected: CommandOutcome.Rejected,
      actual: CommandOutcome.Committed,
    },
  },
} as const satisfies Record<NestedScopeControlName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over two retained models, with no CIB target and no retained answer, so each seeded
 * mutation is the only calibration. Every command is a User Task completion, so the host delivers them in order.
 */
export const nestedScopeControlPipelineCases = Object.freeze(
  (Object.keys(cases) as NestedScopeControlName[]).map((name): PipelineCase => ({
    id: `nested-scope-control-${name}`,
    scenarioRelativePath: `scenarios/nested-embedded-scope-control/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/nested-embedded-scope-control/${cases[name].model}.bpmn`,
    workflowIdPrefix: `nested-scope-control-${name}`,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: cases[name].inject,
    expectedInjectedDisagreement: cases[name].expected,
  })),
);
