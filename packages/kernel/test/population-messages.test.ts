/**
 * `Population.publish` (PC-MESSAGE-02, PC-MESSAGE-08 population side): a publication tries the open Message
 * subscriptions first unless it is start-only, then the root Message starts unless it is executions-only, each by
 * exact cardinality; a definition selector restricts both to one deployment, and without one a start reaches only the
 * current deployment of each key (CIB-INT-0031). A started instance takes the derived identity
 * `start:<len>:<commandId>:<len>:<deploymentId>:<len>:<startEvent>`; the command ledger replays a command of equal
 * content and rejects one of different content. The digests here stand for the harness's canonical wire digest.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runPopulation } from "@bpmn-lean/kernel";

import {
  activity, base, catchEvent, criterion, duration, end, flow, message, replace, start, text, userWork, variable, wired, withOptions,
} from "./admission-refusal-support.ts";

type Json = Record<string, unknown>;

const rooted = (program: Json, key: string): Json =>
  ({ ...program, identity: { ...(program.identity as Json), processId: key, sourceSha256: `${key}-sha` } });

const orderMessage = (correlation: Json[] = []): Json => message({ messageRef: "M_Order", name: text("Order"), correlation });

/** `key`'s process: a root Message start on `M_Order` named `Order`, then a User Task. */
const starting = (key: string, options: Json = {}): Json =>
  rooted(wired(withOptions(replace(replace(base(), "S", start("S", orderMessage())), "T", activity("T", userWork())), options)), key);

/** A none start to a catch of `M_Order` through Operation `O` correlated on `OrderKey = orderId`, and a root Message
 * start on the same channel. */
const operationMessage = (correlation: Json[] = []): Json =>
  message({ messageRef: "M_Order", name: text("Order"), interfaceRef: "I", operationRef: "O", correlation });
const waiting = rooted(wired({
  ...base(),
  variables: ["orderId"],
  elements: [start("S"), start("SM", operationMessage()), catchEvent("C", operationMessage([criterion("OrderKey", variable("orderId"))])), end("E")],
  flows: [flow("f1", "S", "C"), flow("f2", "C", "E"), flow("f3", "SM", "E")],
}), "Waiting");

const order = { kind: "directMessage", messageId: "M_Order" };
const ordered = { kind: "operationMessage", messageId: "M_Order", interfaceId: "I", interfaceOperationId: "O" };
const definition = (definitionRef: string, program: Json): Json => ({
  definitionRef,
  bpmn: {
    id: definitionRef, relativePath: `scenarios/${definitionRef}.bpmn`, sha256: (program.identity as Json).sourceSha256, sourceOverlay: null,
  },
});

/** Run `steps` over `definitions` (one per program, each deployed once at 0 unless a step deploys it), deploying
 * `sources` in deploy order; each step's digest is its JSON text. */
function populate(definitions: readonly Json[], sources: readonly Json[], steps: readonly Json[]): Json {
  const scenario = { kind: "populationScenario", id: "population-messages", profile: "bpmn-2.0.2", definitions, steps };
  return runPopulation(sources, scenario, steps.map((step) => JSON.stringify(step))) as Json;
}

const publish = (commandId: string, address: Json, mode: string, over: Json = {}): Json =>
  ({ kind: "publish", commandId, address, criteria: [], variables: [], mode, ...over });
const keyed = (value: string): Json[] => [{ target: { kind: "processVariable", name: "OrderKey" }, expected: { kind: "string", value } }];
const resolutions = (result: Json): unknown[] => (result.steps as Json[]).map((step) => step.resolution);
const started = (instanceId: string, deploymentId: number, version: number): Json =>
  ({ kind: "fanOut", entries: [{ kind: "started", instanceId, deploymentId, version, startEvent: "S" }] });

