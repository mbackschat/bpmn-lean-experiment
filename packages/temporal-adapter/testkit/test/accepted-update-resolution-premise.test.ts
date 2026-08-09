/**
 * Service half of the bounded-Activity refusal's durable-resolution obligation.
 *
 * The [direct-VM witness](./bounded-activity-deadline-temporal.test.ts) proves what the refusal
 * *emits*: one accepted Update response, never a result, then a non-retryable failure. It cannot
 * prove what a caller then observes, because that is the service's act and the VM harness has no
 * service. This checks that half on a probe Workflow carrying no BPMN meaning, so the two lanes share
 * no instrument: one reads emitted commands, the other awaits a real client handle.
 *
 * Composed, they answer the obligation — the refusal emits accepted-then-fail, and an accepted Update
 * on a failed Workflow is answered by that failure rather than left pending.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { WorkflowUpdateStage } from "@temporalio/client";
import { bundleWorkflowCode, DefaultLogger } from "@temporalio/worker";

import {
  bpmnSemanticTaskQueue,
  createCachedLocalEnvironment,
} from "@bpmn-lean/temporal-testkit";

import {
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  acceptedUpdateFailureType,
  acceptedUpdateName,
} from "./accepted-update-resolution-workflows.ts";

function causeChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && parts.length < 8) {
    parts.push(`${current.name}: ${current.message}`);
    current = current.cause;
  }
  return parts.join(" <- ");
}

const probeIdentity = "bpmn-lean-accepted-update-probe";
const operationDeadlineMs = 15_000;

test("an accepted Update is answered by its Workflow's failure, not left pending", async () => {
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: fileURLToPath(
      new URL("./accepted-update-resolution-workflows.ts", import.meta.url),
    ),
    logger: new DefaultLogger("ERROR"),
  });
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: probeIdentity,
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "accepted-Update probe environment startup",
  );
  let workerLease;

  try {
    workerLease = await startBpmnTestWorker(
      environment,
      workflowBundle,
      probeIdentity,
    );
    const handle = await environment.client.workflow.start(
      "acceptedThenFailingWorkflow",
      {
        taskQueue: bpmnSemanticTaskQueue,
        workflowId: "accepted-update-resolution-probe",
        args: [],
      },
    );

    // Returning from `startUpdate` at ACCEPTED is what makes this the shape under test: the Update is
    // acknowledged and its result is still outstanding when the Workflow fails.
    const updateHandle = await withDeadline(
      handle.startUpdate(acceptedUpdateName, {
        args: [],
        updateId: "accepted-update-resolution",
        waitForStage: WorkflowUpdateStage.ACCEPTED,
      }),
      operationDeadlineMs,
      "accepted-Update acknowledgement",
    );

    // The deadline is the assertion: a stranded Update would exhaust it instead of rejecting.
    const outcome = await withDeadline(
      updateHandle.result().then(
        () => ({ answered: false, message: "" }),
        (error: unknown) => ({
          answered: true,
          message: causeChain(error),
        }),
      ),
      operationDeadlineMs,
      "accepted-Update resolution after Workflow failure",
    );

    // The obligation: the caller is answered rather than left pending.
    assert.equal(outcome.answered, true);
    assert.match(outcome.message, /WorkflowUpdateFailedError/u);
    assert.match(outcome.message, /Workflow completed before the Update completed/u);

    // The limit, locked deliberately. The answer explains that the Workflow closed first and does
    // *not* carry the Workflow's own failure identity, so a caller awaiting a bounded completion
    // cannot learn from this path that the host refused to choose a winner — that identity reaches
    // the Workflow result and Event History only. Should a later SDK propagate it, this assertion
    // fails and the capsule's typed-identity claim can be widened rather than silently drifting.
    assert.doesNotMatch(
      outcome.message,
      new RegExp(acceptedUpdateFailureType, "u"),
    );
  } finally {
    if (workerLease !== undefined) {
      await stopBpmnTestWorker(workerLease);
    }
    await environment.teardown();
  }
});
