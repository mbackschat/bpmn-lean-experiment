/**
 * A Message delivery's API criteria under `messageCorrelation = apiCriteria` and its variables under
 * `deliveryVariables = installs` (PC-MESSAGE-08, CIB-EXT-0025): each criterion is checked against the waiting
 * occurrence's own state, a failed one leaves the wait open, and the variables install after the catch's own writes.
 * The expectations are the project-owned criterion contract of the subscriptions specification; no retained CIB answer
 * exists, because the runner realizes no `deliver` criterion.
 *
 * `Start -> T -> End`, `T` a Message catch on `M`, or a Receive Task on it; the Sub-Process form puts the catch `C` and then the User Task `W`
 * inside `T`, whose own variable `local` an input mapping sets.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Program, State } from "@bpmn-lean/kernel";

import {
  activity, append, base, catchEvent, end, flow, literalValue, mapping, message, scope, start, receiveWork, task, text, userWork, wired, withFlows, withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

/** The cibseven selections these rules read: API criteria, installed variables, and a new name created at the instance root. */
const cibCorrelation = { messageCorrelation: "apiCriteria", deliveryVariables: "installs", undeclaredWrite: "atInstanceRoot" };
const awaited = message({ messageRef: "M", name: text("M") });

function admitted(json: Json): Program {
  const decoded = decodeProgram(wired(json));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null);
  return decoded.value;
}

const topLevel = admitted(withOptions(task(catchEvent("T", awaited))(base()), cibCorrelation));

const nested = admitted(withOptions(withFlows(
  append(task(scope("T", "embedded", {}, { inputs: [mapping("local", literalValue({ kind: "string", value: "L-1" }))] }))(base()),
    start("PS", null, [], "T"), catchEvent("C", awaited, [], "T"), activity("W", userWork(), {}, "T"), end("PE", "none", "T")),
  flow("p1", "PS", "C"), flow("p2", "C", "W"), flow("p3", "W", "PE")), cibCorrelation));

const receiving = admitted(withOptions(task(activity("T", receiveWork({ messageRef: "M", name: text("M") })))(base()), cibCorrelation));

const stimulus = (raw: Json) => {
  const decoded = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

const string = (value: string): Json => ({ kind: "string", value });
const integer = (value: number): Json => ({ kind: "integer", value });
const nothing: Json = { kind: "null" };

function started(program: Program, over: Json = {}): State {
  const outcome = step(hooks, program, null, stimulus({
    kind: "start", instanceId: "I",
    variables: [
      { name: "orderId", value: string("A-1") }, { name: "note", value: nothing }, { name: "ticket", value: integer(41) },
    ],
    ...over,
  }));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.value;
}

const criterion = (target: Json, expected: Json): Json => ({ target, expected });

function deliver(program: Program, state: State, element: string, correlation: Json[], variables: Json[] = []) {
  return step(hooks, program, state, stimulus({
    kind: "deliver", occurrence: { processInstanceId: "I", elementId: element, activation: 1 },
    trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" } }, correlation, variables,
  }));
}

const mismatch = { ok: false, failure: { tag: "rejected", code: "message-correlation-mismatch" } };

/** The delivery fires the catch: the wait is gone. */
function fired(outcome: ReturnType<typeof deliver>, element: string): State {
  assert.ok(outcome.ok, JSON.stringify(outcome));
  assert.ok(!outcome.value.openItems.some((item) => item.element === element));
  return outcome.value;
}

const processVariable = (name: string): Json => ({ kind: "processVariable", name });

/** Each case: the criterion that leaves the wait open, then the one that fires it. */
const cases: ReadonlyArray<readonly [string, Json, Json]> = [
  ["a Process variable compares kind and value", criterion(processVariable("ticket"), string("41")), criterion(processVariable("ticket"), integer(41))],
  ["a null matches a present null, never an absent name", criterion(processVariable("remark"), nothing), criterion(processVariable("note"), nothing)],
  ["a criterion names the instance's business key", criterion({ kind: "businessKey" }, string("ORD-9")), criterion({ kind: "businessKey" }, string("ORD-7"))],
  ["a criterion names the public Process instance", criterion({ kind: "processInstance" }, string("I2")), criterion({ kind: "processInstance" }, string("I"))],
  ["at the process level the local scope is the root",
    criterion({ kind: "localVariable", name: "orderId" }, string("A-2")), criterion({ kind: "localVariable", name: "orderId" }, string("A-1"))],
];

for (const [name, wrong, right] of cases) {
  test(`${name}: the mismatch leaves the wait, the match fires it`, () => {
    const state = started(topLevel, { businessKey: "ORD-7" });
    assert.deepEqual(deliver(topLevel, state, "T", [wrong]), mismatch);
    fired(deliver(topLevel, state, "T", [right]), "T");
  });
}

test("a local variable is the waiting scope's own, without inheritance; a Process variable is the root's", () => {
  const state = started(nested);
  assert.deepEqual(deliver(nested, state, "C", [criterion({ kind: "localVariable", name: "orderId" }, string("A-1"))]), mismatch);
  assert.deepEqual(deliver(nested, state, "C", [criterion(processVariable("local"), string("L-1"))]), mismatch);
  fired(deliver(nested, state, "C", [
    criterion({ kind: "localVariable", name: "local" }, string("L-1")), criterion(processVariable("orderId"), string("A-1")),
  ]), "C");
});

test("criteria form a conjunction, and an empty list matches", () => {
  const state = started(topLevel);
  assert.deepEqual(deliver(topLevel, state, "T", [
    criterion(processVariable("orderId"), string("A-1")), criterion(processVariable("ticket"), integer(42)),
  ]), mismatch);
  fired(deliver(topLevel, state, "T", []), "T");
});

test("criteria naming one target twice are rejected", () => {
  const state = started(topLevel);
  const twice = criterion(processVariable("orderId"), string("A-1"));
  assert.deepEqual(deliver(topLevel, state, "T", [twice, twice]),
    { ok: false, failure: { tag: "rejected", code: "criteria-duplicate" } });
});

test("a delivery's variables install by the nearest-owner rule", () => {
  const state = fired(deliver(nested, started(nested), "C", [],
    [{ name: "local", value: string("L-2") }, { name: "confirmedBy", value: string("ops") }]), "C");
  const holders = (name: string) => state.variables
    .filter((entry) => entry.entries.some(([held]) => held === name))
    .map((entry) => [entry.scope === 0 ? "root" : "local", entry.entries.find(([held]) => held === name)?.[1]]);
  assert.deepEqual(holders("confirmedBy"), [["root", { tag: "string", value: "ops" }]]);
  assert.deepEqual(holders("local"), [["local", { tag: "string", value: "L-2" }]]);
});

test("a Receive Task checks the criteria in its own scope and installs the delivery's variables", () => {
  const state = started(receiving);
  assert.deepEqual(deliver(receiving, state, "T", [criterion(processVariable("orderId"), string("A-2"))]), mismatch);
  const completed = deliver(receiving, state, "T", [criterion(processVariable("orderId"), string("A-1"))],
    [{ name: "confirmedBy", value: string("ops") }]);
  assert.ok(completed.ok, JSON.stringify(completed));
  assert.equal(completed.value.status, "completed");
  assert.deepEqual(completed.value.variables.find((entry) => entry.scope === 0)?.entries.find(([name]) => name === "confirmedBy"),
    ["confirmedBy", { tag: "string", value: "ops" }]);
});
