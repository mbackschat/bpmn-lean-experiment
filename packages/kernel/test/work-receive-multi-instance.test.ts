/**
 * An addressless Receive Task as a Multi-Instance body (PC-HUM-06): each instance waits for its own
 * occurrence-addressed trigger and resumes once; a parallel loop opens every instance's wait at entry, a sequential one
 * the next only after the current one resumed, and a delivery naming a resumed or not yet begun instance is rejected.
 * The oracle is the retained CIB answer of `addressless-receive-compositions/items-parallel-out-of-order` and
 * `items-sequential-turnover`, whose loops are counted rather than collection-driven; this loop reads a collection of
 * two items, the generation form the kernel admits.
 *
 * `Start → T → End`, `T` a Receive Task without a Message.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { admit, decodeProgram, hooks, step, stimulusFromJson } from "@bpmn-lean/kernel";
import type { Outcome, State } from "@bpmn-lean/kernel";

import { activity, base, loop, receiveWork, task, wired } from "./admission-refusal-support.ts";

function program(mode: "parallel" | "sequential") {
  const decoded = decodeProgram(wired(task(activity("T", receiveWork(), {
    multiInstance: loop({ mode, outputDataItem: null }),
  }))(base())));
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value;
}

const stimulus = (raw: Record<string, unknown>) => {
  const decoded = stimulusFromJson({ commandId: "c", ...raw });
  assert.ok(decoded.ok, decoded.ok ? "" : decoded.refusal);
  return decoded.value[1];
};

const scan = (activation: number) => stimulus({
  kind: "deliver", occurrence: { processInstanceId: "I", elementId: "T", activation },
  trigger: { kind: "message", channel: { kind: "unspecifiedMessage" } },
});

/** The outcome of each delivery in turn after the start, as the open activations of `T` or the failure. */
function run(mode: "parallel" | "sequential", activations: readonly number[]): unknown[] {
  const decoded = program(mode);
  const started = step(hooks, decoded, null, stimulus({
    kind: "start", instanceId: "I", variables: [{ name: "items", value: { kind: "stringList", value: ["a", "b"] } }],
  }));
  assert.ok(started.ok, JSON.stringify(started));
  const waiting = (state: State): unknown =>
    state.status === "running" ? state.openItems.map((item) => state.occurrences.find((entry) => entry.id === item.occurrence)?.activation) : state.status;
  const seen: unknown[] = [waiting(started.value)];
  let state = started.value;
  for (const activation of activations) {
    const outcome: Outcome = step(hooks, decoded, state, scan(activation));
    if (outcome.ok) state = outcome.value;
    seen.push(outcome.ok ? waiting(outcome.value) : outcome.failure);
  }
  return seen;
}

const stale = { tag: "rejected", code: "unknown-message-subscription" };

test("a Receive Task is admitted as a Multi-Instance body in both modes", () => {
  assert.equal(admit(program("parallel")), null);
  assert.equal(admit(program("sequential")), null);
});

test("a parallel addressless Receive loop resumes each instance once, in any order", () => {
  assert.deepEqual(run("parallel", [2, 2, 1]), [[1, 2], [1], stale, "completed"]);
});

test("a sequential addressless Receive loop opens the next instance only after the current one resumed", () => {
  assert.deepEqual(run("sequential", [2, 1, 1, 2]), [[1], stale, [2], stale, "completed"]);
});
