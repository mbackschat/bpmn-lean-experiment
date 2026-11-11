/**
 * PC-CONDITION-03 to PC-CONDITION-05: several Conditional items true in one step fire one at a time, and an
 * interrupting firing withdraws the items it cancels before any other pending firing runs. An Event-Based Gateway
 * takes only its first true arm in flow order (BPMN 2.0.2 §10.5.6, Table 10.95), an interrupting boundary ends the
 * items of its host and of everything inside it, and an interrupting Event Sub-Process those of its parent scope. The
 * oracle is the occurrences each input begins (the journal), not only the waits left open, because a later
 * cancellation can hide a firing that should never have begun. The model is `scenarios/open-rows/conditional-catch/arms.bpmn`,
 * whose two-true-arms run has no retained CIB answer (CIB's pick varies per JVM, #79); the other models mutate its shape.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { State } from "@bpmn-lean/kernel";

import { readCaseSource } from "./kernel-program.ts";
import { projectRoot } from "./pipeline-target-support.ts";

type Json = Record<string, any>;

const header = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_Preemption" targetNamespace="urn:bpmn-lean:test:preemption">
<bpmn:process id="Process_Preemption" isExecutable="true">`;
const footer = "</bpmn:process></bpmn:definitions>";
const condition = (body: string): string =>
  `<bpmn:conditionalEventDefinition><bpmn:condition xsi:type="bpmn:tFormalExpression">\${${body}}</bpmn:condition></bpmn:conditionalEventDefinition>`;
/** `from → <id> → End_<id>`, `<id>` a User Task. */
const branch = (from: string, id: string): string =>
  `<bpmn:sequenceFlow id="To_${id}" sourceRef="${from}" targetRef="${id}"/><bpmn:userTask id="${id}"/>` +
  `<bpmn:sequenceFlow id="From_${id}" sourceRef="${id}" targetRef="End_${id}"/><bpmn:endEvent id="End_${id}"/>`;
const eventSubProcess = (id: string, predicate: string): string =>
  `<bpmn:subProcess id="${id}" triggeredByEvent="true"><bpmn:startEvent id="${id}_Start" isInterrupting="true">${condition(predicate)}</bpmn:startEvent>` +
  `${branch(`${id}_Start`, `${id}_Work`)}</bpmn:subProcess>`;

const go = (value: boolean): Json => ({ name: "go", value: { kind: "boolean", value } });
const start = (variables: Json[]): Json => ({ kind: "start", commandId: "s01", instanceId: "Instance_1", variables });
const setGo = (element: string): Json => ({
  kind: "command", commandId: "s02", occurrence: { processInstanceId: "Instance_1", elementId: element, activation: 1 },
  action: { kind: "setVariables", values: [go(true)] },
});

/** The elements each input begins, in order, after reading `bytes` under the CIB profile. */
async function begun(bytes: Uint8Array, stimuli: readonly Json[]): Promise<string[][]> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const read = await readCaseSource({ relativePath: "inline.bpmn", bytes, sha256, overlay: null }, "cibseven-2.2.0");
  assert.equal(read.kind, "read", JSON.stringify(read));
  const decoded = decodeProgram((read as Extract<typeof read, { kind: "read" }>).program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  let state: State | null = null;
  const out: string[][] = [];
  for (const stimulus of stimuli) {
    const parsed = stimulusFromJson(stimulus);
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.refusal);
    const outcome = step(hooks, decoded.value, state, parsed.value[1]);
    assert.ok(outcome.ok, outcome.ok ? "" : JSON.stringify(outcome.failure));
    state = outcome.value;
    out.push(state.journal.flatMap((transition) => transition.started.map((fact) => fact.occurrence.element)));
  }
  return out;
}

const inline = (body: string): Uint8Array => new TextEncoder().encode(`${header}${body}${footer}`);
const witness = (): Promise<Buffer> => readFile(path.join(projectRoot, "scenarios/open-rows/conditional-catch/arms.bpmn"));
const users = (elements: readonly string[]): string[] => elements.filter((element) => /^(Chosen_|W\d|Inner|Wait_Work|ESP\d_Work)/u.test(element));

test("an Event-Based Gateway whose two Conditional arms are true when armed takes only the first in flow order", async () => {
  const [started] = await begun(await witness(), [start([{ name: "ready", value: { kind: "boolean", value: true } }])]);
  assert.deepEqual(users(started ?? []), ["Chosen_Beta"]);
});

