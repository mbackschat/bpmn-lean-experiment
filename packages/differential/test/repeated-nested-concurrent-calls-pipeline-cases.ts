import { CanonicalObservationKind, deriveCalledProcessInstanceId } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type RepeatedCallsName = "natural-order" | "reverse-order-stale-and-cross-addressed";

const supplier = "Instance_1";
const tax = deriveCalledProcessInstanceId(supplier, "CallActivity_TaxApproval", 1);
const risk = deriveCalledProcessInstanceId(supplier, "CallActivity_ReviewRisk", 1);
const compliance = deriveCalledProcessInstanceId(risk, "CallActivity_CheckCompliance", 1);
const final = deriveCalledProcessInstanceId(supplier, "CallActivity_FinalApproval", 1);

/** Names an open task's owning instance, so that equal Element#activation pairs of different instances stay apart. */
const ownerLabels = new Map([[supplier, "supplier"], [tax, "tax"], [risk, "risk"], [compliance, "compliance"], [final, "final"]]);

/**
 * The State observation that follows `commandId`, whose open User Tasks must be exactly `expected`, written as
 * `Element#activation@owner` in sorted order.
 */
function stateAfter(result: MutableScenarioResult, commandId: string, expected: readonly string[]): MutableStateObservation {
  const index = result.trace.findIndex(
    (observation) => observation.kind === CanonicalObservationKind.Command && observation.commandId === commandId,
  );
  if (index < 0) throw new Error(`Repeated Calls calibration requires the ${commandId} command`);
  const state = result.trace[index + 1];
  if (state?.kind !== CanonicalObservationKind.State ||
      state.openUserTasks.map(({ id }) =>
        `${id.elementId.slice("UserTask_".length)}#${id.activation}@${ownerLabels.get(id.processInstanceId) ?? id.processInstanceId}`)
        .toSorted().join() !== expected.join()) {
    throw new Error(`Repeated Calls calibration requires ${expected.join(", ")} open after ${commandId}`);
  }
  return state;
}

/**
 * CALLN-RETURN-01: the finished bank approval returns into its own Call, so the tax approval's Prepare approval stays open
 * and the join keeps waiting. A return selected by the called definition, or by the first-invoked record, would retire the
 * tax instance instead and leave no task open.
 */
function retireFirstInvokedInstance(result: MutableScenarioResult): void {
  const state = stateAfter(result, "complete-bank-approve", ["PrepareApproval#1@tax"]);
  state.openUserTasks = [];
}

/**
 * CALLN-NEST-01: while Screen sanctions waits, the risk review holds no task of its own and has not completed, so Final
 * approval has not been invoked. Completing the outer called root while its nested call is live would open Final
 * approval's Prepare approval early.
 */
function completeOuterRootEarly(result: MutableScenarioResult): void {
  const state = stateAfter(result, "complete-assess-risk", ["ScreenSanctions#1@compliance"]);
  const [screen] = state.openUserTasks;
  if (screen === undefined) throw new Error("Repeated Calls calibration requires Screen sanctions first");
  state.openUserTasks.unshift({
    ...screen,
    id: { processInstanceId: final, elementId: "UserTask_PrepareApproval", activation: 3 },
    name: "Prepare approval",
  });
}

const cases = {
  "natural-order": {
    inject: completeOuterRootEarly,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[18].openUserTasks.length",
      expected: 1,
      actual: 2,
    },
  },
  "reverse-order-stale-and-cross-addressed": {
    inject: retireFirstInvokedInstance,
    expected: {
      kind: DisagreementKind.ObservationValue,
      path: "trace[12].openUserTasks.length",
      expected: 1,
      actual: 0,
    },
  },
} as const satisfies Record<RepeatedCallsName, Readonly<{
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the retained supplier onboarding model, with no CIB target and no retained answer, so each
 * seeded mutation is the only calibration. Every command is a User Task completion, so the host delivers them in order.
 */
export const repeatedNestedConcurrentCallsPipelineCases = Object.freeze(
  (Object.keys(cases) as RepeatedCallsName[]).map((name): PipelineCase => ({
    id: `repeated-nested-calls-${name}`,
    scenarioRelativePath: `scenarios/repeated-nested-concurrent-calls/${name}.scenario.json`,
    bpmnRelativePath: "scenarios/repeated-nested-concurrent-calls/supplier-onboarding.bpmn",
    workflowIdPrefix: `repeated-nested-calls-${name}`,
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
