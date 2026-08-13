/** Configured failed-effect incident schedule and exact identity mutation. */
import {
  CanonicalObservationKind,
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
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/service-task-incident";

function replaceNestedIncidentEffectOccurrence(
  result: MutableScenarioResult,
): void {
  const incidentState = result.trace.find(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.openIncidents.length === 1,
  );
  const incident = incidentState?.kind === CanonicalObservationKind.State
    ? incidentState.openIncidents[0]
    : undefined;
  if (
    incidentState?.kind !== CanonicalObservationKind.State ||
    incident?.id.effectId.elementId !== "ServiceTask_Record"
  ) {
    throw new Error(
      "Service Task incident calibration requires one exact open incident",
    );
  }
  incident.effect.id = {
    ...incident.effect.id,
    elementId: "ServiceTask_Substituted",
  };
}

const serviceTaskIncidentCase = {
  id: "service-task-effect-incident-retry-success",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: "scenarios/service-task-effect/process.bpmn",
  workflowIdPrefix: "service-task-effect-incident-retry-success",
  cib: {
    evidenceRelativePath: `${scenarioRoot}/cibseven-evidence.json`,
    version: "2.2.0",
    relation: CibCaseRelation.ExactSemantic,
    effectExecutionSchedule:
      CibEffectExecutionSchedule.IncidentReportRetrySuccess,
  },
  expectedWaitTraceLength: 5,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: {
    primary: EffectExecutionSchedule.IncidentReportRetrySuccess,
    isolation: EffectExecutionSchedule.IncidentReportRetrySuccess,
  },
  replaySelection: PipelineReplaySelection.PrimaryAndIsolation,
  injectMutation: replaceNestedIncidentEffectOccurrence,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[4].openIncidents[0].effect.id.elementId",
    expected: "ServiceTask_Record",
    actual: "ServiceTask_Substituted",
  },
} as const satisfies PipelineCase;

export const serviceTaskIncidentPipelineCases = Object.freeze([
  serviceTaskIncidentCase,
]);
