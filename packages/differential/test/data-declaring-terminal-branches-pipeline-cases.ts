import { CanonicalObservationKind, CommandOutcome } from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import { PipelineReplaySelection, TemporalCaseRelation } from "./pipeline-types.ts";
import type { MutableScenarioResult, PipelineCase } from "./pipeline-types.ts";

/**
 * DTB-COMMUTE-01: keeping an ordinary End dependent on a declared entry makes the policy result's closure, which batches
 * *Review claim*'s entry beside both wait-free Ends, an observable choice that the profile's scheduling rolls back, so the
 * policy result at `trace[3]` would not commit.
 */
function policyClosureRollsBack(result: MutableScenarioResult): void {
  const command = result.trace[3];
  if (command?.kind !== CanonicalObservationKind.Command || command.outcome !== CommandOutcome.Committed) {
    throw new Error("Data-declaring terminal branch calibration requires a committed command at trace[3]");
  }
  result.trace[3] = { ...command, outcome: CommandOutcome.RolledBack } as typeof command;
}

/**
 * A standards-only schedule over the expense claim, with no CIB target and no retained answer, so its seeded mutation is
 * the only calibration. Stimulus order realizes it through the testkit's ordered Activity release and completion delivery.
 */
export const dataDeclaringTerminalBranchesPipelineCases = Object.freeze([{
  id: "data-declaring-terminal-branches-expense-claim",
  scenarioRelativePath: "scenarios/data-declaring-terminal-branches/expense-claim.scenario.json",
  bpmnRelativePath: "scenarios/data-declaring-terminal-branches/expense-claim.bpmn",
  sourceOverlayRelativePath: "scenarios/data-declaring-terminal-branches/expense-claim-overlay.json",
  workflowIdPrefix: "data-declaring-terminal-branches-expense-claim",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.StimulusOrder,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: policyClosureRollsBack,
  expectedInjectedDisagreement: { kind: DisagreementKind.ObservationValue, path: "trace[3].outcome",
    expected: "committed", actual: "rolledBack" },
} satisfies PipelineCase]);
