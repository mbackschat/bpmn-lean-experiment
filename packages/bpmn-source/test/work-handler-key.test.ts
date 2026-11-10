/**
 * PC-HUM-02, the writable handler key (WORK-SEMANTICS-SPEC "Writable handler key", CIB-LIM-0017): the reader carries
 * the root identifier of a Service or Send Task's `camunda:delegateExpression` as the work's `handlerKey` and refuses
 * nothing for it; `Kernel.Admission` compares it with the names the program declares (`work.handlerKeyName`, the kernel's
 * `work-handler-key.test.ts`). A task without a delegate expression carries none.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

const token = "bpmnLeanEffectHandler";

/** A process whose User Task `Collect` holds a form field named like the token, before the effect task `Notify`. */
const xml = (notify: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">
<bpmn:startEvent id="S" />
<bpmn:userTask id="Collect"><bpmn:extensionElements><camunda:formData><camunda:formField id="${token}" type="string" /></camunda:formData></bpmn:extensionElements></bpmn:userTask>
${notify}
<bpmn:endEvent id="E" />
<bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Collect" /><bpmn:sequenceFlow id="f2" sourceRef="Collect" targetRef="Notify" />
<bpmn:sequenceFlow id="f3" sourceRef="Notify" targetRef="E" />
</bpmn:process></bpmn:definitions>`;

type Json = Record<string, unknown>;

/** The `service` payload the reader gives `Notify`. */
async function notifyWork(notify: string): Promise<Json> {
  const result = await readKernelProgram({
    bytes: new TextEncoder().encode(xml(notify)), overlay: null, profile: "any-profile", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(result.kind, "read", result.kind === "refused" ? result.code : "");
  if (result.kind !== "read") throw new Error("unreachable");
  const elements = (result.program as Json).elements as Json[];
  const notifyElement = elements.find((element) => ((element.activity as Json | undefined)?.header as Json | undefined)?.id === "Notify");
  return (((notifyElement?.activity as Json).payload as Json).work as Json).service as Json;
}

test("a bound delegate's token is carried, not refused, even where a form field shares its name", async () => {
  const work = await notifyWork(`<bpmn:serviceTask id="Notify" implementation="urn:bpmn-lean:effect:probe-v1" camunda:delegateExpression="\${${token}}" camunda:asyncBefore="true" />`);
  assert.equal((work.payload as Json).handlerKey, token);
});

test("a task without a delegate expression carries no token", async () => {
  const work = await notifyWork(`<bpmn:serviceTask id="Notify" implementation="urn:bpmn-lean:effect:probe-v1" camunda:asyncBefore="true" />`);
  assert.equal((work.payload as Json).handlerKey, null);
});
