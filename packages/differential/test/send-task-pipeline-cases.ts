import { CanonicalObservationKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, MutableStateObservation, PipelineCase } from "./pipeline-types.ts";

type SendTaskName = "shipping-notice" | "claim-assessed-first" | "claim-acknowledged-first";

/** The state observation at `index` whose only open effect is `elementId`'s first activation. */
function effectAt(result: MutableScenarioResult, index: number, elementId: string): MutableStateObservation {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State || state.openEffects.length !== 1 ||
    state.openEffects[0]!.id.elementId !== elementId) {
    throw new Error(`Send Task calibration requires ${elementId} alone open at trace[${index}]`);
  }
  return state;
}

/**
 * SEND-EFFECT-01: an argument bound from the wrong variable publishes `value` in place of the committed snapshot
 * `committed`.
 */
export function argumentFrom(index: number, elementId: string, name: string, committed: string, value: string):
  PipelineCase["injectMutation"] {
  return (result) => {
    const state = effectAt(result, index, elementId);
    const effect = state.openEffects[0]!;
    const position = effect.arguments.findIndex(binding => binding.name === name);
    const binding = effect.arguments[position];
    if (binding?.value.kind !== VariableValueKind.String || binding.value.value !== committed) {
      throw new Error(`Send Task calibration requires ${name} = ${committed} at trace[${index}]`);
    }
    const bindings = effect.arguments.with(position, { ...binding, value: { ...binding.value, value } });
    result.trace[index] = { ...state, openEffects: [{ ...effect, arguments: bindings }] };
  };
}

/** SEND-EFFECT-01: a Send Task read as fire-and-forget would complete without waiting, so no effect stands open. */
function sendsWithoutWaiting(result: MutableScenarioResult): void {
  const state = effectAt(result, 4, "AcknowledgeClaim");
  result.trace[4] = { ...state, openEffects: [] };
}

const cases = {
  // The recipient bound from `${order}` instead of `${customerEmail}`.
  "shipping-notice": {
    model: "shipping-notice", inject: argumentFrom(4, "SendShippingNotice", "recipient", "ada@example.org", "A-17"),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openEffects[0].arguments[2].value.value",
      expected: "ada@example.org", actual: "A-17" },
  },
  "claim-assessed-first": {
    model: "claim-acknowledgement", inject: sendsWithoutWaiting,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openEffects.length", expected: 1, actual: 0 },
  },
  // The claim reference, the acknowledgement's correlation key, read from another claim.
  "claim-acknowledged-first": {
    model: "claim-acknowledgement", inject: argumentFrom(2, "AcknowledgeClaim", "claim", "CL-31", "CL-30"),
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[2].openEffects[0].arguments[0].value.value",
      expected: "CL-31", actual: "CL-30" },
  },
} as const satisfies Record<SendTaskName, Readonly<{
  model: string;
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the two retained Send Task models, with no CIB target and no retained answer, so each
 * seeded mutation is the only calibration; the test-only CIB probe calibrates the same journeys against CIB Seven.
 * Stimulus order realizes each schedule through the testkit's ordered Activity release and ordered completion delivery.
 */
export const sendTaskPipelineCases = Object.freeze(
  (Object.keys(cases) as SendTaskName[]).map((name): PipelineCase => ({
    id: `send-task-${name}`,
    scenarioRelativePath: `scenarios/send-task/${name}.scenario.json`,
    bpmnRelativePath: `scenarios/send-task/${cases[name].model}.bpmn`,
    sourceOverlayRelativePath: `scenarios/send-task/${cases[name].model}-overlay.json`,
    workflowIdPrefix: `send-task-${name}`,
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
