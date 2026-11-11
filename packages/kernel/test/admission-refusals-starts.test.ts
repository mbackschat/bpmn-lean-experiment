/**
 * Refusal tests of `admission/subscriptions/starts.ts` for root start Events: a Message start writes its payload, a
 * Signal start is addressed by its Signal, a Timer start takes exactly the schedules its host resolves (PC-TIMER-04),
 * and a Conditional start is admitted only where the profile evaluates it over submitted variables (CIB-EXT-0044),
 * never with `camunda:variableEvents` and never twice with one predicate in one process (CIB-LIM-0027). Predicates
 * compare structurally, so a different literal lexeme or JUEL node keeps two starts apart.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  append, base, computed, condition, cycle, date, duration, flow, juel, mapping, message, qName, refusalOf, refusalTests, replace, signal,
  start, text, variable, withFlows, withOptions,
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

/** The profile selection under which a Signal's name addresses its subscriptions (CIB-INT-0028). */
const addressed = (placed: (program: Json) => Json) => (program: Json): Json =>
  placed(withOptions(program, { signalNames: "addresses", evaluator: "juel" }));

/** A Timer whose `kind` value is the expression `${when}`, with `over` completing its schedule. */
const timerExpression = (kind: string, over: Json = {}): Json =>
  ({ timer: { payload: { schedule: { [kind]: { value: computed(variable("when")), ...over } } } } });

/** The profile selection under which arming a malformed Timer rolls back (CIB-EXT-0036). */
const rollingBack = (placed: (program: Json) => Json) => (program: Json): Json =>
  placed(withOptions(program, { malformedTimer: "rollsBackArming" }));

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
  // Timers: a root start is armed from `Timer.resolve` at deployment, where no input can roll back.
  {
    code: "timer.duration",
    description: "a root start Timer whose duration counts calendar months",
    mutate: starting(duration("P1M")),
    control: starting(duration("P30D")),
  },
  {
    code: "timer.duration",
    description: "a root start Timer whose duration does not parse, even where arming may roll back",
    mutate: rollingBack(starting(duration("PT"))),
    control: rollingBack(starting(duration("PT1M"))),
  },
  {
    code: "timer.duration",
    description: "a root start Timer whose duration is an expression",
    mutate: starting(timerExpression("duration")),
    control: starting(duration("PT1M")),
  },
  {
    code: "timer.date",
    description: "a root start Timer whose date is an expression",
    mutate: starting(timerExpression("date")),
    control: starting(date("2030-01-01T00:00:00Z")),
  },
  {
    code: "timer.cycle",
    description: "a root start Timer repeating from a stated start date",
    mutate: starting(cycle("R2/2030-01-01T00:00:00Z/PT1M")),
    control: starting(cycle("R2/PT1M")),
  },
  {
    code: "timer.cycle",
    description: "a root start Timer whose cycle is an expression",
    mutate: starting(timerExpression("cycle", { dialect: "iso8601" })),
    control: starting(cycle("R/PT1M")),
  },
  {
    code: "timer.cron",
    description: "a root start Timer given as a cron expression outside the subset",
    mutate: starting(cycle("0 0 12 L * ?", "cron")),
    control: starting(cycle("0 0 12 * * ?", "cron")),
  },
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
    code: "start.signalNameExpression",
    description: "a root Signal start whose name is an expression under name addressing",
    mutate: addressed(starting({ signal: { payload: { signalRef: qName("Sig"), name: computed(variable("n")) } } })),
    control: addressed(starting(signal())),
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

test("starts: a root Message start writing its payload and a root Signal start are admitted", () => {
  const named = message({ messageRef: "M", name: text("M") });
  assert.equal(refusalOf(starting(named, [mapping("x", variable("y"))])(base())), null);
  assert.equal(refusalOf(starting(signal())(base())), null);
});
