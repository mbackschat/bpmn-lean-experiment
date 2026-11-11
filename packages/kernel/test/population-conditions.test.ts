/**
 * `Population.evaluateConditions` (PC-CONDITION-02, CIB-EXT-0044): every Conditional root start in scope is evaluated
 * over the submitted variables alone, deployments in deploy order and starts in document order unless the command gives
 * an `order`; each start that holds starts its own instance `start:<len>:<commandId>:<len>:<deploymentId>:<len>:<start>`
 * at the command's time, a false start adds nothing, and a start whose predicate fails is its own `failed` entry beside
 * the instances the others started.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { cascadeInstanceId, runPopulation } from "@bpmn-lean/kernel";

import { activity, append, base, flow, juel, replace, start, userWork, withFlows, withOptions, wired } from "./admission-refusal-support.ts";

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
  const emitter = { processInstanceId: "Bestellung-ä", element: "Wurf-€", activation: 2 };
  // "ä" is two UTF-8 bytes and "€" three, so each length counts bytes, not characters.
  assert.equal(cascadeInstanceId("c-1", 3, "Start", emitter),
    "start:3:c-1:1:3:5:Start:29:13:Bestellung-ä:8:Wurf-€:2");
});
