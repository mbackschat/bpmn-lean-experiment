import { CanonicalObservationKind } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

type ExclusiveChoiceArityName = "complaint-urgent-billing" | "complaint-delivery" | "complaint-product";

/** The State observation at `index`, after *Route complaint* has chosen. */
function routedState(result: MutableScenarioResult, index: number) {
  const state = result.trace[index];
  if (state?.kind !== CanonicalObservationKind.State) {
    throw new Error(`Exclusive choice arity calibration requires a state at trace[${index}]`);
  }
  return state;
}

/** XCA-ORDER-01: selecting the last true candidate opens *Correct invoice* for an urgent billing complaint. */
function selectLastTrue(result: MutableScenarioResult): void {
  const state = routedState(result, 4);
  const task = state.openUserTasks[0];
  if (state.openUserTasks.length !== 1 || task?.id.elementId !== "EscalateToSupervisor") {
    throw new Error("Exclusive choice arity calibration requires EscalateToSupervisor alone open at trace[4]");
  }
  result.trace[4] = { ...state, openUserTasks: [{ ...task, id: { ...task.id, elementId: "CorrectInvoice" } }] };
}

/** XCA-ORDER-01: evaluation that stops after two candidates never arms *Reship order* for a delivery complaint. */
function stopAfterTwo(result: MutableScenarioResult): void {
  const state = routedState(result, 4);
  if (state.openEffects.length !== 1 || state.openEffects[0]!.id.elementId !== "ReshipOrder") {
    throw new Error("Exclusive choice arity calibration requires ReshipOrder alone armed at trace[4]");
  }
  result.trace[4] = { ...state, openEffects: [] };
}

/** XCA-DEFAULT-01: a no-match that does not take the default leaves no open task for a product complaint. */
function skipDefault(result: MutableScenarioResult): void {
  const state = routedState(result, 4);
  if (state.openUserTasks.length !== 1 || state.openUserTasks[0]!.id.elementId !== "AnswerCustomer") {
    throw new Error("Exclusive choice arity calibration requires AnswerCustomer alone open at trace[4]");
  }
  result.trace[4] = { ...state, openUserTasks: [] };
}

const cases = {
  "complaint-urgent-billing": {
    inject: selectLastTrue,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks[0].id.elementId",
      expected: "EscalateToSupervisor", actual: "CorrectInvoice" },
  },
  "complaint-delivery": {
    inject: stopAfterTwo,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openEffects.length", expected: 1, actual: 0 },
  },
  "complaint-product": {
    inject: skipDefault,
    expected: { kind: DisagreementKind.ObservationValue, path: "trace[4].openUserTasks.length", expected: 1, actual: 0 },
  },
} as const satisfies Record<ExclusiveChoiceArityName, Readonly<{
  inject: PipelineCase["injectMutation"];
  expected: PipelineCase["expectedInjectedDisagreement"];
}>>;

/**
 * Standards-only schedules over the retained complaint handling model, with no CIB target and no retained answer, so
 * each seeded mutation is the only calibration. The CIB probe calibrates the same four routes separately.
 */
export const exclusiveChoiceArityPipelineCases = Object.freeze(
  (Object.keys(cases) as ExclusiveChoiceArityName[]).map((name): PipelineCase => ({
    id: `exclusive-choice-arity-${name}`,
    scenarioRelativePath: `scenarios/exclusive-choice-arity/${name}.scenario.json`,
    bpmnRelativePath: "scenarios/exclusive-choice-arity/complaint-handling.bpmn",
    sourceOverlayRelativePath: "scenarios/exclusive-choice-arity/complaint-handling-overlay.json",
    workflowIdPrefix: `exclusive-choice-arity-${name}`,
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
