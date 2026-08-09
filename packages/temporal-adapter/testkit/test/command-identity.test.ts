/**
 * Specifies the production Update identity contract independently of Temporal's payload-blind Update-ID deduplication.
 *
 * Exact typed encodings guard field coverage; fixed SHA-256 values guard the digest boundary; the seeded command-ID-only mutation must collapse the discriminating payload pair.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EffectExecutionResultKind,
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type { Stimulus } from "@bpmn-lean/semantic-core";
import {
  canonicalStimulusEncoding,
  canonicalTimerFiringEncoding,
  contentBoundUpdateId,
  timerFiringCommandId,
  timerFiringStimulus,
} from "@bpmn-lean/temporal-testkit";

const completion = {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-task",
  taskId: {
    processInstanceId: "Instance_1",
    elementId: "Task_1",
    activation: 1,
  },
  submittedValues: [
    {
      name: "answer",
      value: { kind: VariableValueKind.String, value: "yes" },
    },
    { name: "cleared", value: { kind: VariableValueKind.Null } },
  ],
} as const;

test("canonically encodes every typed stimulus field", () => {
  assert.equal(
    canonicalStimulusEncoding({
      kind: StimulusKind.StartProcess,
      commandId: "start-process",
      processId: "Process_1",
      instanceId: "Instance_1",
      initialVariables: [
        {
          name: "requestTitle",
          value: { kind: VariableValueKind.String, value: "Review request" },
        },
      ],
    }),
    '["startProcess","start-process","Process_1","Instance_1",[["requestTitle",["string","Review request"]]]]',
  );
  assert.equal(
    canonicalStimulusEncoding(completion),
    '["completeUserTaskInstance","complete-task",["Instance_1","Task_1",1],[["answer",["string","yes"]],["cleared",["null"]]]]',
  );
  assert.equal(
    canonicalStimulusEncoding({
      kind: StimulusKind.DeliverMessage,
      commandId: "deliver-message",
      subscriptionId: {
        processInstanceId: "Instance_1",
        elementId: "MessageCatch_1",
        activation: 1,
      },
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "MessageInterface_1",
        interfaceOperationId: "ReceiveMessage_1",
        messageId: "Message_1",
      },
    }),
    '["deliverMessage","deliver-message",["Instance_1","MessageCatch_1",1],["operationMessage","MessageInterface_1","ReceiveMessage_1","Message_1"]]',
  );
  assert.equal(
    canonicalStimulusEncoding({
      kind: StimulusKind.DeliverMessage,
      commandId: "deliver-direct-message",
      subscriptionId: {
        processInstanceId: "Instance_1",
        elementId: "ReceiveTask_1",
        activation: 1,
      },
      channel: {
        kind: MessageChannelKind.DirectMessage,
        messageId: "Message_1",
      },
    }),
    '["deliverMessage","deliver-direct-message",["Instance_1","ReceiveTask_1",1],["directMessage","Message_1"]]',
  );
  assert.throws(
    () => canonicalStimulusEncoding({ ...completion, extra: true }),
    /well-formed semantic stimulus/,
  );
});

test("derives fixed SHA-256 Update IDs from exact canonical content", () => {
  assert.equal(
    contentBoundUpdateId(completion),
    "bpmn-command-sha256:402a16062747176079cbeee6ad890c391369ae2f95557ad14a8d3a422a280b14",
  );
  assert.equal(
    contentBoundUpdateId({
      kind: StimulusKind.StartProcess,
      commandId: "start-process",
      processId: "Process_1",
      instanceId: "Instance_1",
      initialVariables: [],
    }),
    "bpmn-command-sha256:8f332418caaff55e732bc2b79fdf6bae90be78d83a004b299ce22156e62b87e6",
  );
});

test("content-binds the typed BPMN Error command without coercing null", () => {
  const stimulus = {
    kind: StimulusKind.CompleteEffect,
    commandId:
      "complete-effect-sha256:937f7a5c5565cde928afe3526bc64fc80c1ddb34281a0e8a259ae5ac6af2ec2e",
    effectId: {
      processInstanceId: "Instance_1",
      elementId: "MappedBoundaryEffectTask",
      activation: 1,
    },
    result: {
      kind: EffectExecutionResultKind.BpmnError,
      code: "MappedBusinessError",
      message: "mapped business error",
      localPatch: [{
        name: "result",
        value: { kind: VariableValueKind.Null },
      }],
    },
  } as const satisfies Stimulus;
  assert.equal(
    canonicalStimulusEncoding(stimulus),
    '["completeEffect","complete-effect-sha256:937f7a5c5565cde928afe3526bc64fc80c1ddb34281a0e8a259ae5ac6af2ec2e",["Instance_1","MappedBoundaryEffectTask",1],["bpmnError","MappedBusinessError",["some","mapped business error"],[["result",["null"]]]]]',
  );
  assert.equal(
    contentBoundUpdateId(stimulus),
    "bpmn-command-sha256:27f8841bf325124b1bac5e6cbea9611affb9e6c9b835f83115a7a61bbd3c60d9",
  );
});

test("derives the scenario-identical timer command inside the Workflow boundary", () => {
  const timer = {
    id: {
      processInstanceId: "Instance_1",
      elementId: "TimerCatch_PT1S",
      activation: 1,
    },
    deadlineMs: 1000,
  };
  assert.equal(
    canonicalTimerFiringEncoding(timer.id, timer.deadlineMs),
    '["fireTimer",["Instance_1","TimerCatch_PT1S",1],1000]',
  );
  assert.equal(
    timerFiringCommandId(timer.id, timer.deadlineMs),
    "fire-timer-sha256:6abd9ffaf10c2bcefd54580956fd16ca64043ce25367c6f8a5b697033bca5c3b",
  );
  assert.deepEqual(timerFiringStimulus(timer), {
    kind: "fireTimer",
    commandId:
      "fire-timer-sha256:6abd9ffaf10c2bcefd54580956fd16ca64043ce25367c6f8a5b697033bca5c3b",
    timerId: timer.id,
    logicalTimeMs: 1000,
  });
});

test("the command-ID-only mutation collapses the payload-conflict witness", () => {
  const conflicting = {
    ...completion,
    taskId: {
      ...completion.taskId,
      activation: 2,
    },
  };
  const requireSeparated = (
    updateIdForStimulus: (stimulus: Stimulus) => string,
  ): void => {
    assert.notEqual(
      updateIdForStimulus(completion),
      updateIdForStimulus(conflicting),
      "different semantic payloads must have different Update IDs",
    );
  };

  assert.doesNotThrow(() => requireSeparated(contentBoundUpdateId));
  assert.throws(
    () => requireSeparated((stimulus: Stimulus) => stimulus.commandId),
    /different semantic payloads must have different Update IDs/,
  );
});
