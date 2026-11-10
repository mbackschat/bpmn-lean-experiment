/**
 * Decision evaluation (PC-AUTO-07, DECISION-SEMANTICS-SPEC items 5 to 8): each hit policy, mapper and conversion, and
 * the three-valued tests, on `Start -> T -> End` with `T` a Business Rule Task whose decision the program carries. The
 * oracle is the pinned CIB source each spec item cites; the retained hit-policy witnesses replay the same cases against
 * CIB once its runner deploys their DMN resource.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  any, b, between, cmp, decision, eq, grades, input, lit, n, nil, not, output, resource, rootValue, rule, ruleProgram, s,
  started, table, tests,
} from "./decision-support.ts";
import type { Json } from "./admission-refusal-support.ts";

const str = (value: string) => ({ tag: "string", value });
const int = (value: number) => ({ tag: "int", value });
const none = { tag: "null" };
const decisionFailed = { ok: false, failure: { tag: "rolledBack", code: "decision-failed" } };
const unsupported = (code: string) => ({ ok: false, failure: { tag: "unsupported", code } });

/** Start the base program over the decision `d` with the task's `work` overrides. */
const run = (logic: Json, variables: Record<string, Json>, work: Json = {}) =>
  started(ruleProgram({ resultVariable: "grade", resultMapping: "singleEntry", ...work }, [resource([decision("d", logic)])]), variables);
const gradeOf = (policy: string, score: Json, work: Json = {}) =>
  started(ruleProgram({ resultVariable: "grade", resultMapping: "singleEntry", ...work }, [resource([{ ...grades("d", policy) }])]),
    { score });
const oneOutput = (inputs: Json[], rules: Json[], hitPolicy = "unique", typeRef: Json | string | null = "string") =>
  table(hitPolicy, inputs, [output("grade", typeRef)], rules);

test("UNIQUE writes its one match, fails on two and writes null on none", () => {
  assert.deepEqual(rootValue(gradeOf("unique", s("55")), "grade"), str("mid"));
  assert.deepEqual(gradeOf("unique", s("65")), decisionFailed);
  assert.deepEqual(rootValue(gradeOf("unique", nil), "grade"), none);
});

test("an absent input reads as null, as feel-scala resolves an unknown name", () => {
  const outcome = started(ruleProgram({ resultVariable: "grade", resultMapping: "singleEntry" }, [resource([grades("d", "unique")])]), {});
  assert.deepEqual(rootValue(outcome, "grade"), none);
});

test("FIRST takes the first match; ANY needs equal entries; COLLECT and RULE ORDER keep rule order", () => {
  assert.deepEqual(rootValue(gradeOf("first", s("65")), "grade"), str("mid"));
  const anyOf = (labels: [string, string, string]) =>
    started(ruleProgram({ resultVariable: "grade", resultMapping: "singleEntry" }, [resource([grades("d", "any", labels)])]), { score: s("65") });
  assert.deepEqual(rootValue(anyOf(["fail", "ok", "ok"]), "grade"), str("ok"));
  assert.deepEqual(anyOf(["low", "mid", "high"]), decisionFailed);
  for (const policy of ["collect", "ruleOrder"]) {
    assert.deepEqual(rootValue(gradeOf(policy, s("65"), { resultMapping: "collectEntries" }), "grade"),
      { tag: "list", items: [str("mid"), str("high")] });
    assert.deepEqual(rootValue(gradeOf(policy, nil, { resultMapping: "collectEntries" }), "grade"), { tag: "list", items: [] });
  }
});

/** `points` declared before `grade`, so the written map's key order is the Data domain's, not the declaration's. */
const rating = (hitPolicy: string) => table(hitPolicy, [input("score")], [output("points", "integer"), output("grade")], [
  rule("r1", [tests(cmp("lt", 50))], [lit.num(1), lit.str("low")]),
  rule("r2", [tests(between(40, true, 70, true))], [lit.num(2), lit.str("mid")]),
  rule("r3", [tests(cmp("gt", 60))], [lit.num(3), lit.str("high")]),
]);
const entries = (points: number, grade: string) => ({ tag: "map", entries: [["grade", str(grade)], ["points", int(points)]] });

