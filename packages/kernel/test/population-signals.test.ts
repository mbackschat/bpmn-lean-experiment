/**
 * `Population.broadcast` and the intent cascade (PC-SIGNAL-04, CIB-INT-0033): a Signal reaches the snapshot taken when
 * its delivery begins, waiting catches of running instances by instance identifier and arming order, then the root
 * Signal starts of every current deployment, or the command's explicit `order`; each receiver is its own unit of
 * commitment, a receiver withdrawn before its turn is `skipped`, and the intents a committed receiver leaves cascade
 * depth-first before the next receiver, until the cascade bound stops them. A broadcast receiver passes the standards
 * profile, where a caller's targeted Signal delivery does not (`SignalReach`). A delivered publication's and an instance
 * input's intents cascade after their step, into `committed`'s `cascade` and `inputCascades`, each present only when
 * non-empty.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { cascadeInstanceId, runPopulation } from "@bpmn-lean/kernel";

import {
  activity, base, catchEvent, criterion, end, eventBased, flow, gateway, message, qName, signal, start, text, userWork, variable, wired,
  withOptions,
} from "./admission-refusal-support.ts";

type Json = Record<string, unknown>;

const signalOf = (localName: string): Json => ({ signal: { payload: { signalRef: qName(localName), name: text(localName) } } });
const throwOf = (localName: string): Json => ({
  signal: {
    payload: { signalRef: qName(localName), name: text(localName), payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false },
  },
});

/** `key`'s process with `elements` and `flows`, every flow list rebuilt from the flows. */
const model = (key: string, elements: Json[], flows: Json[], options: Json = {}): Json => {
  const shaped = wired(withOptions({ ...base(), elements, flows }, options));
  return { ...shaped, identity: { ...(shaped.identity as Json), processId: key, sourceSha256: `${key}-sha` } };
};
/** Waits at the catch `C` of `Sig`, then at the User Task `T`. */
const waiter = (key: string, options: Json = {}): Json => model(key,
  [start("S"), catchEvent("C", signal()), activity("T", userWork()), end("E")],
  [flow("f1", "S", "C"), flow("f2", "C", "T"), flow("f3", "T", "E")], options);
/** A root Signal start of `localName` leading to the User Task `T`. */
const starter = (key: string, localName = "Sig"): Json => model(key,
  [start("S", signalOf(localName)), activity("T", userWork()), end("E")], [flow("f1", "S", "T"), flow("f2", "T", "E")]);
/** A root Signal start of `Go` whose instance ends at once throwing `Sig`. */
const relay = (key: string): Json => model(key, [start("S", signalOf("Go")), end("E", throwOf("Sig"))], [flow("f1", "S", "E")]);
/** Catches `Sig` at `C`, throws `Sig` at `Th` and waits at `C` again, so two instances relay one Signal forever. */
const echo = (key: string): Json => {
  const header = { id: "Th", origin: { definition: null, sourceId: "Th" }, sourceType: "intermediateThrowEvent", parent: null };
  const role = { throw: { record: throwOf("Sig") } };
  const rethrow = { event: { header, payload: { role, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] } } };
  return model(key, [start("S"), catchEvent("C", signal()), rethrow], [flow("f1", "S", "C"), flow("f2", "C", "Th"), flow("f3", "Th", "C")]);
};
/** A none start that ends at once throwing `Sig`. */
const thrower = (key: string): Json => model(key, [start("S"), end("E", throwOf("Sig"))], [flow("f1", "S", "E")]);
/** Waits at `C` for `M_Order` through Operation `O`, correlated on `OrderKey = orderId`, then ends throwing `Sig`. */
const ordered = { kind: "operationMessage", messageId: "M_Order", interfaceId: "I", interfaceOperationId: "O" };
const orderReceiver = (key: string): Json => {
  const order = message({ messageRef: "M_Order", name: text("Order"), interfaceRef: "I", operationRef: "O",
    correlation: [criterion("OrderKey", variable("orderId"))] });
  return { ...model(key, [start("S"), catchEvent("C", order), end("E", throwOf("Sig"))], [flow("f1", "S", "C"), flow("f2", "C", "E")]),
    variables: ["orderId"] };
};
/** An Event-Based Gateway whose two arms both catch `Sig`: the first to fire withdraws the second. */
const forked = (key: string): Json => model(key,
  [start("S"), gateway("G", eventBased()), catchEvent("C1", signal()), catchEvent("C2", signal()), end("E1"), end("E2")],
  [flow("f1", "S", "G"), flow("g1", "G", "C1"), flow("g2", "G", "C2"), flow("h1", "C1", "E1"), flow("h2", "C2", "E2")]);

