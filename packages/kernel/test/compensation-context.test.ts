/**
 * The context a compensation handler reads (COMPENSATION-SEMANTICS-SPEC I12, D9): a completed Sub-Process's Compensation
 * Event Sub-Process restores the Sub-Process's own variables as they were when it completed, and reads every other name
 * live through its context's chain; a boundary handler restores no context. `S -> P -> U -> E`: the Sub-Process `P` declares `own := x` and runs `PS -> PT -> PE`; its handler
 * `H` runs a User Task `HT` whose inputs read `own` and `x`; `U` then sets `x` to `late`, and `E` compensates.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Outcome } from "@bpmn-lean/kernel";

import { activity, end, flow, mapping, scope, start, userWork, variable } from "./admission-refusal-support.ts";
import type { Json } from "./admission-refusal-support.ts";
import { chain, committedState, compensateAll, complete, driveFrom, handlerScope, parts, userTask } from "./compensation-support.ts";

const text = (value: string): Json => ({ kind: "string", value });
const held = (value: string): Json => ({ tag: "string", value });

const subProcess = parts({
  elements: [
    start("PS", null, [], "P"), userTask("PT", null, "P"), end("PE", "none", "P"),
  ],
  flows: [flow("p0", "PS", "PT"), flow("p1", "PT", "PE")],
}, handlerScope("H", [activity("HT", userWork(), { inputs: [mapping("seenOwn", variable("own")), mapping("seenOuter", variable("x"))] }, "H")], "none", "P"));

const program = chain([
  scope("P", "embedded", { localVariables: ["own"] }, { compensationHandlers: ["H"], inputs: [mapping("own", variable("x"))] }),
  userTask("U"),
], compensateAll, subProcess, { submission: "installsVariables", undeclaredWrite: "atInstanceRoot" });

/** The inputs the handler's User Task captured. */
function handlerInputs(outcome: Outcome): Record<string, unknown> {
  const entries = committedState(outcome).variables.find((scoped) => scoped.entries.some(([name]) => name === "seenOwn"));
  assert.ok(entries !== undefined, "the handler's User Task holds its inputs");
  return Object.fromEntries(entries.entries);
}

test("a Sub-Process's handler restores its own variables and reads an outer name live", () => {
  const outcome = driveFrom(program, [{ name: "x", value: text("early") }], complete("PT"), complete("U", 1, [["x", text("late")]]));
  assert.deepEqual(handlerInputs(outcome), { seenOwn: held("early"), seenOuter: held("late") });
});

test("a boundary handler of a Sub-Process restores no context", () => {
  const boundaried = chain([
    scope("P", "embedded", { localVariables: ["own"] }, { compensationHandlers: ["HB"], inputs: [mapping("own", variable("x"))] }),
    userTask("U"),
  ], compensateAll, parts({
    elements: [
      start("PS", null, [], "P"), userTask("PT", null, "P"), end("PE", "none", "P"),
      activity("HB", userWork(), { incoming: [], outgoing: [], forCompensation: true, inputs: [mapping("seenOuter", variable("x"))] }),
    ],
    flows: [flow("p0", "PS", "PT"), flow("p1", "PT", "PE")],
  }), { submission: "installsVariables", undeclaredWrite: "atInstanceRoot" });
  const state = committedState(driveFrom(boundaried, [{ name: "x", value: text("early") }], complete("PT"), complete("U", 1, [["x", text("late")]])));
  const context = state.scopes.find((scoped) => scoped.element === "HB" && scoped.occurrence === null);
  assert.ok(context !== undefined, "the handler runs in a context scope occurrence");
  assert.deepEqual(state.variables.find((scoped) => scoped.scope === context.id)?.entries, []);
});
