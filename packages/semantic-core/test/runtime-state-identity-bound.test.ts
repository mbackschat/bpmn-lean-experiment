import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyStimulus,
  CommandOutcome,
  initialState,
  RuntimeStateDefect,
  runtimeStateDefects,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";

import {
  boundedProgram,
  completeBoundedTask,
  instanceId,
  start,
} from "./bounded-task-fixture.ts";

function armedState(): RuntimeState {
  const started = applyStimulus(boundedProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

const counterFamilies = [
  ["User Task", "taskActivations"],
  ["Timer", "timerActivations"],
  ["Activity", "activityActivations"],
] as const;

for (const [family, counterField] of counterFamilies) {
  test(`${family} live identity above an absent counter is refused`, () => {
    const malformed: RuntimeState = { ...armedState(), [counterField]: [] };

    assert.deepEqual(
      runtimeStateDefects(boundedProgram, instanceId, malformed),
      [RuntimeStateDefect.LiveIdentityAboveCounter],
    );
  });
}

test("a command boundary refuses a carried identity-bound violation", () => {
  const malformed: RuntimeState = { ...armedState(), taskActivations: [] };

  const refused = applyStimulus(boundedProgram, malformed, completeBoundedTask);

  assert.equal(refused.outcome, CommandOutcome.Rejected);
  assert.deepEqual(refused.state, malformed);
});
