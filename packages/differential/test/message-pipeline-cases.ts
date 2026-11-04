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
} from "@bpmn-lean/temporal-testkit";

import {
  CibCaseRelation,
  CibEffectExecutionSchedule,
  PipelineReplaySelection,
  TemporalCaseRelation,
} from "./pipeline-types.ts";
import type { PipelineCaseId } from "./pipeline-case-id-registry.ts";
import type {
  MutableScenarioResult,
  MutableStateObservation,
  ObservationValueDisagreement,
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

function mutateUnspecifiedMessageChannelKind(
  result: MutableScenarioResult,
): void {
  const running = runningObservation(result);
  const subscription = running.openMessageSubscriptions[0];
  if (
    subscription === undefined ||
    subscription.channel.kind !== MessageChannelKind.UnspecifiedMessage
  ) {
    throw new Error(
      "one calibrated unspecified Message wait is required",
    );
  }
  running.openMessageSubscriptions[0] = {
    ...subscription,
    channel: { kind: MessageChannelKind.DirectMessage, messageId: "Message_Mutated" },
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

const intermediateCatchMessageDisagreement: ObservationValueDisagreement = {
  kind: DisagreementKind.ObservationValue,
  path: "trace[2].openMessageSubscriptions[0].channel.messageId",
  expected: "Message_ApprovalRequest",
  actual: "Message_ApprovalRequest-mutated",
};

const intermediateCatchMessageCase: PipelineCase = Object.freeze({
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
  expectedInjectedDisagreement: intermediateCatchMessageDisagreement,
});

const messageAddressedReceiveTaskDisagreement: ObservationValueDisagreement = {
  kind: DisagreementKind.ObservationValue,
  path: "trace[2].openMessageSubscriptions[0].channel.interfaceId",
  expected: undefined,
  actual: "Interface_Mutated",
};

const messageAddressedReceiveTaskCase: PipelineCase = Object.freeze({
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
  expectedInjectedDisagreement: messageAddressedReceiveTaskDisagreement,
});

const addresslessReceiveTaskDisagreement: ObservationValueDisagreement = {
  kind: DisagreementKind.ObservationValue,
  path: "trace[2].openMessageSubscriptions[0].channel.kind",
  expected: MessageChannelKind.UnspecifiedMessage,
  actual: MessageChannelKind.DirectMessage,
};

function addresslessReceiveTaskCase(id: PipelineCaseId, scenarioFile: string): PipelineCase {
  return Object.freeze({
    id,
    scenarioRelativePath: `scenarios/addressless-receive-task/${scenarioFile}.json`,
    bpmnRelativePath: "scenarios/addressless-receive-task/process.bpmn",
    workflowIdPrefix: id,
    cib: Object.freeze({
      evidenceRelativePath: `scenarios/addressless-receive-task/${scenarioFile.replace(/scenario$/u, "cibseven-evidence")}.json`,
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
    injectMutation: mutateUnspecifiedMessageChannelKind,
    expectedInjectedDisagreement: addresslessReceiveTaskDisagreement,
  });
}

export const messagePipelineCases = Object.freeze([
  intermediateCatchMessageCase,
  messageAddressedReceiveTaskCase,
  addresslessReceiveTaskCase("addressless-receive-task", "scenario"),
  addresslessReceiveTaskCase("addressless-receive-task-named-delivery-first", "named-delivery-first.scenario"),
]);
