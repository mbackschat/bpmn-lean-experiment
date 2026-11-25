/**
 * A published scope's identity, its process instance, element, activation and role, is unique within one observation,
 * names an occurrence (an activation from 1) and is never reissued (PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md,
 * "State observation"). A restored compensation context, a handler's or a group's, is named by the key of the subject occurrence
 * whose snapshot it restores (COMPENSATION-SEMANTICS-SPEC.md: records are keyed by the complete runtime occurrence), so
 * a Multi-Instance body's context and its first instance's, which share element and activation, differ by role, and the
 * contexts of two instances or of two runs of one Sub-Process differ by activation. Every state of every witness is
 * checked, and the contexts each witness restores are named. The corpus counterpart runs in the opposite-key-order lane
 * (`packages/differential/test/opposite-key-order.test.ts`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { activity, base, end, flow, gateway, loop, scope, start, withOptions, wired } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, compensateAll, handlerTask, parts, userTask } from "./compensation-support.ts";
import { runScenario } from "./lean-paired.ts";

const counters: Json = {
  evaluator: "juel", multiInstanceBinding: "loopReferences", effectResultValues: "activityLocals",
  multiInstanceCounters: "cibLocals", implicitCompensation: "everySubProcess", branchSchedule: "declarationDepthFirst",
  multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt",
};

const items = (...values: string[]): Json => ({ name: "items", value: { kind: "stringList", value: values } });
const text = (name: string, value: string): Json => ({ name, value: { kind: "string", value } });
const begin = (...variables: Json[]): Json => ({ kind: "start", commandId: "start", instanceId: "I", variables });
const complete = (commandId: string, element: string, activation = 1): Json => ({
  kind: "command", commandId, occurrence: { processInstanceId: "I", elementId: element, activation },
  action: { kind: "completeUserTask", values: [] },
});
const set = (commandId: string, element: string, activation: number, ...values: Json[]): Json => ({
  ...complete(commandId, element, activation), action: { kind: "setVariables", values },
});

/**
 * Each committed state's published scopes as `role:element:activation name=value,...`, after checking that no two share
 * a key and that every one but a called instance's root names an activation from 1.
 */
function publishedStates(program: Json, stimuli: Json[]): string[][] {
  const trace = (runScenario(program, { kind: "scenario", id: "identity", profile: "p", stimuli }) as { trace: Json[] }).trace;
  const states = trace.filter((entry) => entry["kind"] === "state");
  assert.equal(states.length, stimuli.length, "every stimulus commits");
  return states.map((state, index) => {
    const scopes = (state["scopes"] ?? []) as Json[];
    const keys = scopes.map((entry) => JSON.stringify(entry["scope"]));
    assert.equal(new Set(keys).size, keys.length, `state ${String(index + 1)} publishes one scope identity twice: ${keys.join(" ")}`);
    return scopes.map((entry) => {
      const key = entry["scope"] as Json;
      if (key["role"] !== "processInstance") {
        assert.ok(Number(key["activation"]) >= 1, `state ${String(index + 1)} publishes ${JSON.stringify(key)}`);
      }
      const values = (entry["variables"] as Json[]).map((binding) =>
        `${String(binding["name"])}=${JSON.stringify((binding["value"] as Json)["value"])}`);
      return `${String(key["role"])}:${String(key["elementId"])}:${String(key["activation"])} ${values.join(",")}`;
    });
  });
}

const contexts = (state: string[] | undefined): string[] => (state ?? []).filter((line) => /^\w*[cC]ompensationContext:/u.test(line));

test("a compensated Multi-Instance body's context and its first instance's are named by their own occurrences", () => {
  // `S -> P -> U -> E`, `P` a sequential Multi-Instance Sub-Process over `items` running `PS -> PT -> PE`, `PT`
  // compensable by `HT` inside `P`; `E` compensates, so `HT` runs in `P`'s restored body context and its instance's below it.
  const program = chain([
    scope("P", "embedded", {}, { multiInstance: loop({ mode: "sequential", outputDataItem: null, inputDataItem: "DataInput_Item", inputDataItemName: "item" }) }),
    userTask("U"),
  ], compensateAll, parts({
    elements: [start("PS", null, [], "P"), userTask("PT", "HT", "P"), end("PE", "none", "P"), handlerTask("HT", "P")],
    flows: [flow("p0", "PS", "PT"), flow("p1", "PT", "PE")],
  }), counters);
  const states = publishedStates(program, [begin(items("s1")), complete("pt", "PT"), complete("u", "U")]);
  assert.deepEqual(contexts(states.at(-1)), [
    "multiInstanceBodyCompensationContext:P:1 nrOfActiveInstances=1,nrOfCompletedInstances=1,nrOfInstances=1",
    "compensationContext:P:1 item=\"s1\",loopCounter=0",
  ]);
});