test("the mappers: singleResult a map, resultList a list of maps, and their failures", () => {
  assert.deepEqual(rootValue(run(rating("unique"), { score: s("55") }, { resultMapping: "singleResult" }), "grade"), entries(2, "mid"));
  assert.deepEqual(rootValue(run(rating("ruleOrder"), { score: s("65") }, { resultMapping: "resultList" }), "grade"),
    { tag: "list", items: [entries(2, "mid"), entries(3, "high")] });
  assert.deepEqual(run(rating("ruleOrder"), { score: s("65") }, { resultMapping: "singleResult" }), decisionFailed);
  assert.deepEqual(run(rating("unique"), { score: s("55") }, { resultMapping: "singleEntry" }), decisionFailed);
  assert.deepEqual(run(rating("unique"), { score: s("30") }, { resultMapping: "collectEntries" }), decisionFailed);
});

test("without a result variable nothing is written and no mapper runs", () => {
  const outcome = run(rating("ruleOrder"), { score: s("65") }, { resultVariable: null, resultMapping: "singleEntry" });
  assert.equal(rootValue(outcome, "grade"), undefined);
});

test("a matching rule's output fails its conversion even when FIRST would discard it", () => {
  const logic = oneOutput([input("score")], [
    rule("r1", [tests(cmp("lt", 70))], [lit.num(1)]),
    rule("r2", [tests(cmp("gt", 50))], [lit.str("many")]),
  ], "first", "integer");
  assert.deepEqual(run(logic, { score: s("60") }), decisionFailed);
  assert.deepEqual(rootValue(run(logic, { score: s("40") }), "grade"), int(1));
});

test("interval end points: brackets close, parentheses and reversed brackets open", () => {
  const logic = oneOutput([input("score")], [
    rule("closed", [tests(between(40, true, 70, true))], [lit.str("closed")]),
    rule("open", [tests(between(40, false, 70, false))], [lit.str("open")]),
    rule("leftOpen", [tests(between(40, false, 70, true))], [lit.str("leftOpen")]),
    rule("rightOpen", [tests(between(40, true, 70, false))], [lit.str("rightOpen")]),
  ], "collect");
  const bands = (score: string) => rootValue(run(logic, { score: s(score) }, { resultMapping: "collectEntries" }), "grade");
  assert.deepEqual(bands("40"), { tag: "list", items: [str("closed"), str("rightOpen")] });
  assert.deepEqual(bands("70"), { tag: "list", items: [str("closed"), str("leftOpen")] });
});

test("three-valued tests: null matches only null, not() keeps a null comparison null", () => {
  const channel = oneOutput([input("channel", "string")], [
    rule("r1", [tests(eq(lit.null))], [lit.str("none")]),
    rule("r2", [tests(eq(lit.str("branch")))], [lit.str("branch")]),
  ]);
  assert.deepEqual(rootValue(run(channel, { channel: nil }), "grade"), str("none"));
  assert.deepEqual(rootValue(run(channel, { channel: s("branch") }), "grade"), str("branch"));
  const notBranch = oneOutput([input("channel", "string")], [rule("r1", [not(eq(lit.str("branch")))], [lit.str("other")])]);
  assert.deepEqual(rootValue(run(notBranch, { channel: nil }), "grade"), str("other"));
  assert.deepEqual(rootValue(run(notBranch, { channel: s("branch") }), "grade"), none);
  const notSmall = oneOutput([input("score")], [rule("r1", [not(cmp("lt", 5))], [lit.str("big")])]);
  assert.deepEqual(rootValue(run(notSmall, { score: nil }), "grade"), none);
  assert.deepEqual(rootValue(run(notSmall, { score: s("9") }), "grade"), str("big"));
  const list = oneOutput([input("channel", "string")], [rule("r1", [tests(eq(lit.str("web")), eq(lit.str("app")))], [lit.str("online")])]);
  assert.deepEqual(rootValue(run(list, { channel: s("app") }), "grade"), str("online"));
});

