import assert from "node:assert/strict";
import { test } from "node:test";

import { awaitTerminalIncidentAction } from "../src/indeterminate-action.ts";

test("paces exact resubmissions until two-phase recovery becomes terminal", async () => {
  let nowMs = 0;
  let submissions = 0;
  const waits: number[] = [];

  await awaitTerminalIncidentAction({
    action: "Retry action",
    deadlineMs: 2_000,
    pollingDelayMs: 250,
    now: () => nowMs,
    wait: async (delayMs) => {
      waits.push(delayMs);
      nowMs += delayMs;
    },
    submit: async () => {
      submissions += 1;
      return submissions < 5 ? 202 : 200;
    },
  });

  assert.equal(submissions, 5);
  assert.deepEqual(waits, [250, 250, 250, 250, 250]);
});

test("fails with the action and deadline when recovery remains indeterminate", async () => {
  let nowMs = 0;

  await assert.rejects(awaitTerminalIncidentAction({
    action: "Cancel Process action",
    deadlineMs: 500,
    pollingDelayMs: 250,
    now: () => nowMs,
    wait: async (delayMs) => { nowMs += delayMs; },
    submit: async () => 202,
  }), /Cancel Process action did not commit within 500 ms/u);
});
