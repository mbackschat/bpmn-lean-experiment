/**
 * A Signal throw and the catches it reaches in its own State (PC-SIGNAL-01, PC-SIGNAL-02), under each Signal address
 * reading. The standards profile addresses a Signal by its QName (BPMN 2.0.2 Table 10.100), so a name-addressed delivery
 * never reaches a catch; under `SignalNames.addresses` (CIB-INT-0028) the name addresses it. A throw fires its own
 * State's receivers before it leaves and leaves one broadcast intent (CIB-OP-0019); under `SignalPayload.variables`
 * (CIB-EXT-0040, CIB-EXT-0043) its `camunda:in` copies install where the catch's writes land, at the root for an
 * undeclared name under CIB's write rule. The retained
 * `signal-throw-*` witnesses cover the CIB reading against CIB itself; these cover the standards reading, which no
 * retained witness runs, and the rejections no witness reaches.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { admit, decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Program, State } from "@bpmn-lean/kernel";

import { readCaseSource } from "./kernel-program.ts";

const namespace = "urn:bpmn-lean:test:signal-throw";

/**
 * After a fork, `Dispatch` leads to a throw of `Signal_Shipped` (`order-shipped`), copying `customer` to `notified`;
 * `Catch_Shipped` waits for that Signal before `Notify`, and `Catch_Other` for `Signal_Other` (`order-other`).
 */
const model = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  id="Definitions_SignalThrow" targetNamespace="${namespace}">
<bpmn:signal id="Signal_Shipped" name="order-shipped"/><bpmn:signal id="Signal_Other" name="order-other"/>
<bpmn:process id="Process_SignalThrow" isExecutable="true">
  <bpmn:startEvent id="S"/><bpmn:parallelGateway id="Fork"/>
  <bpmn:userTask id="Dispatch"/>
  <bpmn:intermediateThrowEvent id="Throw"><bpmn:signalEventDefinition signalRef="Signal_Shipped">PAYLOAD</bpmn:signalEventDefinition></bpmn:intermediateThrowEvent>
  <bpmn:endEvent id="E1"/>
  <bpmn:intermediateCatchEvent id="Catch_Shipped"><bpmn:signalEventDefinition signalRef="Signal_Shipped"/></bpmn:intermediateCatchEvent>
  <bpmn:userTask id="Notify"/><bpmn:endEvent id="E2"/>
  <bpmn:intermediateCatchEvent id="Catch_Other"><bpmn:signalEventDefinition signalRef="Signal_Other"/></bpmn:intermediateCatchEvent>
  <bpmn:endEvent id="E3"/>
  <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Fork"/>
  <bpmn:sequenceFlow id="f2" sourceRef="Fork" targetRef="Dispatch"/>
  <bpmn:sequenceFlow id="f3" sourceRef="Dispatch" targetRef="Throw"/>
  <bpmn:sequenceFlow id="f4" sourceRef="Throw" targetRef="E1"/>
  <bpmn:sequenceFlow id="f5" sourceRef="Fork" targetRef="Catch_Shipped"/>
  <bpmn:sequenceFlow id="f6" sourceRef="Catch_Shipped" targetRef="Notify"/>
  <bpmn:sequenceFlow id="f7" sourceRef="Notify" targetRef="E2"/>
  <bpmn:sequenceFlow id="f8" sourceRef="Fork" targetRef="Catch_Other"/>
  <bpmn:sequenceFlow id="f9" sourceRef="Catch_Other" targetRef="E3"/>
