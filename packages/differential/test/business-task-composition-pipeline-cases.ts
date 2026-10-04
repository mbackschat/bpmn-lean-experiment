import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

function stateAt(result: MutableScenarioResult, index: number): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) throw new Error(`Business mutation requires state at trace[${index}]`);
  return state;
}

function reusePrecedingTask(result: MutableScenarioResult): void {
  const effect = stateAt(result, 6).openEffects[0];
  if (effect?.id.elementId !== "Classify") throw new Error("Classification mutation requires the second Service Task");
  effect.id.elementId = "Validate";
}

function reusePreviousOccurrence(result: MutableScenarioResult): void {
  const effect = stateAt(result, 8).openEffects[0];
  if (effect?.id.elementId !== "Validate" || effect.id.activation !== 2) throw new Error("Rework mutation requires the second validation");
  effect.id.activation = 1;
}

function skipErrorRecovery(result: MutableScenarioResult): void {
  const state = stateAt(result, 6);
  const task = state.openUserTasks[0];
  if (task?.id.elementId !== "CorrectData") throw new Error("Error mutation requires the attached data-correction path");
  state.openUserTasks[0] = { ...task, id: { ...task.id, elementId: "Finalize" } };
}

function businessCase(id: string, fixture: string, source: string,
  injectMutation: PipelineCase<string>["injectMutation"], path: string,
  expected: string | number, actual: string | number): PipelineCase<string> {
  return { id, scenarioRelativePath: `packages/differential/test/fixtures/${fixture}.scenario.json`,
    bpmnRelativePath: `packages/bpmn-source/test/fixtures/${source}.bpmn`,
    sourceOverlayRelativePath: `packages/differential/test/fixtures/${fixture}.overlay.json`,
    workflowIdPrefix: id, cib: null, expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null, replaySelection: PipelineReplaySelection.Primary, injectMutation,
    expectedInjectedDisagreement: { kind: DisagreementKind.ObservationValue, path, expected, actual } };
}

export const businessTaskCompositionPipelineCases = Object.freeze([
  businessCase("classification", "serial-classification", "serial-invoice-classification", reusePrecedingTask,
    "trace[6].openEffects[0].id.elementId", "Classify", "Validate"),
  businessCase("invoice-rework", "mixed-invoice-rework", "mixed-task-invoice-rework", reusePreviousOccurrence,
    "trace[8].openEffects[0].id.activation", 2, 1),
  businessCase("invoice-business-error-recovery", "business-error", "mixed-task-invoice-business-error", skipErrorRecovery,
    "trace[6].openUserTasks[0].id.elementId", "CorrectData", "Finalize"),
]);
