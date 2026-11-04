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
    sourceOverlay: null,
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

test("normalizes an explicit false instantiate attribute", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const explicitFalse = xml.replace(
    'messageRef="Message_NewInvoice"',
    'messageRef="Message_NewInvoice" instantiate="false"',
  );
  assert.notEqual(explicitFalse, xml);

  const ordinary = requireAccepted(await compile(new TextEncoder().encode(xml)));
  const explicit = requireAccepted(
    await compile(new TextEncoder().encode(explicitFalse)),
  );
  assert.deepEqual(
    withoutSourceDigest(explicit.checkedProcess),
    withoutSourceDigest(ordinary.checkedProcess),
  );
  assert.deepEqual(
    withoutSourceDigest(explicit.semanticProcess),
    withoutSourceDigest(ordinary.semanticProcess),
  );
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

const addresslessProfile = "cibseven-2.2.0-addressless-receive-task-draft";
const addresslessSourceUrl = new URL(
  "../../../scenarios/addressless-receive-task/process.bpmn",
  import.meta.url,
);

// Locks ARECV-ADDRESS-01 of the addressless Receive Task proposal: a Receive Task without `messageRef`
// projects to the field-free unspecified channel, never to a synthetic Message identity.
test("lowers an addressless Receive Task to awaitMessage on the unspecified channel", async () => {
  const result = requireAccepted(await compile(await readFile(addresslessSourceUrl), addresslessProfile));
  const channel = { kind: MessageChannelKind.UnspecifiedMessage } as const;

  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "ReceiveTask_AwaitCourierPickup"),
    { kind: CheckedNodeKind.ReceiveTask, id: "ReceiveTask_AwaitCourierPickup", channel },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(({ kind }) => kind === SemanticOperationKind.AwaitMessage),
    {
      id: "operation:ReceiveTask_AwaitCourierPickup",
      kind: SemanticOperationKind.AwaitMessage,
      origin: { kind: "bpmnElement", elementId: "ReceiveTask_AwaitCourierPickup" },
      input: "place:SequenceFlow_RequestedToPickup",
      output: "place:SequenceFlow_PickupToHandedOver",
      message: { elementId: "ReceiveTask_AwaitCourierPickup", channel },
    },
  );
});

test("rejects an addressless Receive Task outside the exact selected slice and profile", async () => {
  const xml = await readFile(addresslessSourceUrl, "utf8");
  const task = '<bpmn:receiveTask\n      id="ReceiveTask_AwaitCourierPickup"';
  const mutations = [
    xml.replace("<bpmn:process", '<bpmn:message id="Message_Unreferenced" name="unreferenced" />\n  <bpmn:process'),
    xml.replace(task, `${task}\n      instantiate="true"`),
    xml.replace(task, `${task}\n      implementation="##unspecified"`),
    xml.replace(task, `${task}\n      operationRef="Operation_Forbidden"`),
    xml
      .replace('targetNamespace=', 'xmlns:camunda="http://camunda.org/schema/1.0/bpmn"\n  targetNamespace=')
      .replace(
        "<bpmn:incoming>SequenceFlow_RequestedToPickup</bpmn:incoming>",
        "<bpmn:extensionElements><camunda:inputOutput><camunda:inputParameter name=\"courier\">c</camunda:inputParameter></camunda:inputOutput></bpmn:extensionElements>\n      <bpmn:incoming>SequenceFlow_RequestedToPickup</bpmn:incoming>",
      ),
  ];
  for (const [index, mutation] of mutations.entries()) {
    assert.notEqual(mutation, xml, `mutation ${index}`);
    const result = await compile(new TextEncoder().encode(mutation), addresslessProfile);
    assert.equal(result.status, BpmnCompilationStatus.Rejected, `mutation ${index}`);
  }
  const direct = await compile(await readFile(sourceUrl), addresslessProfile);
  assert.equal(direct.status, BpmnCompilationStatus.Rejected, "a direct Receive Task under the addressless profile");

  for (const profile of [
    receiveTaskProfile,
    "cibseven-2.2.0-nested-embedded-scope-data-draft",
    "bpmn-2.0.2-repeatable-event-subscriptions-draft",
    "bpmn-2.0.2-intermediate-catch-message-draft",
  ]) {
    const result = await compile(new TextEncoder().encode(xml), profile);
    assert.equal(result.status, BpmnCompilationStatus.Rejected, profile);
  }
});
