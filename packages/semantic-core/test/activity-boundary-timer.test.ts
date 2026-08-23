/**
 * Focused semantic-core behavior for the interrupting Activity boundary Timer family.
 *
 * The oracle is the [approved capsule](../../../docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md).
 * Every peer family has a test at this level and this one did not: its transition family reached the
 * differential pipeline only through the two victory schedules, and neither of those submits an
 * off-deadline firing. So the pre-due refusal — the capsule's own arming-instant discriminator, and
 * the exposure it calls its largest — was checked in Lean alone.
 *
 * That matters because the two targets are independent implementations. A quantified Lean law says
 * nothing about this core, and the registered scenario that would have covered it cannot exist: the
 * Temporal lane derives the firing from its own committed deadline and admits exactly one, so no
 * schedule can present an early firing to any target. This is where the core's refusal is checked.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";

import {
  boundedProgram,
  completeBoundedTask,
  deadlineId,
  fireDeadline,
  instanceId,
  owner,
  start,
  taskId,
} from "./bounded-task-fixture.ts";

function armed() {
  const started = applyStimulus(boundedProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  return started.state;
}

test("start arms the bounded task and its deadline together at logical time zero", () => {
  const state = armed();

  assert.deepEqual(state.control, {
    kind: ControlStateKind.Running,
    instanceId,
  });
  assert.equal(state.logicalTimeMs, 0);
  assert.deepEqual(state.userTaskWaits.map(({ id }) => id), [taskId]);
  assert.deepEqual(state.timerWaits, [
    {
      id: deadlineId,
      owner,
      deadlineMs: 1000,
      output: "place:Flow_Boundary",
    },
  ]);
  assert.deepEqual(state.controlTokens, []);
});

test("the Activity victory withdraws its own deadline and opens the normal route", () => {
  const won = applyStimulus(boundedProgram, armed(), completeBoundedTask);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.timerWaits, []);
  assert.equal(won.state.logicalTimeMs, 0);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["NormalTask"],
  );
});

test("the deadline victory withdraws the bounded task and opens the boundary route", () => {
  const won = applyStimulus(boundedProgram, armed(), fireDeadline);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.deepEqual(won.state.timerWaits, []);
  assert.equal(won.state.logicalTimeMs, 1000);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["BoundaryTask"],
  );
});

test("every off-deadline firing rejects with the armed pair and its deadline preserved", () => {
  const state = armed();
  // 999 is the capsule's own pre-due witness; 1001 is its mirror, because a core that compared with
  // `>=` instead of `=` would accept one and refuse the other.
  for (const logicalTimeMs of [1, 999, 1001, 2000]) {
    const rejected = applyStimulus(boundedProgram, state, {
      ...fireDeadline,
      commandId: `fire-deadline-at-${logicalTimeMs}`,
      logicalTimeMs,
    });

    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    // Exact state equality is the assertion the capsule requires: no deadline drift, no withdrawn
    // arm, and no advance of logical time toward the refused instant.
    assert.deepEqual(rejected.state, state);
  }
});

test("a refused pre-due firing leaves the exact deadline still able to win", () => {
  const state = armed();
  const refused = applyStimulus(boundedProgram, state, {
    ...fireDeadline,
    commandId: "fire-deadline-at-999",
    logicalTimeMs: 999,
  });
  assert.equal(refused.outcome, CommandOutcome.Rejected);

  const won = applyStimulus(boundedProgram, refused.state, fireDeadline);

  assert.equal(won.outcome, CommandOutcome.Committed);
  assert.equal(won.state.logicalTimeMs, 1000);
  assert.deepEqual(
    won.state.userTaskWaits.map(({ id }) => id.elementId),
    ["BoundaryTask"],
  );
});

test("every wrong deadline identity rejects with exact state preservation", () => {
  const state = armed();
  const mutations = [
    { processInstanceId: "Other_Instance" },
    { elementId: "BoundedTask" },
    { elementId: "Other_Timer" },
    { activation: 2 },
  ];

  for (const mutation of mutations) {
    const rejected = applyStimulus(boundedProgram, state, {
      ...fireDeadline,
      commandId: `fire-wrong-${JSON.stringify(mutation)}`,
      timerId: { ...deadlineId, ...mutation },
    });

    assert.equal(rejected.outcome, CommandOutcome.Rejected);
    assert.deepEqual(rejected.state, state);
  }
});

test("each victory makes the sibling arm ineligible without changing state", () => {
  const afterActivity = applyStimulus(
    boundedProgram,
    armed(),
    completeBoundedTask,
  ).state;
  const staleDeadline = applyStimulus(
    boundedProgram,
    afterActivity,
    fireDeadline,
  );
  assert.equal(staleDeadline.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleDeadline.state, afterActivity);

  const afterDeadline = applyStimulus(boundedProgram, armed(), fireDeadline)
    .state;
  const staleCompletion = applyStimulus(
    boundedProgram,
    afterDeadline,
    completeBoundedTask,
  );
  assert.equal(staleCompletion.outcome, CommandOutcome.Rejected);
  assert.deepEqual(staleCompletion.state, afterDeadline);
});
