/**
 * A Business Rule Task with input and output parameters (PC-AUTO-08; DECISION-SEMANTICS-SPEC "Mappings on a decision
 * task"). CIB makes the task a scope (`BpmnParse.java:2357-2360`): its inputs are locals, the mapped result is set with
 * `setVariable` from the task's execution (`DecisionEvaluationUtil.java:82-86`), so a task-local of the result's name
 * holds it, and the task's outgoing conditions run before its output parameters (CIB-INT-0011), which read the task's
 * execution (CIB-EXT-0031). The oracle is that CIB order; the retained `business-rule-routing` witnesses replay it.
 *
 * `S → T`, `T` a decision task whose `singleResult` goes to its local `outcome`; output parameters copy `grade` and
 * `limit` to the root. `T → A` (a User Task) is conditioned on `limit == '0'`, which the start sets; `T → E` is the
 * default flow.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, step, stimulusFromJson } from "./lean-paired.ts";
import type { Outcome } from "@bpmn-lean/kernel";

import {
  activity, append, base, flow, juel, literalValue, mapping, ruleWork, task, text, userWork, withFlows, withOptions, wired,
} from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { cmp, decision, input, lit, output, resource, rule, table, tests } from "./decision-support.ts";

const str = (value: string): Json => ({ kind: "string", value });
const id = (name: string): Json => ({ identifier: { name } });
const entry = (name: string): Json => juel(id("outcome"), { dot: { base: 0, property: name } });
const limitIsZero = juel(id("limit"), { stringLiteral: { value: "0" } }, { binary: { payload: { op: "eq", left: 0, right: 1 } } });

const routing = resource([decision("d", table("unique", [input("score")], [output("grade"), output("limit")], [
  rule("r1", [tests(cmp("gt", 60))], [lit.str("high"), lit.str("900")]),
]))]);

function program(conditionOrder: string): Json {
  const ruleTask = activity("T", ruleWork({ decision: text("d"), resultVariable: "outcome", resultMapping: "singleResult" }), {
    inputs: [mapping("outcome", literalValue(str("none")))],
    outputs: [mapping("grade", entry("grade")), mapping("limit", entry("limit"))],
    defaultFlow: "f2",
  });
  const json = withFlows(append(task(ruleTask)(base()), activity("A", userWork())), flow("fA", "T", "A", limitIsZero));
  return {
    ...wired(withOptions(json, {
      evaluator: "juel", submission: "installsVariables", undeclaredWrite: "atInstanceRoot", outputContext: "activityScope",
      conditionOrder, businessRuleTask: "decisionTable",
    })),
    decisionResources: [routing],
  };
}

function started(json: Json, score: string): Outcome {
  const decoded = decodeProgram(json);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const stimulus = stimulusFromJson({
    commandId: "start", kind: "start", instanceId: "I", variables: [{ name: "limit", value: str("0") }, { name: "score", value: str(score) }],
  });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(decoded.value, null, stimulus.value[1]);
}

const after = (outcome: Outcome): unknown => outcome.ok
  ? {
    root: Object.fromEntries((outcome.value.variables.find((scope) => scope.scope === 0)?.entries ?? [])
      .filter(([name]) => name !== "score").map(([name, value]) => [name, (value as { value: unknown }).value])),
    open: outcome.value.openItems.map((item) => item.element),
    status: outcome.value.status,
  }
  : outcome.failure;

test("the result reaches the task-local, the outputs copy its entries and the local ends with the task", () => {
  assert.deepEqual(after(started(program("afterOutputs"), "90")), { root: { grade: "high", limit: "900" }, open: [], status: "completed" });
});

test("the outgoing conditions read the variables before the outputs under the CIB condition order", () => {
  assert.deepEqual(after(started(program("beforeOutputs"), "90")), { root: { grade: "high", limit: "900" }, open: ["A"], status: "running" });
});

test("a failed decision writes and maps nothing", () => {
  assert.deepEqual(after(started(program("beforeOutputs"), "n/a")), { tag: "rolledBack", code: "decision-failed" });
});

test("a decision task's input and output parameters are admitted", () => {
  for (const order of ["afterOutputs", "beforeOutputs"]) {
    const decoded = decodeProgram(program(order));
    assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
    assert.equal(admit(decoded.value), null);
  }
});

/** `T` without inputs, so its result reaches the root, with the outputs `outcome` from `'mapped'`, then `seen` from `${outcome}`. */
function overwritten(inputs: Json[]): Json {
  const ruleTask = activity("T", ruleWork({ decision: text("d"), resultVariable: "outcome", resultMapping: "singleResult" }), {
    inputs, outputs: [mapping("outcome", literalValue(str("mapped"))), mapping("seen", juel(id("outcome")))],
  });
  return {
    ...wired(withOptions(task(ruleTask)(base()), {
      evaluator: "juel", submission: "installsVariables", undeclaredWrite: "atInstanceRoot", outputContext: "activityScope",
      conditionOrder: "beforeOutputs", businessRuleTask: "decisionTable",
    })),
    decisionResources: [routing],
  };
}

const seen = (outcome: Outcome): unknown => outcome.ok
  ? (outcome.value.variables.find((scope) => scope.scope === 0)?.entries ?? []).find(([name]) => name === "seen")?.[1]
  : outcome.failure;

test("a later output reads an earlier one's write of the result's name, which the result reached outward", () => {
  assert.deepEqual(seen(started(overwritten([]), "90")), { tag: "string", value: "mapped" });
});

test("a task-local of the result's name holds the result, which shadows an earlier output's write", () => {
  const result = seen(started(overwritten([mapping("outcome", literalValue(str("none")))]), "90")) as { tag: string };
  assert.equal(result.tag, "map");
});
