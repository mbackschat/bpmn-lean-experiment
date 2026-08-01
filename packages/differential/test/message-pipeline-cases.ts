/** Pipeline catalog entries and channel mutations for the two admitted passive Message waits. */
import {
  CanonicalObservationKind,
  MessageChannelKind,
  ProcessStatus,
} from "@bpmn-lean/semantic-core";
import {
  DisagreementKind,
} from "@bpmn-lean/differential";
import {
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "@bpmn-lean/temporal-adapter";

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

function runningObservation(
  result: MutableScenarioResult,
): MutableStateObservation {
  const observation = result.trace.find(
    (candidate): candidate is MutableStateObservation =>
      candidate.kind === CanonicalObservationKind.State &&
      candidate.status === ProcessStatus.Running,
  );
  if (observation === undefined) {
    throw new Error("calibrated running state is required");
  }
  return observation;
}

function mutateOperationMessageId(result: MutableScenarioResult): void {
  const running = runningObservation(result);
  const subscription = running.openMessageSubscriptions[0];
  if (
    subscription === undefined ||
    subscription.channel.kind !== MessageChannelKind.OperationMessage
  ) {
    throw new Error(
      "one calibrated operation-addressed Message subscription is required",
    );
  }
  running.openMessageSubscriptions[0] = {
    ...subscription,
    channel: {
      ...subscription.channel,
      messageId: `${subscription.channel.messageId}-mutated`,
    },
  };
}

function mutateDirectMessageChannelKind(
  result: MutableScenarioResult,
): void {
  const running = runningObservation(result);
  const subscription = running.openMessageSubscriptions[0];
  if (
    subscription === undefined ||
    subscription.channel.kind !== MessageChannelKind.DirectMessage
  ) {
    throw new Error(
      "one calibrated direct Message subscription is required",
    );
  }
  running.openMessageSubscriptions[0] = {
    ...subscription,
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: "Interface_Mutated",
      interfaceOperationId: "Operation_Mutated",
      messageId: subscription.channel.messageId,
    },
  };
}

const intermediateCatchMessageCase = Object.freeze({
  id: "intermediate-catch-message",
  scenarioRelativePath:
    "scenarios/intermediate-catch-message/scenario.json",
  bpmnRelativePath:
    "scenarios/intermediate-catch-message/process.bpmn",
  workflowIdPrefix: "intermediate-catch-message",
  cib: null,
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: mutateOperationMessageId,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].openMessageSubscriptions[0].channel.messageId",
    expected: "Message_ApprovalRequest",
    actual: "Message_ApprovalRequest-mutated",
  },
}) satisfies PipelineCase;

const messageAddressedReceiveTaskCase = Object.freeze({
  id: "message-addressed-receive-task",
  scenarioRelativePath:
    "scenarios/message-addressed-receive-task/scenario.json",
  bpmnRelativePath:
    "scenarios/message-addressed-receive-task/process.bpmn",
  workflowIdPrefix: "message-addressed-receive-task",
  cib: Object.freeze({
    evidenceRelativePath:
      "scenarios/message-addressed-receive-task/cibseven-evidence.json",
    version: "2.2.0" as const,
    relation: CibCaseRelation.ExactSemantic,
    effectExecutionSchedule: CibEffectExecutionSchedule.None,
  }),
  expectedWaitTraceLength: 3,
  completionDelivery: TemporalCompletionDelivery.Ordered,
  temporalRelation: TemporalCaseRelation.ExactSemantic,
  executionSchedule: TemporalExecutionSchedule.Normal,
  effectSchedules: null,
  replaySelection: PipelineReplaySelection.Primary,
  injectMutation: mutateDirectMessageChannelKind,
  expectedInjectedDisagreement: {
    kind: DisagreementKind.ObservationValue,
    path: "trace[2].openMessageSubscriptions[0].channel.interfaceId",
    expected: undefined,
    actual: "Interface_Mutated",
  },
}) satisfies PipelineCase;

export const messagePipelineCases = Object.freeze([
  intermediateCatchMessageCase,
  messageAddressedReceiveTaskCase,
]);
