/**
 * Refusal tests of `admission/subscriptions/starts.ts` for root start Events: a Message start writes its payload, and a
 * Conditional start is admitted only where the profile evaluates it over
 * submitted variables (CIB-EXT-0044), never with `camunda:variableEvents` and never twice with one predicate in one
 * process (CIB-LIM-0027). Predicates compare structurally, so a different literal lexeme or JUEL node keeps two starts
 * apart.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  append, base, condition, flow, juel, mapping, message, refusalOf, refusalTests, replace, start, text, variable, withFlows,
  withOptions,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

/** The process start `S` waits for `trigger`. */
const starting = (trigger: Json | string, outputs: Json[] = []) => (program: Json): Json =>
  replace(program, "S", start("S", trigger, outputs));

/** A second root start `S2` on `trigger`, leading to the Task. */
const secondStart = (trigger: Json | string) => (program: Json): Json =>
  withFlows(append(program, start("S2", trigger)), flow("f9", "S2", "T"));

/** The profile selection that evaluates a Conditional root start over submitted variables (CIB-EXT-0044). */
const submitted = (placed: (program: Json) => Json) => (program: Json): Json =>
  placed(withOptions(program, { conditionalStart: "submittedContext" }));

/** A Conditional trigger with `over` replacing its predicate or filters. */
const conditionWith = (over: Json): Json => {
  const plain = condition() as { condition: { payload: Json } };
  return { condition: { payload: { ...plain.condition.payload, ...over } } };
};

/** `${amount >= <digits>}` as a JUEL node table. */
const atLeast = (digits: string, op = "ge"): Json => conditionWith({
  condition: juel({ identifier: { name: "amount" } }, { integer: { digits } },
    { binary: { payload: { op, left: 0, right: 1 } } }),
});

/** Two Conditional root starts on `first` and `second` under JUEL. */
const twoConditions = (first: Json, second: Json) => (program: Json): Json =>
  secondStart(second)(starting(first)(withOptions(program, { conditionalStart: "submittedContext", evaluator: "juel" })));

refusalTests("starts", [
  {
    code: "start.condition",
    description: "a Conditional root start under the standards reading",
    mutate: starting(condition()),
    control: submitted(starting(condition())),
  },
  {
    code: "start.condition.variableEvents",
    description: "a Conditional root start naming write events",
    mutate: submitted(starting(conditionWith({ variableEvents: ["create"] }))),
    control: submitted(starting(condition())),
  },
  {
    code: "start.condition.duplicate",
    description: "two Conditional root starts with one predicate",
    mutate: twoConditions(atLeast("1000"), atLeast("1000")),
    control: twoConditions(atLeast("1000"), atLeast("1000", "gt")),
  },
  {
    code: "start.condition.duplicate",
    description: "two Conditional root starts with one Simple Boolean predicate",
    mutate: (program) => secondStart(condition())(submitted(starting(condition()))(program)),
  },
]);

test("starts: two Conditional root starts whose integer literals differ only in their digits are admitted", () => {
  assert.equal(refusalOf(twoConditions(atLeast("1000"), atLeast("01000"))(base())), null);
});

test("starts: a root Message start writing its payload is admitted", () => {
  const named = message({ messageRef: "M", name: text("M") });
  assert.equal(refusalOf(starting(named, [mapping("x", variable("y"))])(base())), null);
});