test("a start-only publication starts its key's current deployment, an exact deployment, or each key's current one", () => {
  const program = starting("Order");
  const result = populate([definition("d1", program)], [program, program], [
    { kind: "deploy", definitionRef: "d1", at: 0 },
    { kind: "deploy", definitionRef: "d1", at: 10 },
    publish("p1", { definition: { processKey: "Order" }, channel: order }, "startOnly"),
    publish("p2", { definition: { deploymentId: 1 }, channel: order }, "startOnly"),
    publish("p3", { channel: order }, "startOnly"),
    publish("p4", { definition: { deploymentId: 9 }, channel: order }, "startOnly"),
    publish("p5", { definition: { processKey: "Missing" }, channel: order }, "startOnly"),
  ]);
  assert.deepEqual(resolutions(result), [
    started("start:2:p1:1:2:1:S", 2, 2),
    started("start:2:p2:1:1:1:S", 1, 1),
    started("start:2:p3:1:2:1:S", 2, 2),
    { kind: "rejected", code: "definition-not-deployed" },
    { kind: "rejected", code: "definition-not-deployed" },
  ]);
  assert.equal((result.processStates as Json[]).length, 3);
});

test("a start the start step refuses is the fan-out's failed entry and starts nothing", () => {
  const program = starting("Order");
  const result = populate([definition("d1", program)], [program], [
    publish("p1", { channel: order }, "startOnly", { payload: { kind: "string", value: "unexpected" } }),
  ]);
  assert.deepEqual(resolutions(result), [{
    kind: "fanOut",
    entries: [{ kind: "failed", target: { kind: "start", deploymentId: 1, startEvent: "S" }, outcome: "rejected", code: "message-payload-not-accepted" }],
  }]);
  assert.deepEqual(result.processStates, []);
});

test("a Message name addresses a start only under Message name addressing", () => {
  const addressed = starting("Order", { messageNames: "addresses", evaluator: "juel" });
  const described = starting("Order");
  const byName = [publish("p1", { name: "Order" }, "any")];
  assert.deepEqual(resolutions(populate([definition("d1", addressed)], [addressed], byName)), [started("start:2:p1:1:1:1:S", 1, 1)]);
  assert.deepEqual(resolutions(populate([definition("d1", described)], [described], byName)), [{ kind: "noMatch" }]);
});

test("two reachable starts, in one deployment or in two keys' current deployments, are ambiguous and start nothing", () => {
  const twoStarts = rooted(wired({
    ...base(),
    elements: [start("S", orderMessage()), start("S2", orderMessage()), activity("T", userWork()), end("E")],
    flows: [flow("f1", "S", "T"), flow("f3", "S2", "T"), flow("f2", "T", "E")],
  }), "Twice");
  const first = starting("A");
  const second = starting("B");
  const within = populate([definition("d1", twoStarts)], [twoStarts], [publish("p1", { channel: order }, "startOnly")]);
  assert.deepEqual(resolutions(within), [{ kind: "ambiguous" }]);
  const across = populate([definition("d1", first), definition("d2", second)], [first, second], [
    publish("p1", { channel: order }, "startOnly"),
    publish("p2", { definition: { processKey: "B" }, channel: order }, "startOnly"),
  ]);
  assert.deepEqual(resolutions(across), [{ kind: "ambiguous" }, started("start:2:p2:1:2:1:S", 2, 1)]);
  assert.equal((across.processStates as Json[]).length, 1);
});

test("a publication delivers to its sole open subscription before any start, and falls back to a start unless executions-only", () => {
  const begin = (instanceId: string, businessKey: string): Json => ({
    kind: "instance", definitionRef: "d1", instanceId,
    stimulus: { kind: "start", commandId: `start-${instanceId}`, instanceId, businessKey, variables: [{ name: "orderId", value: { kind: "string", value: "o-7" } }] },
  });
  const result = populate([definition("d1", waiting)], [waiting], [
    begin("W1", "bk-1"),
    publish("q1", { channel: ordered }, "executionsOnly", { criteria: keyed("o-9") }),
    publish("q2", { channel: ordered }, "any", { criteria: keyed("o-8") }),
    publish("q3", { channel: ordered }, "executionsOnly", { criteria: keyed("o-7"), businessKey: "bk-2" }),
    publish("q4", { channel: ordered }, "any", { criteria: keyed("o-7"), businessKey: "bk-1" }),
  ]);
  assert.deepEqual(resolutions(result), [
    { kind: "noMatch" },
    { kind: "fanOut", entries: [{ kind: "started", instanceId: "start:2:q2:1:1:2:SM", deploymentId: 1, version: 1, startEvent: "SM" }] },
    { kind: "noMatch" },
    { kind: "committed", target: { processInstanceId: "W1", elementId: "C", activation: 1 } },
  ]);
});

