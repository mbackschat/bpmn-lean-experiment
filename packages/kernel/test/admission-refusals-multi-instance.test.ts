/**
 * Refusal tests of `admission/multi-instance.ts`: the kernel runs one User Task or Service Task per item of an input
 * collection it reads once on entry, gives each instance its item through a data item, takes a User Task's result
 * through its output data item and a Service Task's as the empty OutputSet, and reads a completion condition only as
 * Simple Boolean. Every other loop shape is refused whole. Under the standards schedule (`orderInvariant`) a parallel
 * loop whose instances race one another where they begin is refused (`concurrentInstances`). Under `Evaluator.juel` the Multi-Instance level admits JUEL,
 * a variable read and text at the cardinality, collection and completion sites, with the profile options it reads
 * (docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md, "Multi-Instance level").
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, callWork, definitionRef, end, flow, foreign, gateway, juel, literalValue, bool, loop, mapping, receiveWork,
  base, refusalOf, refusalTests, scope, serviceWork, simpleBoolean, start, task, text, userWork, variable, withFlows, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` becomes a User Task running the loop `loop(over)`, with the envelope `env`. */
const looping = (over: Json = {}, env: Json = {}) => task(activity("T", userWork(), { multiInstance: loop(over), ...env }));

const admitted = looping();

/** The options the Multi-Instance level reads under CIB; `over` replaces some. */
const cibLoop = (over: Json = {}) => (program: Json): Json => withOptions(program, {
  evaluator: "juel", multiInstanceBinding: "loopReferences", multiInstanceCounters: "cibLocals",
  multiInstanceInputFailure: "rollback", multiInstanceCount: "javaInt", ...over,
});
/** `T` loops under the CIB options. */
const juelLooping = (over: Json = {}, options: Json = {}) => (program: Json): Json => cibLoop(options)(looping(over)(program));
const items = juel({ identifier: { name: "order" } }, { dot: { base: 0, property: "lines" } });
const cardinality = (count: Json): Json => ({ count: { cardinality: { count } }, inputDataItem: null, inputDataItemName: null });
const counter = (name: string): Json => juel({ identifier: { name } }, { integer: { digits: "1" } }, { binary: { payload: { op: "eq", left: 0, right: 1 } } });

/** `T` loops under the CIB options with the item local `item` and the own input mappings `inputs`. */
const ownInputs = (...inputs: Json[]) => (program: Json): Json =>
  cibLoop()(looping({ inputDataItemName: "item" }, { inputs })(program));
/** `T` becomes a looping Sub-Process under the CIB options whose User Task `C` has the output mappings `outputs`. */
const nestedOutputs = (...outputs: Json[]) => (program: Json): Json => cibLoop()(append(
  task(scope("T", "embedded", { children: ["C"] }, { multiInstance: loop({ outputDataItem: null, inputDataItemName: "item" }) }))(program),
  activity("C", userWork(), { outputs }, "T")));

/** `T` becomes a Service Task running the loop `loop(over)` without an output data item (PC-MI-02). */
const effects = (over: Json = {}) =>
  task(activity("T", serviceWork(), { multiInstance: loop({ outputDataItem: null, ...over }) }));

/**
 * `T` becomes a Sub-Process looping by `loop(over)`, without an output data item, whose instance runs from `TS` to `TE`
 * through `elements`; `path` names the elements in order from `TS` to `TE`, and `flows` adds the flows off that path.
 */
const instances = (over: Json, path: string[] = [], elements: Json[] = [], flows: Json[] = []) => (program: Json): Json => {
  const chain = ["TS", ...path, "TE"];
  return withFlows(append(task(scope("T", "embedded", {}, { multiInstance: loop({ outputDataItem: null, ...over }) }))(program),
    start("TS", null, [], "T"), end("TE", "none", "T"), ...elements),
  ...chain.slice(1).map((id, index) => flow(`t${String(index)}`, chain[index]!, id)), ...flows);
};
/** `T` becomes a Sub-Process looping by `loop(over)`, without a start Event, whose `elements` without an incoming flow
 * begin implicitly (`scopeStart: implicit`). */
const implicitInstances = (over: Json, elements: Json[], flows: Json[] = []) => (program: Json): Json =>
  withFlows(append(task(scope("T", "embedded", {}, { multiInstance: loop({ outputDataItem: null, ...over }) }))(program), ...elements),
    ...flows);
