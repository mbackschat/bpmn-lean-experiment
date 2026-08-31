/**
 * Locks exact source admission and lowering for the interrupting Activity boundary Message profile.
 *
 * The oracle is the approved Activity boundary Message specification: the omission-only interrupting
 * Boundary Event and its host User Task lower to one Activity-owned operation whose two outputs
 * remain distinct and whose Message channel is derived from the resolved root definition chain.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  BpmnCompilationStatus,
  CheckedNodeKind,
  MessageChannelKind,
  SemanticOperationKind,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";

const profile = "bpmn-2.0.2-activity-boundary-message-draft";
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});
const source = await readFile(
  new URL(
    "../../../scenarios/activity-boundary-message/process.bpmn",
    import.meta.url,
  ),
  "utf8",
);

function compile(bytes: string) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(bytes),
    sourceId: "activity-boundary-message-test",
    expectedSha256: undefined,
    semanticProfile: profile,
    sourceOverlay: null,
    limits,
  });
}

const channel = Object.freeze({
  kind: MessageChannelKind.OperationMessage,
  interfaceId: "Interface_ApplicationMessages",
  interfaceOperationId: "Operation_ReceiveApplicationWithdrawal",
  messageId: "Message_ApplicationWithdrawal",
});

test("lowers one Message-bounded User Task with distinct normal and boundary routes", async () => {
  const result = await compile(source);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  assert.deepEqual(
    result.checkedProcess.nodes.find(({ id }) => id === "Withdrawal"),
    {
      kind: CheckedNodeKind.MessageBoundaryEvent,
      id: "Withdrawal",
      attachedToRef: "ReviewApplication",
      interruption: "interrupting",
      channel,
      outputFlowId: "Flow_Boundary",
    },
  );
  assert.deepEqual(
    result.semanticProcess.operations.filter(
      ({ kind }) => kind === SemanticOperationKind.AwaitMessageBoundedUserTask,
    ),
    [{
      id: "operation:ReviewApplication",
      kind: SemanticOperationKind.AwaitMessageBoundedUserTask,
      origin: { kind: "bpmnElement", elementId: "ReviewApplication" },
      input: "place:Flow_Start",
      task: {
        elementId: "ReviewApplication",
        name: "Review application",
        output: "place:Flow_Normal",
      },
      boundaryMessage: {
        elementId: "Withdrawal",
        channel,
        output: "place:Flow_Boundary",
        origin: {
          kind: "bpmnSequenceFlow",
          elementId: "Flow_Boundary",
        },
      },
    }],
  );
  assert.equal(
    result.semanticProcess.operations.some(
      ({ id }) => id === "operation:Withdrawal",
    ),
    false,
  );
});

test("binds the compiler output to the checked-process schema only as a node", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const schema = JSON.parse(await readFile(
    new URL(
      "../../../contracts/schemas/checked-process.schema.json",
      import.meta.url,
    ),
    "utf8",
  )) as Record<string, unknown> & { $defs: Record<string, unknown> };
  const ajv = new Ajv2020({ strict: true });
  const validateProcess = ajv.compile(schema);
  const validateMappingExpression = ajv.compile({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: schema.$defs,
    $ref: "#/$defs/mappingExpression",
  });
  const handler = result.checkedProcess.nodes.find(
    ({ kind }) => kind === CheckedNodeKind.MessageBoundaryEvent,
  );
  assert.ok(handler !== undefined);
  assert.equal(
    validateProcess(result.checkedProcess),
    true,
    JSON.stringify(validateProcess.errors),
  );
  assert.equal(validateMappingExpression(handler), false);
});

test("derives the exact OperationMessage channel from resolved definition references", async () => {
  const renamed = source
    .replaceAll("Interface_ApplicationMessages", "Interface_Renamed")
    .replaceAll(
      "Operation_ReceiveApplicationWithdrawal",
      "Operation_ReceiveRenamedWithdrawal",
    )
    .replaceAll("Message_ApplicationWithdrawal", "Message_RenamedWithdrawal");
  const result = await compile(renamed);

  assert.equal(result.status, BpmnCompilationStatus.Accepted);
  if (result.status !== BpmnCompilationStatus.Accepted) {
    return;
  }
  const operation = result.semanticProcess.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitMessageBoundedUserTask,
  );
  assert.ok(operation !== undefined);
  if (operation?.kind !== SemanticOperationKind.AwaitMessageBoundedUserTask) {
    return;
  }
  assert.deepEqual(operation.boundaryMessage.channel, {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_Renamed",
    interfaceOperationId: "Operation_ReceiveRenamedWithdrawal",
    messageId: "Message_RenamedWithdrawal",
  });
});

test("refuses every explicit cancelActivity lexeme", async () => {
  const attached = 'attachedToRef="ReviewApplication"';
  for (const lexeme of ["true", "false"] as const) {
    const result = await compile(
      source.replace(attached, `${attached} cancelActivity="${lexeme}"`),
    );
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});

test("refuses a mismatched Message and Operation chain", async () => {
  const mismatched = source
    .replace(
      "  <bpmn:process id=",
      [
        '  <bpmn:message id="Message_Other" name="Other message"/>',
        '  <bpmn:interface id="Interface_Other" name="Other messages">',
        '    <bpmn:operation id="Operation_ReceiveOther" name="Receive other">',
        "      <bpmn:inMessageRef>Message_Other</bpmn:inMessageRef>",
        "    </bpmn:operation>",
        "  </bpmn:interface>",
        "  <bpmn:process id=",
      ].join("\n"),
    )
    .replace(
      "<bpmn:operationRef>Operation_ReceiveApplicationWithdrawal</bpmn:operationRef>",
      "<bpmn:operationRef>Operation_ReceiveOther</bpmn:operationRef>",
    );
  assert.notEqual(mismatched, source);

  const result = await compile(mismatched);

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

test("refuses a topology that arms the Message handler after a follow-on task", async () => {
  const reordered = source
    .replace(
      [
        '    <bpmn:userTask id="ReviewApplication" name="Review application">',
        "      <bpmn:incoming>Flow_Start</bpmn:incoming>",
        "      <bpmn:outgoing>Flow_Normal</bpmn:outgoing>",
      ].join("\n"),
      [
        '    <bpmn:userTask id="ReviewApplication" name="Review application">',
        "      <bpmn:incoming>Flow_Normal</bpmn:incoming>",
        "      <bpmn:outgoing>Flow_Normal_End</bpmn:outgoing>",
      ].join("\n"),
    )
    .replace(
      [
        '    <bpmn:userTask id="RecordReviewCompletion" name="Record review completion">',
        "      <bpmn:incoming>Flow_Normal</bpmn:incoming>",
        "      <bpmn:outgoing>Flow_Normal_End</bpmn:outgoing>",
      ].join("\n"),
      [
        '    <bpmn:userTask id="RecordReviewCompletion" name="Record review completion">',
        "      <bpmn:incoming>Flow_Start</bpmn:incoming>",
        "      <bpmn:outgoing>Flow_Normal</bpmn:outgoing>",
      ].join("\n"),
    )
    .replace(
      '    <bpmn:sequenceFlow id="Flow_Start" sourceRef="Start" targetRef="ReviewApplication"/>',
      '    <bpmn:sequenceFlow id="Flow_Start" sourceRef="Start" targetRef="RecordReviewCompletion"/>',
    )
    .replace(
      '    <bpmn:sequenceFlow id="Flow_Normal" sourceRef="ReviewApplication" targetRef="RecordReviewCompletion"/>',
      '    <bpmn:sequenceFlow id="Flow_Normal" sourceRef="RecordReviewCompletion" targetRef="ReviewApplication"/>',
    )
    .replace(
      '    <bpmn:sequenceFlow id="Flow_Normal_End" sourceRef="RecordReviewCompletion" targetRef="NormalEnd"/>',
      '    <bpmn:sequenceFlow id="Flow_Normal_End" sourceRef="ReviewApplication" targetRef="NormalEnd"/>',
    );
  assert.notEqual(reordered, source);

  const result = await compile(reordered);

  assert.equal(result.status, BpmnCompilationStatus.Rejected);
});

test("refuses payload, misattachment, and additional boundary handlers", async () => {
  const payloadBearing = source.replace(
    '  <bpmn:message id="Message_ApplicationWithdrawal" name="Application withdrawal"/>',
    [
      '  <bpmn:itemDefinition id="Item_Withdrawal" structureRef="bpmn:tBaseElement"/>',
      '  <bpmn:message id="Message_ApplicationWithdrawal" name="Application withdrawal" itemRef="Item_Withdrawal"/>',
    ].join("\n"),
  );
  const wrongAttachment = source.replace(
    'attachedToRef="ReviewApplication"',
    'attachedToRef="NormalEnd"',
  );
  const extraHandler = source.replace(
    "    <bpmn:userTask id=\"RecordReviewCompletion\"",
    [
      '    <bpmn:boundaryEvent id="ExtraWithdrawal" attachedToRef="ReviewApplication">',
      "      <bpmn:outgoing>Flow_ExtraBoundary</bpmn:outgoing>",
      '      <bpmn:messageEventDefinition id="MessageEventDefinition_ExtraWithdrawal" messageRef="Message_ApplicationWithdrawal">',
      "        <bpmn:operationRef>Operation_ReceiveApplicationWithdrawal</bpmn:operationRef>",
      "      </bpmn:messageEventDefinition>",
      "    </bpmn:boundaryEvent>",
      '    <bpmn:userTask id="HandleExtraWithdrawal" name="Handle extra withdrawal">',
      "      <bpmn:incoming>Flow_ExtraBoundary</bpmn:incoming>",
      "      <bpmn:outgoing>Flow_ExtraBoundary_End</bpmn:outgoing>",
      "    </bpmn:userTask>",
      '    <bpmn:endEvent id="ExtraBoundaryEnd">',
      "      <bpmn:incoming>Flow_ExtraBoundary_End</bpmn:incoming>",
      "    </bpmn:endEvent>",
      '    <bpmn:userTask id="RecordReviewCompletion"',
    ].join("\n"),
  ).replace(
    "    <bpmn:sequenceFlow id=\"Flow_Start\"",
    [
      '    <bpmn:sequenceFlow id="Flow_ExtraBoundary" sourceRef="ExtraWithdrawal" targetRef="HandleExtraWithdrawal"/>',
      '    <bpmn:sequenceFlow id="Flow_ExtraBoundary_End" sourceRef="HandleExtraWithdrawal" targetRef="ExtraBoundaryEnd"/>',
      '    <bpmn:sequenceFlow id="Flow_Start"',
    ].join("\n"),
  );

  for (const mutation of [payloadBearing, wrongAttachment, extraHandler]) {
    assert.notEqual(mutation, source);
    const result = await compile(mutation);
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  }
});
