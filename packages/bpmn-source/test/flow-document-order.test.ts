/**
 * PC-BASIC-03: the reader keeps Sequence Flows, every element's `outgoing` list and an Inclusive Gateway's candidates
 * in document order. The kernel emits a split's tokens in `outgoing` order and settles them first in, first out
 * (`State.emit`, `Step.settle`), and CIB starts a split's branches in declaration order
 * (`PvmAtomicOperationTransitionDestroyScope`, which reverses them for its LIFO invocation queue), so when two automatic
 * branches write one variable the later-declared branch's write is the one kept. Identifier order would let a renaming
 * decide it; the witness is `scenarios/open-rows/split-branch-order`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelRead } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

/**
 * A Start, a Parallel fork and an Inclusive split, each with two outgoing flows declared `Z_*` before `A_*`, so
 * identifier order is the reverse of document order.
 */
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">
<bpmn:startEvent id="S" /><bpmn:parallelGateway id="F" /><bpmn:inclusiveGateway id="I" />
<bpmn:endEvent id="E1" /><bpmn:endEvent id="E2" /><bpmn:endEvent id="E3" /><bpmn:endEvent id="E4" />
<bpmn:sequenceFlow id="Z_s" sourceRef="S" targetRef="F" /><bpmn:sequenceFlow id="A_s" sourceRef="S" targetRef="I" />
<bpmn:sequenceFlow id="Z_f" sourceRef="F" targetRef="E1" /><bpmn:sequenceFlow id="A_f" sourceRef="F" targetRef="E2" />
<bpmn:sequenceFlow id="Z_i" sourceRef="I" targetRef="E3"><bpmn:conditionExpression>\${true}</bpmn:conditionExpression></bpmn:sequenceFlow>
<bpmn:sequenceFlow id="A_i" sourceRef="I" targetRef="E4"><bpmn:conditionExpression>\${true}</bpmn:conditionExpression></bpmn:sequenceFlow>
</bpmn:process></bpmn:definitions>`;

async function program(): Promise<Json> {
  const read: KernelRead = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "any-profile", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(read.kind, "read", JSON.stringify(read));
  return (read as Extract<KernelRead, { kind: "read" }>).program as Json;
}

const element = (built: Json, id: string): Json => {
  const found = built.elements.find((entry: Json) => Object.values(entry).some((value: any) => value?.header?.id === id));
  assert.ok(found !== undefined, id);
  return Object.values(found)[0] as Json;
};

test("Sequence Flows are read in document order", async () => {
  assert.deepEqual((await program()).flows.map((flow: Json) => flow.id), ["Z_s", "A_s", "Z_f", "A_f", "Z_i", "A_i"]);
});

test("a Start's and a Parallel fork's outgoing flows are read in document order", async () => {
  const built = await program();
  assert.deepEqual(element(built, "S").payload.outgoing, ["Z_s", "A_s"]);
  assert.deepEqual(element(built, "F").payload.outgoing, ["Z_f", "A_f"]);
});

test("an Inclusive split's candidates are read in document order", async () => {
  const payload = element(await program(), "I").payload;
  assert.deepEqual(payload.outgoing, ["Z_i", "A_i"]);
  assert.deepEqual(payload.kind.inclusive.candidates, ["Z_i", "A_i"]);
});
