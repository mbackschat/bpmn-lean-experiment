/**
 * Locks exact BPMN Message definition-chain admission and lowering.
 *
 * These tests keep Message/Interface/Operation reference selection separate
 * from the generic Semantic Process lowering regression suite.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";
import type {
  SemanticOperation,
} from "@bpmn-lean/semantic-core";

const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

async function compileFixture(
  relativePath: string,
  sourceId: string,
): Promise<AcceptedBpmnCompilation> {
  const result = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(relativePath, import.meta.url)),
    sourceId,
    expectedSha256: undefined,
    semanticProfile:
      "bpmn-2.0.2-intermediate-catch-message-draft",
    limits,
  });
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(
      `${sourceId} was rejected: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result;
}

function operationOfKind<Kind extends SemanticOperationKind>(
  operations: ReadonlyArray<SemanticOperation>,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = operations.find((candidate) => candidate.kind === kind);
  assert.ok(found !== undefined, `the program has no ${kind} operation`);
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

test("resolves and lowers the exact Message reference chain", async () => {
  const result = await compileFixture(
    "../../../scenarios/intermediate-catch-message/process.bpmn",
    "intermediate-catch-message-process",
  );
  const channel = {
    interfaceId: "Interface_ProcessMessages",
    interfaceOperationId: "Operation_ReceiveApprovalRequest",
    messageId: "Message_ApprovalRequest",
  };

  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "MessageCatch_ApprovalRequest",
    ),
    {
      kind: CheckedNodeKind.IntermediateCatchMessageEvent,
      id: "MessageCatch_ApprovalRequest",
      channel,
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitMessage,
    ),
    {
      id: "operation:MessageCatch_ApprovalRequest",
      kind: SemanticOperationKind.AwaitMessage,
      origin: {
        kind: "bpmnElement",
        elementId: "MessageCatch_ApprovalRequest",
      },
      input: "place:Flow_StartToMessage",
      output: "place:Flow_MessageToTask",
      message: {
        elementId: "MessageCatch_ApprovalRequest",
        channel,
      },
    },
  );
});

test("admits the same passive Message and User Task mechanisms in reverse graph order", async () => {
  const result = await compileFixture(
    "./fixtures/intermediate-catch-message-reverse.bpmn",
    "intermediate-catch-message-reverse",
  );
  const userTask = operationOfKind(
    result.semanticProcess.operations,
    SemanticOperationKind.AwaitUserTask,
  );
  const message = operationOfKind(
    result.semanticProcess.operations,
    SemanticOperationKind.AwaitMessage,
  );

  assert.equal(userTask.input, "place:Flow_StartToTask");
  assert.equal(userTask.output, "place:Flow_TaskToMessage");
  assert.equal(message.input, userTask.output);
  assert.equal(message.output, "place:Flow_MessageToEnd");
});

test("derives Message channel identity from references rather than fixture constants", async () => {
  const bytes = await readFile(
    new URL(
      "../../../scenarios/intermediate-catch-message/process.bpmn",
      import.meta.url,
    ),
  );
  const xml = new TextDecoder().decode(bytes);
  const replacement = xml
    .replaceAll("Interface_ProcessMessages", "Interface_Other")
    .replaceAll(
      "Operation_ReceiveApprovalRequest",
      "Operation_ReceiveOther",
    )
    .replaceAll("Message_ApprovalRequest", "Message_Other");
  const result = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(replacement),
    sourceId: "replacement-message-channel",
    expectedSha256: undefined,
    semanticProfile:
      "bpmn-2.0.2-intermediate-catch-message-draft",
    limits,
  });

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("replacement Message channel was not admitted");
  }
  const operation = operationOfKind(
    result.semanticProcess.operations,
    SemanticOperationKind.AwaitMessage,
  );
  assert.deepEqual(operation.message.channel, {
    interfaceId: "Interface_Other",
    interfaceOperationId: "Operation_ReceiveOther",
    messageId: "Message_Other",
  });
});

test("rejects incomplete, inconsistent, payload-bearing, or additional Message chains", async () => {
  const bytes = await readFile(
    new URL(
      "../../../scenarios/intermediate-catch-message/process.bpmn",
      import.meta.url,
    ),
  );
  const xml = new TextDecoder().decode(bytes);
  const mutations = [
    xml.replace(
      ' operationRef="Operation_ReceiveApprovalRequest"',
      "",
    ),
    xml.replace(
      'operationRef="Operation_ReceiveApprovalRequest"',
      'operationRef="Operation_Missing"',
    ),
    xml.replace(
      "<bpmn:inMessageRef>Message_ApprovalRequest</bpmn:inMessageRef>",
      "<bpmn:inMessageRef>Message_Missing</bpmn:inMessageRef>",
    ),
    xml.replace(
      '<bpmn:message id="Message_ApprovalRequest" name="Approval request"/>',
      '<bpmn:message id="Message_ApprovalRequest" name="Approval request" itemRef="Item_Payload"/>',
    ),
    xml.replace(
      '  <bpmn:message id="Message_ApprovalRequest" name="Approval request"/>',
      [
        '  <bpmn:message id="Message_ApprovalRequest" name="Approval request"/>',
        '  <bpmn:message id="Message_Extra"/>',
      ].join("\n"),
    ),
  ];

  for (const [index, mutation] of mutations.entries()) {
    assert.notEqual(mutation, xml);
    const result = await compileBpmnToSemanticProcess({
      bytes: new TextEncoder().encode(mutation),
      sourceId: `invalid-message-chain-${index}`,
      expectedSha256: undefined,
      semanticProfile:
        "bpmn-2.0.2-intermediate-catch-message-draft",
      limits,
    });
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});
