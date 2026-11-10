/**
 * The reader's interchange forms (PC-BASIC-04, [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#interchange-forms-and-diagnostics-pc-basic-04)):
 * QName references, referenced event definitions, the source facts pinned CIB erases, and the `source.schema`
 * invariant on the reader's path. The pinned CIB Seven `2.2.0` parser bounds each case; the line it cites settles it.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelRead } from "@bpmn-lean/bpmn-source";

const bpmn = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const target = "urn:t";

function model(body: string, roots = "", namespaces = `xmlns:tns="${target}"`, process = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${bpmn}" ${namespaces} id="D" targetNamespace="${target}">
${roots}<bpmn:process id="P" isExecutable="true" ${process}>${body}</bpmn:process></bpmn:definitions>`;
}

const read = (xml: string): Promise<KernelRead> => readKernelProgram({
  bytes: new TextEncoder().encode(xml),
  overlay: null,
  profile: "any-profile",
  limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
}, kernelProfileOptions([]));

async function refused(xml: string, code: string, evidence?: string): Promise<void> {
  const result = await read(xml);
  assert.ok(result.kind === "refused", JSON.stringify(result));
  assert.equal(result.code, code, result.evidence);
  if (evidence !== undefined) assert.ok(result.evidence.includes(evidence), result.evidence);
}

async function admitted(xml: string): Promise<string> {
  const result = await read(xml);
  assert.ok(result.kind === "read", JSON.stringify(result));
  return JSON.stringify(result.program);
}

const witness = (name: string): Promise<string> =>
  readFile(new URL(`../../../scenarios/open-rows/event-reference-forms/${name}.bpmn`, import.meta.url), "utf8");

const catching = (definition: string): string =>
  `<bpmn:intermediateCatchEvent id="C">${definition}</bpmn:intermediateCatchEvent>`;
const message = `<bpmn:message id="Msg" name="reply"/><bpmn:signal id="Sg" name="present"/>`;

test("a message reference prefixed with the target namespace's root prefix binds like an unprefixed one", async () => {
  // `BpmnParse#resolveName` qualifies a messageRef with the Definitions' targetNamespace (pinned `BpmnParse:1264`).
  assert.match(await admitted(await witness("message-ref-qname")), /"messageRef":"Message_Reply"/u);
  assert.match(await admitted(model(catching(`<bpmn:messageEventDefinition messageRef="tns:Msg"/>`), message)),
    /"messageRef":"Msg"/u);
});

test("a signal reference prefixed with the target namespace's root prefix binds", async () => {
  // Pinned `BpmnParse:3542` resolves a signalRef the same way.
  assert.match(await admitted(model(catching(`<bpmn:signalEventDefinition signalRef="tns:Sg"/>`), message)),
    /"literal":\{"value":"Sg"\}/u);
});

test("an unresolvable reference is one code, renamed or not", async () => {
  await refused(await witness("typo-message-ref"), "source.reference", "Message_Rply");
  await refused(await witness("typo-message-ref-renamed"), "source.reference", "Message_Rply");
  await refused(await witness("dangling-signal-ref"), "source.reference", "Signal_Missing");
});

test("a prefix bound to another namespace names an import, which the target excludes", async () => {
  await refused(await witness("message-ref-foreign-prefix"), "source.reference", "other:");
});

test("an unbound prefix, or one bound only below the Definitions, is refused", async () => {
  // CIB reads prefix bindings from the root Definitions only (pinned `BpmnParse:388-397`).
  await refused(model(catching(`<bpmn:messageEventDefinition messageRef="nope:Msg"/>`), message), "source.reference", "nope:");
  await refused(model(catching(`<bpmn:messageEventDefinition messageRef="inner:Msg"/>`), message, "",
    `xmlns:inner="${target}"`), "source.reference", "inner:");
});

test("a prefixed error or escalation reference is refused, because CIB reads it as raw text", async () => {
  // Pinned `BpmnParse:1217-1218` looks an errorRef up by its literal text and otherwise uses it as the error code.
  const roots = `<bpmn:error id="Err" errorCode="E1"/><bpmn:escalation id="Esc" escalationCode="X1"/>`;
  await refused(model(`<bpmn:endEvent id="E"><bpmn:errorEventDefinition errorRef="tns:Err"/></bpmn:endEvent>`, roots),
    "source.reference", "tns:Err");
  await refused(model(`<bpmn:endEvent id="E"><bpmn:escalationEventDefinition escalationRef="tns:Esc"/></bpmn:endEvent>`, roots),
    "source.reference", "tns:Esc");
  await admitted(model(`<bpmn:endEvent id="E"><bpmn:errorEventDefinition errorRef="Err"/></bpmn:endEvent>`, roots));
});

test("a referenced event definition is refused in every position, because CIB never resolves one", async () => {
  // Pinned `BpmnParse` reads no `eventDefinitionRef`: a catch fails to parse and any other Event runs as a None Event.
  const roots = `<bpmn:timerEventDefinition id="Td"><bpmn:timeDuration>PT1S</bpmn:timeDuration></bpmn:timerEventDefinition>`;
  for (const event of [
    `<bpmn:intermediateCatchEvent id="C"><bpmn:eventDefinitionRef>Td</bpmn:eventDefinitionRef></bpmn:intermediateCatchEvent>`,
    `<bpmn:startEvent id="S"><bpmn:eventDefinitionRef>Td</bpmn:eventDefinitionRef></bpmn:startEvent>`,
  ]) await refused(model(event, roots), "reader.eventDefinitionRef", "Td");
  await admitted(model(`<bpmn:startEvent id="S"/>`, roots));
});

type Json = Record<string, unknown>;

async function programOf(xml: string): Promise<Json> {
  const result = await read(xml);
  assert.ok(result.kind === "read", JSON.stringify(result));
  return result.program as Json;
}

/** The payload of the program's element `id`. */
function payloadOf(program: Json, id: string): Json {
  const found = (program.elements as Json[]).map((element) => Object.values(element)[0] as Json)
    .find((body) => (body.header as Json).id === id);
  assert.ok(found !== undefined, `no element ${id}`);
  return found.payload as Json;
}

