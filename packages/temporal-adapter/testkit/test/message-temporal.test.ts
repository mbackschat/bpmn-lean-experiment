/**
 * Establishes durable Signal refinement for both passive Message loci.
 *
 * One suite owns the disposable server and Workflow bundle, while four independently runnable cases own the Catch Event, Receive Task, reverse-order, and channel-erasure witnesses.
 */
import { after, before, describe, test } from "node:test";

import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  createCachedLocalEnvironment,
  loadBpmnWorkflowBundle,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  exerciseIntermediateCatchMessagePrimary,
  exerciseIntermediateCatchMessageReverseOrder,
} from "./intermediate-catch-message-temporal-cases.ts";
import {
  replayMessageHistories,
  startMessageWorker,
  stopMessageWorker,
} from "./message-temporal-test-support.ts";
import type {
  MessageTemporalCaseContext,
  MessageWorkerLease,
} from "./message-temporal-test-support.ts";
import {
  exerciseReceiveTaskChannelErasure,
  exerciseReceiveTaskPrimary,
} from "./receive-task-message-temporal-cases.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";

const operationDeadlineMs = 10_000;

type MessageSuite = Readonly<{
  environment: TestWorkflowEnvironment;
  workflowBundle: WorkflowBundleWithSourceMap;
}>;

type RetainedHistory = Readonly<{
  history: TemporalHistory;
  workflowId: string;
}>;

describe("Message Signal delivery", { concurrency: false }, () => {
  let suite: MessageSuite | undefined;
  let lease: MessageWorkerLease | undefined;
  const retainedHistories: RetainedHistory[] = [];

  before(async () => {
    const environment = await withDeadline(
      createCachedLocalEnvironment({
        identity: "bpmn-lean-message-probe",
        downloadDirectory: temporalCacheDirectory,
      }),
      40_000,
      "Temporal Message environment startup",
    );
    const workflowBundle = await loadBpmnWorkflowBundle();
    suite = { environment, workflowBundle };
    lease = await startMessageWorker(environment, workflowBundle);
  });

  after(async () => {
    const current = suite;
    if (current === undefined) {
      return;
    }
    try {
      await suspendWorker();
      await replayMessageHistories(
        current.workflowBundle,
        retainedHistories,
      );
    } finally {
      await withDeadline(
        current.environment.teardown(),
        operationDeadlineMs,
        "Temporal Message environment teardown",
      );
    }
  });

  test("operation-addressed Catch Event survives Worker absence", async () => {
    await exerciseIntermediateCatchMessagePrimary(caseContext());
  });

  test("direct Receive Task survives Worker absence", async () => {
    await exerciseReceiveTaskPrimary(caseContext());
  });

  test("reverse User Task and Message order preserves delivery", async () => {
    await exerciseIntermediateCatchMessageReverseOrder(caseContext());
  });

  test("direct-channel erasure is observably rejected", async () => {
    await exerciseReceiveTaskChannelErasure(caseContext());
  });

  function caseContext(): MessageTemporalCaseContext {
    return {
      environment: requiredSuite().environment,
      suspendWorker,
      resumeWorker,
      retainHistory: (history, workflowId) => {
        retainedHistories.push({ history, workflowId });
      },
    };
  }

  function requiredSuite(): MessageSuite {
    if (suite === undefined) {
      throw new Error("Message suite has not started");
    }
    return suite;
  }

  async function suspendWorker(): Promise<void> {
    const current = lease;
    lease = undefined;
    if (current !== undefined) {
      await stopMessageWorker(current);
    }
  }

  async function resumeWorker(): Promise<void> {
    if (lease !== undefined) {
      return;
    }
    const current = requiredSuite();
    lease = await startMessageWorker(
      current.environment,
      current.workflowBundle,
    );
  }
});
