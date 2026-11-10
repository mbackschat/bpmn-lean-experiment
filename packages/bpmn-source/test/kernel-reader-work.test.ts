/**
 * The reader's User Task form fields: a field without an id or type reads as an empty key or type, which
 * `Kernel.Admission.Work` refuses (`work.user.formField`) as CIB refuses it at deployment
 * (`DefaultFormHandler#parseFormField`, `FormTypes#parseFormPropertyType`), never as a field named `undefined`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

async function formFieldsOf(fields: string): Promise<unknown> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true"><bpmn:userTask id="U"><bpmn:extensionElements><camunda:formData>${fields}</camunda:formData>
</bpmn:extensionElements></bpmn:userTask></bpmn:process></bpmn:definitions>`;
  const result = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "any-profile", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(result.kind, "read", JSON.stringify(result));
  const program = (result as Extract<typeof result, { kind: "read" }>).program as Json;
  const task = program.elements.find((entry: Json) => (Object.values(entry)[0] as Json).header.id === "U");
  return task.activity.payload.work.user.payload.formFields;
}

test("a form field's id and type are read as declared", async () => {
  assert.deepEqual(await formFieldsOf(`<camunda:formField id="route" type="string"/>`), [["route", "string"]]);
});

test("a form field without an id or type reads as empty", async () => {
  assert.deepEqual(await formFieldsOf(`<camunda:formField type="string"/><camunda:formField id="route"/>`), [["", "string"], ["route", ""]]);
});