test("source facts pinned CIB erases are read into their IL fields, for admission to refuse", async () => {
  // Receive `instantiate` (§10.3.3, Table 10.10), Multiple and Parallel Multiple Events (§10.5.1), an instantiating or
  // Parallel Event-Based Gateway (§10.6.6) and `isExecutable` (Table 10.1) each carry BPMN meaning pinned CIB erases
  // (CIB-LIM-0008; `BpmnParse:560-574` deploys no process whose `isExecutable` is absent or false).
  const receive = async (attribute: string): Promise<unknown> =>
    ((payloadOf(await programOf(model(`<bpmn:receiveTask id="R" ${attribute}/>`)), "R").work as Json).receive as Json).payload;
  assert.equal(((await receive(`instantiate="true"`)) as Json).instantiate, true);
  assert.equal(((await receive("")) as Json).instantiate, false);

  const timer = `<bpmn:timerEventDefinition><bpmn:timeDuration>PT1S</bpmn:timeDuration></bpmn:timerEventDefinition>`;
  const catchOf = async (attributes: string, definitions: string): Promise<Json> =>
    ((payloadOf(await programOf(model(`<bpmn:intermediateCatchEvent id="C" ${attributes}>${definitions}</bpmn:intermediateCatchEvent>`,
      message)), "C").role as Json).catch as Json).subscription as Json;
  const several = await catchOf("", `<bpmn:messageEventDefinition messageRef="Msg"/>${timer}`);
  assert.ok("message" in (several.trigger as Json));
  assert.deepEqual((several.alternatives as Json[]).map((trigger) => Object.keys(trigger)), [["timer"]]);
  assert.equal(several.parallelMultiple, false);
  assert.equal((await catchOf(`parallelMultiple="true"`, `<bpmn:messageEventDefinition messageRef="Msg"/>`)).parallelMultiple, true);

  const roots = `<bpmn:error id="Err" errorCode="E1"/><bpmn:escalation id="Esc" escalationCode="X1"/>`;
  const end = payloadOf(await programOf(model(`<bpmn:endEvent id="E"><bpmn:errorEventDefinition errorRef="Err"/>` +
    `<bpmn:escalationEventDefinition escalationRef="Esc"/></bpmn:endEvent>`, roots)), "E");
  assert.ok("error" in (((end.role as Json).throw as Json).record as Json));
  assert.deepEqual((end.alternativeThrows as Json[]).map((record) => Object.keys(record)), [["escalation"]]);

  const gateway = async (attributes: string): Promise<unknown> =>
    payloadOf(await programOf(model(`<bpmn:eventBasedGateway id="G" ${attributes}/>`)), "G").kind;
  assert.deepEqual(await gateway(""), { eventBased: { instantiation: "none" } });
  assert.deepEqual(await gateway(`instantiate="true"`), { eventBased: { instantiation: "exclusive" } });
  assert.deepEqual(await gateway(`instantiate="true" eventGatewayType="Parallel"`), { eventBased: { instantiation: "parallel" } });
  assert.deepEqual(await gateway(`eventGatewayType="Parallel"`), { eventBased: { instantiation: "parallel" } });
  assert.deepEqual(await gateway(`eventGatewayType="Exclusive"`), { eventBased: { instantiation: "none" } });

  assert.equal((await programOf(model(`<bpmn:task id="T"/>`))).executable, true);
  assert.equal((await programOf(model(`<bpmn:task id="T"/>`).replace(`isExecutable="true"`, `isExecutable="false"`))).executable, false);
  assert.equal((await programOf(model(`<bpmn:task id="T"/>`).replace(` isExecutable="true"`, ""))).executable, false);
  const called = await programOf(model(`<bpmn:callActivity id="A" calledElement="Q"/>`,
    `<bpmn:process id="Q"><bpmn:task id="QT"/></bpmn:process>`));
  assert.deepEqual((called.processes as Json[]).map((process) => process.executable), [false]);
});

test("a source the BPMN 2.0.2 XSD rejects is refused before it is read", async () => {
  const operation = `<bpmn:interface id="If" name="If"><bpmn:operation id="Op" name="Op"><bpmn:inMessageRef>Msg</bpmn:inMessageRef></bpmn:operation></bpmn:interface>`;
  // `tMessageEventDefinition` declares operationRef a child element (Semantic.xsd), which `bpmn-moddle` also reads as
  // an attribute.
  await refused(model(catching(`<bpmn:messageEventDefinition messageRef="Msg" operationRef="Op"/>`), message + operation),
    "source.schema", "operationRef");
  await admitted(model(catching(`<bpmn:messageEventDefinition messageRef="Msg"><bpmn:operationRef>Op</bpmn:operationRef></bpmn:messageEventDefinition>`),
    message + operation));
  // `tProcess` orders flow elements before artifacts.
  const annotation = `<bpmn:textAnnotation id="Note"><bpmn:text>note</bpmn:text></bpmn:textAnnotation>`;
  await refused(model(`${annotation}<bpmn:task id="T"/>`), "source.schema", "task");
  await admitted(model(`<bpmn:task id="T"/>${annotation}`));
});
