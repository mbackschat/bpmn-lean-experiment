/**
 * PC-HUM-02, the writable handler key (WORK-SEMANTICS-SPEC "Writable handler key"): CIB resolves a delegate token such
 * as `${bpmnLeanEffectHandler}` against process variables before its beans (`JuelExpressionManager.java:144-150`), so a
 * variable of the token's name shadows the handler. The reader binds the token to its operation and keeps no token in
 * the IL, so it refuses every name the program declares that equals a token one of its tasks binds
 * (`work.handlerKeyName`): form field ids, parameter targets, result variables, loop item names, Call targets and
 * process items. The oracle is the retained `writable-handler-key` answer, where CIB fails the job; a name of another
 * spelling is read as before.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelRead } from "@bpmn-lean/bpmn-source";

const token = "bpmnLeanEffectHandler";

/** A process whose User Task `Collect` holds `collect` and whose process holds `items`, before the effect task `Notify`. */
const xml = (collect: string, items = "", calls = "") => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">${items}
<bpmn:startEvent id="S" />
<bpmn:userTask id="Collect">${collect}</bpmn:userTask>${calls}
<bpmn:serviceTask id="Notify" implementation="urn:bpmn-lean:effect:probe-v1" camunda:delegateExpression="\${${token}}" camunda:asyncBefore="true" />
<bpmn:endEvent id="E" />
<bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Collect" /><bpmn:sequenceFlow id="f2" sourceRef="Collect" targetRef="Notify" />
<bpmn:sequenceFlow id="f3" sourceRef="Notify" targetRef="E" />
</bpmn:process></bpmn:definitions>`;

async function read(source: string): Promise<string> {
  const result: KernelRead = await readKernelProgram({
    bytes: new TextEncoder().encode(source), overlay: null, profile: "cibseven-2.2.0", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  return result.kind === "read" ? "read" : result.code;
}

const field = (id: string) => `<bpmn:extensionElements><camunda:formData><camunda:formField id="${id}" type="string" /></camunda:formData></bpmn:extensionElements>`;
const parameters = (input: string, output: string) =>
  `<bpmn:extensionElements><camunda:inputOutput><camunda:inputParameter name="${input}">x</camunda:inputParameter><camunda:outputParameter name="${output}">y</camunda:outputParameter></camunda:inputOutput></bpmn:extensionElements>`;
const loop = (variable: string) =>
  `<bpmn:multiInstanceLoopCharacteristics camunda:collection="\${items}" camunda:elementVariable="${variable}" />`;
const property = (id: string) => `<bpmn:property id="${id}" />`;

test("a form field, parameter, result variable, loop item, Call target or process item named like a bound delegate token is refused", async () => {
  for (const [label, source] of [
    ["form field", xml(field(token))],
    ["input parameter", xml(parameters(token, "out"))],
    ["output parameter", xml(parameters("in", token))],
    ["element variable", xml(loop(token))],
    ["process property", xml("", property(token))],
    ["result variable", xml("", "", `<bpmn:scriptTask id="Compute" scriptFormat="javascript" camunda:resultVariable="${token}"><bpmn:script>1</bpmn:script></bpmn:scriptTask>`)],
    ["call target", xml("", "", `<bpmn:callActivity id="Call" calledElement="P"><bpmn:extensionElements><camunda:in source="a" target="${token}" /></bpmn:extensionElements></bpmn:callActivity>`)],
  ] as const) {
    assert.equal(await read(source), "work.handlerKeyName", label);
  }
});

test("the same declarations under other names are read", async () => {
  assert.equal(await read(xml(field("note"))), "read");
  assert.equal(await read(xml(parameters("in", "out"))), "read");
  assert.equal(await read(xml("", property("notes"))), "read");
});