test("a replayed command answers its recorded resolution and one of different content is rejected, changing nothing", () => {
  const program = starting("Order");
  const sent = publish("p1", { channel: order }, "startOnly");
  const result = populate([definition("d1", program)], [program], [
    sent, sent, publish("p1", { channel: order }, "any"),
  ]);
  assert.deepEqual((result.steps as Json[]).map((step) => [step.ordinal, step.resolution]), [
    [1, started("start:2:p1:1:1:1:S", 1, 1)],
    [2, started("start:2:p1:1:1:1:S", 1, 1)],
    [3, { kind: "rejected", code: "command-content-mismatch" }],
  ]);
  assert.equal((result.processStates as Json[]).length, 1);
});

test("criteria naming one target twice are rejected, for every target kind, and distinct targets are not", () => {
  const program = starting("Order", { messageCorrelation: "apiCriteria" });
  const criterion = (target: Json, value: string): Json => ({ target, expected: { kind: "string", value } });
  const targets: Json[] = [
    { kind: "processVariable", name: "a" }, { kind: "localVariable", name: "a" }, { kind: "businessKey" }, { kind: "processInstance" },
  ];
  const twice = targets.map((target, index) =>
    publish(`twice-${String(index)}`, { channel: order }, "executionsOnly", { criteria: [criterion(target, "x"), criterion(target, "y")] }));
  const distinct = [
    [{ kind: "processVariable", name: "a" }, { kind: "processVariable", name: "b" }],
    [{ kind: "processVariable", name: "a" }, { kind: "localVariable", name: "a" }],
    [{ kind: "localVariable", name: "a" }, { kind: "localVariable", name: "b" }],
    [{ kind: "businessKey" }, { kind: "processInstance" }],
  ].map((pair, index) => publish(`distinct-${String(index)}`, { channel: order }, "executionsOnly",
    { criteria: pair.map((target) => criterion(target, "x")) }));
  const result = populate([definition("d1", program)], [program], [...twice, ...distinct]);
  const duplicate = { kind: "rejected", code: "criteria-duplicate" };
  assert.deepEqual(resolutions(result), [...twice.map(() => duplicate), ...distinct.map(() => ({ kind: "noMatch" }))]);
});

test("an instance step reaches an instance a publication started, by its derived identity", () => {
  const program = starting("Order");
  const instanceId = "start:2:p1:1:1:1:S";
  const result = populate([definition("d1", program)], [program], [
    publish("p1", { channel: order }, "startOnly"),
    {
      kind: "instance", definitionRef: "d1", instanceId,
      stimulus: {
        kind: "command", commandId: "complete", occurrence: { processInstanceId: instanceId, elementId: "T", activation: 1 },
        action: { kind: "completeUserTask", values: [] },
      },
    },
  ]);
  assert.equal(result.inputFailures, undefined);
  assert.equal(((result.processStates as Json[])[0] as Json).status, "completed");
});

test("a delivery takes the publication's logical time, so a Timer its step arms counts from the command", () => {
  const timed = rooted(wired({
    ...base(),
    variables: ["orderId"],
    elements: [
      start("S"), catchEvent("C", operationMessage([criterion("OrderKey", variable("orderId"))])), catchEvent("W", duration("PT1M")), end("E"),
    ],
    flows: [flow("f1", "S", "C"), flow("f3", "C", "W"), flow("f2", "W", "E")],
  }), "Timed");
  const result = populate([definition("d1", timed)], [timed], [
    {
      kind: "instance", definitionRef: "d1", instanceId: "W1", at: 0,
      stimulus: { kind: "start", commandId: "start-W1", instanceId: "W1", variables: [{ name: "orderId", value: { kind: "string", value: "o-7" } }] },
    },
    publish("q1", { channel: ordered }, "executionsOnly", { criteria: keyed("o-7"), at: 1000 }),
  ]);
  assert.deepEqual(resolutions(result), [{ kind: "committed", target: { processInstanceId: "W1", elementId: "C", activation: 1 } }]);
  const state = (result.processStates as Json[])[0] as Json;
  assert.equal(state.logicalTimeMs, 1000);
  assert.deepEqual((state.openWaits as Json[]).map((wait) => wait.detail), [{ kind: "timer", deadlineMs: 61000, recurrence: null }]);
});

