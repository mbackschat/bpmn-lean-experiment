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

const representativeBusinessCases = Object.freeze([
  businessCase("classification", "serial-business-task-composition", reusePrecedingTask,
    "trace[6].openEffects[0].id.elementId", "Classify", "Validate"),
  businessCase("invoice-rework", "mixed-task-control-flow", reusePreviousOccurrence,
    "trace[8].openEffects[0].id.activation", 2, 1),
  businessCase("invoice-business-error-recovery", "mixed-task-business-error", skipErrorRecovery,
    "trace[6].openUserTasks[0].id.elementId", "CorrectData", "Finalize"),
]);

function publicDeliveryCase(candidate: PipelineCase, id: PipelineCase["id"], fixture: string): PipelineCase {
  return { ...candidate, id, workflowIdPrefix: id,
    scenarioRelativePath: candidate.scenarioRelativePath.replace(/scenario\.json$/u, "public-delivery.scenario.json"),
    bpmnRelativePath: `packages/bpmn-source/test/fixtures/business-public-delivery/${fixture}.bpmn` };
}

export const businessTaskCompositionPipelineCases = Object.freeze([
  ...representativeBusinessCases,
  ...representativeBusinessCases.map(candidate => {
    switch (candidate.id) {
      case "classification": return publicDeliveryCase(candidate, "public-delivery-classification", "serial-invoice");
      case "invoice-rework": return publicDeliveryCase(candidate, "public-delivery-invoice-rework", "invoice-rework");
      case "invoice-business-error-recovery": return publicDeliveryCase(candidate,
        "public-delivery-invoice-business-error-recovery", "invoice-error-recovery");
      default: throw new Error(`Unexpected representative business case ${candidate.id}`);
    }
  }),
]);
