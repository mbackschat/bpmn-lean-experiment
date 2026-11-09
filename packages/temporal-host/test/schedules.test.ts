/**
 * The one-shot Schedule assessment: the immutable stored action and occurrence against what the caller expects, then
 * the single action's phase from the Schedule's counters.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExpectedSchedule, StoredSchedule } from "../src/schedules.ts";

const schedules = await import(new URL("../dist/schedules.js", import.meta.url).href) as
  typeof import("../src/schedules.ts");
const { SchedulePhase, assessSchedule, scheduleCatchupWindowMs } = schedules;

const due = Date.UTC(2026, 10, 9, 12, 0, 0);

const expected: ExpectedSchedule = {
  scheduleId: "schedule-1",
  dueAtEpochMs: due,
  workflowIdBase: "process-1",
  taskQueue: "queue",
  memo: { intent: { sha256: "abc" } },
};

const pending: StoredSchedule = {
  scheduleId: "schedule-1",
  workflowType: "runProcess",
  taskQueue: "queue",
  workflowId: "process-1",
  memo: { intent: { sha256: "abc" } },
  startAtEpochMs: due,
  endAtEpochMs: due,
  overlapSkip: true,
  catchupWindowMs: scheduleCatchupWindowMs,
  paused: false,
  remainingActions: 1,
  actionsTaken: 0,
  actionsMissed: 0,
  actionsSkipped: 0,
  nextActionEpochMs: [due],
  recentWorkflowIds: [],
  runningWorkflowIds: [],
};

const started: StoredSchedule = {
  ...pending,
  remainingActions: 0,
  actionsTaken: 1,
  nextActionEpochMs: [],
  recentWorkflowIds: ["process-1-2026-11-09T12:00:00Z"],
  runningWorkflowIds: ["process-1-2026-11-09T12:00:00Z"],
};

test("a Schedule before its due instant is pending, with its paused state", () => {
  assert.deepEqual(assessSchedule(pending, expected), { phase: SchedulePhase.Pending, paused: false });
  assert.deepEqual(assessSchedule({ ...pending, paused: true }, expected), { phase: SchedulePhase.Pending, paused: true });
});

test("a Schedule whose one action ran names the one Workflow it started", () => {
  assert.deepEqual(assessSchedule(started, expected), {
    phase: SchedulePhase.Started,
    paused: false,
    workflowId: "process-1-2026-11-09T12:00:00Z",
  });
});

test("two different started Workflows are an invalid phase, never a choice", () => {
  const assessment = assessSchedule({ ...started, runningWorkflowIds: ["other"] }, expected);
  assert.equal(assessment.phase, SchedulePhase.InvalidPhase);
});

test("an action that missed the catch-up window is missed", () => {
  const missed = { ...pending, actionsMissed: 1, nextActionEpochMs: [] };
  assert.deepEqual(assessSchedule(missed, expected), { phase: SchedulePhase.Missed, paused: false });
});

test("a stored action, occurrence or policy other than expected is drift, whatever the phase", () => {
  for (const drifted of [
    { ...pending, memo: { intent: { sha256: "other" } } },
    { ...pending, taskQueue: "elsewhere" },
    { ...pending, workflowType: "otherWorkflow" },
    { ...pending, startAtEpochMs: due + 1_000 },
    { ...pending, overlapSkip: false },
    { ...started, workflowId: "process-2" },
  ]) {
    assert.equal(assessSchedule(drifted, expected).phase, SchedulePhase.Drift);
  }
});
