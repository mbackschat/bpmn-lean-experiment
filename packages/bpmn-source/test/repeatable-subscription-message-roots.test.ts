import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnModdle } from "bpmn-moddle";

import { SemanticProfileId } from "@bpmn-lean/semantic-core";
const { selectRootDefinitions } = await import(
  new URL("../dist/root-definition-selection.js", import.meta.url).href
) as typeof import("../src/root-definition-selection.ts");
const { resolveOperationMessageEventDefinition } = await import(
  new URL("../dist/operation-message-event-definition-source.js", import.meta.url).href
) as typeof import("../src/operation-message-event-definition-source.ts");
const { projectReceiveTask } = await import(
  new URL("../dist/receive-task-source.js", import.meta.url).href
) as typeof import("../src/receive-task-source.ts");

const profile = "bpmn-2.0.2-repeatable-event-subscriptions-draft";

function record(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

async function parse(extraRoots = "") {
  const source = await readFile(new URL(
    "fixtures/repeatable-event-subscriptions/catch-message.bpmn", import.meta.url,
  ), "utf8");
  const xml = source.replace(
    /<bpmn:userTask id="IndependentAudit"[^>]*>([\s\S]*?)<\/bpmn:userTask>/u,
    '<bpmn:receiveTask id="IndependentAudit" name="Receive audit response" messageRef="ApplicationReminder">$1</bpmn:receiveTask>',
  ).replace("</bpmn:definitions>", `${extraRoots}</bpmn:definitions>`);
  const parsed = record(await new BpmnModdle().fromXML(xml));
  assert.deepEqual(parsed.warnings, []);
  const rootElements = record(parsed.rootElement).rootElements;
  assert.ok(Array.isArray(rootElements));
  return { rootElements, elementsById: record(parsed.elementsById) };
}

function select(parsed: Awaited<ReturnType<typeof parse>>, semanticProfile = profile) {
  return selectRootDefinitions(parsed.rootElements, semanticProfile,
    { segments: ["definitions", "rootElements"] }).selection;
}

test("one Message definition can address both a catch and a Receive Task", async () => {
  const parsed = await parse();
  const selection = select(parsed);
  assert.ok(selection);
  assert.deepEqual(resolveOperationMessageEventDefinition(
    record(parsed.elementsById.UserTask_Sibling), selection.messageArtifacts,
  ), { kind: "operationMessage", messageId: "ApplicationReminder",
    interfaceId: "ApplicationMessages", interfaceOperationId: "ReceiveReminder" });
  assert.deepEqual(projectReceiveTask(
    record(parsed.elementsById.IndependentAudit), "IndependentAudit", selection.messageArtifacts,
  ), { kind: "receiveTask", id: "IndependentAudit",
    channel: { kind: "directMessage", messageId: "ApplicationReminder" } });
});

test("distinct Message and operation chains resolve by exact references", async () => {
  const parsed = await parse(`<bpmn:message id="OtherMessage" name="Other"/>
    <bpmn:interface id="OtherInterface" name="Other">
      <bpmn:operation id="OtherOperation" name="Other"><bpmn:inMessageRef>OtherMessage</bpmn:inMessageRef></bpmn:operation>
    </bpmn:interface>`);
  const selection = select(parsed);
  assert.ok(selection);
  const event = record(parsed.elementsById.UserTask_Sibling);
  assert.ok(Array.isArray(event.eventDefinitions));
  const definition = record(event.eventDefinitions[0]);
  definition.messageRef = parsed.elementsById.OtherMessage;
  assert.equal(resolveOperationMessageEventDefinition(event, selection.messageArtifacts), undefined);
  definition.operationRef = parsed.elementsById.OtherOperation;
  assert.deepEqual(resolveOperationMessageEventDefinition(event, selection.messageArtifacts), {
    kind: "operationMessage", messageId: "OtherMessage", interfaceId: "OtherInterface",
    interfaceOperationId: "OtherOperation",
  });
  record(parsed.elementsById.IndependentAudit).messageRef = parsed.elementsById.OtherMessage;
  assert.equal(projectReceiveTask(record(parsed.elementsById.IndependentAudit), "IndependentAudit",
    selection.messageArtifacts)?.channel.messageId, "OtherMessage");
});

test("additional Message roots retain legacy profile refusal", async () => {
  const parsed = await parse('<bpmn:message id="OtherMessage" name="Other"/>');
  assert.ok(select(parsed));
  assert.equal(select(parsed, SemanticProfileId.IntermediateCatchMessage), undefined);
  assert.equal(select(parsed, SemanticProfileId.MessageAddressedReceiveTask), undefined);
});

test("subscription roots reject unselected artifacts and output Messages", async () => {
  const extra = await parse('<bpmn:error id="Error" errorCode="NO"/>');
  assert.equal(select(extra), undefined);
  const parsed = await parse();
  record(parsed.elementsById.ReceiveReminder).outMessageRef = parsed.elementsById.ApplicationReminder;
  assert.equal(select(parsed), undefined);
});
