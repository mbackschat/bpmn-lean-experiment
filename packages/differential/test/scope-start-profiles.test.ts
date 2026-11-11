/**
 * A Sub-Process or Transaction without a start Event under each profile (`ScopeStart`, CIB-LIM-0024). BPMN 2.0.2
 * §13.3.4 lets such a Scope begin its Activities without incoming flow, which the standards profile runs. CIB Seven
 * `2.2.0` refuses deploying a Sub-Process without a start Event (`BpmnParse.java:967-968`) and fails entering such a
 * Transaction (`SubProcessActivityBehavior.java:41-43`), so the cibseven profiles refuse both at admission. Each model
 * is read from BPMN under the profile's own relations, so the selection, not a hand-set option, is under test.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";

import { kernelAdmission, readCaseSource } from "./kernel-program.ts";

const definitions = (body: string): Uint8Array => new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_ScopeStart"
  targetNamespace="urn:bpmn-lean:test:scope-start">
<bpmn:process id="Process_ScopeStart" isExecutable="true">
  <bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Region"/>
  ${body}
  <bpmn:sequenceFlow id="f2" sourceRef="Region" targetRef="E"/><bpmn:endEvent id="E"/>
</bpmn:process></bpmn:definitions>`);

/** `Region` holds the User Tasks `A` and `B` and no start Event, so entering it begins both. */
const startless = (tag: "subProcess" | "transaction"): Uint8Array =>
  definitions(`<bpmn:${tag} id="Region"><bpmn:userTask id="A"/><bpmn:userTask id="B"/></bpmn:${tag}>`);

/** The same Scope with a none start Event forking to `A` and `B`. */
const started = (tag: "subProcess" | "transaction"): Uint8Array =>
  definitions(`<bpmn:${tag} id="Region"><bpmn:startEvent id="RS"/><bpmn:parallelGateway id="RG"/>
    <bpmn:sequenceFlow id="r1" sourceRef="RS" targetRef="RG"/><bpmn:sequenceFlow id="r2" sourceRef="RG" targetRef="A"/>
    <bpmn:sequenceFlow id="r3" sourceRef="RG" targetRef="B"/><bpmn:userTask id="A"/><bpmn:userTask id="B"/></bpmn:${tag}>`);

async function read(bytes: Uint8Array, profile: string) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return readCaseSource({ relativePath: "inline.bpmn", bytes, sha256, overlay: null }, profile);
}

for (const tag of ["subProcess", "transaction"] as const) {
  for (const profile of ["cibseven-2.2.0", "cibseven-2.2.0-scope-chain"]) {
    test(`a ${tag} without a start Event is refused under ${profile}`, async () => {
      assert.deepEqual(kernelAdmission(await read(startless(tag), profile)), { status: "rejected", refusal: "scope.withoutStart" });
      assert.deepEqual(kernelAdmission(await read(started(tag), profile)), { status: "accepted" }, "the control has a start Event");
    });
  }

  test(`a ${tag} without a start Event begins its Activities under bpmn-2.0.2`, async () => {
    const program = await read(startless(tag), "bpmn-2.0.2");
    assert.deepEqual(kernelAdmission(program), { status: "accepted" });
    assert.equal(program.kind, "read");
    const decoded = decodeProgram((program as Extract<typeof program, { kind: "read" }>).program);
    assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
    const stimulus = stimulusFromJson({ kind: "start", commandId: "s01", instanceId: "Instance_1", variables: [] });
    assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
    const outcome = step(hooks, decoded.value, null, stimulus.value[1]);
    assert.ok(outcome.ok, outcome.ok ? "" : JSON.stringify(outcome.failure));
    assert.deepEqual(outcome.value.openItems.map((item) => item.element).sort(), ["A", "B"]);
  });
}
