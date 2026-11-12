/**
 * The JUEL node table through the program codec: every `JuelNode` constructor in its Lean-derived wire form, and the
 * call target, which `Kernel.Codec`'s hand-written `JuelCall` instances read as a Java method name looked up among the
 * listed methods (docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#il-shape-and-placement). The fixture is the
 * vertical slice's program with one condition replaced; the Lean encoding is the oracle, so the qualifier is present
 * (Lean omits an absent `Option` field of a structure).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decodeProgram, encodeProgram } from "./lean-paired.ts";

type Json = Record<string, unknown>;

const nodes = [
  { text: { value: "n=" } },
  { identifier: { name: "s" } },
  { integer: { digits: "1" } },
  { call: { payload: { receiver: 1, target: "substring", args: [2] } } },
  { call: { payload: { receiver: 1, target: "getClass", args: [] } } },
  { stringLiteral: { value: "length" } },
  { computedCall: { payload: { receiver: 1, name: 5, args: [] } } },
  { function: { payload: { qualifier: "f", name: "g", args: [2] } } },
  { float: { lexeme: "1.5" } },
  "null",
  { bool: { value: true } },
  { dot: { base: 1, property: "p" } },
  { bracket: { base: 1, property: 2 } },
  { unary: { op: "not", operand: 10 } },
  { binary: { payload: { op: "add", left: 2, right: 2 } } },
  { choice: { payload: { condition: 10, whenTrue: 14, whenFalse: 2 } } },
  { composite: { parts: [0, 15] } },
];

function programWith(condition: unknown): Json {
  const program = JSON.parse(readFileSync(new URL("./fixtures/simple-boolean.program.json", import.meta.url), "utf8")) as Json;
  const flows = program.flows as Json[];
  const flow = flows.find((candidate) => candidate.condition !== undefined && candidate.condition !== null);
  assert.ok(flow !== undefined);
  flow.condition = condition;
  return program;
}

const conditionOf = (program: unknown): Json =>
  ((program as { flows: Json[] }).flows.find((flow) => flow.condition !== undefined && flow.condition !== null)?.condition ?? {}) as Json;

test("every JUEL node round-trips the Lean encoding", () => {
  const program = programWith({ juel: { nodes } });
  const decoded = decodeProgram(program);
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  assert.deepEqual(encodeProgram(decoded.value), program);
});

test("a call target decodes to a listed method by its Java name and keeps any other name", () => {
  const decoded = decodeProgram(programWith({ juel: { nodes } }));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  const table = (conditionOf(decoded.value) as { nodes: Json[] }).nodes;
  assert.deepEqual((table[3]?.payload as Json).target, { tag: "listed", method: "substring" });
  assert.deepEqual((table[4]?.payload as Json).target, { tag: "other", name: "getClass" });
});

test("a call target that is neither a method name nor a String is refused", () => {
  const decoded = decodeProgram(programWith({ juel: { nodes: [{ identifier: { name: "s" } },
    { call: { payload: { receiver: 0, target: 7, args: [] } } }] } }));
  assert.equal(decoded.ok, false);
});
