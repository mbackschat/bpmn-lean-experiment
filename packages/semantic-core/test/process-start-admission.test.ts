import assert from "node:assert/strict";
import test from "node:test";

import {
  admitProcessStart,
  evaluateStimulusWithSelectedSteps,
  initialState,
} from "@bpmn-lean/semantic-core";

import {
  items,
  reviewProgram,
  startWithCollection,
} from "./sequential-multi-instance-fixture.ts";
import {
  boundedTaskProgram,
  boundedTaskStart,
} from "./flow-node-occurrence-lifecycle-fixture.ts";

test("plain Process start and command admission share one exact successor", () => {
  const successor = admitProcessStart(
    boundedTaskProgram,
    initialState,
    boundedTaskStart,
  );
  const evaluated = evaluateStimulusWithSelectedSteps(
    boundedTaskProgram,
    initialState,
    boundedTaskStart,
  );

  assert.ok(successor !== null);
  assert.deepEqual(evaluated.admittedState, successor);

  const privateUnregisteredStart = startWithCollection(
    "start-shared-successor",
    items,
  );
  assert.ok(
    admitProcessStart(reviewProgram, initialState, privateUnregisteredStart) !== null,
  );
  assert.equal(
    admitProcessStart(
      reviewProgram,
      initialState,
      { ...privateUnregisteredStart, processId: "substituted-process" },
    ),
    null,
  );
});
