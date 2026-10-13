/**
 * Locks the Property-path runtime of the serial portable-value handoff: the first task receives P_in by value,
 * the submitted DataOutput is written to P_mid, the second task receives P_mid under its own input and occurrence,
 * and the retired local lifetime never leaks into Process data.
 *
 * The oracle is the amendment's runtime contract plus the capsule's PBV rules. Expected values are rebuilt here as
 * literals, so deduplication, rounding, Map flattening and tag loss all change a compared tree.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind, CommandOutcome, ProcessStatus, applyStimulus, initialState, observeStableState,
  cloneVariableValue,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram, Stimulus, VariableValue } from "@bpmn-lean/semantic-core";
import {
  binding, completion, decimal, emptyMap, handoffProgram, integer, list, map, nothing, order, output, renamed,
  reviewArchive, revision, start, text,
} from "./portable-handoff-fixture.ts";
import type { HandoffNames } from "./portable-handoff-fixture.ts";

function commit(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const result = applyStimulus(program, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, false);
  assert.equal(result.ambiguousInternalChoice, false);
  return result.state;
}

function localInputs(state: RuntimeState): readonly (readonly unknown[])[] {
  return state.variables.activities.map(({ bindings }) => bindings);
}

/** Runs Start, the first completion and the second completion, returning the state at each stable point. */
function journey(names: HandoffNames, entered: VariableValue, reviewed: VariableValue, archived: VariableValue) {
  const program = handoffProgram(names);
  const first = commit(program, initialState, start(entered, names));
  const second = commit(program, first, completion(names.first, [output(names.first, reviewed)]));
  const last = commit(program, second, completion(names.second, [output(names.second, archived)]));
  return { program, first, second, last };
}

test("the 12-node order reaches Review whole, then Archive as revised, then terminates with all three Properties", () => {
  const { program, first, second, last } = journey(reviewArchive, order, revision, order);
  assert.deepEqual(first.userTaskWaits.map(({ id }) => id.elementId), ["Review"]);
  assert.deepEqual(localInputs(first), [[binding("Review_Input", order)]]);
  assert.deepEqual(first.variables.process.bindings, [binding("Order", order)]);

  assert.deepEqual(second.userTaskWaits.map(({ id }) => id.elementId), ["Archive"]);
  assert.deepEqual(localInputs(second), [[binding("Archive_Input", revision)]]);
  assert.deepEqual(second.variables.process.bindings, [binding("Order", order), binding("ReviewedOrder", revision)]);

  assert.deepEqual(last.userTaskWaits, []);
  assert.deepEqual(last.variables.activities, []);
  assert.deepEqual(last.variables.process.bindings,
    [binding("ArchivedOrder", order), binding("Order", order), binding("ReviewedOrder", revision)]);
  assert.equal(observeStableState(program, last)?.status, ProcessStatus.Completed);
});

test("each wait publishes the copied input and the complete Process values", () => {
  const { program, first, second, last } = journey(reviewArchive, order, revision, nothing);
  const waits = [first, second].map((state) => observeStableState(program, state));
  assert.deepEqual(waits.map((observation) => observation?.openUserTasks.map(({ id, inputs }) => [id.elementId, inputs])),
    [[["Review", [binding("Review_Input", order)]]], [["Archive", [binding("Archive_Input", revision)]]]]);
  assert.deepEqual(waits[0]?.variables, [binding("Order", order)]);
  assert.deepEqual(waits[1]?.variables, [binding("Order", order), binding("ReviewedOrder", revision)]);
  const terminal = observeStableState(program, last);
  assert.deepEqual(terminal?.variables,
    [binding("ArchivedOrder", nothing), binding("Order", order), binding("ReviewedOrder", revision)]);
  assert.deepEqual(terminal?.openUserTasks, []);
});

