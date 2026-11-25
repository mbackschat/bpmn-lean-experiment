/**
 * One Signal throw reaching the waits of ten called instances begun in one closure, under the CIB profile (KD1's Signal
 * witness, docs/REWRITE-2-PROPOSAL.md): a parallel Multi-Instance Call of 10 enters `Process_Called` ten times, each
 * waiting on `Signal_Go`; completing `Release` throws it. A throw fires its own State's receivers by public instance
 * string, then by position (`ownReceivers`), so activation 10 (`…:Call:10`) fires between 1 and 2: the string order,
 * not the numeric one or the order the instances were begun in. The expected order is today's kernel answer, an
 * agreement guard: it holds by construction now, and fails if receivers come to be ordered by position or by activation
 * alone, as a commit-time renumbering of activations (K0.12) could make them.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { admit, decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Program, State } from "@bpmn-lean/kernel";

import { readCaseSource } from "./kernel-program.ts";

const model = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_SignalCalled"
  targetNamespace="urn:bpmn-lean:test:signal-called">
<bpmn:signal id="Signal_Go" name="go"/>
<bpmn:process id="Process_Main" isExecutable="true">
  <bpmn:startEvent id="S"/><bpmn:parallelGateway id="Fork"/>
  <bpmn:callActivity id="Call" calledElement="Process_Called">
    <bpmn:multiInstanceLoopCharacteristics><bpmn:loopCardinality>10</bpmn:loopCardinality></bpmn:multiInstanceLoopCharacteristics>
  </bpmn:callActivity>
  <bpmn:endEvent id="E1"/>
  <bpmn:userTask id="Release"/>
  <bpmn:intermediateThrowEvent id="Throw"><bpmn:signalEventDefinition signalRef="Signal_Go"/></bpmn:intermediateThrowEvent>
  <bpmn:endEvent id="E2"/>
  <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Fork"/>
  <bpmn:sequenceFlow id="f2" sourceRef="Fork" targetRef="Call"/>
  <bpmn:sequenceFlow id="f3" sourceRef="Call" targetRef="E1"/>
  <bpmn:sequenceFlow id="f4" sourceRef="Fork" targetRef="Release"/>
  <bpmn:sequenceFlow id="f5" sourceRef="Release" targetRef="Throw"/>
  <bpmn:sequenceFlow id="f6" sourceRef="Throw" targetRef="E2"/>
</bpmn:process>
<bpmn:process id="Process_Called" isExecutable="true">
  <bpmn:startEvent id="CS"/>
  <bpmn:intermediateCatchEvent id="Wait"><bpmn:signalEventDefinition signalRef="Signal_Go"/></bpmn:intermediateCatchEvent>
  <bpmn:userTask id="After"/><bpmn:endEvent id="CE"/>
  <bpmn:sequenceFlow id="c1" sourceRef="CS" targetRef="Wait"/>
  <bpmn:sequenceFlow id="c2" sourceRef="Wait" targetRef="After"/>
  <bpmn:sequenceFlow id="c3" sourceRef="After" targetRef="CE"/>
</bpmn:process></bpmn:definitions>`);

async function program(): Promise<Program> {
  const sha256 = createHash("sha256").update(model).digest("hex");
  const read = await readCaseSource({ relativePath: "inline.bpmn", bytes: model, sha256, overlay: null }, "cibseven-2.2.0");
  assert.equal(read.kind, "read", JSON.stringify(read));
  const decoded = decodeProgram((read as Extract<typeof read, { kind: "read" }>).program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

function run(target: Program, stimuli: ReadonlyArray<Record<string, unknown>>): State {
  let state: State | null = null;
  for (const [index, json] of stimuli.entries()) {
    const stimulus = stimulusFromJson({ commandId: `c${String(index)}`, ...json });
    assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
    const outcome = step(hooks, target, state, stimulus.value[1]);
    assert.ok(outcome.ok, JSON.stringify(outcome));
    state = outcome.value;
  }
  return state!;
}

test("a throw fires ten called instances' waits by public instance string, activation 10 between 1 and 2", async () => {
  const state = run(await program(), [
    { kind: "start", instanceId: "Instance_1", variables: [] },
    { kind: "command", occurrence: { processInstanceId: "Instance_1", elementId: "Release", activation: 1 },
      action: { kind: "completeUserTask", values: [] } },
  ]);
  const begun = state.journal.flatMap((transition) => transition.started)
    .filter((fact) => fact.occurrence.element === "After")
    .map((fact) => fact.occurrence.processInstanceId);
  // The depth-first schedule begins the last fired wait's continuation first, so `After` begins in reverse fire order;
  // by activation or by position the reverse would be 10, 9, …, 1.
  assert.deepEqual(begun, [9, 8, 7, 6, 5, 4, 3, 2, 10, 1].map((activation) => `call:10:Instance_1:4:Call:${String(activation)}`));
});