const definition = (definitionRef: string, program: Json): Json => ({
  definitionRef,
  bpmn: { id: definitionRef, relativePath: `scenarios/${definitionRef}.bpmn`, sha256: (program.identity as Json).sourceSha256, sourceOverlay: null },
});

/** Deploy `programs` at 0 as `d1`, `d2`, … and run `steps`, each step's digest its JSON text. */
function populate(programs: readonly Json[], steps: readonly Json[]): Json {
  const definitions = programs.map((program, index) => definition(`d${String(index + 1)}`, program));
  const scenario = { kind: "populationScenario", id: "population-signals", profile: "bpmn-2.0.2", definitions, steps };
  return runPopulation(programs, scenario, steps.map((step) => JSON.stringify(step))) as Json;
}

const begin = (definitionRef: string, instanceId: string): Json =>
  ({ kind: "instance", definitionRef, instanceId, stimulus: { kind: "start", commandId: `start-${instanceId}`, instanceId, variables: [] } });
const sig = { signalRef: { id: "Sig" } };
const send = (commandId: string, over: Json = {}): Json => ({ kind: "broadcast", commandId, address: sig, variables: [], at: 100, ...over });
const occurrence = (processInstanceId: string, elementId: string): Json => ({ processInstanceId, elementId, activation: 1 });
const delivered = (processInstanceId: string, elementId: string): Json => ({ kind: "delivered", target: occurrence(processInstanceId, elementId) });
const startedId = (commandId: string, deploymentId: number, startEvent = "S"): string =>
  `start:${String(commandId.length)}:${commandId}:1:${String(deploymentId)}:${String(startEvent.length)}:${startEvent}`;
const started = (instanceId: string, deploymentId: number): Json => ({ kind: "started", instanceId, deploymentId, version: 1, startEvent: "S" });
const resolutions = (result: Json): unknown[] => (result.steps as Json[]).map((step) => step.resolution);
const waits = (result: Json): Array<[unknown, unknown[]]> => (result.processStates as Json[]).map((state) =>
  [state.instanceId, (state.openWaits as Json[]).map((wait) => (wait.id as Json).elementId)]);

test("under the standards profile a caller's targeted Signal delivery is rejected and a broadcast's receiver commits", () => {
  const result = populate([waiter("Orders")], [
    begin("d1", "W1"),
    { kind: "instance", definitionRef: "d1", instanceId: "W1",
      stimulus: { kind: "deliver", commandId: "targeted", occurrence: occurrence("W1", "C"), trigger: { kind: "signal", signalRef: { id: "Sig" } } } },
    send("b1"),
  ]);
  assert.deepEqual(result.inputFailures, [{ commandId: "targeted", outcome: "rejected", code: "signal-delivery-targeted" }]);
  assert.deepEqual(resolutions(result), [{ kind: "fanOut", entries: [delivered("W1", "C")] }]);
  assert.deepEqual(waits(result), [["W1", ["T"]]]);
});

test("a broadcast reaches waiting catches by instance identifier, then current starts, or the command's order", () => {
  const programs = [waiter("Orders"), starter("Audit")];
  const result = populate(programs, [begin("d1", "W2"), begin("d1", "W1"), send("b1")]);
  assert.deepEqual(resolutions(result), [{ kind: "fanOut", entries: [delivered("W1", "C"), delivered("W2", "C"), started(startedId("b1", 2), 2)] }]);
  const reversed = [
    { kind: "start", deploymentId: 2, startEvent: "S" },
    { kind: "occurrence", occurrence: occurrence("W2", "C") },
    { kind: "occurrence", occurrence: occurrence("W1", "C") },
  ];
  const ordered = populate(programs, [begin("d1", "W2"), begin("d1", "W1"), send("b1", { order: reversed }), send("b2", { order: reversed.slice(0, 1) })]);
  assert.deepEqual(resolutions(ordered), [
    { kind: "fanOut", entries: [started(startedId("b1", 2), 2), delivered("W2", "C"), delivered("W1", "C")] },
    { kind: "fanOut", entries: [started(startedId("b2", 2), 2)] },
  ]);
  const mismatch = populate(programs, [begin("d1", "W1"), send("b1", { order: reversed })]);
  assert.deepEqual(resolutions(mismatch), [{ kind: "rejected", code: "discovery-order-mismatch" }]);
});