</bpmn:process></bpmn:definitions>`);

const withPayload = (payload: string): Uint8Array =>
  new TextEncoder().encode(new TextDecoder().decode(model).replace("PAYLOAD", payload));

/** The model read under the standards profile, with `options` replacing the Signal readings it selects. */
async function program(bytes: Uint8Array, options: Record<string, unknown>): Promise<Program> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const read = await readCaseSource({ relativePath: "inline.bpmn", bytes, sha256, overlay: null }, "bpmn-2.0.2");
  assert.equal(read.kind, "read", JSON.stringify(read));
  const json = (read as Extract<typeof read, { kind: "read" }>).program as Record<string, unknown>;
  const decoded = decodeProgram({ ...json, options: { ...(json.options as Record<string, unknown>), ...options } });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  // `occurrenceTargeted` is refused at admission until the input boundary rejects a targeted Signal under
  // `broadcastOnly`; the step itself is under test here.
  assert.equal(admit(decoded.value), options.signalDelivery === "occurrenceTargeted" ? "profile.signalDelivery.occurrenceTargeted" : null);
  return decoded.value;
}

function run(target: Program, stimuli: ReadonlyArray<Record<string, unknown>>) {
  let state: State | null = null;
  let last = null as ReturnType<typeof step> | null;
  for (const [index, json] of stimuli.entries()) {
    const stimulus = stimulusFromJson({ commandId: `c${String(index)}`, ...json });
    assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
    last = step(hooks, target, state, stimulus.value[1]);
    if (last.ok) state = last.value;
  }
  return { state, last: last! };
}

const start = { kind: "start", instanceId: "Instance_1", variables: [{ name: "customer", value: { kind: "string", value: "ACME" } }] };
const complete = (elementId: string) => ({
  kind: "command", occurrence: { processInstanceId: "Instance_1", elementId, activation: 1 }, action: { kind: "completeUserTask", values: [] },
});
const deliver = (elementId: string, trigger: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  kind: "deliver", occurrence: { processInstanceId: "Instance_1", elementId, activation: 1 }, trigger, ...extra,
});
const waiting = (state: State | null): string[] => (state?.openItems ?? []).map((item) => item.element).sort();

test("a throw reaches the catch of its own Signal by QName under the standards reading, and leaves one intent", async () => {
  const { state, last } = run(await program(withPayload(""), {}), [start, complete("Dispatch")]);
  assert.ok(last.ok, JSON.stringify(last));
  assert.deepEqual(waiting(state), ["Catch_Other", "Notify"]);
  assert.deepEqual(state!.outbox.map((intent) => [intent.address, intent.variables, intent.businessKey]), [
    [{ tag: "qualified", ref: { namespace, localName: "Signal_Shipped" } }, [], null],
  ]);
});

test("a name-addressed delivery never reaches a QName subscription, and does under the names reading", async () => {
  const named = { kind: "signal", name: "order-shipped" };
  const standards = run(await program(withPayload(""), { signalDelivery: "occurrenceTargeted" }), [start, deliver("Catch_Shipped", named)]);
  assert.deepEqual(standards.last.ok ? null : standards.last.failure, { tag: "rejected", code: "unknown-signal-subscription" });
  const names = run(await program(withPayload(""), { signalNames: "addresses", signalDelivery: "occurrenceTargeted" }),
    [start, deliver("Catch_Shipped", named)]);
  assert.ok(names.last.ok, JSON.stringify(names.last));
  assert.deepEqual(waiting(names.state), ["Catch_Other", "Dispatch", "Notify"]);
});

test("a Signal delivery carrying a payload is rejected rather than dropped", async () => {
  const { last } = run(await program(withPayload(""), { signalNames: "addresses", signalDelivery: "occurrenceTargeted" }),
    [start, deliver("Catch_Shipped", { kind: "signal", name: "order-shipped" }, { payload: { kind: "string", value: "x" } })]);
  assert.deepEqual(last.ok ? null : last.failure, { tag: "rejected", code: "signal-payload-not-accepted" });
});

test("a throw's camunda:in copies install where the catch writes, and travel with its intent", async () => {
  const target = await program(withPayload(`<bpmn:extensionElements><camunda:in source="customer" target="notified"/></bpmn:extensionElements>`),
    { signalNames: "addresses", signalPayload: "variables", evaluator: "juel", undeclaredWrite: "atInstanceRoot" });
  const { state, last } = run(target, [start, complete("Dispatch")]);
  assert.ok(last.ok, JSON.stringify(last));
  assert.deepEqual(waiting(state), ["Catch_Other", "Notify"]);
  const root = state!.variables.find((scope) => scope.scope === 0)?.entries ?? [];
  assert.deepEqual(root.find(([name]) => name === "notified"), ["notified", { tag: "string", value: "ACME" }]);
  assert.deepEqual(state!.outbox.map((intent) => [intent.address, intent.variables]), [
    [{ tag: "named", name: "order-shipped" }, [["notified", { tag: "string", value: "ACME" }]]],
  ]);
});
