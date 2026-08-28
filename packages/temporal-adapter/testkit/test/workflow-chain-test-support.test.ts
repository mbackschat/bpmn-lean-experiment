import assert from "node:assert/strict";
import test from "node:test";

import type { TestWorkflowEnvironment } from "@temporalio/testing";

import { waitForWorkflowChainRunCount } from "./workflow-chain-test-support.ts";

test("waits for workflow-chain observations by elapsed deadline instead of attempt count", async () => {
  let attempts = 0;
  let nowMs = 0;
  const workflowId = "workflow-chain-deadline-witness";
  const environment = {
    client: {
      workflow: {
        list: async function* () {
          attempts += 1;
          if (attempts > 100) {
            yield {
              workflowId,
              runId: "run-1",
              startTime: new Date(0),
            };
          }
        },
      },
    },
  } as unknown as TestWorkflowEnvironment;

  await waitForWorkflowChainRunCount(
    environment,
    workflowId,
    1,
    {
      now: () => nowMs,
      delay: async (durationMs) => {
        nowMs += durationMs;
      },
    },
  );

  assert.equal(attempts, 101);
  assert.equal(nowMs, 2_500);
});

test("stops workflow-chain polling at its shared elapsed deadline", async () => {
  let attempts = 0;
  let nowMs = 0;
  const environment = {
    client: {
      workflow: {
        list: async function* () {
          attempts += 1;
        },
      },
    },
  } as unknown as TestWorkflowEnvironment;

  await assert.rejects(
    waitForWorkflowChainRunCount(
      environment,
      "workflow-chain-deadline-witness",
      1,
      {
        now: () => nowMs,
        delay: async (durationMs) => {
          nowMs += durationMs;
        },
      },
    ),
    /Workflow chain did not reach 1 Runs; latest was 0/u,
  );
  assert.equal(attempts, 800);
  assert.equal(nowMs, 20_000);
});
