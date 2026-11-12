/**
 * `Population.evaluateConditions` (PC-CONDITION-02, CIB-EXT-0044): every Conditional root start in scope is evaluated
 * over the submitted variables alone, deployments in deploy order and starts in document order unless the command gives
 * an `order`; each start that holds starts its own instance `start:<len>:<commandId>:<len>:<deploymentId>:<len>:<start>`
 * at the command's time, a false start adds nothing, and a start whose predicate fails is its own `failed` entry beside
 * the instances the others started.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeProgram, fixture, runPopulation, step, stimulusFromJson } from "./lean-paired.ts";

import {
  activity, append, base, catchEvent, end, flow, juel, qName, replace, signal, start, text, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";

type Json = Record<string, unknown>;

const conditional = { conditionalStart: "submittedContext", evaluator: "juel", conditionalRetrigger: "eachWrite" };

/** A Conditional trigger on `${<name> >= 1000}`, or on `${<name>}` alone when `threshold` is false. */
const condition = (name: string, threshold = true): Json => {
  const read = { identifier: { name } };
  const predicate = threshold
    ? juel(read, { integer: { digits: "1000" } }, { binary: { payload: { op: "ge", left: 0, right: 1 } } })
    : juel(read);
  return { condition: { payload: { condition: predicate, variableName: null, variableEvents: [] } } };
};

/** `key`'s process: root starts `starts` (identifier and trigger, the first replacing `S`), each leading to a User Task. */
const processModel = (key: string, starts: readonly (readonly [string, Json | null])[]): Json => {
  const [first, ...rest] = starts;
  let program = withOptions(replace(replace(base(), "S", start(first?.[0] ?? "S", first?.[1] ?? null)), "T", activity("T", userWork())), conditional);
  for (const [index, [id, trigger]] of rest.entries()) program = withFlows(append(program, start(id, trigger)), flow(`g${String(index)}`, id, "T"));
  const shaped = wired(program);
  return { ...shaped, identity: { ...(shaped.identity as Json), processId: key, sourceSha256: `${key}-sha` } };
};

const definition = (definitionRef: string, program: Json): Json => ({
  definitionRef,
  bpmn: { id: definitionRef, relativePath: `scenarios/${definitionRef}.bpmn`, sha256: (program.identity as Json).sourceSha256, sourceOverlay: null },
});

/** Deploy each of `programs` in order at 0 as `d1`, `d2`, … and run `steps`, each step's digest its JSON text. */
function populate(programs: readonly Json[], steps: readonly Json[]): Json {
  const definitions = programs.map((program, index) => definition(`d${String(index + 1)}`, program));
  const scenario = { kind: "populationScenario", id: "population-conditions", profile: "bpmn-2.0.2", definitions, steps };
  return runPopulation(programs, scenario, steps.map((step) => JSON.stringify(step))) as Json;
}

const integer = (value: number): Json => ({ kind: "integer", value });
const evaluate = (commandId: string, variables: readonly Json[], over: Json = {}): Json =>
  ({ kind: "evaluateConditions", commandId, variables, at: 5_000, ...over });
const amount = (value: number): Json[] => [{ name: "amount", value: integer(value) }];
const resolutions = (result: Json): unknown[] => (result.steps as Json[]).map((step) => step.resolution);
const started = (commandId: string, deploymentId: number, startEvent: string): Json => ({
  kind: "started", instanceId: `start:${String(commandId.length)}:${commandId}:1:${String(deploymentId)}:${String(startEvent.length)}:${startEvent}`,
  deploymentId, version: 1, startEvent,
});
const startTarget = (deploymentId: number, startEvent: string): Json => ({ kind: "start", deploymentId, startEvent });
const fanOut = (...entries: Json[]): Json => ({ kind: "fanOut", entries });
const rejected = (code: string): Json => ({ kind: "rejected", code });

test("every start that holds starts its own instance at the command's time, deployments in deploy order", () => {
  const result = populate([processModel("Orders", [["Large", condition("amount")]]), processModel("Audit", [["Big", condition("amount")]])], [
    evaluate("c1", amount(2_500), { businessKey: "o-7" }),
    evaluate("c2", amount(10)),
  ]);
  assert.deepEqual(resolutions(result), [fanOut(started("c1", 1, "Large"), started("c1", 2, "Big")), fanOut()]);
  const states = result.processStates as Json[];
  assert.deepEqual(states.map((state) => [state.instanceId, state.logicalTimeMs]),
    [[started("c1", 1, "Large").instanceId, 5_000], [started("c1", 2, "Big").instanceId, 5_000]]);
});

