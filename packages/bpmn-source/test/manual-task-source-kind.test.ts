/**
 * PC-HUM-05: the reader keeps a Manual Task's source kind beside its pass-through work, so that the kernel's journal
 * can name it (`packages/kernel/test/flow-manual-pass-through.test.ts`); a plain Task with the same work keeps its own.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelRead } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">
<bpmn:startEvent id="S" /><bpmn:manualTask id="M" /><bpmn:task id="T" /><bpmn:endEvent id="E" />
<bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="M" /><bpmn:sequenceFlow id="f2" sourceRef="M" targetRef="T" />
<bpmn:sequenceFlow id="f3" sourceRef="T" targetRef="E" />
</bpmn:process></bpmn:definitions>`;

test("a Manual Task is read as manual work under its own source kind", async () => {
  const read: KernelRead = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "any-profile", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(read.kind, "read", JSON.stringify(read));
  const elements = (read as Extract<KernelRead, { kind: "read" }>).program as Json;
  const activity = (id: string): Json => elements.elements.find((element: Json) => element.activity?.header.id === id).activity;
  assert.deepEqual([activity("M").header.sourceType, activity("M").payload.work], ["manualTask", "manual"]);
  assert.deepEqual([activity("T").header.sourceType, activity("T").payload.work], ["task", "none"]);
});
