/** Standards-only operation-addressed Message Start case and instance-identity mutation. */
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
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type {
  MutableScenarioResult,
  PipelineCase,
} from "./pipeline-types.ts";

const scenarioRoot = "scenarios/message-start-event";

function mutateSemanticInstanceIdentity(result: MutableScenarioResult): void {
  const observation = result.trace[2];
  if (
    observation?.kind !== CanonicalObservationKind.State ||
    observation.instanceId !== "MessageStartInstance_1"
  ) {
    throw new Error(
      "Message Start calibration requires the supplied running-instance identity",
    );
  }
  observation.instanceId = "MessageStartInstance_mutated";
}

const messageStartCase = {
  id: "message-start-event",
  scenarioRelativePath: `${scenarioRoot}/scenario.json`,
  bpmnRelativePath: `${scenarioRoot}/process.bpmn`,
  workflowIdPrefix: "message-start-event",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: mutateSemanticInstanceIdentity,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].instanceId",
    expected: "MessageStartInstance_1",
    actual: "MessageStartInstance_mutated",
  },
} as const satisfies PipelineCase;

export const messageStartPipelineCases = Object.freeze([
  messageStartCase,
]);
