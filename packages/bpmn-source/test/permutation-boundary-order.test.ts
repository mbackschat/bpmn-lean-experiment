/**
 * PC-BASIC-03: the reader keeps the program's elements, and so a host's Boundary Events and a scope's Event
 * Sub-Processes, in document order, the order in which the kernel breaks a tie between two catchers of equal
 * precedence (CIB-INT-0010, `feature/propagation.ts` `best`). Identifier order made the identifiers pick the catcher,
 * which the rename-and-permute check over the witnesses
 * (`packages/differential/test/rename-permutation-invariance.test.ts`) found on `error-boundary-candidates`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import type { KernelRead } from "@bpmn-lean/bpmn-source";

type Json = Record<string, any>;

/** Two catch-all Error boundaries on `T`, declared `Z_First` then `A_Second`: identifier order is the reverse. */
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">
<bpmn:startEvent id="S" /><bpmn:userTask id="T" /><bpmn:endEvent id="E" /><bpmn:endEvent id="E1" /><bpmn:endEvent id="E2" />
<bpmn:boundaryEvent id="Z_First" attachedToRef="T"><bpmn:errorEventDefinition id="D1" /></bpmn:boundaryEvent>
<bpmn:boundaryEvent id="A_Second" attachedToRef="T"><bpmn:errorEventDefinition id="D2" /></bpmn:boundaryEvent>
<bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="T" /><bpmn:sequenceFlow id="f2" sourceRef="T" targetRef="E" />
<bpmn:sequenceFlow id="f3" sourceRef="Z_First" targetRef="E1" /><bpmn:sequenceFlow id="f4" sourceRef="A_Second" targetRef="E2" />
</bpmn:process></bpmn:definitions>`;

test("a host's Boundary Events are read in document order", async () => {
  const read: KernelRead = await readKernelProgram({
    bytes: new TextEncoder().encode(xml), overlay: null, profile: "any-profile", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(read.kind, "read", JSON.stringify(read));
  const program = (read as Extract<KernelRead, { kind: "read" }>).program as Json;
  const host = program.elements.find((element: Json) => element.activity?.header.id === "T").activity;
  assert.deepEqual(host.payload.envelope.boundaries.map((boundary: Json) => boundary.id), ["Z_First", "A_Second"]);
});

/** Two catch-all Error Event Sub-Processes declared `Z_First` then `A_Second` in one process. */
const eventSubProcessXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:t">
<bpmn:process id="P" isExecutable="true">
<bpmn:startEvent id="S" /><bpmn:userTask id="T" /><bpmn:endEvent id="E" />
<bpmn:subProcess id="Z_First" triggeredByEvent="true"><bpmn:startEvent id="Z_Start"><bpmn:errorEventDefinition id="D1" /></bpmn:startEvent><bpmn:endEvent id="Z_End" /><bpmn:sequenceFlow id="z1" sourceRef="Z_Start" targetRef="Z_End" /></bpmn:subProcess>
<bpmn:subProcess id="A_Second" triggeredByEvent="true"><bpmn:startEvent id="A_Start"><bpmn:errorEventDefinition id="D2" /></bpmn:startEvent><bpmn:endEvent id="A_End" /><bpmn:sequenceFlow id="a1" sourceRef="A_Start" targetRef="A_End" /></bpmn:subProcess>
<bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="T" /><bpmn:sequenceFlow id="f2" sourceRef="T" targetRef="E" />
</bpmn:process></bpmn:definitions>`;

// The kernel offers an Error to a scope's Event Sub-Processes in program element order (`programChildren`), so that
// order must be the document's too (CIB-INT-0010), not the identifiers'.
test("a scope's Event Sub-Processes are read in document order", async () => {
  const read: KernelRead = await readKernelProgram({
    bytes: new TextEncoder().encode(eventSubProcessXml), overlay: null, profile: "any-profile", limits: { maxBytes: 1 << 20, parserDeadlineMs: 2_000 },
  }, kernelProfileOptions([]));
  assert.equal(read.kind, "read", JSON.stringify(read));
  const program = (read as Extract<KernelRead, { kind: "read" }>).program as Json;
  const scopes = program.elements.flatMap((element: Json) =>
    element.scope?.payload.kind.eventSubProcess === undefined ? [] : [element.scope.header.id]);
  assert.deepEqual(scopes, ["Z_First", "A_Second"]);
});