const itemIsB: Json = { simpleBoolean: { body: { stringEquals: { name: "item", value: "b" } } } };
const review = activity("R", userWork(), {}, "T");
/** The inner Sub-Process `N`, `NS → NE`, whose output writes `x` from the item when it completes. */
const writesX: [Json[], Json[]] = [[
  scope("N", "embedded", {}, { outputs: [mapping("x", variable("item"), "dataAssociation")] }, "T"),
  start("NS", null, [], "N"), end("NE", "none", "N"),
], [flow("n1", "NS", "NE")]];
/** The Call `C` writing `x` from the item through the called process `Q`, `QS → QE`, which returns in the same closure. */
const callsQ: [Json[], Json[]] = [[
  activity("C", callWork({ calledElement: text("Q"), inputs: [mapping("din", variable("item"), "dataAssociation")],
    outputs: [mapping("x", variable("din"), "dataAssociation")] }), {}, "T"),
  start("QS"), end("QE"),
], [flow("q1", "QS", "QE")]];
const withCalled = (shape: (program: Json) => Json) => (program: Json): Json =>
  ({ ...shape(program), processes: [{ definition: definitionRef("Q"), children: ["QS", "QE"], variables: ["din"], executable: true }] });
/** The Parallel split `P` into the plain Tasks `A` and `B`, joined by `J`. */
const forkJoin: [Json[], Json[]] = [[
  gateway("P", "parallel", {}, "T"), activity("A", "none", {}, "T"), activity("B", "none", {}, "T"), gateway("J", "parallel", {}, "T"),
], [flow("pa", "P", "A"), flow("pb", "P", "B"), flow("aj", "A", "J"), flow("bj", "B", "J")]];
const cibSchedule = (shape: (program: Json) => Json) => (program: Json): Json =>
  withOptions(shape(program), { branchSchedule: "declarationDepthFirst" });

