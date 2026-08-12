/** Exact User Task metadata case and its three public-observation mutations. */
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

const scenarioRoot = "scenarios/user-task-assignment-form-metadata";

function metadataAtWait(result: MutableScenarioResult) {
  const observation = result.trace[2];
  const metadata = observation?.kind === CanonicalObservationKind.State
    ? observation.openUserTasks[0]?.metadata
    : undefined;
  if (metadata === undefined) {
    throw new Error("User Task metadata calibration requires metadata at trace[2]");
  }
  return metadata;
}

function mutateCandidateGroup(result: MutableScenarioResult): void {
  metadataAtWait(result).assignment.candidates[0].id = "approvers";
}

function mutateFormKey(result: MutableScenarioResult): void {
  metadataAtWait(result).form.fields[0].key = "decision";
}

function mutateFieldType(result: MutableScenarioResult): void {
  metadataAtWait(result).form.fields[0].type = "string";
}

function disagreement(
  path: string,
  expected: string,
  actual: string,
): ObservationValueDisagreement {
  return { kind: DisagreementKind.ObservationValue, path, expected, actual };
}

export const userTaskMetadataMutations = Object.freeze([
  Object.freeze({
    id: "candidate-group",
    injectMutation: mutateCandidateGroup,
    expectedDisagreement: disagreement(
      "trace[2].openUserTasks[0].metadata.assignment.candidates[0].id",
      "reviewers",
      "approvers",
    ),
  }),
  Object.freeze({
    id: "form-key",
    injectMutation: mutateFormKey,
    expectedDisagreement: disagreement(
      "trace[2].openUserTasks[0].metadata.form.fields[0].key",
      "approved",
      "decision",
    ),
  }),
  Object.freeze({
    id: "field-type",
    injectMutation: mutateFieldType,
    expectedDisagreement: disagreement(
      "trace[2].openUserTasks[0].metadata.form.fields[0].type",
      "boolean",
      "string",
    ),
  }),
]);

const typeMutation = userTaskMetadataMutations[2];
if (typeMutation === undefined) {
  throw new TypeError("User Task metadata field-type mutation is required");
}

const userTaskMetadataCase = {
  id: "user-task-assignment-form-metadata",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
  workflowIdPrefix: "user-task-assignment-form-metadata",
  cib: {
    evidenceRelativePath: `${scenarioRoot}/cibseven-evidence.json`,
    version: "2.2.0",
    relation: CibCaseRelation.ExactSemantic,
    effectExecutionSchedule: CibEffectExecutionSchedule.None,
  },
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
  injectMutation: typeMutation.injectMutation,
  expectedInjectedDisagreement: typeMutation.expectedDisagreement,
} as const satisfies PipelineCase;

export const userTaskMetadataPipelineCases = Object.freeze([
  userTaskMetadataCase,
]);
