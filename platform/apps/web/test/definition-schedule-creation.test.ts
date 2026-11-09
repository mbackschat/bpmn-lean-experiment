import assert from "node:assert/strict";
import test from "node:test";

import {
  ScheduleCreationKind,
  scheduleCreation,
} from "../src/definition-schedule-creation.ts";

const resolved = { startEventId: "TimerStart_PT1S", durationMs: 1_000 } as const;
const unresolved = { startEventId: "TimerStart_Cycle", durationMs: null } as const;

test("offers a Schedule only for exactly one Timer Start with a resolved duration", () => {
  assert.deepEqual(scheduleCreation([resolved]), {
    kind: ScheduleCreationKind.Available,
    timerStart: resolved,
  });
  assert.deepEqual(scheduleCreation([]), { kind: ScheduleCreationKind.NoTimerStart });
  assert.deepEqual(scheduleCreation([resolved, unresolved]), {
    kind: ScheduleCreationKind.MultipleTimerStarts,
  });
});

test("refuses a Schedule for a Timer Start whose duration the engine leaves unresolved", () => {
  assert.deepEqual(scheduleCreation([unresolved]), {
    kind: ScheduleCreationKind.UnresolvedDuration,
    timerStart: unresolved,
  });
});