test("list multiplicity, canonical Map keys, signed coefficients and type tags survive both handoffs", () => {
  const { second } = journey(reviewArchive, order, revision, order);
  const received = second.variables.process.bindings.find(({ name }) => name === "ReviewedOrder")?.value;
  assert.ok(received?.kind === "map");
  assert.deepEqual(received.value.map(({ name }) => name), ["address", "items", "total"]);
  const items = received.value[1]?.value;
  assert.ok(items?.kind === "list");
  assert.equal(items.value.length, 2);
  assert.notDeepEqual(items.value[0], items.value[1], "unequal items keep their order and multiplicity");
  assert.deepEqual(received.value[2]?.value, decimal("-125", 2));
  assert.deepEqual(received.value[0]?.value, map(["city", text("Berlin")], ["line2", nothing]));
  const original = journey(reviewArchive, order, order, order).second.variables.process.bindings.find(({ name }) => name === "ReviewedOrder")?.value;
  const equalItems = original?.kind === "map" ? original.value[1]?.value : undefined;
  assert.ok(equalItems?.kind === "list");
  assert.equal(equalItems.value.length, 2, "two equal items are two items, not one");
});

test("a present Null is available to the next task and an empty Map completes it", () => {
  const { program, second, last } = journey(reviewArchive, order, nothing, emptyMap);
  assert.deepEqual(localInputs(second), [[binding("Archive_Input", nothing)]]);
  assert.deepEqual(second.variables.process.bindings.map(({ name }) => name), ["Order", "ReviewedOrder"]);
  assert.deepEqual(last.variables.process.bindings,
    [binding("ArchivedOrder", emptyMap), binding("Order", order), binding("ReviewedOrder", nothing)]);
  const terminal = observeStableState(program, last);
  assert.equal(terminal?.kind, CanonicalObservationKind.State);
});

test("neither a submitted DataOutput name nor a retired local becomes Process data", () => {
  const { second, last } = journey(reviewArchive, order, revision, revision);
  for (const state of [second, last]) {
    const names = state.variables.process.bindings.map(({ name }) => name);
    assert.equal(names.some((name) => name.endsWith("_Output") || name.endsWith("_Input")), false, names.join());
  }
  assert.deepEqual(localInputs(second).flat().map((candidate) => (candidate as { name: string }).name), ["Archive_Input"]);
  assert.deepEqual(last.variables.activities, []);
});

test("each handoff opens a new occurrence under its own input id", () => {
  const { first, second } = journey(reviewArchive, order, revision, order);
  assert.notDeepEqual(first.variables.activities[0]?.owner, second.variables.activities[0]?.owner);
  assert.deepEqual(first.userTaskWaits.map(({ id }) => id.activation), [1]);
  assert.deepEqual(second.userTaskWaits.map(({ id }) => id.activation), [1]);
  assert.notDeepEqual(first.userTaskWaits.map(({ id }) => id.elementId), second.userTaskWaits.map(({ id }) => id.elementId));
});

test("renamed identifiers run the same journey and produce the same value trees", () => {
  const { second, last } = journey(renamed, order, revision, nothing);
  assert.deepEqual(second.variables.process.bindings, [binding("p1", revision), binding("p3", order)]);
  assert.deepEqual(localInputs(second), [[binding(`${renamed.second}_Input`, revision)]]);
  assert.deepEqual(last.variables.process.bindings, [binding("p1", revision), binding("p2", nothing), binding("p3", order)]);
});

test("a refused completion preserves the predecessor's data, waits and counters", () => {
  const program = handoffProgram();
  const waiting = commit(program, initialState, start(order));
  for (const submitted of [[], [binding("ReviewedOrder", revision)], [output("Review", list(integer(1)))]]) {
    const result = applyStimulus(program, waiting, completion("Review", submitted));
    assert.equal(result.outcome, CommandOutcome.Rejected);
    assert.deepEqual(result.state, waiting);
  }
});

test("caller-owned storage is detached at Start and at completion", () => {
  const program = handoffProgram();
  const entered = cloneVariableValue(order);
  const reviewed = cloneVariableValue(revision);
  const first = commit(program, initialState, start(entered));
  const second = commit(program, first, completion("Review", [output("Review", reviewed)]));
  const snapshot = structuredClone(second);
  const mutate = (value: VariableValue) => {
    if (value.kind !== "map") return;
    (value.value as unknown as { name: string }[])[0]!.name = "mutated";
    (value.value as unknown as unknown[]).length = 0;
  };
  mutate(entered);
  mutate(reviewed);
  assert.deepEqual(second, snapshot);
  assert.deepEqual(second.variables.process.bindings, [binding("Order", order), binding("ReviewedOrder", revision)]);
});
