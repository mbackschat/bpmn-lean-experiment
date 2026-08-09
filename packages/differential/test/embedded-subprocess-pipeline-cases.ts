/** Pipeline catalog entries and early-exit mutation for ordinary embedded Sub-Process completion. */
import {
  CanonicalObservationKind,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
} from "@bpmn-lean/differential";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-testkit";

import {
  CibCaseRelation,
  CibEffectExecutionSchedule,
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  CibPipelineConfiguration,
  MutableScenarioResult,
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

function mutatePrematureScopeExit(result: MutableScenarioResult): void {
  const firstCompletionIndex = result.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      observation.commandId.startsWith("complete-child-"),
  );
  const state = result.trace[firstCompletionIndex + 1];
  const remainingTask = state?.kind === CanonicalObservationKind.State
    ? state.openUserTasks[0]
    : undefined;
  if (
    firstCompletionIndex < 0 ||
    state?.kind !== CanonicalObservationKind.State ||
    state.openUserTasks.length !== 1 ||
    remainingTask === undefined ||
    !remainingTask.id.elementId.startsWith("UserTask_Child")
  ) {
    throw new Error(
      "embedded Sub-Process calibration requires one live child after the first completion",
    );
  }
  state.openUserTasks[0] = {
    ...remainingTask,
    id: { ...remainingTask.id, elementId: "UserTask_AfterScope" },
    name: "After Scope",
  };
}

function embeddedSubProcessCase(
  id: string,
  scenarioFile: string,
  evidenceFile: string,
  remainingChildElementId: "UserTask_ChildA" | "UserTask_ChildB",
): PipelineCase {
  const disagreement: ObservationValueDisagreement = {
    kind: DisagreementKind.ObservationValue,
    path: "trace[4].openUserTasks[0].id.elementId",
    expected: remainingChildElementId,
    actual: "UserTask_AfterScope",
  };
  const cib: CibPipelineConfiguration = Object.freeze({
    evidenceRelativePath:
      `scenarios/embedded-subprocess-completion/${evidenceFile}`,
    version: "2.2.0",
    relation: CibCaseRelation.ExactSemantic,
    effectExecutionSchedule: CibEffectExecutionSchedule.None,
  });
  return Object.freeze({
    id,
    scenarioRelativePath:
      `scenarios/embedded-subprocess-completion/${scenarioFile}`,
    bpmnRelativePath:
      "scenarios/embedded-subprocess-completion/process.bpmn",
    workflowIdPrefix: id,
    cib,
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.Primary,
    injectMutation: mutatePrematureScopeExit,
    expectedInjectedDisagreement: disagreement,
  });
}

export const embeddedSubProcessPipelineCases = Object.freeze([
  embeddedSubProcessCase(
    "embedded-subprocess-completion-a-then-b",
    "a-then-b.scenario.json",
    "a-then-b.cibseven-evidence.json",
    "UserTask_ChildB",
  ),
  embeddedSubProcessCase(
    "embedded-subprocess-completion-b-then-a",
    "b-then-a.scenario.json",
    "b-then-a.cibseven-evidence.json",
    "UserTask_ChildA",
  ),
  embeddedSubProcessCase(
    "embedded-subprocess-completion-stale-a-while-b-active",
    "stale-a-while-b-active.scenario.json",
    "stale-a-while-b-active.cibseven-evidence.json",
    "UserTask_ChildB",
  ),
  embeddedSubProcessCase(
    "embedded-subprocess-completion-stale-a-after-scope",
    "stale-a-after-scope.scenario.json",
    "stale-a-after-scope.cibseven-evidence.json",
    "UserTask_ChildB",
  ),
]);
