/**
 * Refusal tests of `admission/multi-instance.ts`: the kernel runs one User Task or Service Task per item of an input
 * collection it reads once on entry, gives each instance its item through a data item, takes a User Task's result
 * through its output data item and a Service Task's as the empty OutputSet, and reads a completion condition only as
 * Simple Boolean. Every other loop shape is refused whole. Under `Evaluator.juel` the Multi-Instance level admits JUEL,
 * a variable read and text at the cardinality, collection and completion sites, with the profile options it reads
 * (docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md, "Multi-Instance level").
 */
import {
  activity, foreign, juel, literalValue, bool, loop, mapping, refusalTests, serviceWork, simpleBoolean, task, userWork, variable,
  withOptions,
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

/** `T` becomes a Service Task running the loop `loop(over)` without an output data item (PC-MI-02). */
const effects = (over: Json = {}) =>
  task(activity("T", serviceWork(), { multiInstance: loop({ outputDataItem: null, ...over }) }));

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
];

refusalTests("multi-instance", rows);
