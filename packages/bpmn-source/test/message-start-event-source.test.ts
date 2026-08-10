/** Locks the exact top-level, payload-free Message Start Event source slice. */
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
  BpmnCompilationResult,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";
import { SemanticProfileId } from "@bpmn-lean/semantic-core";

const messageStartProfile = SemanticProfileId.MessageStart;
const sourceUrl = new URL("./fixtures/message-start-event.bpmn", import.meta.url);
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

async function compile(
  bytes: Uint8Array,
  semanticProfile: string = messageStartProfile,
): Promise<BpmnCompilationResult> {
  return await compileBpmnToSemanticProcess({
    bytes,
    sourceId: "message-start-event",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits,
  });
}

function requireAccepted(result: BpmnCompilationResult): AcceptedBpmnCompilation {
  if (result.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(JSON.stringify(result.diagnostics));
  }
  return result;
}

test("compiles and lowers the exact Message Start Event source slice", async () => {
  const bytes = await readFile(sourceUrl);
  const result = requireAccepted(await compile(bytes));
  const channel = {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_ProcessMessages",
    interfaceOperationId: "Operation_ReceiveApprovalRequest",
    messageId: "Message_ApprovalRequest",
  } as const;

  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "MessageStart_ApprovalRequest",
    ),
    {
      kind: CheckedNodeKind.MessageStartEvent,
      id: "MessageStart_ApprovalRequest",
      channel,
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.find(
      ({ kind }) => kind === SemanticOperationKind.InitiateMessage,
    ),
    {
      id: "operation:MessageStart_ApprovalRequest",
      kind: SemanticOperationKind.InitiateMessage,
      origin: {
        kind: "bpmnElement",
        elementId: "MessageStart_ApprovalRequest",
      },
      channel,
      outputs: ["place:Flow_StartToTask"],
    },
  );
  assert.deepEqual(Array.from(result.copyExactBytes()), Array.from(bytes));
  assert.equal(result.checkedProcess.identity.sourceId, "message-start-event");
});

test("preserves the complete operation-addressed channel through ordinary compilation", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const changed = xml.replaceAll(
    "Operation_ReceiveApprovalRequest",
    "Operation_ReceiveAlternateRequest",
  );
  assert.notEqual(changed, xml);

  const result = requireAccepted(
    await compile(new TextEncoder().encode(changed)),
  );
  const checked = result.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.MessageStartEvent,
  );
  const lowered = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.InitiateMessage,
  );

  assert.equal(checked?.kind, CheckedNodeKind.MessageStartEvent);
  assert.equal(
    checked?.channel.interfaceOperationId,
    "Operation_ReceiveAlternateRequest",
  );
  assert.equal(lowered?.kind, SemanticOperationKind.InitiateMessage);
  assert.equal(
    lowered?.channel.interfaceOperationId,
    "Operation_ReceiveAlternateRequest",
  );
});

test("allows empty Interface and Operation names without projecting them", async () => {
  const xml = await readFile(sourceUrl, "utf8");
  const changed = xml
    .replace('name="Process messages"', 'name=""')
    .replace('name="Receive approval request"', 'name=""');
  assert.notEqual(changed, xml);

  const result = requireAccepted(
    await compile(new TextEncoder().encode(changed)),
  );

  assert.deepEqual(
    result.checkedProcess.nodes.find(
      ({ id }) => id === "MessageStart_ApprovalRequest",
    ),
    {
      kind: CheckedNodeKind.MessageStartEvent,
      id: "MessageStart_ApprovalRequest",
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "Interface_ProcessMessages",
        interfaceOperationId: "Operation_ReceiveApprovalRequest",
        messageId: "Message_ApprovalRequest",
      },
    },
  );
});

test("rejects every malformed Message Start source boundary", async (context) => {
  const xml = await readFile(sourceUrl, "utf8");
  const mutations = messageStartSourceMutations(xml);

  for (const [name, mutation] of Object.entries(mutations)) {
    await context.test(name, async () => {
      assert.notEqual(mutation, xml, `${name} mutation matched nothing`);
      const result = await compile(new TextEncoder().encode(mutation));
      assert.equal(result.status, BpmnCompilationStatus.Rejected);
    });
  }
});

