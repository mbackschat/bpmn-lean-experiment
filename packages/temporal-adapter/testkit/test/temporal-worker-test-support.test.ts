import assert from "node:assert/strict";
import test from "node:test";

import type { OpenUserTask } from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";

import { waitForOpenUserTaskIds } from "./temporal-worker-test-support.ts";

test("settles a timed-out Query before retrying readiness", async (context) => {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000 });
  let deadline: number | undefined;
  let pending = false;
  let attempts = 0;
  let settle: (() => void) | undefined;
  let started: (() => void) | undefined;
  const firstQuery = new Promise<void>((resolve) => { started = resolve; });
  const handle = {
    client: {
      connection: {
        withDeadline: async <Value>(value: number, invoke: () => Promise<Value>) => {
          deadline = value;
          try { return await invoke(); } finally { deadline = undefined; }
        },
      },
    },
    query: async () => {
      attempts += 1;
      if (attempts > 1) return [];
      pending = true;
      return new Promise<never>((_resolve, reject) => {
        settle = () => { pending = false; reject(new Error("RPC deadline exceeded")); };
        if (deadline !== undefined) setTimeout(settle, deadline - Date.now());
        started?.();
      });
    },
  } as unknown as WorkflowHandle;
  const observation = waitForOpenUserTaskIds(handle, [], {
    now: Date.now,
    delay: async () => undefined,
  });
  await firstQuery;
  context.mock.timers.tick(1_000);
  try {
    assert.deepEqual(await observation, []);
    assert.equal(pending, false, "successful retry must leave no earlier Query running");
    assert.equal(attempts, 2);
  } finally {
    settle?.();
    await observation;
  }
});

test("waits by elapsed deadline rather than a fixed query-attempt count", async () => {
  let attempts = 0;
  let nowMs = 0;
  const expectedTask = {
    id: { elementId: "UserTask_Review" },
  } as unknown as OpenUserTask;
  const handle = {
    client: immediateClient,
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
    client: immediateClient,
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

/**
 * The armed-deadline allowance extends the poll budget rather than consuming it.
 *
 * The fake clock makes the distinction observable: a task that cannot appear until the model's own
 * deadline fires must still leave the whole ordinary allowance available for host latency, so the
 * same appearance instant fails without the allowance and succeeds with it.
 */
test("adds an armed deadline to the poll allowance instead of spending it", async () => {
  const appearsAtMs = 12_000;
  let nowMs = 0;
  const expectedTask = { id: { elementId: "UserTask_Escalation" } } as unknown as OpenUserTask;
  const handle = {
    client: immediateClient,
    query: async () => (nowMs >= appearsAtMs ? [expectedTask] : []),
  } as unknown as WorkflowHandle;
  const scheduler = {
    now: () => nowMs,
    delay: async (durationMs: number) => {
      nowMs += durationMs;
    },
  };

  await assert.rejects(
    waitForOpenUserTaskIds(handle, ["UserTask_Escalation"], scheduler),
    /did not expose User Tasks UserTask_Escalation/u,
  );

  nowMs = 0;
  assert.deepEqual(
    await waitForOpenUserTaskIds(handle, ["UserTask_Escalation"], scheduler, 5_000),
    [expectedTask],
  );
});

test("rejects a negative armed-deadline allowance", async () => {
  const handle = { query: async () => [] } as unknown as WorkflowHandle;
  await assert.rejects(
    waitForOpenUserTaskIds(handle, [], undefined, -1),
    TypeError,
  );
});

const immediateClient = {
  connection: {
    withDeadline: <Value>(_deadline: number, invoke: () => Promise<Value>) => invoke(),
  },
};
