import assert from "node:assert/strict";
import { test } from "node:test";
import { MappingExpressionKind } from "@bpmn-lean/semantic-core";
import type { ScopeLocalData } from "@bpmn-lean/semantic-core";
import type { AvailabilityBody, ScopeDataAccess } from "../src/concurrent-scope-data-availability.ts";
const { concurrentScopeStartNames } = await import(
  new URL("../dist/concurrent-scope-data-availability.js", import.meta.url).href) as
  typeof import("../src/concurrent-scope-data-availability.ts");
const { RawBodyNodeKind: Kind } = await import(
  new URL("../dist/merge-region-admission.js", import.meta.url).href) as typeof import("../src/merge-region-admission.ts");

/**
 * CSD-AVAILABLE-01: each case is the smallest raw body that separates the rule from its nearest wrong algorithm, the
 * expected required Start names being read off the proposal's rule text.
 */
type Node = AvailabilityBody["nodes"][number];
const node = (id: string, kind: Node["kind"], ...outputs: string[]): Node => ({ id, kind, outputs });
const start = (next: string) => node("start", Kind.Start, next);
const task = (id: string, next: string) => node(id, Kind.Task, next);
const end = (id = "end") => node(id, Kind.End);
const body = (nodes: Node[], children: Record<string, string> = {}): AvailabilityBody =>
  ({ nodes, children: new Map(Object.entries(children)) });
const access = (reads: string[], writes: string[] = []): ScopeDataAccess => ({ reads, writes });
const required = (bodies: Record<string, AvailabilityBody>, accesses: Record<string, ScopeDataAccess>,
  records: ScopeLocalData[] = []) =>
  concurrentScopeStartNames("root", new Map(Object.entries(bodies)), records, new Map(Object.entries(accesses)))?.required ?? null;
const record = (scopeId: string, inputs: Record<string, string | { read: string }>, outputs: Record<string, string> = {}):
  ScopeLocalData => ({
  scopeId,
  localInputs: Object.entries(inputs).map(([target, source]) => ({ target, expression: typeof source === "string"
    ? { kind: MappingExpressionKind.StringLiteral, value: source }
    : { kind: MappingExpressionKind.EnclosingVariable, name: source.read } })),
  localOutputs: Object.entries(outputs).map(([target, name]) =>
    ({ target, expression: { kind: MappingExpressionKind.LocalVariable, name } })),
});

test("a read with no earlier write is a required Start name; an earlier definite write makes it available", () => {
  const serial = body([start("A"), task("A", "B"), task("B", "end"), end()]);
  assert.deepEqual(required({ root: serial }, { A: access(["claim"]), B: access(["rate"]) }), ["claim", "rate"]);
  assert.deepEqual(required({ root: serial }, { A: access(["claim"], ["rate"]), B: access(["rate"]) }), ["claim"]);
});

test("a write in one fork branch is never available in its sibling, but is after the join", () => {
  const forked = body([start("F"), node("F", Kind.Fork, "W", "R"), task("W", "J"), task("R", "J"),
    node("J", Kind.Join, "after"), task("after", "end"), end()]);
  assert.deepEqual(required({ root: forked }, { W: access([], ["estimate"]), R: access(["estimate"]),
    after: access(["estimate"]) }), ["estimate"]);
  assert.deepEqual(required({ root: forked }, { W: access([], ["estimate"]), after: access(["estimate"]) }), []);
});

test("after an Exclusive merge only the writes of every branch remain available", () => {
  const merged = body([start("F"), node("F", Kind.Fork, "A", "B"), task("A", "M"), task("B", "M"),
    node("M", Kind.Merge, "T"), task("T", "end"), end()]);
  assert.deepEqual(required({ root: merged }, { A: access([], ["x", "y"]), B: access([], ["y"]), T: access(["x", "y"]) }),
    ["x"]);
});

test("a declared local is always available inside its scope and never lands at the Process", () => {
  const root = body([start("S"), task("S", "after"), task("after", "end"), end()], { S: "price" });
  const price = body([start("inner"), task("inner", "end"), end()]);
  const records = [record("price", { estimate: "pending" })];
  assert.deepEqual(required({ root, price }, { inner: access(["estimate"], ["estimate", "rate"]),
    after: access(["estimate", "rate"]) }, records), ["estimate"]);
});

test("a Sub-Process input reads its parent's chain and its output lands there", () => {
  const root = body([start("S"), task("S", "after"), task("after", "end"), end()], { S: "price" });
  const price = body([start("inner"), task("inner", "end"), end()]);
  const records = [record("price", { estimate: { read: "claim" } }, { priced: "estimate" })];
  assert.deepEqual(required({ root, price }, { after: access(["priced"]) }, records), ["claim"]);
});

test("a body's completion keeps the writes of every branch that ends separately", () => {
  const root = body([start("S"), task("S", "after"), task("after", "end"), end()], { S: "check" });
  const check = body([start("F"), node("F", Kind.Fork, "A", "B"), task("A", "endA"), task("B", "endB"),
    end("endA"), end("endB")]);
  assert.deepEqual(required({ root, check }, { A: access([], ["fire"]), B: access([], ["power"]),
    after: access(["fire", "power"]) }), []);
});

test("a missing child body or a cycle refuses instead of guessing", () => {
  const root = body([start("S"), task("S", "end"), end()], { S: "missing" });
  assert.equal(required({ root }, {}), null);
  const cyclic = body([start("J"), node("J", Kind.Join, "A"), task("A", "J"), end()]);
  assert.equal(required({ root: cyclic }, {}), null);
});