export const rows: readonly Row[] = [
  {
    code: "expression.outsideSimpleBoolean",
    description: "a collection that is a JUEL expression under Simple Boolean",
    mutate: looping({ count: { collection: { items: juel({ identifier: { name: "items" } }, { dot: { base: 0, property: "all" } }) } } }),
    control: admitted,
  },
  {
    code: "expression.outsideSimpleBoolean",
    description: "a collection that is a foreign expression",
    mutate: looping({ count: { collection: { items: foreign() } } }),
    control: admitted,
  },
  {
    code: "expression.outsideSimpleBoolean",
    description: "a completion condition that is a foreign expression",
    mutate: looping({ completionCondition: foreign() }),
    control: looping({ completionCondition: simpleBoolean() }),
  },
  {
    code: "multiInstance.collectionExpression",
    description: "a collection that is a literal",
    mutate: looping({ count: { collection: { items: literalValue(bool(true)) } } }),
    control: admitted,
  },
  {
    code: "multiInstance.collectionExpression",
    description: "a collection that is a Simple Boolean expression",
    mutate: looping({ count: { collection: { items: simpleBoolean() } } }),
    control: admitted,
  },
  {
    code: "multiInstance.cardinality",
    description: "a loop counted by a cardinality",
    mutate: looping({ count: { cardinality: { count: literalValue({ kind: "integer", value: 3 }) } } }),
    control: admitted,
  },
  {
    code: "multiInstance.completionConditionExpression",
    description: "a completion condition that is a variable read",
    mutate: looping({ completionCondition: variable("done") }),
    control: looping({ completionCondition: simpleBoolean() }),
  },
  {
    code: "multiInstance.completionConditionExpression",
    description: "a completion condition that is a literal",
    mutate: looping({ completionCondition: literalValue(bool(true)) }),
    control: looping({ completionCondition: simpleBoolean() }),
  },
  {
    code: "multiInstance.elementVariable",
    description: "a loop naming an element variable",
    mutate: looping({ elementVariable: "element" }),
    control: admitted,
  },
  {
    code: "multiInstance.elementVariable",
    description: "under the loop references binding, an element variable beside an inputDataItem, whose name CIB sets over it",
    mutate: juelLooping({ elementVariable: "element", inputDataItemName: "item" }),
    control: juelLooping({ elementVariable: "element", inputDataItem: null, inputDataItemName: null }),
  },
  {
    code: "multiInstance.mutableCollection",
    description: "a loop that re-reads its collection",
    mutate: looping({ mutableCollection: "sequentialReread" }),
    control: looping({ mutableCollection: "entrySnapshot" }),
  },
  {
    code: "multiInstance.inputDataItem",
    description: "a loop without an input data item",
    mutate: looping({ inputDataItem: null }),
    control: admitted,
  },
  {
    code: "multiInstance.outputDataItem",
    description: "a loop without an output data item",
    mutate: looping({ outputDataItem: null }),
    control: admitted,
  },
  {
    code: "multiInstance.instanceResult",
    description: "a Service Task loop naming an output data item, which the effect's empty OutputSet never fills",
    mutate: effects({ outputDataItem: "result" }),
    control: effects(),
  },
  {
    code: "multiInstance.instanceResult",
    description: "a Service Task loop naming an output collection",
    mutate: effects({ outputCollection: "results" }),
    control: effects(),
  },
  {
    code: "multiInstance.mappings",
    description: "a loop on an Activity with an input mapping",
    mutate: looping({}, { inputs: [mapping("x", variable("y"))] }),
    control: admitted,
  },
  {
    code: "multiInstance.mappings",
    description: "a loop on an Activity with an output mapping",
    mutate: looping({}, { outputs: [mapping("x", variable("y"))] }),
    control: admitted,
  },
  {
    code: "multiInstance.mappings",
    description: "under the loop references binding, a loop on an Activity with an output mapping, a CIB deployment error",
    mutate: (program: Json) => cibLoop()(looping({}, { outputs: [mapping("x", variable("y"))] })(program)),
    control: ownInputs(mapping("x", variable("y"))),
  },
  {
    code: "multiInstance.ownInputReadsInstance",
    description: "under the loop references binding, an own input mapping reading the item, which CIB reads outside the instance",
    mutate: ownInputs(mapping("x", variable("item"))),
    control: ownInputs(mapping("x", variable("y"))),
  },
  {
    code: "multiInstance.ownInputReadsInstance",
    description: "under the loop references binding, an own input mapping reading a counter",
    mutate: ownInputs(mapping("x", counter("loopCounter"))),
    control: ownInputs(mapping("x", juel({ identifier: { name: "y" } }))),
  },
  {
    code: "multiInstance.counterTarget",
    description: "under the CIB counters, an own input mapping writing a counter",
    mutate: ownInputs(mapping("nrOfInstances", variable("y"))),
    control: ownInputs(mapping("x", variable("y"))),
  },
  {
    code: "multiInstance.counterTarget",
    description: "under the CIB counters, an output mapping inside a Sub-Process instance writing a counter",
    mutate: nestedOutputs(mapping("loopCounter", variable("y"))),
    control: nestedOutputs(mapping("x", counter("loopCounter"))),
  },
  {
    code: "multiInstance.countAndCollection",
    description: "under JUEL, a loop declaring both a cardinality and a collection",
    mutate: juelLooping({ count: { countAndCollection: { count: variable("n"), items: variable("items") } } }),
    control: juelLooping(cardinality(variable("n"))),
  },
  {
    code: "multiInstance.mutableCollection",
    description: "under JUEL, a sequential loop whose collection is a JUEL expression",
    mutate: juelLooping({ mode: "sequential", count: { collection: { items } } }),
    control: juelLooping({ count: { collection: { items } } }),
  },
  {
    code: "multiInstance.expressionLanguage",
    description: "under JUEL, a completion condition in a declared language other than JUEL",
    mutate: juelLooping({ completionCondition: foreign() }),
    control: juelLooping({ completionCondition: variable("done") }),
  },
  {
    code: "expression.juel.syntax",
    description: "under JUEL, a cardinality whose text the reader could not parse",
    mutate: juelLooping(cardinality({ foreign: { language: "urn:cibseven:expression-language:juel", source: "${" } })),
    control: juelLooping(cardinality(literalValue({ kind: "string", value: "3" }))),
  },
  {
    code: "expression.outsideJuel",
    description: "under JUEL, a Simple Boolean completion condition",
    mutate: juelLooping({ completionCondition: simpleBoolean() }),
    control: juelLooping({ completionCondition: counter("nrOfCompletedInstances") }),
  },
  {
    code: "expression.juel.multiInstanceCounter",
    description: "under JUEL, a counter name in the loop's own cardinality",
    mutate: juelLooping(cardinality(counter("loopCounter"))),
    control: juelLooping(cardinality(variable("n"))),
  },
  {
    code: "profile.multiInstanceCounters.none",
    description: "a JUEL profile without CIB's counters, for a program with a loop",
    mutate: juelLooping({ completionCondition: counter("loopCounter") }, { multiInstanceCounters: "none" }),
    control: juelLooping({ completionCondition: counter("loopCounter") }),
  },
  {
    code: "multiInstance.itemNamedLikeCounter",
    description: "under the CIB counters, an item named like a counter",
    mutate: juelLooping({ inputDataItemName: "nrOfInstances" }),
    control: juelLooping(),
  },
  {
    code: "multiInstance.inputDataItem",
    description: "under JUEL, a collection loop without an input data item, which a cardinality loop needs none of",
    mutate: juelLooping({ inputDataItem: null }),
    control: juelLooping(cardinality(literalValue({ kind: "string", value: "3" }))),
  },
  {
    code: "profile.multiInstanceInputFailure.hold",
    description: "a JUEL profile holding an unavailable loop input, for a program with a loop",
    mutate: juelLooping({}, { multiInstanceInputFailure: "hold" }),
    control: juelLooping(),
  },
  {
    code: "profile.multiInstanceCounters.cibLocals",
    description: "a Simple Boolean profile selecting CIB's counters, for a program with a loop",
    mutate: (program: Json) => withOptions(looping()(program), { multiInstanceCounters: "cibLocals" }),
    control: admitted,
  },
  {
    // BPMN 2.0.2 §13.3.7: the instances interleave in any order, so which instance's completion closes the loop is undefined.
    code: "multiInstance.concurrentInstances",
    description: "under the standards schedule, a parallel loop with a completion condition whose instance may complete where it begins",
    mutate: instances({ completionCondition: itemIsB }),
    control: instances({ completionCondition: itemIsB }, ["R"], [review]),
  },
  {
    code: "multiInstance.concurrentInstances",
    description: "under the standards schedule, a parallel loop with a completion condition whose instance completes past a Parallel join",
    mutate: instances({ completionCondition: itemIsB }, ["P", "J"], ...forkJoin),
    control: instances({ completionCondition: itemIsB }, ["P", "J", "R"], forkJoin[0].concat(review), forkJoin[1]),
  },
  {
    code: "multiInstance.concurrentInstances",
    description: "under the standards schedule, a parallel loop whose instances write one name from an inner Sub-Process before they wait",
    mutate: instances({}, ["N"], ...writesX),
    control: instances({ mode: "sequential" }, ["N"], ...writesX),
  },
  {
    code: "multiInstance.concurrentInstances",
    description: "under the standards schedule, a parallel loop whose instances write one name from a Call that returns at once",
    mutate: withCalled(instances({}, ["C"], ...callsQ)),
    control: withCalled(instances({}, ["R", "C"], callsQ[0].concat(review), callsQ[1])),
  },
  {
    code: "multiInstance.concurrentInstances",
    description: "under the standards schedule, a parallel loop with a completion condition whose implicitly begun Task completes the instance",
    mutate: implicitInstances({ completionCondition: itemIsB }, [activity("M", "manual", {}, "T")]),
    control: implicitInstances({ completionCondition: itemIsB }, [review]),
  },
  {
    code: "multiInstance.concurrentInstances",
    description: "under the standards schedule, a parallel loop whose instances write one name from an implicitly begun Sub-Process",
    mutate: implicitInstances({}, ...writesX),
    control: implicitInstances({ mode: "sequential" }, ...writesX),
  },
];

refusalTests("multi-instance", rows);

test("multi-instance: instances that always wait, a sequential loop and CIB's schedule are admitted", () => {
  const condition = { completionCondition: simpleBoolean() };
  assert.equal(refusalOf(looping(condition)(base())), null, "a User Task body (PC-MI-01)");
  assert.equal(refusalOf(effects(condition)(base())), null, "a Service Task body (PC-MI-02)");
  assert.equal(refusalOf(task(activity("T", receiveWork({ messageRef: "M", name: text("M") }),
    { multiInstance: loop({ outputDataItem: null, ...condition }) }))(base())), null, "a Receive Task body");
  assert.equal(refusalOf(instances({})(base())), null, "a Sub-Process body that writes nothing, without a condition");
  assert.equal(refusalOf(instances({ mode: "sequential", completionCondition: itemIsB })(base())), null, "a sequential loop");
  assert.equal(refusalOf(cibSchedule(instances({ completionCondition: itemIsB }))(base())), null, "declarationDepthFirst");
  assert.equal(refusalOf(cibSchedule(instances({}, ["N"], ...writesX))(base())), null, "declarationDepthFirst");
});