test("criteria the reading refuses refuse the publication before any receiver or start is sought", () => {
  const listed = [{ target: { kind: "processVariable", name: "orderId" }, expected: { kind: "list", value: [{ kind: "string", value: "o-7" }] } }];
  const program = starting("Order", { messageCorrelation: "apiCriteria" });
  const notPrimitive = { kind: "unsupported", code: "correlation-criterion-not-primitive" };
  const api = populate([definition("d1", program)], [program], [
    publish("p1", { channel: order }, "any", { criteria: listed }),
    publish("p2", { channel: order }, "startOnly", { criteria: listed }),
    publish("p3", { channel: order }, "executionsOnly", { criteria: listed }),
  ]);
  assert.deepEqual(resolutions(api), [notPrimitive, { kind: "rejected", code: "criteria-start-only" }, notPrimitive]);
  assert.deepEqual(api.processStates, []);
  const modeled = populate([definition("d1", waiting)], [waiting], [
    {
      kind: "instance", definitionRef: "d1", instanceId: "W1",
      stimulus: { kind: "start", commandId: "start-W1", instanceId: "W1", variables: [{ name: "orderId", value: { kind: "string", value: "o-7" } }] },
    },
    publish("q1", { channel: ordered }, "any", { criteria: [{ target: { kind: "businessKey" }, expected: { kind: "string", value: "o-7" } }] }),
  ]);
  assert.deepEqual(resolutions(modeled), [{ kind: "unsupported", code: "profile-message-correlation-api-criteria" }]);
  assert.equal((modeled.processStates as Json[]).length, 1);
});

test("a start-only publication is rejected for a variable criterion and refused for any other criterion, starting nothing", () => {
  const program = starting("Order", { messageCorrelation: "apiCriteria" });
  const text = (value: string): Json => ({ kind: "string", value });
  const targets: Json[] = [
    { kind: "processVariable", name: "orderId" }, { kind: "localVariable", name: "orderId" }, { kind: "businessKey" }, { kind: "processInstance" },
  ];
  const result = populate([definition("d1", program)], [program], [
    ...targets.map((target, index) =>
      publish(`criterion-${String(index)}`, { channel: order }, "startOnly", { criteria: [{ target, expected: text("o-7") }] })),
    publish("bare", { channel: order }, "startOnly"),
  ]);
  const rejected = { kind: "rejected", code: "criteria-start-only" };
  const refused = { kind: "unsupported", code: "start-criterion-not-variable" };
  assert.deepEqual(resolutions(result), [rejected, rejected, refused, refused, started("start:4:bare:1:1:1:S", 1, 1)]);
  assert.equal((result.processStates as Json[]).length, 1);
});

test("a publication that falls through to a start is refused for a business-key or instance criterion and starts for a variable one", () => {
  const program = starting("Order", { messageCorrelation: "apiCriteria" });
  const text = (value: string): Json => ({ kind: "string", value });
  const result = populate([definition("d1", program)], [program], [
    publish("by-key", { channel: order }, "any", { criteria: [{ target: { kind: "businessKey" }, expected: text("ORD-7") }] }),
    publish("by-instance", { channel: order }, "any", { criteria: [{ target: { kind: "processInstance" }, expected: text("I-1") }] }),
    publish("by-variable", { channel: order }, "any", { criteria: [{ target: { kind: "processVariable", name: "orderId" }, expected: text("o-7") }] }),
  ]);
  const refused = { kind: "unsupported", code: "start-criterion-not-variable" };
  assert.deepEqual(resolutions(result), [refused, refused, started("start:11:by-variable:1:1:1:S", 1, 1)]);
  const states = result.processStates as Json[];
  assert.equal(states.length, 1);
  assert.deepEqual((states[0] as Json).variables, []);
});
