import { CanonicalObservationKind, ProcessStatus, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, ObservationValueDisagreement, PipelineCase } from "./pipeline-types.ts";

function stateAt(result: MutableScenarioResult, index: number): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) throw new Error(`Compensation mutation requires State at trace[${index}]`);
  return state;
}

function activatePredecessorEarly(result: MutableScenarioResult): void {
  const frontier = stateAt(result, 10);
  const predecessor = stateAt(result, 12).openEffects.find(({ id }) => id.elementId === "Task_UndoReserveHotel");
  if (frontier.openEffects.length !== 2 || predecessor === undefined) throw new Error("Compensation mutation requires the B/C frontier before A activation");
  frontier.openEffects.push(structuredClone(predecessor));
}

function removeConcurrentHandler(result: MutableScenarioResult): void {
  const frontier = stateAt(result, 10);
  if (frontier.openEffects[1]?.id.elementId !== "Task_UndoInsurance") throw new Error("Compensation mutation requires concurrent insurance compensation");
  frontier.openEffects.splice(1, 1);
}

function changeRestoredInput(result: MutableScenarioResult): void {
  const binding = stateAt(result, 10).openEffects[0]?.arguments[0];
  if (binding?.name !== "DataInput_TravelDetails" || binding.value.kind !== VariableValueKind.String) throw new Error("Compensation mutation requires the restored itinerary binding");
  binding.value.value = "Changed itinerary TRAVEL-4711";
}

function projectFailureAsCompleted(result: MutableScenarioResult): void {
  const state = stateAt(result, result.trace.length - 1);
  if (state.status !== ProcessStatus.Failed) throw new Error("Compensation mutation requires a failed Process");
  Reflect.set(state, "status", ProcessStatus.Completed);
}

function mutateAfterStaleResult(result: MutableScenarioResult): void {
  const state = stateAt(result, 6);
  state.variables = structuredClone(state.variables);
  const binding = state.variables[0];
  if (binding?.name !== "Property_TravelDetails" || binding.value.kind !== VariableValueKind.String) throw new Error("Compensation mutation requires unchanged data after stale-task refusal");
  binding.value.value = "Changed itinerary TRAVEL-4711";
}

function compensationCase(
  id: PipelineCase["id"],
  injectMutation: PipelineCase["injectMutation"],
  path: string,
  expected: ObservationValueDisagreement["expected"],
  actual: ObservationValueDisagreement["actual"],
): PipelineCase {
  return Object.freeze({
    id,
    scenarioRelativePath: `scenarios/compensation/${id.slice("compensation-".length)}.scenario.json`,
    bpmnRelativePath: "scenarios/compensation/travel-cancellation.bpmn",
    workflowIdPrefix: id,
    cib: null,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation,
    expectedInjectedDisagreement: { kind: DisagreementKind.ObservationValue as const, path, expected, actual },
  });
}

export const compensationPipelineCases = Object.freeze([
  compensationCase("compensation-success-b-c-a", activatePredecessorEarly, "trace[10].openEffects.length", 2, 3),
  compensationCase("compensation-success-b-a-c", removeConcurrentHandler, "trace[10].openEffects.length", 2, 1),
  compensationCase("compensation-success-c-b-a", changeRestoredInput, "trace[10].openEffects[0].arguments[0].value.value", "Confirmed itinerary TRAVEL-4711", "Changed itinerary TRAVEL-4711"),
  compensationCase("compensation-failure-a", projectFailureAsCompleted, "trace[14].status", ProcessStatus.Failed, ProcessStatus.Completed),
  compensationCase("compensation-failure-b", projectFailureAsCompleted, "trace[12].status", ProcessStatus.Failed, ProcessStatus.Completed),
  compensationCase("compensation-failure-c", mutateAfterStaleResult, "trace[6].variables[0].value.value", "Confirmed itinerary TRAVEL-4711", "Changed itinerary TRAVEL-4711"),
]);
