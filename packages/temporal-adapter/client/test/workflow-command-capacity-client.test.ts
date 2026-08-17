import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import {
  submitMessageDeliveryAtWorkflowId,
} from "../dist/process-client.js";
import { resolveSemanticUpdate } from "../dist/semantic-update-client.js";

const processInstanceId = "Instance_1";
const workflowId = "workflow-address";
const stimulusLimit = workflowChainProductionLimit(
  WorkflowChainBudgetKind.SemanticStimulusBytes,
);

test("sends an Update at the exact semantic-stimulus byte boundary", async () => {
  let updateCount = 0;
  const stimulus = sizedCompletion(stimulusLimit);

  const result = await resolveSemanticUpdate({
    client: fakeClient({
      executeUpdate: async () => {
        updateCount += 1;
        return "committed";
      },
    }),
    workflowId,
    processInstanceId,
    stimulus,
    updateName: "complete",
    operation: "capacity boundary",
  });

  assert.equal(updateCount, 1);
  assert.equal(result.kind, "semantic");
});

test("rejects oversized Update and Message stimuli before acquiring an SDK handle", async () => {
  let handleCount = 0;
  const client = fakeClient({}, () => {
    handleCount += 1;
  });

  await assert.rejects(
    resolveSemanticUpdate({
      client,
      workflowId,
      processInstanceId,
      stimulus: sizedCompletion(stimulusLimit + 1),
      updateName: "complete",
      operation: "oversized Update",
    }),
    /semanticStimulusBytes exceeds 65536 canonical UTF-8 bytes/u,
  );
  await assert.rejects(
    submitMessageDeliveryAtWorkflowId(
      client,
      workflowId,
      processInstanceId,
      sizedMessage(stimulusLimit + 1),
    ),
    /semanticStimulusBytes exceeds 65536 canonical UTF-8 bytes/u,
  );
  assert.equal(handleCount, 0);
});

function sizedCompletion(targetBytes: number) {
  const base = completion("");
  const stimulus = completion(
    "x".repeat(targetBytes - workflowChainCanonicalUtf8ByteLength(base)),
  );
  assert.equal(workflowChainCanonicalUtf8ByteLength(stimulus), targetBytes);
  return stimulus;
}

function completion(commandId: string) {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: {
      processInstanceId,
      elementId: "UserTask_1",
      activation: 1,
    },
    submittedValues: [],
  } as const;
}

function sizedMessage(targetBytes: number) {
  const base = message("");
  const stimulus = message(
    "x".repeat(targetBytes - workflowChainCanonicalUtf8ByteLength(base)),
  );
  assert.equal(workflowChainCanonicalUtf8ByteLength(stimulus), targetBytes);
  return stimulus;
}

function message(commandId: string) {
  return {
    kind: StimulusKind.DeliverMessage,
    commandId,
    subscriptionId: {
      processInstanceId,
      elementId: "Catch_1",
      activation: 1,
    },
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: "Interface_1",
      interfaceOperationId: "Operation_1",
      messageId: "Message_1",
    },
  } as const;
}

function fakeClient(
  handle: Readonly<{
    executeUpdate?: () => Promise<unknown>;
  }>,
  onGetHandle: () => void = () => undefined,
): never {
  return {
    getHandle: () => {
      onGetHandle();
      return {
        executeUpdate: handle.executeUpdate ?? (async () => {
          throw new Error("unexpected Update");
        }),
        signal: async () => {
          throw new Error("unexpected Signal");
        },
        query: async () => {
          throw new Error("unexpected Query");
        },
      };
    },
  } as never;
}
