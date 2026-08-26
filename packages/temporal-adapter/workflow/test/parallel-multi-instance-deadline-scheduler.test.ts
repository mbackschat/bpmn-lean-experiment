import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  applyStimulus,
  initialState,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";

import {
  parallelProgram,
  parallelStart,
} from "../../../semantic-core/test/parallel-multi-instance-fixture.ts";
import {
  createBoundedDeadlineScheduler,
  createBoundedDeadlineSchedulers,
  parallelMultiInstanceDeadlineFamily,
} from "../dist/index.js";

function enteredState(): RuntimeState {
  const result = applyStimulus(parallelProgram, {
    ...initialState,
    parallelMultiInstanceControllers: [],
  }, parallelStart);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function scheduler() {
  return createBoundedDeadlineScheduler(
    parallelProgram,
    async () => {},
    parallelMultiInstanceDeadlineFamily,
  );
}

test("owns one outer deadline joined to every active parallel child", () => {
  const state = enteredState();
  const managed = scheduler();

  assert.equal(managed.ownsCommittedDeadline(state), true);
  assert.doesNotThrow(() => managed.reconcileCommittedState(state));
  assert.equal(createBoundedDeadlineSchedulers(
    parallelProgram,
    async () => {},
  ).filter((candidate) => candidate.ownsCommittedDeadline(state)).length, 1);
});

test("refuses a parallel Activity whose controller loses one live child", () => {
  const state = enteredState();
  const malformed: RuntimeState = {
    ...state,
    userTaskWaits: state.userTaskWaits.slice(0, -1),
  };

  assert.equal(scheduler().ownsCommittedDeadline(malformed), true);
  assert.throws(
    () => scheduler().reconcileCommittedState(malformed),
    /Managed parallel Multi-Instance Activity is not one controller, its complete active task set, and one exact PT1S outer-lifetime boundary deadline/u,
  );
});
