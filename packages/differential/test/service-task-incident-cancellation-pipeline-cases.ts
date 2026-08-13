/** Incident-gated root cancellation schedule and terminal-state mutation. */
import {
  CanonicalObservationKind,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import { DisagreementKind } from "@bpmn-lean/differential";
import {
  EffectExecutionSchedule,
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
  MutableStateObservation,
  PipelineCase,
} from "./pipeline-types.ts";

export const incidentCancellationSchedule =
  EffectExecutionSchedule.IncidentReportCancel;

function completeInsteadOfCancel(result: MutableScenarioResult): void {
  const finalState = [...result.trace].reverse().find(
    (observation): observation is MutableStateObservation =>
      observation.kind === CanonicalObservationKind.State,
  );
  if (finalState?.status !== ProcessStatus.Cancelled) {
    throw new Error("incident cancellation requires one final cancelled state");
  }
  finalState.status = ProcessStatus.Completed;
}

const incidentCancellationCase = {
  id: "service-task-effect-incident-root-cancellation",
  scenarioRelativePath:
    "scenarios/service-task-incident-cancellation/scenario.json",
  bpmnRelativePath: "scenarios/service-task-effect/process.bpmn",
  workflowIdPrefix: "service-task-effect-incident-root-cancellation",
  cib: {
    evidenceRelativePath:
      "scenarios/service-task-incident-cancellation/cibseven-evidence.json",
    version: "2.2.0",
    relation: CibCaseRelation.ExactSemantic,
    effectExecutionSchedule: CibEffectExecutionSchedule.IncidentReportCancel,
  },
  expectedWaitTraceLength: 5,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemanticWithClosedReceipt,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: {
    primary: EffectExecutionSchedule.IncidentReportCancel,
    isolation: EffectExecutionSchedule.IncidentReportCancel,
  },
  replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
  injectMutation: completeInsteadOfCancel,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[6].status",
    expected: ProcessStatus.Cancelled,
    actual: ProcessStatus.Completed,
  },
} as const satisfies PipelineCase;

export const serviceTaskIncidentCancellationPipelineCases = Object.freeze([
  incidentCancellationCase,
]);
