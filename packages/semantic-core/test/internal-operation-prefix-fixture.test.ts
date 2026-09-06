import assert from "node:assert/strict";
import { test } from "node:test";

import { applyInternalOperationStep, initialState } from "@bpmn-lean/semantic-core";
import { inclusiveProgram, inclusiveStart, present } from "./inclusive-gateway-fixture.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";

const start = inclusiveStart([present("takeA"), present("takeB")]);
const prefix = ["operation:Start", "operation:Split"];
const frontier = ["operation:Task_A", "operation:Task_B"];

test("stops before both selected tasks with both selected join inputs intact", () => {
  const state = admittedInternalPrefix(inclusiveProgram, initialState, start, prefix, frontier);
  assert.deepEqual(state.selectedBranchSets.map(({ expectedInputs }) => expectedInputs), [
    ["place:Flow_A_Join", "place:Flow_B_Join"],
  ]);
  assert.deepEqual(state.userTaskWaits, []);
  for (const id of frontier) {
    const operation = inclusiveProgram.operations.find((candidate) => candidate.id === id);
    assert.ok(operation !== undefined);
    const step = applyInternalOperationStep(inclusiveProgram, operation, state);
    assert.ok(step !== null);
    assert.ok(step.successor.userTaskWaits.length === 1);
  }
});

test("refuses to consume one task from the two-task frontier", () => {
  assert.throws(() => admittedInternalPrefix(
    inclusiveProgram, initialState, start, [...prefix, "operation:Task_A"], ["operation:Task_B"],
  ), /exactly one enabled operation/);
});

test("refuses rejected admission, missing or disabled IDs, duplicates, and wrong stopping points", () => {
  assert.throws(() => admittedInternalPrefix(
    inclusiveProgram, initialState, { ...start, processId: "missing" }, [], [],
  ), /committed admission/);
  assert.throws(() => admittedInternalPrefix(
    inclusiveProgram, initialState, start, ["operation:missing"], frontier,
  ), /unique operation declaration/);
  assert.throws(() => admittedInternalPrefix(
    inclusiveProgram, initialState, start, ["operation:Split"], frontier,
  ), /requested operation/);
  const operation = inclusiveProgram.operations.find(({ id }) => id === "operation:Start");
  assert.ok(operation !== undefined);
  assert.throws(() => admittedInternalPrefix(
    { ...inclusiveProgram, operations: [...inclusiveProgram.operations, operation] },
    initialState, start, prefix, frontier,
  ), /committed admission|unique operation declaration/);
  assert.throws(() => admittedInternalPrefix(
    inclusiveProgram, initialState, start, prefix, ["operation:Task_A"],
  ), /stopping frontier/);
});
