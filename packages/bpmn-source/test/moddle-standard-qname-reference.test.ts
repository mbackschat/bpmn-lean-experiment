import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findModdleElement,
  importCompiledBpmnGraph,
  moddleElement,
  moddleElements,
} from "./compiled-moddle-graph.ts";

const source = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  id="Definitions_QNameReferences"
  targetNamespace="https://bpmn-lean.org/test/qname-references">
  <bpmn:message id="Message_Notice" />
  <bpmn:interface id="Interface_Notices" name="Notices">
    <bpmn:operation id="Operation_ReceiveNotice" name="Receive notice">
      <bpmn:inMessageRef>Message_Notice</bpmn:inMessageRef>
    </bpmn:operation>
  </bpmn:interface>
  <bpmn:process id="Process_Notices" isExecutable="true">
    <bpmn:startEvent id="Start" />
  </bpmn:process>
  <bpmn:collaboration id="Collaboration_Notices">
    <bpmn:participant id="Participant_Sender" />
    <bpmn:participant id="Participant_Receiver" processRef="Process_Notices" />
    <bpmn:messageFlow
      id="MessageFlow_Notice"
      sourceRef="Participant_Sender"
      targetRef="Participant_Receiver"
      messageRef="Message_Notice" />
    <bpmn:conversation id="Conversation_Notices">
      <bpmn:participantRef>Participant_Sender</bpmn:participantRef>
      <bpmn:participantRef>Participant_Receiver</bpmn:participantRef>
      <bpmn:messageFlowRef>MessageFlow_Notice</bpmn:messageFlowRef>
    </bpmn:conversation>
  </bpmn:collaboration>
  <bpmn:messageEventDefinition
    id="MessageEventDefinition_Notice"
    messageRef="Message_Notice">
    <bpmn:operationRef>Operation_ReceiveNotice</bpmn:operationRef>
  </bpmn:messageEventDefinition>
</bpmn:definitions>`;

test("resolves schema-defined child QName references by parser-graph identity", async () => {
  const imported = await importCompiledBpmnGraph(source, 1_000);
  assert.deepEqual(imported.warnings, []);

  const definitions = moddleElement(imported.rootElement, "definitions");
  const rootElements = moddleElements(definitions, "rootElements");
  const message = findModdleElement(rootElements, "id", "Message_Notice");
  const operation = findModdleElement(
    moddleElements(
      findModdleElement(rootElements, "id", "Interface_Notices"),
      "operations",
    ),
    "id",
    "Operation_ReceiveNotice",
  );
  const eventDefinition = findModdleElement(
    rootElements,
    "id",
    "MessageEventDefinition_Notice",
  );
  const collaboration = findModdleElement(
    rootElements,
    "id",
    "Collaboration_Notices",
  );
  const messageFlow = findModdleElement(
    moddleElements(collaboration, "messageFlows"),
    "id",
    "MessageFlow_Notice",
  );
  const conversation = findModdleElement(
    moddleElements(collaboration, "conversations"),
    "id",
    "Conversation_Notices",
  );

  assert.equal(operation["inMessageRef"], message);
  assert.equal(eventDefinition["operationRef"], operation);
  assert.deepEqual(conversation["messageFlowRef"], [messageFlow]);
});
