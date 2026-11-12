/**
 * The reader's User Task form fields: a field without an id or type reads as an empty key or type, which
 * `Kernel.Admission.Work` refuses (`work.user.formField`) as CIB refuses it at deployment
 * (`DefaultFormHandler#parseFormField`, `FormTypes#parseFormPropertyType`), never as a field named `undefined`. A Script
 * Task's `camunda:resource` is read, never dropped, so admission refuses it (`work.script.resource`) rather than run the
 * empty inline source in its place; an absent `script` element reads as no source, distinct from an empty one, and
 * `camunda:resultVariableName` reads as the result variable only where `camunda:resultVariable` is absent, as CIB's
 * `BpmnParse#parseResultVariable` does.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

async function workOf(task: string): Promise<Json> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">${task}</bpmn:process></bpmn:definitions>`;
  const result = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "any-profile", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(result.kind, "read", JSON.stringify(result));
  const program = (result as Extract<typeof result, { kind: "read" }>).program as Json;
  const element = program.elements.find((entry: Json) => (Object.values(entry)[0] as Json).header.id === "U");
  return element.activity.payload.work;
}

async function formFieldsOf(fields: string): Promise<unknown> {
  const work = await workOf(`<bpmn:userTask id="U"><bpmn:extensionElements><camunda:formData>${fields}</camunda:formData>
</bpmn:extensionElements></bpmn:userTask>`);
  return work.user.payload.formFields;
}

test("a form field's id and type are read as declared", async () => {
  assert.deepEqual(await formFieldsOf(`<camunda:formField id="route" type="string"/>`), [["route", "string"]]);
});

test("a form field without an id or type reads as empty", async () => {
  assert.deepEqual(await formFieldsOf(`<camunda:formField type="string"/><camunda:formField id="route"/>`), [["", "string"], ["route", ""]]);
});

test("a Script Task's camunda:resource is read beside an absent inline script", async () => {
  const work = await workOf(`<bpmn:scriptTask id="U" scriptFormat="javascript" camunda:resource="scripts/total.js"/>`);
  assert.deepEqual(work.script.payload, { format: "javascript", source: null, resultVariable: null, resource: "scripts/total.js" });
});

test("an inline Script Task reads no resource", async () => {
  const work = await workOf(`<bpmn:scriptTask id="U" scriptFormat="javascript"><bpmn:script>1</bpmn:script></bpmn:scriptTask>`);
  assert.equal(work.script.payload.resource, null);
});

test("an empty script element is an empty source, not an absent one", async () => {
  const work = await workOf(`<bpmn:scriptTask id="U" scriptFormat="javascript"><bpmn:script></bpmn:script></bpmn:scriptTask>`);
  assert.equal(work.script.payload.source, "");
});

test("camunda:resultVariableName names the result variable only where camunda:resultVariable is absent", async () => {
  const legacy = await workOf(`<bpmn:scriptTask id="U" scriptFormat="javascript" camunda:resultVariableName="total"><bpmn:script>1</bpmn:script></bpmn:scriptTask>`);
  assert.equal(legacy.script.payload.resultVariable, "total");
  const both = await workOf(
    `<bpmn:scriptTask id="U" scriptFormat="javascript" camunda:resultVariable="sum" camunda:resultVariableName="total"><bpmn:script>1</bpmn:script></bpmn:scriptTask>`);
  assert.equal(both.script.payload.resultVariable, "sum");
});
