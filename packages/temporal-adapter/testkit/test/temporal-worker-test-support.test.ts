import assert from "node:assert/strict";
import test from "node:test";

import type { OpenUserTask } from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";

import { waitForOpenUserTaskIds } from "./temporal-worker-test-support.ts";

test("waits by elapsed deadline rather than a fixed query-attempt count", async () => {
  let attempts = 0;
  let nowMs = 0;
  const expectedTask = {
    id: { elementId: "UserTask_Review" },
  } as unknown as OpenUserTask;
  const handle = {
    query: async () => {
      attempts += 1;
      return attempts <= 100 ? [] : [expectedTask];
    },
  } as unknown as WorkflowHandle;

  const tasks = await waitForOpenUserTaskIds(
    handle,
    ["UserTask_Review"],
    {
      now: () => nowMs,
      delay: async (durationMs) => {
        nowMs += durationMs;
      },
    },
  );

  assert.deepEqual(tasks, [expectedTask]);
  assert.equal(attempts, 101);
  assert.equal(nowMs, 2_500);
});

test("stops at the shared lifecycle deadline and reports the last observation", async () => {
  let attempts = 0;
  let nowMs = 0;
  const handle = {
    query: async () => {
      attempts += 1;
      return [];
    },
  } as unknown as WorkflowHandle;

  await assert.rejects(
    waitForOpenUserTaskIds(
      handle,
      ["UserTask_Review"],
      {
        now: () => nowMs,
        delay: async (durationMs) => {
          nowMs += durationMs;
        },
      },
    ),
    /Workflow did not expose User Tasks UserTask_Review; latest was $/u,
  );
  assert.equal(attempts, 400);
  assert.equal(nowMs, 10_000);
});
