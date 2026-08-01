/**
 * Locks the exact direct-Message Receive Task source slice and its lowering.
 *
 * The Message name is required at admission for the CIB public ingress but is
 * deliberately absent from the checked graph and Semantic Process program.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  MessageChannelKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";

const receiveTaskProfile =
  "cibseven-2.2.0-message-addressed-receive-task-draft";
const sourceUrl = new URL(
  "../../../scenarios/message-addressed-receive-task/process.bpmn",
  import.meta.url,
);
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

async function compile(
  bytes: Uint8Array,
  semanticProfile = receiveTaskProfile,
): Promise<ReturnType<typeof compileBpmnToSemanticProcess> extends Promise<infer Result> ? Result : never> {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "message-addressed-receive-task-process",
    expectedSha256: undefined,
    semanticProfile,
    limits,
  });
}

function requireAccepted(
  result: Awaited<ReturnType<typeof compile>>,
): AcceptedBpmnCompilation {
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result;
}

test("lowers one exact Message-addressed Receive Task to direct awaitMessage", async () => {
  const result = requireAccepted(await compile(await readFile(sourceUrl)));
  const channel = {
    kind: MessageChannelKind.DirectMessage,
    messageId: "Message_NewInvoice",
  } as const;

  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "ReceiveTask_WaitForInvoice",
    ),
    {
      kind: CheckedNodeKind.ReceiveTask,
      id: "ReceiveTask_WaitForInvoice",
      channel,
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.AwaitMessage,
    ),
    {
      id: "operation:ReceiveTask_WaitForInvoice",
      kind: SemanticOperationKind.AwaitMessage,
      origin: {
        kind: "bpmnElement",
        elementId: "ReceiveTask_WaitForInvoice",
      },
      input: "place:SequenceFlow_StartToReceive",
      output: "place:SequenceFlow_ReceiveToEnd",
      message: {
        elementId: "ReceiveTask_WaitForInvoice",
        channel,
      },
    },
  );
  assert.equal(JSON.stringify(result.checkedProcess).includes("newInvoiceMessage"), false);
  assert.equal(JSON.stringify(result.semanticProcess).includes("newInvoiceMessage"), false);
});

test("derives the direct channel from messageRef rather than fixture identity", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const changed = xml
    .replaceAll("Message_NewInvoice", "Message_Changed")
    .replace('name="newInvoiceMessage"', 'name="changedMessage"');
  assert.notEqual(changed, xml);

  const result = requireAccepted(await compile(new TextEncoder().encode(changed)));
  const wait = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitMessage,
  );
  assert.equal(wait?.kind, SemanticOperationKind.AwaitMessage);
  if (wait?.kind !== SemanticOperationKind.AwaitMessage) {
    throw new Error("missing Receive Task wait");
  }
  assert.deepEqual(wait.message.channel, {
    kind: MessageChannelKind.DirectMessage,
    messageId: "Message_Changed",
  });
  assert.equal(JSON.stringify(result.semanticProcess).includes("changedMessage"), false);
});

test("declaration permutation preserves checked and lowered definitions", async () => {
  const ordinary = requireAccepted(await compile(await readFile(sourceUrl)));
  const permuted = requireAccepted(
    await compile(
      await readFile(
        new URL("./fixtures/message-addressed-receive-task-permuted.bpmn", import.meta.url),
      ),
    ),
  );

  assert.deepEqual(
    withoutSourceDigest(permuted.checkedProcess),
    withoutSourceDigest(ordinary.checkedProcess),
  );
  assert.deepEqual(
    withoutSourceDigest(permuted.semanticProcess),
    withoutSourceDigest(ordinary.semanticProcess),
  );
});

function withoutSourceDigest<Definition extends Readonly<{
  identity: Readonly<{ sourceSha256: string }>;
}>>(definition: Definition): Definition {
  return {
    ...definition,
    identity: { ...definition.identity, sourceSha256: "<source-digest>" },
  };
}

test("rejects Receive Task source outside the exact selected slice", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutations = [
    xml.replace(' messageRef="Message_NewInvoice"', ""),
    xml.replace(
      'messageRef="Message_NewInvoice"',
      'messageRef="Message_Missing"',
    ),
    xml.replace(
      'messageRef="Message_NewInvoice"',
      'messageRef="Message_NewInvoice" operationRef="Operation_Forbidden"',
    ),
    xml.replace(
      'messageRef="Message_NewInvoice"',
      'messageRef="Message_NewInvoice" instantiate="true"',
    ),
    xml.replace(
      'messageRef="Message_NewInvoice"',
      'messageRef="Message_NewInvoice" implementation="##unspecified"',
    ),
    xml.replace(' name="newInvoiceMessage"', ""),
    xml.replace(
      'name="newInvoiceMessage"',
      'name="newInvoiceMessage" itemRef="Item_Payload"',
    ),
  ];

  for (const [index, mutation] of mutations.entries()) {
    assert.notEqual(mutation, xml);
    const result = await compile(new TextEncoder().encode(mutation));
    assert.equal(result.status, BpmnCompilationStatus.Rejected, `mutation ${index}`);
  }
});

test("Receive Task and Intermediate Catch Message profiles reject each other's graphs", async () => {
  const receiveUnderCatch = await compile(
    await readFile(sourceUrl),
    "bpmn-2.0.2-intermediate-catch-message-draft",
  );
  const catchUnderReceive = await compile(
    await readFile(
      new URL("../../../scenarios/intermediate-catch-message/process.bpmn", import.meta.url),
    ),
  );

  assert.equal(receiveUnderCatch.status, BpmnCompilationStatus.Rejected);
  assert.equal(catchUnderReceive.status, BpmnCompilationStatus.Rejected);
});
