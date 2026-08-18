/** The production Process start surface preserves semantic identity without exposing an SDK handle. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BpmnProcessStartResultKind,
  startBpmnProcess,
} from "@bpmn-lean/temporal-client";
import {
  BpmnWorkflowHostInputKind,
  WorkflowChainBudgetKind,
  bpmnWorkflowContinuationV1,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import {
  processProgramFixture as program,
  processStartFixture as start,
} from "./process-start-fixture.ts";

test("starts the exact Workflow request and returns only semantic Process identity", async () => {
  const calls: unknown[] = [];
  const client = fakeClient(calls);

  const result = await startBpmnProcess(
    client,
    start,
    program,
    { taskQueue: "process-task-queue" },
  );

  assert.deepEqual(result, {
    kind: BpmnProcessStartResultKind.Started,
    processInstanceId: start.instanceId,
  });
  assertNoSdkEscape(result);
  assert.deepEqual(calls, [{
    workflowType: "runBpmnProcess",
    options: {
      taskQueue: "process-task-queue",
      workflowId: "bpmn-process-sha256:68da48d2363df04557bc53f025c759d51ca0206dd64525a7b111f3f9b887aca6",
      workflowIdReusePolicy: "REJECT_DUPLICATE",
      args: [start, program, {
        protocol: bpmnWorkflowContinuationV1,
        kind: BpmnWorkflowHostInputKind.Initial,
        eventHistoryEventLimit: workflowChainProductionLimit(
          WorkflowChainBudgetKind.EventHistoryEvents,
        ),
        eventHistoryByteLimit: workflowChainProductionLimit(
          WorkflowChainBudgetKind.EventHistoryBytes,
        ),
      }],
    },
  }]);
});

function fakeClient(calls: unknown[]): never {
  return {
    start: async (workflowType: string, options: unknown) => {
      calls.push({ workflowType, options });
      return {
        firstExecutionRunId: "private-run-id",
        client: { fetchHistory: () => undefined },
        result: async () => undefined,
        describe: async () => undefined,
      };
    },
  } as never;
}

function assertNoSdkEscape(value: unknown): void {
  const forbiddenKeys = new Set([
    "handle",
    "client",
    "result",
    "describe",
    "fetchHistory",
    "firstExecutionRunId",
    "runId",
  ]);
  visit(value);

  function visit(candidate: unknown): void {
    if (candidate === null || typeof candidate !== "object") {
      return;
    }
    for (const [key, nested] of Object.entries(candidate)) {
      assert.equal(forbiddenKeys.has(key), false, `SDK escape ${key}`);
      visit(nested);
    }
  }
}
