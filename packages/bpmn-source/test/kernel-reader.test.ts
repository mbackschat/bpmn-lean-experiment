/** Locks the BPMN-to-kernel-IL reader's boundary: it reads every BPMN fact and refuses only what it cannot read. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram, ReadRefusalCode } from "@bpmn-lean/bpmn-source";
import type { KernelJson, KernelRead } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

const camunda = "http://camunda.org/schema/1.0/bpmn";

function model(body: string, roots = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="${camunda}" id="D" targetNamespace="urn:t">
${roots}<bpmn:process id="P" isExecutable="true">${body}</bpmn:process></bpmn:definitions>`;
}

const read = (xml: string, profile = "any-profile"): Promise<KernelRead> => readKernelProgram({
  bytes: new TextEncoder().encode(xml),
  overlay: null,
  profile,
  limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
}, kernelProfileOptions([]));

async function program(xml: string): Promise<Json> {
  const result = await read(xml);
  assert.equal(result.kind, "read", JSON.stringify(result));
  return (result as Extract<KernelRead, { kind: "read" }>).program as Json;
}

async function refusal(xml: string): Promise<string> {
  const result = await read(xml);
  assert.equal(result.kind, "refused", JSON.stringify(result));
  return (result as Extract<KernelRead, { kind: "refused" }>).code;
}

const element = (p: Json, id: string): Json => {
  const found = p.elements.find((entry: Json) => (Object.values(entry)[0] as Json).header.id === id);
  assert.ok(found, `element ${id}`);
  return found;
};

test("an exclusive gateway keeps document order of its candidates, an inclusive one id order", async () => {
  const p = await program(model(`<bpmn:startEvent id="S"/>
    <bpmn:exclusiveGateway id="X" default="z"/><bpmn:inclusiveGateway id="I"/><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="s" sourceRef="S" targetRef="X"/>
    <bpmn:sequenceFlow id="b" sourceRef="X" targetRef="I"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">isPresent(a)</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="a" sourceRef="X" targetRef="I"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">isNull(a)</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="z" sourceRef="X" targetRef="I"/>
    <bpmn:sequenceFlow id="q" sourceRef="I" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">true</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="p" sourceRef="I" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">false</bpmn:conditionExpression></bpmn:sequenceFlow>`));
  const exclusive = element(p, "X").gateway.payload.kind.exclusive;
  assert.deepEqual(exclusive.candidates.map((entry: Json) => entry.flow), ["b", "a"]);
  assert.equal(exclusive.default, "z");
  assert.deepEqual(element(p, "I").gateway.payload.kind.inclusive.candidates.map((entry: Json) => entry.flow), ["p", "q"]);
});

test("every User Task assignment and date attribute the BPMN sets is populated", async () => {
  const p = await program(model(`<bpmn:userTask id="U" name="N" camunda:assignee="\${who}" camunda:candidateUsers="a, b" camunda:candidateGroups="g"
    camunda:formKey="form" camunda:dueDate="2030-01-01" camunda:followUpDate="\${later}" camunda:priority="7"/>`));
  assert.deepEqual(element(p, "U").activity.payload.work.user.payload, {
    name: "N",
    assignee: { expression: { body: { variable: { name: "who" } } } },
    candidateUsers: [{ literal: { value: "a" } }, { literal: { value: "b" } }],
    candidateGroups: [{ literal: { value: "g" } }],
    formKey: "form",
    formFields: [],
    dueDate: { literal: { value: "2030-01-01" } },
    followUpDate: { expression: { body: { variable: { name: "later" } } } },
    priority: { literal: { value: "7" } },
  });
});

test("error and escalation variables are read from their event definitions", async () => {
  const p = await program(model(`<bpmn:task id="T"/><bpmn:boundaryEvent id="B" attachedToRef="T">
      <bpmn:errorEventDefinition errorRef="Err" camunda:errorCodeVariable="c" camunda:errorMessageVariable="m"/></bpmn:boundaryEvent>
    <bpmn:boundaryEvent id="C" attachedToRef="T" cancelActivity="false">
      <bpmn:escalationEventDefinition escalationRef="Esc" camunda:escalationCodeVariable="v"/></bpmn:boundaryEvent>`,
  `<bpmn:error id="Err" errorCode="E1"/><bpmn:escalation id="Esc" escalationCode="X1"/>`));
  const [error, escalation] = element(p, "T").activity.payload.envelope.boundaries as Json[];
  assert.deepEqual(error?.subscription.trigger.error.payload, { code: "E1", codeVariable: "c", messageVariable: "m" });
  assert.deepEqual(escalation?.subscription.trigger.escalation.payload, { code: "X1", codeVariable: "v" });
  assert.equal(escalation?.interrupting, false);
});

test("semantic choices are emitted in full shape and left to Kernel.Admission", async () => {
  const eventSubProcess = await program(model(`<bpmn:startEvent id="S"/><bpmn:subProcess id="ESP" triggeredByEvent="true">
    <bpmn:startEvent id="ES"><bpmn:messageEventDefinition messageRef="M"/></bpmn:startEvent><bpmn:endEvent id="EE"/>
    <bpmn:sequenceFlow id="ef" sourceRef="ES" targetRef="EE"/></bpmn:subProcess>`, `<bpmn:message id="M"/>`));
  const kind = element(eventSubProcess, "ESP").scope.payload.kind.eventSubProcess;
  assert.equal(kind.interrupting, true);
  assert.deepEqual(kind.start.trigger.message.payload.name, { literal: { value: "M" } });
  assert.ok(element(eventSubProcess, "ES").start.payload.subscription);

  const foreignCondition = await program(model(`<bpmn:exclusiveGateway id="X"/><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="f" sourceRef="X" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\${a &gt; 1}</bpmn:conditionExpression></bpmn:sequenceFlow>`));
  assert.deepEqual(element(foreignCondition, "X").gateway.payload.kind.exclusive.candidates[0].condition, {
    foreign: { language: "http://www.w3.org/1999/XPath", source: "${a > 1}" },
  });

  const compensationInput = await program(model(`<bpmn:property id="Prop"/><bpmn:userTask id="U"/>
    <bpmn:boundaryEvent id="B" attachedToRef="U"><bpmn:compensateEventDefinition/></bpmn:boundaryEvent>
    <bpmn:serviceTask id="H" isForCompensation="true"><bpmn:ioSpecification><bpmn:dataInput id="I"/><bpmn:inputSet/></bpmn:ioSpecification>
      <bpmn:dataInputAssociation><bpmn:sourceRef>Prop</bpmn:sourceRef><bpmn:targetRef>I</bpmn:targetRef></bpmn:dataInputAssociation></bpmn:serviceTask>
    <bpmn:association id="A" sourceRef="B" targetRef="H"/>`));
  assert.equal(element(compensationInput, "U").activity.payload.envelope.compensationHandler, "H");
  assert.deepEqual(element(compensationInput, "H").activity.payload.envelope.inputs, [{ target: "I", source: { variable: { name: "Prop" } } }]);
});

test("a Send Task without an implementation is read as Send work, a declared one as an effect", async () => {
  const p = await program(model(`<bpmn:sendTask id="Plain" messageRef="M"/><bpmn:sendTask id="Delegate" camunda:delegateExpression="\${d}"/>`, `<bpmn:message id="M"/>`));
  assert.deepEqual(element(p, "Plain").activity.payload.work, { send: { payload: { binding: "M", recipient: null, correlation: [] } } });
  assert.equal(element(p, "Plain").activity.header.sourceType, "sendTask");
  assert.deepEqual(element(p, "Delegate").activity.payload.work, { service: { payload: { protocol: "##WebService", operation: "${d}" } } });
});

test("an unknown element, foreign attribute or unsafe source is refused with a stable code", async () => {
  assert.equal(await refusal(model(`<bpmn:complexGateway id="G"/>`)), ReadRefusalCode.UnknownElement);
  assert.equal(await refusal(`<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:x="urn:x" id="D" targetNamespace="urn:t"><bpmn:process id="P"><bpmn:task id="T" x:a="1"/></bpmn:process></bpmn:definitions>`), ReadRefusalCode.UnknownAttribute);
  assert.equal(await refusal(model(`<bpmn:unknownThing id="T"/>`)), ReadRefusalCode.ParserWarning);
  assert.equal(await refusal(model(`<bpmn:boundaryEvent id="B" cancelActivity="1"/>`)), ReadRefusalCode.SourceAmbiguousBoolean);
  assert.equal(await refusal(`<!DOCTYPE x><a/>`), ReadRefusalCode.SourceDoctype);
  assert.equal(await refusal(model(`<bpmn:task id="T"><bpmn:standardLoopCharacteristics/></bpmn:task>`)), ReadRefusalCode.StandardLoop);
});

test("CIB attributes the IL has no field for are reported, never dropped silently", async () => {
  const result = await read(model(`<bpmn:serviceTask id="T" camunda:delegateExpression="\${x}" camunda:asyncBefore="true"/>`));
  assert.equal(result.kind, "read");
  assert.deepEqual((result as Extract<KernelRead, { kind: "read" }>).notCarried, [{ element: "T", fact: "camunda:asyncBefore" }]);
});

test("source facts on flows and scopes the IL cannot hold yet are reported, never dropped silently", async () => {
  const result = await read(model(`<bpmn:task id="T" default="d"/><bpmn:transaction id="Tx" method="##Image"/><bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="c" sourceRef="T" targetRef="E"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">true</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="d" sourceRef="T" targetRef="E"/>`));
  assert.equal(result.kind, "read", JSON.stringify(result));
  assert.deepEqual((result as Extract<KernelRead, { kind: "read" }>).notCarried, [
    { element: "c", fact: "conditionExpression on a non-gateway source" },
    { element: "T", fact: "default" },
    { element: "Tx", fact: "method" },
  ]);
});

test("a Multi-Instance loop without a count and a conditional Event without a condition have no IL shape", async () => {
  assert.equal(await refusal(model(`<bpmn:userTask id="U"><bpmn:multiInstanceLoopCharacteristics/></bpmn:userTask>`)), ReadRefusalCode.MultiInstanceWithoutCount);
  assert.equal(await refusal(model(`<bpmn:intermediateCatchEvent id="C"><bpmn:conditionalEventDefinition/></bpmn:intermediateCatchEvent>`)), ReadRefusalCode.ConditionWithoutExpression);
});

test("the reader does not depend on the profile: only the program's identity changes", async () => {
  const xml = model(`<bpmn:userTask id="U"/>`);
  const left = await read(xml, "profile-a") as Extract<KernelRead, { kind: "read" }>;
  const right = await read(xml, "profile-b") as Extract<KernelRead, { kind: "read" }>;
  const withoutProfile = (program: KernelJson): Json => ({ ...(program as Json), identity: { ...(program as Json).identity, profile: "" } });
  assert.deepEqual(withoutProfile(left.program), withoutProfile(right.program));
});

test("the reader imports nothing from semantic-core", async () => {
  const directory = new URL("../src/kernel-reader/", import.meta.url);
  for (const name of await readdir(directory)) {
    const source = await readFile(new URL(name, directory), "utf8");
    assert.doesNotMatch(source, /@bpmn-lean\/semantic-core/u, name);
  }
});