test("number literals compare by value, and Boolean tests read a Boolean input", () => {
  const fives = oneOutput([input("score")], [
    rule("r1", [tests(eq(lit.num(50, 1)))], [lit.str("exact")]),
    rule("r2", [tests({ interval: { value: { low: lit.num(45, 1), lowClosed: true, high: lit.num(55, 1), highClosed: true } } })],
      [lit.str("near")]),
  ], "collect");
  assert.deepEqual(rootValue(run(fives, { score: s("5") }, { resultMapping: "collectEntries" }), "grade"),
    { tag: "list", items: [str("exact"), str("near")] });
  const vip = oneOutput([input("vip", "boolean")], [
    rule("r1", [tests(eq(lit.bool(true)))], [lit.str("vip")]),
    rule("r2", [tests(eq(lit.bool(false)))], [lit.str("regular")]),
  ]);
  assert.deepEqual(rootValue(run(vip, { vip: b(true) }), "grade"), str("vip"));
  assert.deepEqual(rootValue(run(vip, { vip: b(false) }), "grade"), str("regular"));
  assert.deepEqual(rootValue(run(vip, { vip: s("TRUE") }), "grade"), str("vip"));
  assert.deepEqual(run(vip, { vip: s("yes") }), decisionFailed);
  assert.deepEqual(run(vip, { vip: s("ſalse") }), unsupported("decision-conversion-text"));
});

test("integer conversion: signed ASCII text, integral numbers within int, else a failure or a kernel limit", () => {
  const signs = oneOutput([input("score")], [
    rule("r1", [tests(eq(lit.num(7)))], [lit.str("seven")]),
    rule("r2", [tests(eq(lit.num(0)))], [lit.str("zero")]),
  ]);
  assert.deepEqual(rootValue(run(signs, { score: s("+7") }), "grade"), str("seven"));
  assert.deepEqual(rootValue(run(signs, { score: s("-0") }), "grade"), str("zero"));
  assert.deepEqual(rootValue(run(signs, { score: n(7) }), "grade"), str("seven"));
  assert.deepEqual(rootValue(run(signs, { score: { kind: "decimal", coefficient: "7", scale: 0 } }), "grade"), str("seven"));
  assert.deepEqual(run(signs, { score: { kind: "decimal", coefficient: "75", scale: 1 } }), decisionFailed);
  assert.deepEqual(run(signs, { score: s("n/a") }), decisionFailed);
  assert.deepEqual(run(signs, { score: s("2147483648") }), decisionFailed);
  assert.deepEqual(run(signs, { score: n(2147483648) }), decisionFailed);
  assert.deepEqual(run(signs, { score: b(true) }), decisionFailed);
  assert.deepEqual(run(signs, { score: s("٧") }), unsupported("decision-conversion-text"));
  assert.deepEqual(run(signs, { score: { kind: "decimal", coefficient: "1234567890123456", scale: 6 } }),
    unsupported("decision-conversion-range"));
  assert.deepEqual(run(signs, { score: { kind: "list", value: [] } }), unsupported("decision-input-kind"));
});

test("string conversion: Booleans and integers as their text, a number output literal as its digits", () => {
  const echo = oneOutput([input("value", "string")], [rule("r1", [any], [lit.num(5)])]);
  assert.deepEqual(rootValue(run(echo, { value: b(true) }), "grade"), str("5"));
  const branch = oneOutput([input("value", "string")], [rule("r1", [tests(eq(lit.str("true")))], [lit.str("t")]),
    rule("r2", [tests(eq(lit.str("7")))], [lit.str("seven")])]);
  assert.deepEqual(rootValue(run(branch, { value: b(true) }), "grade"), str("t"));
  assert.deepEqual(rootValue(run(branch, { value: n(7) }), "grade"), str("seven"));
  assert.deepEqual(run(branch, { value: { kind: "decimal", coefficient: "75", scale: 1 } }), unsupported("decision-conversion-kind"));
});

test("a dash and an empty entry both match", () => {
  const logic = oneOutput([input("score"), input("channel", "string")], [rule("r1", [any, any], [lit.str("both")])]);
  assert.deepEqual(rootValue(run(logic, { score: s("1"), channel: s("web") }), "grade"), str("both"));
});
