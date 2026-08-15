/** Two exact composed metadata schedules and their independent seeded disagreements. */
import {
  CanonicalObservationKind,
} from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
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
  MutableScenarioResult,
  ObservationValueDisagreement,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/parallel-user-task-metadata-composition";

function waitingState(result: MutableScenarioResult, traceIndex: number) {
  const observation = result.trace[traceIndex];
  if (observation?.kind !== CanonicalObservationKind.State) {
    throw new Error(`parallel metadata calibration requires state at trace[${traceIndex}]`);
  }
  return observation;
}

function swapStartMetadata(result: MutableScenarioResult): void {
  const waiting = waitingState(result, 2);
  const content = waiting.openUserTasks.find(
    ({ id }) => id.elementId === "UserTask_ContentReview",
  );
  const risk = waiting.openUserTasks.find(
    ({ id }) => id.elementId === "UserTask_RiskReview",
  );
  if (content?.metadata === undefined || risk?.metadata === undefined) {
    throw new Error("two metadata-bearing parallel User Tasks are required");
  }
  [content.metadata, risk.metadata] = [risk.metadata, content.metadata];
}

function dropIntermediateSibling(result: MutableScenarioResult): void {
  const intermediate = waitingState(result, 4);
  if (intermediate.openUserTasks.length !== 1) {
    throw new Error("one live metadata sibling is required after first completion");
  }
  intermediate.openUserTasks = [];
}

function disagreement(
  path: string,
  expected: unknown,
  actual: unknown,
): ObservationValueDisagreement {
  return { kind: DisagreementKind.ObservationValue, path, expected, actual };
}

function combinedCase(
  id: string,
  scenarioFile: string,
  evidenceFile: string,
  injectMutation: PipelineCase["injectMutation"],
  expectedInjectedDisagreement: ObservationValueDisagreement,
): PipelineCase {
  return Object.freeze({
    id,
    scenarioRelativePath: `${scenarioRoot}/${scenarioFile}`,
    bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
    workflowIdPrefix: id,
    cib: {
      evidenceRelativePath: `${scenarioRoot}/${evidenceFile}`,
      version: "2.2.0" as const,
      relation: CibCaseRelation.ExactSemantic,
      effectExecutionSchedule: CibEffectExecutionSchedule.None,
    },
    expectedWaitTraceLength: 3,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    temporalRelation: TemporalCaseRelation.ExactSemantic,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectSchedules: null,
    replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
    injectMutation,
    expectedInjectedDisagreement,
  });
}

export const parallelUserTaskMetadataPipelineCases = Object.freeze([
  combinedCase(
    "parallel-user-task-metadata-content-then-risk",
    "content-then-risk.scenario.json",
    "content-then-risk.cibseven-evidence.json",
    swapStartMetadata,
    disagreement(
      "trace[2].openUserTasks[0].metadata.form.fields[0].key",
      "contentApproved",
      "riskApproved",
    ),
  ),
  combinedCase(
    "parallel-user-task-metadata-risk-then-content",
    "risk-then-content.scenario.json",
    "risk-then-content.cibseven-evidence.json",
    dropIntermediateSibling,
    disagreement("trace[4].openUserTasks.length", 1, 0),
  ),
]);
