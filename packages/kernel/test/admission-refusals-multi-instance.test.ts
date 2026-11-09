/**
 * Refusal tests of `admission/multi-instance.ts`: the kernel runs one User Task or Service Task per item of an input
 * collection it reads once on entry, gives each instance its item through a data item, takes a User Task's result
 * through its output data item and a Service Task's as the empty OutputSet, and reads a completion condition only as
 * Simple Boolean. Every other loop shape is refused whole.
 */
import {
  activity, foreign, literalValue, bool, loop, mapping, refusalTests, serviceWork, simpleBoolean, task, userWork, variable,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` becomes a User Task running the loop `loop(over)`, with the envelope `env`. */
const looping = (over: Json = {}, env: Json = {}) => task(activity("T", userWork(), { multiInstance: loop(over), ...env }));

const admitted = looping();

/** `T` becomes a Service Task running the loop `loop(over)` without an output data item (PC-MI-02). */
const effects = (over: Json = {}) =>
  task(activity("T", serviceWork(), { multiInstance: loop({ outputDataItem: null, ...over }) }));

export const rows: readonly Row[] = [
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
];

refusalTests("multi-instance", rows);