test("the gateway's first arm is the first outgoing flow, not the first declared catch", async () => {
  const swapped = (await witness()).toString("utf8").replace(
    /(<bpmn:sequenceFlow id="Flow_Gateway_Arms_Catch_Beta"[^>]*\/>)(\s*)(<bpmn:sequenceFlow id="Flow_Gateway_Arms_Catch_Alpha"[^>]*\/>)/u,
    "$3$2$1");
  const [started] = await begun(new TextEncoder().encode(swapped), [start([{ name: "ready", value: { kind: "boolean", value: true } }])]);
  assert.deepEqual(users(started ?? []), ["Chosen_Alpha"]);
});

test("of two interrupting Conditional boundaries true at their host's entry only the first fires", async () => {
  const model = inline(`<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Host"/><bpmn:userTask id="Host"/>
    <bpmn:sequenceFlow id="f2" sourceRef="Host" targetRef="E"/><bpmn:endEvent id="E"/>
    <bpmn:boundaryEvent id="B1" attachedToRef="Host">${condition("go")}</bpmn:boundaryEvent>${branch("B1", "W1")}
    <bpmn:boundaryEvent id="B2" attachedToRef="Host">${condition("go")}</bpmn:boundaryEvent>${branch("B2", "W2")}`);
  const [started] = await begun(model, [start([go(true)])]);
  assert.deepEqual(users(started ?? []), ["W1"]);
});

test("an interrupting boundary true at entry withdraws its Sub-Process host's own interrupting Event Sub-Process", async () => {
  const model = inline(`<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Host"/>
    <bpmn:subProcess id="Host"><bpmn:startEvent id="IS"/>${branch("IS", "Inner")}${eventSubProcess("ESP1", "go")}</bpmn:subProcess>
    <bpmn:sequenceFlow id="f2" sourceRef="Host" targetRef="E"/><bpmn:endEvent id="E"/>
    <bpmn:boundaryEvent id="B1" attachedToRef="Host">${condition("go")}</bpmn:boundaryEvent>${branch("B1", "W1")}`);
  const [started] = await begun(model, [start([go(true)])]);
  assert.deepEqual(users(started ?? []), ["W1"]);
});

test("of two interrupting Conditional Event Sub-Processes true at their scope's entry only the first starts", async () => {
  const model = inline(`<bpmn:startEvent id="S"/>${branch("S", "Wait_Work")}${eventSubProcess("ESP1", "go")}${eventSubProcess("ESP2", "go == true")}`);
  const [started] = await begun(model, [start([go(true)])]);
  assert.deepEqual(users(started ?? []), ["ESP1_Work"]);
});

test("a write that makes an interrupting Event Sub-Process and a catch it cancels true fires only the Event Sub-Process", async () => {
  const model = inline(`<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f0" sourceRef="S" targetRef="Fork"/><bpmn:parallelGateway id="Fork"/>
    ${branch("Fork", "W1")}<bpmn:sequenceFlow id="f3" sourceRef="Fork" targetRef="Wait"/>
    <bpmn:intermediateCatchEvent id="Wait">${condition("go == true")}</bpmn:intermediateCatchEvent>${branch("Wait", "W2")}
    ${eventSubProcess("ESP1", "go")}`);
  const [, started] = await begun(model, [start([go(false)]), setGo("W1")]);
  assert.deepEqual(users(started ?? []), ["ESP1_Work"]);
});

test("a write that makes an interrupting boundary and a catch inside its host true fires only the boundary", async () => {
  const model = inline(`<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f0" sourceRef="S" targetRef="Fork"/><bpmn:parallelGateway id="Fork"/>
    ${branch("Fork", "Wait_Work")}<bpmn:sequenceFlow id="f3" sourceRef="Fork" targetRef="Host"/>
    <bpmn:subProcess id="Host"><bpmn:startEvent id="IS"/><bpmn:sequenceFlow id="i1" sourceRef="IS" targetRef="Wait"/>
      <bpmn:intermediateCatchEvent id="Wait">${condition("go == true")}</bpmn:intermediateCatchEvent>${branch("Wait", "Inner")}</bpmn:subProcess>
    <bpmn:sequenceFlow id="f4" sourceRef="Host" targetRef="E"/><bpmn:endEvent id="E"/>
    <bpmn:boundaryEvent id="B1" attachedToRef="Host">${condition("go")}</bpmn:boundaryEvent>${branch("B1", "W1")}`);
  const [, started] = await begun(model, [start([go(false)]), setGo("Wait_Work")]);
  assert.deepEqual(users(started ?? []), ["W1"]);
});
