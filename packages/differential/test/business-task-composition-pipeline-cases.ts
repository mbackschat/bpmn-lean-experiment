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

function businessCase(id: PipelineCase["id"], family: string,
  injectMutation: PipelineCase["injectMutation"], path: string,
  expected: string | number, actual: string | number): PipelineCase {
  return { id, scenarioRelativePath: `scenarios/${family}/scenario.json`,
    bpmnRelativePath: `scenarios/${family}/process.bpmn`,
    sourceOverlayRelativePath: `scenarios/${family}/source-overlay.json`,
    workflowIdPrefix: id, cib: null, expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.StimulusOrder,
    effectSchedules: null, replaySelection: PipelineReplaySelection.Primary, injectMutation,
    expectedInjectedDisagreement: { kind: DisagreementKind.ObservationValue, path, expected, actual } };
}

export const businessTaskCompositionPipelineCases = Object.freeze([
  businessCase("classification", "serial-business-task-composition", reusePrecedingTask,
    "trace[6].openEffects[0].id.elementId", "Classify", "Validate"),
  businessCase("invoice-rework", "mixed-task-control-flow", reusePreviousOccurrence,
    "trace[8].openEffects[0].id.activation", 2, 1),
  businessCase("invoice-business-error-recovery", "mixed-task-business-error", skipErrorRecovery,
    "trace[6].openUserTasks[0].id.elementId", "CorrectData", "Finalize"),
]);
