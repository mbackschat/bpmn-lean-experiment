/**
 * The snapshot of a Multi-Instance Sub-Process instance (docs/kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md I12, D9;
 * BPMN 2.0.2 §10.3.8, §13.5.5 "for each instance the dedicated snapshot is restored"): where a record restores a
 * snapshot, its instance's own item and, under `cibLocals`, its `loopCounter` are part of it, beneath the
 * Sub-Process's own variables; a boundary handler still restores nothing. `S -> A -> U -> E`: `A` runs over
 * `[i0, i1]`, its instances complete in item order, `U` sets the outer `item` to `late`, and `E` compensates, the
 * latest completion first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Outcome } from "@bpmn-lean/kernel";

import { activity, end, eventSubProcess, flow, literalValue, loop, mapping, scope, start, userWork, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, committedState, compensateAll, complete, driveFrom, parts, userTask } from "./compensation-support.ts";

const text = (value: string): Json => ({ kind: "string", value });
const held = (value: string): Json => ({ tag: "string", value });
const counter = (value: number): Json => ({ tag: "int", value });

const standards: Json = {};
const cib: Json = { multiInstanceBinding: "loopReferences", multiInstanceCounters: "cibLocals", evaluator: "juel" };
const common: Json = { submission: "installsVariables", undeclaredWrite: "atInstanceRoot" };

/** The loop over `items` binding each item to `item` under `binding`'s profile. */
const looping = (mode: string, binding: Json): Json => loop({
  mode, count: { collection: { items: variable("items") } }, outputDataItem: null,
  ...(binding === cib ? { inputDataItem: null, elementVariable: "item" } : { inputDataItem: "item" }),
});

/** A User Task `id` in `parent` capturing `reads` (input name to variable name); `handler` marks it for compensation. */
const reader = (id: string, reads: [string, string][], parent: string | null, handler: boolean): Json =>
  activity(id, userWork(), {
    ...(handler ? { incoming: [], outgoing: [], forCompensation: true } : {}),
    inputs: reads.map(([seen, name]) => mapping(seen, variable(name))),
  }, parent);

type Form = "group" | "eventSubProcess" | "boundary";

/**
 * `A` in `form`: a group under `everySubProcess` whose body Task `T` has the boundary handler `HT`; a Compensation
 * Event Sub-Process `H` of `A` running `HT`; or `A`'s boundary handler `HT`.
 */
function program(form: Form, mode: string, binding: Json, reads: [string, string][], scopeOver: Json = {}, envOver: Json = {}): Json {
  const handlers = form === "group" ? {} : { compensationHandlers: [form === "boundary" ? "HT" : "H"] };
  const body: Json[] = [start("AS", null, [], "A"), userTask("T", form === "group" ? "HT" : null, "A"), end("AE", "none", "A")];
  const flows: Json[] = [flow("a0", "AS", "T"), flow("a1", "T", "AE")];
  const handler: Json[] = form === "group" ? [reader("HT", reads, "A", true)]
    : form === "boundary" ? [reader("HT", reads, null, true)]
    : [
      scope("H", eventSubProcess("compensation", true), {}, { incoming: [], outgoing: [], forCompensation: true }, "A"),
      start("HS", "compensation", [], "H"), reader("HT", reads, "H", false), end("HE", "none", "H"),
    ];
  if (form === "eventSubProcess") flows.push(flow("h0", "HS", "HT"), flow("h1", "HT", "HE"));
  return chain([
    scope("A", "embedded", scopeOver, { ...handlers, multiInstance: looping(mode, binding), ...envOver }), userTask("U"),
  ], compensateAll, parts({ elements: [...body, ...handler], flows }), {
    ...common, ...binding, ...(form === "group" ? { implicitCompensation: "everySubProcess" } : {}),
  });
}

const items: Json[] = [
  { name: "items", value: { kind: "list", value: [text("i0"), text("i1")] } },
  { name: "item", value: text("outside") },
];
const ran: Json[] = [complete("T", 1), complete("T", 2), complete("U", 1, [["item", text("late")]])];

/** The inputs the waiting handler Task captured. */
function seen(outcome: Outcome, input: string): unknown {
  const scoped = committedState(outcome).variables.find((vars) => vars.entries.some(([name]) => name === input));
  assert.ok(scoped !== undefined, `the handler Task holds ${input}: ${JSON.stringify(outcome)}`);
  return Object.fromEntries(scoped.entries)[input];
}

/** What each of the two handler runs captured as `input`, the first run first. */
function readsOf(json: Json, input: string): unknown[] {
  return [
    seen(driveFrom(json, items, ...ran), input),
    seen(driveFrom(json, items, ...ran, complete("HT", 1)), input),
  ];
}

/** The names of the snapshots the instance records hold once both instances completed. */
function snapshotNames(json: Json): string[][] {
  const state = committedState(driveFrom(json, items, complete("T", 1), complete("T", 2)));
  const body = state.slots.compensation.retained.find((record) => record.subject === "A" && record.handler === null);
  assert.ok(body !== undefined, "the body retains its instance records");
  return body.children.map((record) => record.snapshot.map(([name]) => name).sort());
}

for (const mode of ["parallel", "sequential"]) {
  for (const [label, binding] of [["the Data Input", standards], ["camunda:elementVariable", cib]] as const) {
    test(`a ${mode} instance's group restores its own item bound as ${label}`, () => {
      assert.deepEqual(readsOf(program("group", mode, binding, [["seenItem", "item"]]), "seenItem"), [held("i1"), held("i0")]);
    });
  }

  test(`a ${mode} instance's group restores its own loopCounter under cibLocals`, () => {
    const reads = readsOf(program("group", mode, cib, [["seenCounter", "loopCounter"]]), "seenCounter");
    assert.deepEqual(reads, [counter(1), counter(0)]);
  });

  test(`a ${mode} instance's snapshot holds its item and no loopCounter without cibLocals`, () => {
    assert.deepEqual(snapshotNames(program("group", mode, standards, [])), [["item"], ["item"]]);
    assert.deepEqual(snapshotNames(program("group", mode, cib, [])), [["item", "loopCounter"], ["item", "loopCounter"]]);
  });

  test(`a ${mode} instance's Compensation Event Sub-Process restores its own item`, () => {
    assert.deepEqual(readsOf(program("eventSubProcess", mode, standards, [["seenItem", "item"]]), "seenItem"), [held("i1"), held("i0")]);
  });

  test(`a boundary handler of a ${mode} Multi-Instance Sub-Process reads the item live`, () => {
    const json = program("boundary", mode, standards, [["seenItem", "item"]]);
    assert.deepEqual(readsOf(json, "seenItem"), [held("late"), held("late")]);
    const state = committedState(driveFrom(json, items, complete("T", 1), complete("T", 2)));
    const body = state.slots.compensation.retained.find((record) => record.subject === "A" && record.handler === null);
    assert.deepEqual(body?.children.map((record) => record.snapshot), [[], []]);
  });
}

test("a Sub-Process local named like the item wins over the instance's item", () => {
  const json = program("eventSubProcess", "parallel", standards, [["seenItem", "item"]], { localVariables: ["item"] },
    { inputs: [mapping("item", literalValue(text("own")))] });
  assert.deepEqual(readsOf(json, "seenItem"), [held("own"), held("own")]);
  assert.deepEqual(snapshotNames(json), [["item"], ["item"]]);
});
