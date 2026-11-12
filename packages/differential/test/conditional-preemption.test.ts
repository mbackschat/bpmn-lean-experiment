/**
 * PC-CONDITION-03 to PC-CONDITION-05: several Conditional items true in one step fire one at a time, and an
 * interrupting firing withdraws the items it cancels before any other pending firing runs: an interrupting boundary ends
 * the items of its host and of everything inside it, and an interrupting Event Sub-Process those of its parent scope.
 * Items true at one evaluation where firing one withdraws another (two arms of one Event-Based Gateway, two interrupting
 * boundaries of one host, an interrupting Event Sub-Process and a catch it cancels) have no winner of their own: BPMN
 * orders no simultaneous triggers (§13.4.4) and CIB picks by `HashSet` order (#79, CIB-LIM-0053), so the input's
 * ranking `conditionChoices` decides, and an input that leaves the contest undecided is refused as `unsupported`.
 * The oracle is the occurrences each input begins (the journal), not only the waits left open, because a later
 * cancellation can hide a firing that should never have begun. The model is `scenarios/open-rows/conditional-catch/arms.bpmn`,
 * whose two-true-arms run has no retained CIB answer; the other models mutate its shape.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Program, State } from "@bpmn-lean/kernel";

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
/** A start with `variables`, the input ranking `choices` first. */
const start = (variables: Json[], choices: readonly string[] = []): Json =>
  ({ kind: "start", commandId: "s01", instanceId: "Instance_1", variables, conditionChoices: choices.map((elementId) => ({ elementId })) });
/** `go` written true on `element`, the input ranking `choices` first. */
const setGo = (element: string, choices: readonly string[] = []): Json => ({
  kind: "command", commandId: "s02", occurrence: { processInstanceId: "Instance_1", elementId: element, activation: 1 },
  action: { kind: "setVariables", values: [go(true)] }, conditionChoices: choices.map((elementId) => ({ elementId })),
});

/** `bytes` read and decoded under the CIB profile. */
async function programOf(bytes: Uint8Array): Promise<Program> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const read = await readCaseSource({ relativePath: "inline.bpmn", bytes, sha256, overlay: null }, "cibseven-2.2.0");
  assert.equal(read.kind, "read", JSON.stringify(read));
  const decoded = decodeProgram((read as Extract<typeof read, { kind: "read" }>).program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

/** The elements each input begins, in order, after reading `bytes` under the CIB profile. */
async function begun(bytes: Uint8Array, stimuli: readonly Json[]): Promise<string[][]> {
  const program = await programOf(bytes);
  let state: State | null = null;
  const out: string[][] = [];
  for (const stimulus of stimuli) {
    const parsed = stimulusFromJson(stimulus);
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.refusal);
    const outcome = step(hooks, program, state, parsed.value[1]);
    assert.ok(outcome.ok, outcome.ok ? "" : JSON.stringify(outcome.failure));
    state = outcome.value;
    out.push(state.journal.flatMap((transition) => transition.started.map((fact) => fact.occurrence.element)));
  }
  return out;
}

/** The refusal of the last of `stimuli`, every earlier one committing. */
async function refused(bytes: Uint8Array, stimuli: readonly Json[]): Promise<unknown> {
  const program = await programOf(bytes);
  let state: State | null = null;
  for (const [index, stimulus] of stimuli.entries()) {
    const parsed = stimulusFromJson(stimulus);
    assert.ok(parsed.ok, parsed.ok ? "" : parsed.refusal);
    const outcome = step(hooks, program, state, parsed.value[1]);
    if (index === stimuli.length - 1) return outcome.ok ? null : outcome.failure;
    assert.ok(outcome.ok, outcome.ok ? "" : JSON.stringify(outcome.failure));
    state = outcome.value;
  }
  return null;
}

const inline = (body: string): Uint8Array => new TextEncoder().encode(`${header}${body}${footer}`);
const witness = (): Promise<Buffer> => readFile(path.join(projectRoot, "scenarios/open-rows/conditional-catch/arms.bpmn"));
const users = (elements: readonly string[]): string[] => elements.filter((element) => /^(Chosen_|W\d|Inner|Wait_Work|ESP\d_Work)/u.test(element));

test("an Event-Based Gateway whose two Conditional arms are true when armed refuses the input", async () => {
  assert.deepEqual(await refused(await witness(), [start([{ name: "ready", value: { kind: "boolean", value: true } }])]),
    { tag: "unsupported", code: "gateway-arms-simultaneous" });
});

