/** The production Process start surface preserves semantic identity without exposing an SDK handle. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "../../../bpmn-source/dist/index.js";
import { REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID, supportsSemanticProcessExecution } from "@bpmn-lean/semantic-core";
import { enrollmentFixture } from "./worker-deployment-enrollment-fixture.ts";

import {
  BpmnProcessStartResultKind,
  BpmnProcessAdmissionResultKind,
  assessBpmnProcessAdmission,
  startBpmnProcess,
} from "@bpmn-lean/temporal-client";
import {
  BpmnWorkflowHostInputKind,
  assessTemporalHostCapability,
  TemporalHostCapabilityResultKind,
  WorkflowChainBudgetKind,
  bpmnWorkflowContinuationV1,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import {
  processProgramFixture as program,
  processStartFixture as start,
} from "./process-start-fixture.ts";

for (const scenario of [
  "non-interrupting-boundary-timer",
  "activity-boundary-message",
  "intermediate-catch-message",
]) {
  test(`${scenario} preserves legacy starts and enrolls the validated subscription profile`, async () => {
    const bytes = await readFile(new URL(`../../../../scenarios/${scenario}/process.bpmn`, import.meta.url));
    for (const semanticProfile of [
      `bpmn-2.0.2-${scenario}-draft`,
      REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
    ]) {
      const compiled = await compileBpmnToSemanticProcess({
        bytes, sourceId: scenario, semanticProfile, sourceOverlay: null,
        limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
      });
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
      if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Source refused");
      const semanticProcess = compiled.semanticProcess;
      const processStart = { ...start, processId: semanticProcess.processId };
      assert.equal(supportsSemanticProcessExecution(processStart, semanticProcess), true);
      const host = assessTemporalHostCapability(semanticProcess);
      const admission = assessBpmnProcessAdmission(processStart, semanticProcess);
      const calls: unknown[] = [];
      const result = await startBpmnProcess(fakeClient(calls), processStart, semanticProcess,
        { taskQueue: "process-task-queue" });
      assert.equal(host.kind, TemporalHostCapabilityResultKind.Admitted);
      assert.equal(admission.kind, BpmnProcessAdmissionResultKind.Admitted);
      assert.equal(result.kind, BpmnProcessStartResultKind.Started);
      assert.equal(calls.length, 1);
    }
  });
}

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
    ...enrollmentFixture("process-task-queue"),
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
