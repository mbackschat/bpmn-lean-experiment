import assert from "node:assert/strict";
import test from "node:test";

import {
  ScheduleCreationKind,
  scheduleCreation,
} from "../src/definition-schedule-creation.ts";
import { occurrencePage } from "../src/definition-schedule-occurrences.ts";

const resolved = { startEventId: "TimerStart_PT1S", durationMs: 1_000 } as const;
const cycle = { startEventId: "TimerStart_Cycle", durationMs: null } as const;

test("offers a Schedule for exactly one Timer Start, whatever its form", () => {
  assert.deepEqual(scheduleCreation([resolved]), { kind: ScheduleCreationKind.Available, timerStart: resolved });
  assert.deepEqual(scheduleCreation([cycle]), { kind: ScheduleCreationKind.Available, timerStart: cycle });
  assert.deepEqual(scheduleCreation([]), { kind: ScheduleCreationKind.NoTimerStart });
  assert.deepEqual(scheduleCreation([resolved, cycle]), { kind: ScheduleCreationKind.MultipleTimerStarts });
});

const hourly = ["2026-08-11T12:00:01.250Z", "2026-08-11T13:00:01.250Z", "2026-08-11T14:00:01.250Z"]
  .map((dueAt) => ({ dueAt }));

test("selects the first occurrence and keeps a selection that is still listed", () => {
  assert.equal(occurrencePage(hourly, null, 3).selected, hourly[0]?.dueAt);
  assert.equal(occurrencePage(hourly, hourly[2]?.dueAt ?? null, 3).selected, hourly[2]?.dueAt);
  assert.equal(occurrencePage(hourly, "2026-08-11T11:00:00.000Z", 3).selected, hourly[0]?.dueAt);
  assert.equal(occurrencePage([], hourly[0]?.dueAt ?? null, 3).selected, null);
});

test("offers later occurrences just after a full page and none after a short one", () => {
  assert.equal(occurrencePage(hourly, null, 3).laterFrom, "2026-08-11T14:00:01.251Z");
  assert.equal(occurrencePage(hourly, null, 4).laterFrom, null);
  assert.equal(occurrencePage([], null, 3).laterFrom, null);
});