test("a start whose predicate fails is its own failed entry and leaves the other starts' instances in place", () => {
  const program = processModel("Orders", [["Large", condition("amount")], ["Flagged", condition("flag", false)]]);
  const result = populate([program], [evaluate("c1", [...amount(2_500), { name: "flag", value: { kind: "null" } }])]);
  assert.deepEqual(resolutions(result), [fanOut(
    started("c1", 1, "Large"),
    { kind: "failed", target: startTarget(1, "Flagged"), outcome: "rolledBack", code: "condition-not-boolean" },
  )]);
  assert.equal((result.processStates as Json[]).length, 1);
});

test("an explicit order is followed when it names each start once and rejected otherwise", () => {
  const programs = [processModel("Orders", [["Large", condition("amount")]]), processModel("Audit", [["Big", condition("amount")]])];
  const reversed = [startTarget(2, "Big"), startTarget(1, "Large")];
  const result = populate(programs, [
    evaluate("c1", amount(2_500), { order: reversed }),
    evaluate("c2", amount(2_500), { order: [startTarget(2, "Big")] }),
    evaluate("c3", amount(2_500), { order: [startTarget(2, "Big"), startTarget(2, "Big")] }),
    evaluate("c4", amount(2_500), {
      order: [startTarget(2, "Big"), { kind: "occurrence", occurrence: { processInstanceId: "I", elementId: "T", activation: 1 } }],
    }),
  ]);
  assert.deepEqual(resolutions(result), [
    fanOut(started("c1", 2, "Big"), started("c1", 1, "Large")),
    rejected("discovery-order-mismatch"),
    rejected("discovery-order-mismatch"),
    rejected("discovery-order-mismatch"),
  ]);
});

test("a selector narrows the scope, and a scope without a Conditional start or deployment is rejected", () => {
  const programs = [processModel("Orders", [["Large", condition("amount")]]), processModel("Plain", [["S", null]])];
  const result = populate(programs, [
    evaluate("c1", amount(2_500), { definition: { processKey: "Orders" } }),
    evaluate("c2", amount(2_500), { definition: { deploymentId: 2 } }),
    evaluate("c3", amount(2_500), { definition: { deploymentId: 9 } }),
    evaluate("c4", amount(2_500), { definition: { processKey: "Missing" } }),
  ]);
  assert.deepEqual(resolutions(result), [
    fanOut(started("c1", 1, "Large")),
    rejected("no-conditional-start"),
    rejected("definition-not-deployed"),
    rejected("definition-not-deployed"),
  ]);
});

test("a cascade-started instance's identity adds the throw's occurrence as one length-prefixed key", () => {
  const emitter = { processInstanceId: "Bestellung-ä", elementId: "Wurf-€", activation: 2 };
  // "ä" is two UTF-8 bytes and "€" three, so each length counts bytes, not characters.
  assert.equal(fixture("instanceId", [], { commandId: "c-1", deploymentId: 3, startEvent: "Start", emitter }),
    "start:3:c-1:1:3:5:Start:29:13:Bestellung-ä:8:Wurf-€:2");
});

const throwOf = (localName: string): Json => ({
  signal: {
    payload: { signalRef: qName(localName), name: text(localName), payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false },
  },
});

/** `key`'s process with `elements` and `flows` under the Conditional options, every flow list rebuilt from the flows. */
const model = (key: string, elements: Json[], flows: Json[]): Json => {
  const shaped = wired(withOptions({ ...base(), elements, flows }, conditional));
  return { ...shaped, identity: { ...(shaped.identity as Json), processId: key, sourceSha256: `${key}-sha` } };
};

/** Catches `Sig` at `C`, throws `Sig` at `Th` and waits at `C` again, so two instances relay one Signal forever. */
const echo = (key: string): Json => {
  const header = { id: "Th", origin: { definition: null, sourceId: "Th" }, sourceType: "intermediateThrowEvent", parent: null };
  const role = { throw: { record: throwOf("Sig") } };
  const rethrow = { event: { header, payload: { role, placement: "intermediate", incoming: [], outgoing: [], alternativeThrows: [] } } };
  return model(key, [start("S"), catchEvent("C", signal()), rethrow], [flow("f1", "S", "C"), flow("f2", "C", "Th"), flow("f3", "Th", "C")]);
};

