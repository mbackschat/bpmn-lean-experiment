import assert from "node:assert/strict";
import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { isWellFormedSemanticProcessProgram, SemanticProfileId } from "@bpmn-lean/semantic-core";

const source = await readFile(
  new URL("./fixtures/application-review-withdrawal.bpmn", import.meta.url),
  "utf8",
);
const profile = "bpmn-2.0.2-interrupting-message-event-subprocess-draft";

function compile(xml: string, semanticProfile = profile) {
  return compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(xml),
    sourceId: "application-review-withdrawal",
    expectedSha256: undefined,
    semanticProfile,
    sourceOverlay: null,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
}

for (const [label, xml] of [
  ["default interruption", source],
  ["explicit interruption", source.replace(
    '<bpmn:startEvent id="Start_Withdrawal">',
    '<bpmn:startEvent id="Start_Withdrawal" isInterrupting="true">',
  )],
  ["absent display names", source.replace(/ name="[^"]*"/g, "")],
] as const) {
  test(`admits parallel application checks and a dormant withdrawal handler with ${label}`, async () => {
    const result = await compile(xml);
    assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
    assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
    assert.deepEqual(result.checkedProcess.interruptingMessageEventSubProcesses, [{
      parentScopeId: "scope:Process_ApplicationReview", handlerScopeId: "scope:Handler_Withdrawal",
      elementId: "Handler_Withdrawal", startEventId: "Start_Withdrawal", interruption: "interrupting",
      channel: { kind: "operationMessage", messageId: "Message_Withdrawal", interfaceId: "Interface_Applications", interfaceOperationId: "Operation_Withdraw" },
      childEntryFlowId: "Flow_Withdrawal_Task",
    }]);
    assert.deepEqual(result.semanticProcess.interruptingMessageEventSubProcesses, [{
      parentScopeId: "scope:Process_ApplicationReview",
      handlerScopeId: "scope:Handler_Withdrawal",
      elementId: "Handler_Withdrawal",
      startEventId: "Start_Withdrawal",
      channel: {
        kind: "operationMessage",
        messageId: "Message_Withdrawal",
        interfaceId: "Interface_Applications",
        interfaceOperationId: "Operation_Withdraw",
      },
      childEntry: "place:Flow_Withdrawal_Task",
    }]);
    assert.deepEqual(result.semanticProcess.operations.filter(({ origin }) => origin.elementId === "Handler_Withdrawal"), [{
      id: "operation:complete-event-subprocess:scope:Handler_Withdrawal", kind: "completeEventSubProcess",
      origin: { kind: "bpmnElement", elementId: "Handler_Withdrawal" }, scopeId: "scope:Handler_Withdrawal",
    }]);
    assert.ok(result.semanticProcess.operationScopes.some(({ operationId, scopeId }) =>
      operationId === "operation:complete-event-subprocess:scope:Handler_Withdrawal" && scopeId === "scope:Handler_Withdrawal"));
    assert.ok(result.semanticProcess.controlPlaceScopes.some(({ controlPlaceId, scopeId }) =>
      controlPlaceId === "place:Flow_Withdrawal_Task" && scopeId === "scope:Handler_Withdrawal"));
    assert.ok(!result.semanticProcess.operations.some(({ kind }) => String(kind) === "enterScope"));
    assert.ok(!result.semanticProcess.operations.some(({ origin }) => origin.elementId === "Start_Withdrawal"));
  });
}

test("Message Event Sub-Process admission follows globally renamed identities", async () => {
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]!);
  const names = new Map(ids.map((id, index) => [id, `Renamed_${index}`]));
  const xml = source.replace(new RegExp(ids.sort((a, b) => b.length - a.length).join("|"), "g"), (id) => names.get(id)!);
  const result = await compile(xml);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  assert.equal(isWellFormedSemanticProcessProgram(result.semanticProcess), true);
});

