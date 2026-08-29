/**
 * Locks the margin assertion that keeps host-clock races visible.
 *
 * The oracle is the ceiling itself: the contract is that a racing path at or below it passes, one
 * above it fails, and a measurement that cannot be a duration is a harness error rather than a
 * margin verdict.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHostClockDeadlineMargin,
  hostClockDeadlineMarginCeiling,
} from "./host-clock-deadline-margin.ts";

const remainingMs = 5_000;

test("accepts a racing path exactly at the margin ceiling", () => {
  assertHostClockDeadlineMargin({
    label: "at the ceiling",
    elapsedMs: remainingMs * hostClockDeadlineMarginCeiling,
    remainingMs,
  });
});

test("rejects a racing path just past the margin ceiling", () => {
  assert.throws(
    () =>
      assertHostClockDeadlineMargin({
        label: "past the ceiling",
        elapsedMs: remainingMs * hostClockDeadlineMarginCeiling + 1,
        remainingMs,
      }),
    /past the ceiling consumed 50\.0% of its 5000ms host-armed deadline/,
  );
});

// The case this guard exists for: the Sequential Multi-Instance natural path measured at about
// 355 ms on a quiet eight-core host would have consumed 71% of a 1,000 ms deadline on the recorded
// four-core hosted-runner profile, where it flaked, and consumes 14% of the 5,000 ms one.
test("separates the deadline this repository raised from the one it replaced", () => {
  const hostedRunnerElapsedMs = 710;
  assert.throws(() =>
    assertHostClockDeadlineMargin({
      label: "sequential Multi-Instance natural path",
      elapsedMs: hostedRunnerElapsedMs,
      remainingMs: 1_000,
    })
  );
  assertHostClockDeadlineMargin({
    label: "sequential Multi-Instance natural path",
    elapsedMs: hostedRunnerElapsedMs,
    remainingMs: 5_000,
  });
});

test("rejects a measurement that cannot be a duration", () => {
  assert.throws(
    () =>
      assertHostClockDeadlineMargin({
        label: "negative",
        elapsedMs: -1,
        remainingMs,
      }),
    TypeError,
  );
  assert.throws(
    () =>
      assertHostClockDeadlineMargin({
        label: "no armed remainder",
        elapsedMs: 1,
        remainingMs: 0,
      }),
    TypeError,
  );
});
