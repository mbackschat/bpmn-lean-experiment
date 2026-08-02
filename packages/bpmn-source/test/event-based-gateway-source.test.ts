import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  GatewayDirection,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

const profile = "bpmn-2.0.2-event-based-gateway-message-timer-draft";
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });
const source = await readFile(
  new URL("./fixtures/event-based-gateway-message-timer.bpmn", import.meta.url),
  "utf8",
);
const permutedSource = await readFile(
  new URL("./fixtures/event-based-gateway-message-timer-permuted.bpmn", import.meta.url),
  "utf8",
);

function compile(bytes: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "event-race-test",
    expectedSha256: undefined,
    semanticProfile: profile,
    limits,
  });
}

test("lowers the complete Message/Timer configuration into one typed race", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
  assert.deepEqual(
    result.checkedProcess.nodes.filter(({ kind }) => kind === CheckedNodeKind.EventBasedGateway),
    [{ kind: CheckedNodeKind.EventBasedGateway, id: "Race", direction: GatewayDirection.Diverging }],
  );
  assert.deepEqual(
    result.semanticProcess.operations.filter(({ kind }) => kind === SemanticOperationKind.AwaitEventRace),
    [{
      id: "operation:Race",
      kind: SemanticOperationKind.AwaitEventRace,
      origin: { kind: "bpmnElement", elementId: "Race" },
      input: "place:Flow_Start",
      message: {
        configurationOrigin: { kind: "bpmnSequenceFlow", elementId: "Flow_Message_Config" },
        elementId: "MessageCatch",
        channel: {
          kind: "operationMessage",
          interfaceId: "Interface_ProcessMessages",
          interfaceOperationId: "Operation_ReceiveApproval",
          messageId: "Message_Approval",
        },
        output: "place:Flow_Message_Task",
      },
      timer: {
        configurationOrigin: { kind: "bpmnSequenceFlow", elementId: "Flow_Timer_Config" },
        elementId: "TimerCatch",
        durationMs: 1000,
        output: "place:Flow_Timer_Task",
      },
    }],
  );
  assert.deepEqual(
    result.semanticProcess.controlPlaces.map(({ origin }) => origin.elementId),
    ["Flow_Message_End", "Flow_Message_Task", "Flow_Start", "Flow_Timer_End", "Flow_Timer_Task"],
  );
});

test("derives the Event-Based Gateway defaults and rejects non-exclusive or instantiating forms", async () => {
  for (const candidate of [
    source,
    source.replace('<bpmn:eventBasedGateway id="Race">', '<bpmn:eventBasedGateway id="Race" gatewayDirection="Unspecified" instantiate="false" eventGatewayType="Exclusive">'),
    source.replace('<bpmn:eventBasedGateway id="Race">', '<bpmn:eventBasedGateway id="Race" gatewayDirection="Diverging" instantiate="0" eventGatewayType="Exclusive">'),
  ]) {
    assert.equal((await compile(candidate)).status, BpmnCompilationStatus.Accepted);
  }
  for (const candidate of [
    source.replace('<bpmn:eventBasedGateway id="Race">', '<bpmn:eventBasedGateway id="Race" instantiate="true">'),
    source.replace('<bpmn:eventBasedGateway id="Race">', '<bpmn:eventBasedGateway id="Race" eventGatewayType="Parallel">'),
    source.replace('<bpmn:eventBasedGateway id="Race">', '<bpmn:eventBasedGateway id="Race" gatewayDirection="Converging">'),
    source.replace('<bpmn:eventBasedGateway id="Race">', '<bpmn:eventBasedGateway id="Race" gatewayDirection="Mixed">'),
  ]) {
    assert.equal((await compile(candidate)).status, BpmnCompilationStatus.Rejected);
  }
});

test("rejects alternate catch ingress, conditions, swapped trigger references, and cross-branch flow", async () => {
  const extraIngress = source
    .replace('<bpmn:startEvent id="Start">', '<bpmn:startEvent id="Start"><bpmn:outgoing>Flow_Alternate</bpmn:outgoing>')
    .replace('<bpmn:incoming>Flow_Message_Config</bpmn:incoming>', '<bpmn:incoming>Flow_Message_Config</bpmn:incoming><bpmn:incoming>Flow_Alternate</bpmn:incoming>')
    .replace('</bpmn:process>', '<bpmn:sequenceFlow id="Flow_Alternate" sourceRef="Start" targetRef="MessageCatch"/></bpmn:process>');
  const mutations = [
    extraIngress,
    source.replace('<bpmn:sequenceFlow id="Flow_Message_Config" sourceRef="Race" targetRef="MessageCatch"/>', '<bpmn:sequenceFlow id="Flow_Message_Config" sourceRef="Race" targetRef="MessageCatch"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">true</bpmn:conditionExpression></bpmn:sequenceFlow>'),
    source.replace('operationRef="Operation_ReceiveApproval"', 'operationRef="Operation_Missing"'),
    source.replace('sourceRef="MessageCatch" targetRef="MessageTask"', 'sourceRef="MessageCatch" targetRef="TimerTask"'),
  ];
  for (const mutation of mutations) {
    assert.equal((await compile(mutation)).status, BpmnCompilationStatus.Rejected);
  }
});

test("canonicalizes root, node, flow, and reference declaration order", async () => {
  const original = await compile(source);
  const permuted = await compile(permutedSource);
  assert.equal(original.status, BpmnCompilationStatus.Accepted);
  assert.equal(permuted.status, BpmnCompilationStatus.Accepted);
  if (
    original.status !== BpmnCompilationStatus.Accepted ||
    permuted.status !== BpmnCompilationStatus.Accepted
  ) {
    return;
  }
  assert.notEqual(original.source.sha256, permuted.source.sha256);
  assert.deepEqual(
    { ...original.checkedProcess, identity: { ...original.checkedProcess.identity, sourceSha256: "digest" } },
    { ...permuted.checkedProcess, identity: { ...permuted.checkedProcess.identity, sourceSha256: "digest" } },
  );
  assert.deepEqual(
    { ...original.semanticProcess, identity: { ...original.semanticProcess.identity, sourceSha256: "digest" } },
    { ...permuted.semanticProcess, identity: { ...permuted.semanticProcess.identity, sourceSha256: "digest" } },
  );
});