for (const [label, before, after] of [
  ["non-interrupting handler", 'id="Start_Withdrawal">', 'id="Start_Withdrawal" isInterrupting="false">'],
  ["lossy interruption lexeme", 'id="Start_Withdrawal">', 'id="Start_Withdrawal" isInterrupting="1">'],
  ["lossy event-trigger lexeme", 'triggeredByEvent="true"', 'triggeredByEvent="1"'],
  ["missing event trigger", ' triggeredByEvent="true"', ''],
  ["ordinary subprocess", 'triggeredByEvent="true"', 'triggeredByEvent="false"'],
  ["parent flow enters handler", 'targetRef="Task_Documents"', 'targetRef="Handler_Withdrawal"'],
  ["parent flow leaves handler", 'sourceRef="Task_Documents"', 'sourceRef="Handler_Withdrawal"'],
  ["child flow escapes scope", 'targetRef="Task_Withdrawal"', 'targetRef="Task_Documents"'],
  ["handler has an extra Start", '<bpmn:userTask id="Task_Withdrawal"', '<bpmn:startEvent id="Start_Extra" /><bpmn:userTask id="Task_Withdrawal"'],
  ["handler uses a Timer trigger", '<bpmn:messageEventDefinition id="Definition_Withdrawal" messageRef="Message_Withdrawal" operationRef="Operation_Withdraw" />', '<bpmn:timerEventDefinition id="Definition_Withdrawal"><bpmn:timeDuration>PT1S</bpmn:timeDuration></bpmn:timerEventDefinition>'],
  ["extra Message definition", '<bpmn:messageEventDefinition id="Definition_Withdrawal"', '<bpmn:messageEventDefinition id="Definition_Extra" messageRef="Message_Withdrawal" operationRef="Operation_Withdraw" /><bpmn:messageEventDefinition id="Definition_Withdrawal"'],
  ["Process Property", '<bpmn:startEvent id="Start_Application"', '<bpmn:property id="Request" /><bpmn:startEvent id="Start_Application"'],
  ["handler boundary", '<bpmn:endEvent id="End_Documents" />', '<bpmn:endEvent id="End_Documents" /><bpmn:boundaryEvent id="Boundary_Unsupported" attachedToRef="Handler_Withdrawal" />'],
  ["payload Message", '<bpmn:message id="Message_Withdrawal"', '<bpmn:itemDefinition id="Item_Unsupported" /><bpmn:message itemRef="Item_Unsupported" id="Message_Withdrawal"'],
  ["unresolved Message identity", 'messageRef="Message_Withdrawal"', 'messageRef="Message_Missing"'],
  ["unresolved Operation identity", 'operationRef="Operation_Withdraw"', 'operationRef="Operation_Missing"'],
] as const) {
  test(`Message Event Sub-Process admission refuses ${label}`, async () => {
    const xml = source.replace(before, after);
    assert.notEqual(xml, source);
    const result = await compile(xml);
    assert.equal(result.status, BpmnCompilationStatus.Rejected);
  });
}


test("declaration order does not alter checked ownership or lowering", async () => {
  const handler = source.match(/    <bpmn:subProcess[\s\S]*?<\/bpmn:subProcess>/)![0];
  const process = source.match(/  <bpmn:process[^>]*>([\s\S]*?)  <\/bpmn:process>/)![1]!;
  const ordinary = process.replace(handler, "").trim().split("\n").reverse().join("\n");
  const message = source.match(/  <bpmn:message[^>]*\/>/)![0];
  const interface_ = source.match(/  <bpmn:interface[\s\S]*?<\/bpmn:interface>/)![0];
  const reordered = source.replace(process, `\n${handler}\n${ordinary}\n`).replace(`${message}\n${interface_}`, `${interface_}\n${message}`);
  assert.notEqual(reordered, source);
  const baseline = await compile(source);
  const changed = await compile(reordered);
  assert.equal(baseline.status, BpmnCompilationStatus.Accepted);
  assert.equal(changed.status, BpmnCompilationStatus.Accepted, JSON.stringify(changed.diagnostics));
  assert.deepEqual({ ...changed.checkedProcess, identity: baseline.checkedProcess.identity }, baseline.checkedProcess);
  assert.deepEqual({ ...changed.semanticProcess, identity: baseline.semanticProcess.identity }, baseline.semanticProcess);
});

for (const predecessor of [SemanticProfileId.MessageStart, SemanticProfileId.EmbeddedSubProcessCompletion, SemanticProfileId.RepeatableEventSubscriptions]) {
  test(`Message handler does not broaden predecessor ${predecessor}`, async () => {
    assert.equal((await compile(source, predecessor)).status, BpmnCompilationStatus.Rejected);
  });
}


test("Message handler checked and Program declarations satisfy their strict schemas", async () => {
  const result = await compile(source);
  assert.equal(result.status, BpmnCompilationStatus.Accepted, JSON.stringify(result.diagnostics));
  for (const [filename, value] of [["checked-process", result.checkedProcess], ["semantic-process", result.semanticProcess]] as const) {
    const schema = JSON.parse(await readFile(new URL(`../../../contracts/schemas/${filename}.schema.json`, import.meta.url), "utf8"));
    const validate = new Ajv2020({ strict: true }).compile(schema);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    assert.equal(validate({ ...value, interruptingMessageEventSubProcesses: [{ ...value.interruptingMessageEventSubProcesses?.[0], ignored: true }] }), false);
    const { channel: _channel, ...withoutChannel } = value.interruptingMessageEventSubProcesses![0]!;
    assert.equal(validate({ ...value, interruptingMessageEventSubProcesses: [withoutChannel] }), false);
    if ("operations" in value) {
      assert.equal(validate({ ...value, operations: value.operations.map((operation) => operation.kind === "completeEventSubProcess"
        ? { ...operation, parentOutput: null } : operation) }), false);
    }
  }
});
