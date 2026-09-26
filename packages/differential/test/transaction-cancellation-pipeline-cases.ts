import { CanonicalObservationKind, ProcessStatus } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, ObservationValueDisagreement, PipelineCase } from "./pipeline-types.ts";

function stateAt(result: MutableScenarioResult, index: number): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) throw new Error(`Transaction mutation requires State at trace[${index}]`);
  return state;
}

function omitEmptyContinuation(result: MutableScenarioResult): void {
  const state = stateAt(result, 4);
  if (state.openUserTasks[0]?.id.elementId !== "Task_Acknowledge") throw new Error("Transaction mutation requires the empty Cancel continuation");
  state.openUserTasks.splice(0, 1);
}

function releaseContinuationEarly(result: MutableScenarioResult): void {
  const active = stateAt(result, 6);
  const acknowledgement = stateAt(result, 10).openUserTasks[0];
  if (active.openEffects[0]?.id.elementId !== "Task_Release" || active.openUserTasks.length !== 0 ||
      acknowledgement?.id.elementId !== "Task_Acknowledge") throw new Error("Transaction mutation requires a pending handler before acknowledgement");
  active.openUserTasks.push(structuredClone(acknowledgement));
}

function forgetCompletedReservation(result: MutableScenarioResult): void {
  const state = stateAt(result, 8);
  if (state.openEffects[0]?.id.elementId !== "Task_Release") throw new Error("Transaction mutation requires completed eligible work");
  state.openEffects.splice(0, 1);
}

function projectFailureAsCompleted(result: MutableScenarioResult): void {
  const state = stateAt(result, 10);
  if (state.status !== ProcessStatus.Failed) throw new Error("Transaction mutation requires typed handler failure");
  Reflect.set(state, "status", ProcessStatus.Completed);
}

function transactionCase(
  id: PipelineCase["id"], injectMutation: PipelineCase["injectMutation"], path: string,
  expected: ObservationValueDisagreement["expected"], actual: ObservationValueDisagreement["actual"],
): PipelineCase {
  return Object.freeze({ id,
    scenarioRelativePath: `scenarios/transaction-cancellation/${id.slice("transaction-cancellation-".length)}.scenario.json`,
    bpmnRelativePath: "scenarios/transaction-cancellation/reservation-withdrawal.bpmn",
    workflowIdPrefix: id, cib: null, expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null, replaySelection: PipelineReplaySelection.Primary, injectMutation,
    expectedInjectedDisagreement: { kind: DisagreementKind.ObservationValue as const, path, expected, actual },
  });
}

export const transactionCancellationPipelineCases = Object.freeze([
  transactionCase("transaction-cancellation-empty", omitEmptyContinuation, "trace[4].openUserTasks.length", 1, 0),
  transactionCase("transaction-cancellation-retained-active", releaseContinuationEarly, "trace[6].openUserTasks.length", 0, 1),
  transactionCase("transaction-cancellation-retained-ended", forgetCompletedReservation, "trace[8].openEffects.length", 1, 0),
  transactionCase("transaction-cancellation-handler-failed", projectFailureAsCompleted, "trace[10].status", ProcessStatus.Failed, ProcessStatus.Completed),
]);