test("Message, passive catch, and None starts cannot cross-admit", async () => {
  const messageUnderManual = await compile(
    await readFile(sourceUrl),
    SemanticProfileId.UserTask,
  );
  const messageUnderPassiveCatch = await compile(
    await readFile(sourceUrl),
    SemanticProfileId.IntermediateCatchMessage,
  );
  const manualUnderMessage = await compile(
    await readFile(
      new URL("../../../scenarios/user-task-discovery-completion/process.bpmn", import.meta.url),
    ),
  );
  const passiveCatchUnderMessage = await compile(
    await readFile(
      new URL("../../../scenarios/intermediate-catch-message/process.bpmn", import.meta.url),
    ),
  );

  assert.equal(messageUnderManual.status, BpmnCompilationStatus.Rejected);
  assert.equal(messageUnderPassiveCatch.status, BpmnCompilationStatus.Rejected);
  assert.equal(manualUnderMessage.status, BpmnCompilationStatus.Rejected);
  assert.equal(passiveCatchUnderMessage.status, BpmnCompilationStatus.Rejected);
});

function messageStartSourceMutations(xml: string): Readonly<Record<string, string>> {
  const startDefinition = '<bpmn:messageEventDefinition id="MessageEventDefinition_ApprovalRequest" messageRef="Message_ApprovalRequest" operationRef="Operation_ReceiveApprovalRequest"/>';
  const startFlow = '<bpmn:sequenceFlow id="Flow_StartToTask" sourceRef="MessageStart_ApprovalRequest" targetRef="UserTask_Approve"/>';
  const messageRoot = '<bpmn:message id="Message_ApprovalRequest" name="Approval request"/>';
  const operationInput = "      <bpmn:inMessageRef>Message_ApprovalRequest</bpmn:inMessageRef>";
  return {
    "missing Interface name": xml.replace(' name="Process messages"', ""),
    "missing Operation name": xml.replace(
      ' name="Receive approval request"',
      "",
    ),
    "missing Message reference": xml.replace(
      ' messageRef="Message_ApprovalRequest"',
      "",
    ),
    "unresolved Message reference": xml.replace(
      'messageRef="Message_ApprovalRequest"',
      'messageRef="Message_Missing"',
    ),
    "missing Operation reference": xml.replace(
      ' operationRef="Operation_ReceiveApprovalRequest"',
      "",
    ),
    "unresolved Operation reference": xml.replace(
      'operationRef="Operation_ReceiveApprovalRequest"',
      'operationRef="Operation_Missing"',
    ),
    "missing Operation input Message reference": xml.replace(
      `${operationInput}\n`,
      "",
    ),
    "Operation declares an output Message": xml.replace(
      operationInput,
      `${operationInput}\n      <bpmn:outMessageRef>Message_ApprovalRequest</bpmn:outMessageRef>`,
    ),
    "Operation declares an implementation reference": xml.replace(
      'name="Receive approval request">',
      'name="Receive approval request" implementationRef="Implementation_Handler">',
    ),
    "Operation declares an Error reference": xml
      .replace(
        messageRoot,
        `${messageRoot}\n  <bpmn:error id="Error_Operation" name="Operation error" errorCode="E_OPERATION"/>`,
      )
      .replace(
        operationInput,
        `${operationInput}\n      <bpmn:errorRef>Error_Operation</bpmn:errorRef>`,
      ),
    "Operation input differs from Event Definition Message": xml
      .replace(
        messageRoot,
        `${messageRoot}\n  <bpmn:message id="Message_Other"/>`,
      )
      .replace(
        "<bpmn:inMessageRef>Message_ApprovalRequest</bpmn:inMessageRef>",
        "<bpmn:inMessageRef>Message_Other</bpmn:inMessageRef>",
      ),
    "referenced Event Definition": xml
      .replace(
        startDefinition,
        "<bpmn:eventDefinitionRef>MessageEventDefinition_ApprovalRequest</bpmn:eventDefinitionRef>",
      )
      .replace(
        "  <bpmn:process",
        `  ${startDefinition}\n  <bpmn:process`,
      ),
    "repeated Event Definition": xml.replace(
      startDefinition,
      `${startDefinition}\n      ${startDefinition.replace("ApprovalRequest\"", "ApprovalRequest_2\"")}`,
    ),
    "parallel Event Definition": xml.replace(
      '<bpmn:startEvent id="MessageStart_ApprovalRequest">',
      '<bpmn:startEvent id="MessageStart_ApprovalRequest" parallelMultiple="true">',
    ),
    "explicit isInterrupting": xml.replace(
      '<bpmn:startEvent id="MessageStart_ApprovalRequest">',
      '<bpmn:startEvent id="MessageStart_ApprovalRequest" isInterrupting="true">',
    ),
    "payload-bearing Message": xml.replace(
      messageRoot,
      '<bpmn:itemDefinition id="Item_Payload" structureRef="bpmn:tBaseElement"/>\n  <bpmn:message id="Message_ApprovalRequest" name="Approval request" itemRef="Item_Payload"/>',
    ),
    "catch Event data output": xml.replace(
      `      ${startDefinition}`,
      `      <bpmn:dataOutput id="DataOutput_Start"/>\n      ${startDefinition}`,
    ),
    "catch Event output set": xml.replace(
      `      ${startDefinition}`,
      `      <bpmn:outputSet id="OutputSet_Start"/>\n      ${startDefinition}`,
    ),
    "catch Event data output association": xml.replace(
      `      ${startDefinition}`,
      `      <bpmn:dataOutput id="DataOutput_Start"/>\n      <bpmn:dataOutputAssociation id="DataOutputAssociation_Start"><bpmn:targetRef>DataOutput_Start</bpmn:targetRef></bpmn:dataOutputAssociation>\n      ${startDefinition}`,
    ),
    "incoming Sequence Flow": xml.replace(
      `    ${startFlow}`,
      `    ${startFlow}\n    <bpmn:sequenceFlow id="Flow_EndToStart" sourceRef="EndEvent_Approved" targetRef="MessageStart_ApprovalRequest"/>`,
    ),
    "zero outgoing Sequence Flows": xml
      .replace("      <bpmn:incoming>Flow_StartToTask</bpmn:incoming>\n", "")
      .replace(`    ${startFlow}\n`, ""),
    "multiple outgoing Sequence Flows": xml.replace(
      `    ${startFlow}`,
      `    ${startFlow}\n    <bpmn:sequenceFlow id="Flow_StartToEnd" sourceRef="MessageStart_ApprovalRequest" targetRef="EndEvent_Approved"/>`,
    ),
    "conditional outgoing Sequence Flow": xml
      .replace(
        'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"',
        'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"\n  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      )
      .replace(
        startFlow,
        '<bpmn:sequenceFlow id="Flow_StartToTask" sourceRef="MessageStart_ApprovalRequest" targetRef="UserTask_Approve"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">true()</bpmn:conditionExpression></bpmn:sequenceFlow>',
      ),
    "non-top-level Message Start": nestedMessageStartDocument(xml, false),
    "Event Sub-Process Message Start": nestedMessageStartDocument(xml, true),
    "extra root": xml.replace(
      "  <bpmn:process",
      '  <bpmn:signal id="Signal_Extra"/>\n  <bpmn:process',
    ),
    "second Message definition": xml.replace(
      messageRoot,
      `${messageRoot}\n  <bpmn:message id="Message_Second"/>`,
    ),
    "multiple Message Starts": xml.replace(
      "    <bpmn:userTask",
      `    <bpmn:startEvent id="MessageStart_Second">${startDefinition.replace("ApprovalRequest\"", "ApprovalRequest_2\"")}</bpmn:startEvent>\n    <bpmn:userTask`,
    ),
    "mixed Message and None Starts": xml.replace(
      "    <bpmn:userTask",
      '    <bpmn:startEvent id="ManualStart"/>\n    <bpmn:userTask',
    ),
  };
}

function nestedMessageStartDocument(
  xml: string,
  triggeredByEvent: boolean,
): string {
  const opening = triggeredByEvent
    ? '<bpmn:subProcess id="Nested" triggeredByEvent="true">'
    : '<bpmn:subProcess id="Nested">';
  return xml
    .replace(
      '    <bpmn:startEvent id="MessageStart_ApprovalRequest">',
      `    ${opening}\n      <bpmn:startEvent id="MessageStart_ApprovalRequest">`,
    )
    .replace(
      "    </bpmn:startEvent>\n    <bpmn:userTask",
      "      </bpmn:startEvent>\n    </bpmn:subProcess>\n    <bpmn:userTask",
    );
}