test("a broadcast's variables are rejected where a receiver's Signal carries no data, and installed where it does", () => {
  const variables = [{ name: "lot", value: { kind: "string", value: "L-1" } }];
  const standards = populate([waiter("Orders")], [begin("d1", "W1"), send("b1", { variables })]);
  assert.deepEqual(resolutions(standards), [{ kind: "rejected", code: "broadcast-variables-not-admitted" }]);
  const carrying = populate([waiter("Orders", { signalPayload: "variables", undeclaredWrite: "atInstanceRoot" })], [begin("d1", "W1"), send("b1", { variables })]);
  assert.deepEqual(resolutions(carrying), [{ kind: "fanOut", entries: [delivered("W1", "C")] }]);
  const installed = ((carrying.processStates as Json[])[0]?.variables as Json[]).map((entry) => entry.name);
  assert.deepEqual(installed, ["lot"]);
});

test("a started instance's thrown Signal cascades depth-first, its starts named after the throw", () => {
  const result = populate([relay("Relay"), waiter("Orders"), starter("Audit")], [begin("d2", "W1"), send("b1", { address: { signalRef: { id: "Go" } } })]);
  const relayed = startedId("b1", 1);
  const emitter = { processInstanceId: relayed, element: "E", activation: 1 };
  assert.deepEqual(resolutions(result), [{
    kind: "fanOut",
    entries: [started(relayed, 1), delivered("W1", "C"), started(cascadeInstanceId("b1", 3, "S", emitter), 3)],
  }]);
});

test("a receiver its own State withdrew before its turn is skipped, read off the open waits", () => {
  const result = populate([forked("Forked")], [begin("d1", "F1"), send("b1")]);
  assert.deepEqual(resolutions(result), [{
    kind: "fanOut", entries: [delivered("F1", "C1"), { kind: "skipped", target: occurrence("F1", "C2") }],
  }]);
});

test("a cascade that never settles stops at the cascade bound, the receivers before it committed", () => {
  const result = populate([echo("Echo")], [begin("d1", "A"), begin("d1", "B"), send("b1")]);
  const [fanOut] = resolutions(result) as Json[];
  const entries = fanOut?.entries as Json[];
  // The bound is `Step.closureBound` (100000) receivers; each relay's own receiver is the other instance's catch.
  assert.equal(entries.length, 100001);
  assert.deepEqual(entries.slice(0, 3), [delivered("A", "C"), delivered("B", "C"), { kind: "delivered", target: { ...occurrence("A", "C"), activation: 2 } }]);
  assert.ok(entries.slice(0, -1).every((entry) => entry.kind === "delivered"));
  assert.deepEqual(entries.at(-1), {
    kind: "failed", target: { kind: "occurrence", occurrence: { ...occurrence("A", "C"), activation: 50001 } },
    outcome: "unsupported", code: "population-cascade-bound",
  });
});

test("an instance input's or a delivered publication's thrown Signal cascades after its step, reported only when it reached a receiver", () => {
  const orderId = [{ name: "orderId", value: { kind: "string", value: "A" } }];
  const result = populate([thrower("Thrower"), waiter("Orders"), orderReceiver("Receiver")], [
    begin("d1", "X1"),
    begin("d2", "W1"),
    begin("d1", "X2"),
    begin("d2", "W2"),
    { kind: "instance", definitionRef: "d3", instanceId: "R1",
      stimulus: { kind: "start", commandId: "start-R1", instanceId: "R1", variables: orderId } },
    { kind: "publish", commandId: "p1", address: { channel: ordered }, mode: "any", variables: [],
      criteria: [{ target: { kind: "processVariable", name: "OrderKey" }, expected: { kind: "string", value: "A" } }] },
  ]);
  // X1 throws before any catch waits, and W1, W2 and R1 throw nothing: none of them has an entry, never an empty one.
  assert.deepEqual(result.inputCascades, [{ commandId: "start-X2", entries: [delivered("W1", "C")] }]);
  assert.deepEqual(resolutions(result), [{ kind: "committed", target: occurrence("R1", "C"), cascade: [delivered("W2", "C")] }]);
  const quiet = populate([thrower("Thrower")], [begin("d1", "X1")]);
  assert.equal("inputCascades" in quiet, false);
});