test("two instances of a parallel Multi-Instance Sub-Process restored at once publish two contexts", () => {
  // Under `orderInvariant` the instance records of one closure are unordered, so both groups begin together (I1 (d)).
  const program = withOptions(wired({
    ...base(), variables: ["items"],
    elements: [start("S"), scope("M", "embedded", {}, { multiInstance: loop({ mode: "parallel", outputDataItem: null }) }),
      start("MS", null, [], "M"), scope("N", "embedded", {}, { compensationHandlers: ["HT"] }, "M"), start("NS", null, [], "N"),
      activity("NT", "manual", {}, "N"), end("NE", "none", "N"), end("ME", "none", "M"), handlerTask("HT", "M"), userTask("X"), end("E", compensateAll)],
    flows: [flow("sm", "S", "M"), flow("m0", "MS", "N"), flow("m1", "N", "ME"), flow("n0", "NS", "NT"), flow("n1", "NT", "NE"),
      flow("mx", "M", "X"), flow("xe", "X", "E")],
  }), { implicitCompensation: "everySubProcess" });
  const states = publishedStates(program, [begin(items("a", "b")), complete("x", "X"), complete("h1", "HT"), complete("h2", "HT", 2)]);
  assert.deepEqual(contexts(states[1]), ["compensationContext:M:1 item=\"a\"", "compensationContext:M:2 item=\"b\""]);
});

test("a Sub-Process compensated after two runs restores each run's context under that run's activation", () => {
  // `P` runs twice through `G0 <- G`; `E` compensates the second run, then the first, each in its own group context.
  const program = withOptions(wired({
    ...base(), variables: ["again", "pass"],
    elements: [start("S"), gateway("G0", { exclusive: { candidates: [], default: "g0" } }),
      scope("P", "embedded", {}, { inputs: [{ target: "seen", source: { variable: { name: "pass" } }, dialect: "ioParameter" }] }),
      start("PS", null, [], "P"), userTask("PT", "HT", "P"), end("PE", "none", "P"), handlerTask("HT", "P"), userTask("U"),
      gateway("G", { exclusive: { candidates: ["back"], default: "gx" } }), userTask("X"), end("E", compensateAll)],
    flows: [flow("s0", "S", "G0"), flow("g0", "G0", "P"), flow("p0", "PS", "PT"), flow("p1", "PT", "PE"), flow("pu", "P", "U"),
      flow("ug", "U", "G"), flow("back", "G", "G0", { simpleBoolean: { body: { stringEquals: { name: "again", value: "yes" } } } }),
      flow("gx", "G", "X"), flow("xe", "X", "E")],
  }), { implicitCompensation: "everySubProcess" });
  const states = publishedStates(program, [
    begin(text("again", "yes"), text("pass", "first")), complete("pt1", "PT"), set("p1", "U", 1, text("pass", "second")),
    complete("u1", "U"), complete("pt2", "PT", 2), set("s2", "U", 2, text("again", "no")), complete("u2", "U", 2),
    complete("x", "X"), complete("h1", "HT"), complete("h2", "HT", 2),
  ]);
  assert.deepEqual([contexts(states[7]), contexts(states[8])], [
    ["compensationContext:P:2 seen=\"second\""],
    ["compensationContext:P:1 seen=\"first\""],
  ]);
});

test("the contexts of two instances' Sub-Processes over equal items are named apart", () => {
  // Each instance of the parallel Multi-Instance `O` runs its own `P`, whose `seen` is the instance's item, then
  // compensates it: both groups' contexts hold `seen = "a"` at once, and only `P`'s activation tells them apart.
  const program = withOptions(wired({
    ...base(), variables: ["items"],
    elements: [start("S"), scope("O", "embedded", {}, { multiInstance: loop({ mode: "parallel", outputDataItem: null, inputDataItem: "DataInput_Item", inputDataItemName: "item" }) }),
      start("OS", null, [], "O"),
      scope("P", "embedded", {}, { inputs: [{ target: "seen", source: { variable: { name: "item" } }, dialect: "ioParameter" }] }, "O"),
      start("PS", null, [], "P"), userTask("PT", "HT", "P"), end("PE", "none", "P"), handlerTask("HT", "P"),
      end("OE", compensateAll, "O"), userTask("X"), end("E")],
    flows: [flow("so", "S", "O"), flow("o0", "OS", "P"), flow("o1", "P", "OE"), flow("p0", "PS", "PT"), flow("p1", "PT", "PE"),
      flow("ox", "O", "X"), flow("xe", "X", "E")],
  }), counters);
  const states = publishedStates(program, [begin(items("a", "a")), complete("pt1", "PT"), complete("pt2", "PT", 2), complete("h1", "HT"), complete("h2", "HT", 2)]);
  assert.deepEqual(contexts(states[2]), ["compensationContext:P:1 seen=\"a\"", "compensationContext:P:2 seen=\"a\""]);
});
