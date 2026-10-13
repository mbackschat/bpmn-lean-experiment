import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { PipelineCase } from "./pipeline-types.ts";

export const structuredCompositionPipelineCases = Object.freeze(([
  "invoice-approve", "invoice-reject", "invoice-manual", "serial-string", "serial-null",
] as const).map((name): PipelineCase => ({
  id: `structured-composition-${name}`,
  scenarioRelativePath: `scenarios/structured-process-composition/${name}.scenario.json`,
  bpmnRelativePath: `scenarios/structured-process-composition/${name.startsWith("invoice-") ? "invoice" : "serial"}.bpmn`,
  workflowIdPrefix: `structured-composition-${name}`,
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation(result) {
    const observation = result.trace[2];
    const task = observation?.kind === CanonicalObservationKind.State ? observation.openUserTasks[0] : undefined;
    const input = task?.inputs?.[0];
    if (observation?.kind !== CanonicalObservationKind.State || task?.id.elementId !== "assess" ||
        input?.name !== "assess_in" || input.value.kind !== VariableValueKind.String || input.value.value !== "Invoice 4711") {
      throw new Error("Structured composition calibration requires the exact copied invoice input");
    }
    observation.openUserTasks[0] = { ...task, inputs: [{ ...input,
      value: { kind: VariableValueKind.String, value: "lost invoice" } }] };
  },
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].openUserTasks[0].inputs[0].value.value",
    expected: "Invoice 4711",
    actual: "lost invoice",
  },
})));