test("a Conditional start's cascade stops at the cascade bound, the start spending one receiver and later starts unreached", () => {
  const relaying = model("Relay", [start("Large", condition("amount")), end("E", throwOf("Sig"))], [flow("f1", "Large", "E")]);
  const begin = (instanceId: string): Json =>
    ({ kind: "instance", definitionRef: "d2", instanceId, stimulus: { kind: "start", commandId: `start-${instanceId}`, instanceId, variables: [] } });
  const result = populate([relaying, echo("Echo"), processModel("Audit", [["Big", condition("amount")]])],
    [begin("A"), begin("B"), evaluate("c1", amount(2_500))]);
  const [evaluated] = resolutions(result) as Json[];
  const entries = (evaluated as Json).entries as Json[];
  // The bound is `Step.closureBound` (100000) receivers: the start takes one, the relays the other 99999.
  assert.equal(entries.length, 100_001);
  assert.deepEqual(entries[0], started("c1", 1, "Large"));
  assert.ok(entries.slice(1, -1).every((entry) => entry.kind === "delivered"));
  const last = entries.at(-1);
  assert.deepEqual([last?.kind, last?.outcome, last?.code], ["failed", "unsupported", "population-cascade-bound"]);
});

/**
 * Drive one Conditional evaluation of `programs`' starts on the fan-out machine as a host does, over submitted
 * `variables` and a budget of `budget` receivers: a false start is passed, a failing one records its `failed` entry,
 * a holding one starts its instance and records its `started` entry. None of these starts throws, so no snapshot comes.
 * The machine runs as the `fanOut` kernel fixture, replayed from its root with the steps taken so far.
 */
function drive(programs: readonly Json[], starts: readonly Json[], variables: readonly Json[], budget: number): unknown[] {
  const root = starts.map((receiver) => ({ receiver, emission: null }));
  const ops: Json[] = [];
  for (;;) {
    const next = (fixture("fanOut", [], { commandId: "c1", root, budget, ops: [...ops, { op: "next" }] }) as Json[]).at(-1) as Json;
    if (next.kind === "done") return next.entries as unknown[];
    const receiver = next.receiver as Json;
    assert.ok(next.kind === "reach" && next.emission === null && receiver.kind === "start");
    const deploymentId = receiver.deploymentId as number;
    const startEvent = receiver.startEvent as string;
    const program = programs[deploymentId - 1];
    assert.ok(program !== undefined);
    const instanceId = fixture("instanceId", [], { commandId: "c1", deploymentId, startEvent, emitter: null }) as string;
    const verdict = fixture("conditionalStartVerdict", [program], { instanceId, startEvent, variables, businessKey: null, atMs: 5_000 }) as Json;
    if (verdict.holds === false) {
      ops.push({ op: "pass" });
      continue;
    }
    let entry: Json = { kind: "failed", target: receiver, ...verdict };
    if (verdict.holds === true) {
      const read = decodeProgram(program);
      const input = stimulusFromJson({ kind: "start", commandId: "c1", instanceId, startEvent, variables, trigger: { kind: "condition" }, at: 5_000 });
      assert.ok(read.ok && input.ok);
      const outcome = step(read.value, null, input.value[1]);
      entry = outcome.ok
        ? { kind: "started", instanceId, deploymentId, version: 1, startEvent }
        : { kind: "failed", target: receiver, outcome: outcome.failure.tag, code: outcome.failure.code };
    }
    ops.push({ op: "record", entry, intents: [], emitter: instanceId });
  }
}

test("a host driving the fan-out machine over a Conditional evaluation answers the population runner's fan-out", () => {
  const programs = [
    processModel("Orders", [["Small", condition("small")], ["Large", condition("amount")], ["Flagged", condition("flag", false)]]),
    processModel("Audit", [["Big", condition("amount")]]),
  ];
  const variables = [...amount(2_500), { name: "small", value: integer(1) }, { name: "flag", value: { kind: "null" } }];
  const starts = [startTarget(1, "Small"), startTarget(1, "Large"), startTarget(1, "Flagged"), startTarget(2, "Big")];
  const [ran] = resolutions(populate(programs, [evaluate("c1", variables)])) as Json[];
  assert.deepEqual(drive(programs, starts, variables, 100_000), (ran as Json).entries);
  assert.deepEqual(drive(programs, starts, variables, 2), [
    started("c1", 1, "Large"),
    { kind: "failed", target: startTarget(1, "Flagged"), outcome: "unsupported", code: "population-cascade-bound" },
  ]);
});
