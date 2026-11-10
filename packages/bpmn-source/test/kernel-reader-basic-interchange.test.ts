/**
 * The reader's interchange forms (PC-BASIC-04, [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#interchange-forms-and-diagnostics-pc-basic-04)):
 * QName references, referenced event definitions, the source facts the IL does not carry yet, and the `source.schema`
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
  assert.match(await admitted(await witness("message-ref-qname")), /"literal":\{"value":"Message_Reply"\}/u);
  assert.match(await admitted(model(catching(`<bpmn:messageEventDefinition messageRef="tns:Msg"/>`), message)),
    /"literal":\{"value":"Msg"\}/u);
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

test("source facts the IL does not carry yet are refused, never dropped", async () => {
  // Receive `instantiate` (§10.3.3, Table 10.10), `parallelMultiple` (§10.5.1) and a non-executable process
  // (pinned `BpmnParse:560-574` deploys none) move to `Kernel.Admission` once the IL carries them.
  await refused(model(`<bpmn:receiveTask id="R" instantiate="true"/>`), "reader.factNotCarried", "instantiate");
  await admitted(model(`<bpmn:receiveTask id="R" instantiate="false"/>`));
  await refused(model(catching(`<bpmn:messageEventDefinition messageRef="Msg"/>`).replace(`id="C"`, `id="C" parallelMultiple="true"`), message),
    "reader.factNotCarried", "parallelMultiple");
  await refused(model(`<bpmn:task id="T"/>`).replace(`isExecutable="true"`, `isExecutable="false"`), "reader.factNotCarried",
    "isExecutable");
  await refused(model(`<bpmn:task id="T"/>`).replace(` isExecutable="true"`, ""), "reader.factNotCarried", "isExecutable");
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