test("two interrupting Conditional boundaries true at their host's entry refuse the input", async () => {
  const model = inline(`<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Host"/><bpmn:userTask id="Host"/>
    <bpmn:sequenceFlow id="f2" sourceRef="Host" targetRef="E"/><bpmn:endEvent id="E"/>
    <bpmn:boundaryEvent id="B1" attachedToRef="Host">${condition("go")}</bpmn:boundaryEvent>${branch("B1", "W1")}
    <bpmn:boundaryEvent id="B2" attachedToRef="Host">${condition("go")}</bpmn:boundaryEvent>${branch("B2", "W2")}`);
  assert.deepEqual(await refused(model, [start([go(true)])]), { tag: "unsupported", code: "conditions-simultaneous" });
});

test("an interrupting boundary and its Sub-Process host's own interrupting Event Sub-Process true at entry fire as ranked", async () => {
  const model = inline(`<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Host"/>
    <bpmn:subProcess id="Host"><bpmn:startEvent id="IS"/>${branch("IS", "Inner")}${eventSubProcess("ESP1", "go")}</bpmn:subProcess>
    <bpmn:sequenceFlow id="f2" sourceRef="Host" targetRef="E"/><bpmn:endEvent id="E"/>
    <bpmn:boundaryEvent id="B1" attachedToRef="Host">${condition("go")}</bpmn:boundaryEvent>${branch("B1", "W1")}`);
  assert.deepEqual(await refused(model, [start([go(true)])]), { tag: "unsupported", code: "conditions-simultaneous" });
  const [boundaryFirst] = await begun(model, [start([go(true)], ["B1"])]);
  assert.deepEqual(users(boundaryFirst ?? []), ["W1"]);
  const [both] = await begun(model, [start([go(true)], ["ESP1_Start", "B1"])]);
  assert.deepEqual(users(both ?? []), ["W1"], "the boundary cancels the handler the start began before its work begins");
  assert.ok(both?.includes("ESP1"), "the Event Sub-Process fired first");
});

test("two interrupting Conditional Event Sub-Processes true at their scope's entry refuse the input", async () => {
  const model = inline(`<bpmn:startEvent id="S"/>${branch("S", "Wait_Work")}${eventSubProcess("ESP1", "go")}${eventSubProcess("ESP2", "go == true")}`);
  assert.deepEqual(await refused(model, [start([go(true)])]), { tag: "unsupported", code: "conditions-simultaneous" });
});

test("a write that makes an interrupting Event Sub-Process and a catch it cancels true fires the ranked one, unranked refused", async () => {
  const model = inline(`<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f0" sourceRef="S" targetRef="Fork"/><bpmn:parallelGateway id="Fork"/>
    ${branch("Fork", "W1")}<bpmn:sequenceFlow id="f3" sourceRef="Fork" targetRef="Wait"/>
    <bpmn:intermediateCatchEvent id="Wait">${condition("go == true")}</bpmn:intermediateCatchEvent>${branch("Wait", "W2")}
    ${eventSubProcess("ESP1", "go")}`);
  assert.deepEqual(await refused(model, [start([go(false)]), setGo("W1")]), { tag: "unsupported", code: "conditions-simultaneous" });
  const [, started] = await begun(model, [start([go(false)]), setGo("W1", ["ESP1_Start"])]);
  assert.deepEqual(users(started ?? []), ["ESP1_Work"]);
});

test("a write that makes an interrupting boundary and a catch inside its host true fires the ranked one, unranked refused", async () => {
  const model = inline(`<bpmn:startEvent id="S"/><bpmn:sequenceFlow id="f0" sourceRef="S" targetRef="Fork"/><bpmn:parallelGateway id="Fork"/>
    ${branch("Fork", "Wait_Work")}<bpmn:sequenceFlow id="f3" sourceRef="Fork" targetRef="Host"/>
    <bpmn:subProcess id="Host"><bpmn:startEvent id="IS"/><bpmn:sequenceFlow id="i1" sourceRef="IS" targetRef="Wait"/>
      <bpmn:intermediateCatchEvent id="Wait">${condition("go == true")}</bpmn:intermediateCatchEvent>${branch("Wait", "Inner")}</bpmn:subProcess>
    <bpmn:sequenceFlow id="f4" sourceRef="Host" targetRef="E"/><bpmn:endEvent id="E"/>
    <bpmn:boundaryEvent id="B1" attachedToRef="Host">${condition("go")}</bpmn:boundaryEvent>${branch("B1", "W1")}`);
  assert.deepEqual(await refused(model, [start([go(false)]), setGo("Wait_Work")]), { tag: "unsupported", code: "conditions-simultaneous" });
  const [, started] = await begun(model, [start([go(false)]), setGo("Wait_Work", ["B1"])]);
  assert.deepEqual(users(started ?? []), ["W1"]);
});
