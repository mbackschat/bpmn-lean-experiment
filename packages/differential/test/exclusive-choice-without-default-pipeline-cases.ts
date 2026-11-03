import { CanonicalObservationKind, CommandOutcome } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase, SemanticDifferentialCase } from "./pipeline-types.ts";

const directory = "scenarios/exclusive-choice-without-default";

/** XND-ROUTE-01: selecting the last true candidate opens *Review travel* for an urgent travel expense. */
function selectLastTrue(result: MutableScenarioResult): void {
  const state = result.trace[2];
  const task = state?.kind === CanonicalObservationKind.State ? state.openUserTasks[0] : undefined;
  if (state?.kind !== CanonicalObservationKind.State || state.openUserTasks.length !== 1 ||
    task?.id.elementId !== "ReviewUrgently") {
    throw new Error("Exclusive Choice without a default calibration requires ReviewUrgently alone open at trace[2]");
  }
  result.trace[2] = { ...state, openUserTasks: [{ ...task, id: { ...task.id, elementId: "ReviewTravel" } }] };
}

/** XND-ROLLBACK-01: a no-match that commits its command, whatever it then does, publishes `committed` at `index`. */
function commitsNoMatch(index: number): PipelineCase["injectMutation"] {
  return (result) => {
    const command = result.trace[index];
    if (command?.kind !== CanonicalObservationKind.Command || command.outcome !== CommandOutcome.RolledBack) {
      throw new Error(`Exclusive Choice without a default calibration requires a rolledBack command at trace[${String(index)}]`);
    }
    result.trace[index] = { ...command, outcome: CommandOutcome.Committed };
  };
}

const rolledBackAt = (index: number) => ({
  kind: DisagreementKind.ObservationValue, path: `trace[${String(index)}].outcome`,
  expected: CommandOutcome.RolledBack, actual: CommandOutcome.Committed,
} as const);

const hosted = (name: "urgent-travel" | "medium-triage", model: string): Omit<PipelineCase,
  "injectMutation" | "expectedInjectedDisagreement"> => ({
  id: `exclusive-choice-without-default-${name}`,
  scenarioRelativePath: `${directory}/${name}.scenario.json`,
  bpmnRelativePath: `${directory}/${model}.bpmn`,
  sourceOverlayRelativePath: `${directory}/${model}-overlay.json`,
  workflowIdPrefix: `exclusive-choice-without-default-${name}`,
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.StimulusOrder,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
});

/**
 * Standards-only schedules over the two retained default-less Choice models, with no CIB target and no retained answer,
 * so each seeded mutation is the only calibration; the CIB probe calibrates the same journeys separately. The medium
 * triage ends at its rolled-back completion, which the Workflow answers while the triage task stays open (XND-HOST-02).
 */
export const exclusiveChoiceWithoutDefaultPipelineCases: ReadonlyArray<PipelineCase> = Object.freeze([
  { ...hosted("urgent-travel", "expense-routing"), injectMutation: selectLastTrue,
    expectedInjectedDisagreement: { kind: DisagreementKind.ObservationValue,
      path: "trace[2].openUserTasks[0].id.elementId", expected: "ReviewUrgently", actual: "ReviewTravel" } },
  { ...hosted("medium-triage", "ticket-triage"), injectMutation: commitsNoMatch(3),
    expectedInjectedDisagreement: rolledBackAt(3) },
]);

/**
 * The catering Start rolls back, so no Workflow exists for a hosted run to observe: the client refuses it with
 * `startRolledBack` before creating one (XND-HOST-01). This case therefore runs on Lean and the semantic core only,
 * and the client's refusal is locked by its own test.
 */
export const exclusiveChoiceWithoutDefaultStartCases: ReadonlyArray<SemanticDifferentialCase> = Object.freeze([{
  id: "exclusive-choice-without-default-catering",
  scenarioRelativePath: "packages/differential/test/fixtures/exclusive-choice-without-default-catering.scenario.json",
  bpmnRelativePath: `${directory}/expense-routing.bpmn`,
  sourceOverlayRelativePath: `${directory}/expense-routing-overlay.json`,
  cib: null,
  injectMutation: commitsNoMatch(1),
  expectedInjectedDisagreement: rolledBackAt(1),
}]);
