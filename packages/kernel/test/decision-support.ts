/**
 * Builders of DMN decision tables in the kernel IL's wire form (`Kernel.IL.Types.Decision`) and a runner of the base
 * program `Start -> T -> End` whose `T` is a Business Rule Task, for the decision evaluation and admission tests.
 */
import assert from "node:assert/strict";

import { admit, decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

import { activity, base, ruleWork, task, text, wired, withOptions } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";

export const dmn13 = "https://www.omg.org/spec/DMN/20191111/MODEL/";

export const lit = {
  null: "null" as Json | string,
  bool: (value: boolean): Json => ({ bool: { value } }),
  num: (coefficient: number | bigint | string, scale = 0): Json => ({ number: { coefficient: String(coefficient), scale } }),
  str: (value: string): Json => ({ string: { value } }),
};

export const eq = (value: Json | string): Json => ({ literal: { value } });
export const cmp = (operator: string, coefficient: number, scale = 0): Json =>
  ({ compare: { operator, bound: lit.num(coefficient, scale) } });
export const between = (low: number, lowClosed: boolean, high: number, highClosed: boolean): Json =>
  ({ interval: { value: { low: lit.num(low), lowClosed, high: lit.num(high), highClosed } } });
export const tests = (...unary: Json[]): Json => ({ tests: { value: { negated: false, first: unary[0], rest: unary.slice(1) } } });
export const not = (...unary: Json[]): Json => ({ tests: { value: { negated: true, first: unary[0], rest: unary.slice(1) } } });
export const any = "any";

export const input = (name: string, typeRef: Json | string | null = "integer"): Json =>
  ({ expression: { variable: { name } }, typeRef });
export const output = (name: string | null, typeRef: Json | string | null = "string"): Json => ({ name, typeRef });
export const out = (value: Json | string): Json => ({ literal: { value } });
/** A rule; each output is a FEEL literal, or an output entry as written: `"blank"` or a `foreign` text. */
export const rule = (id: string, inputs: Array<Json | string>, outputs: Array<Json | string>): Json =>
  ({ id, inputs, outputs: outputs.map((entry) => (entry === "blank" || (typeof entry === "object" && "foreign" in entry) ? entry : out(entry))) });
export const table = (hitPolicy: string, inputs: Json[], outputs: Json[], rules: Json[], aggregation: string | null = null): Json =>
  ({ table: { value: { hitPolicy, aggregation, inputs, outputs, rules } } });
export const decision = (id: string, logic: Json, requires: string[] = []): Json => ({ id, logic, requires });
export const resource = (decisions: Json[], over: Json = {}): Json =>
  ({ sourceSha256: "0".repeat(64), namespace: dmn13, expressionLanguage: null, decisions, ...over });

/** `< 50`, `[40..70]` and `> 60` on the Integer `score`, the three overlapping rules of the hit-policy witnesses. */
export function grades(id: string, hitPolicy: string, labels: [string, string, string] = ["low", "mid", "high"]): Json {
  return decision(id, table(hitPolicy, [input("score")], [output("grade")], [
    rule("r1", [tests(cmp("lt", 50))], [lit.str(labels[0])]),
    rule("r2", [tests(between(40, true, 70, true))], [lit.str(labels[1])]),
    rule("r3", [tests(cmp("gt", 60))], [lit.str(labels[2])]),
  ]));
}

/**
 * The base program whose `T` is a Business Rule Task with `work` overrides, carrying `resources`, under the CIB reading
 * that an undeclared write lands at the instance root (CIB-EXT-0005), as the hit-policy witnesses run.
 */
export function ruleProgram(work: Json, resources: Json[]): Json {
  const program = withOptions(task(activity("T", ruleWork({ decision: text("d"), ...work })))(base()), { undeclaredWrite: "atInstanceRoot" });
  return { ...program, decisionResources: resources };
}

export const s = (value: string): Json => ({ kind: "string", value });
export const n = (value: number): Json => ({ kind: "integer", value });
export const b = (value: boolean): Json => ({ kind: "boolean", value });
export const nil: Json = { kind: "null" };

/** The outcome of starting `program` with `variables`; the program must be admitted. */
export function started(program: Json, variables: Record<string, Json>): Outcome {
  const decoded = decodeProgram(wired(program));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.equal(admit(decoded.value), null, "the program is admitted");
  const stimulus = stimulusFromJson({
    commandId: "start", kind: "start", instanceId: "I",
    variables: Object.entries(variables).map(([name, value]) => ({ name, value })),
  });
  assert.ok(stimulus.ok, stimulus.ok ? "" : stimulus.refusal);
  return step(hooks, decoded.value, null as State | null, stimulus.value[1]);
}

/** The root variable `name` after a committed start, `undefined` when absent. */
export function rootValue(outcome: Outcome, name: string): unknown {
  assert.ok(outcome.ok, outcome.ok ? "" : JSON.stringify(outcome));
  return outcome.value.variables.find((entry) => entry.scope === 0)?.entries.find(([key]) => key === name)?.[1];
}
