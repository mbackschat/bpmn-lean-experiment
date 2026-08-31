import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import {
  CorrelationIngressEnsureResultKind,
  ensureCorrelationIngress,
} from "@bpmn-lean/temporal-client/correlation-ingress";
import {
  bpmnSemanticTaskQueue,
  correlationIngressWorkflowId,
  createCachedLocalEnvironment,
  loadBpmnWorkflowBundle,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-testkit";

import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import type {
  WorkerLease,
} from "./temporal-worker-test-support.ts";
import { withDeadline } from "./temporal-test-support.ts";

const address: CorrelatedMessageAddress = {
  definition: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "message-key-correlation-checkpoint",
    sourceId: "settlement-confirmation",
    sourceSha256: "a".repeat(64),
    sourceOverlay: null,
  },
  processId: "Process_SettlementConfirmation",
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_Settlement",
    interfaceOperationId: "Operation_ConfirmSettlement",
    messageId: "Message_SettlementConfirmed",
  },
  correlationKeyId: "CorrelationKey_Settlement",
};
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../../.cache/temporal-cli/", import.meta.url),
);
const operationDeadlineMs = 10_000;

test("recovers a lost start response and a duplicate through the live exact ingress echo", async () => {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-correlation-ingress-ensure",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "correlation ingress environment startup",
  );
  const workflowBundle = await loadBpmnWorkflowBundle();
  let workerLease: WorkerLease | undefined;
  let handle: WorkflowHandle | undefined;
  try {
    workerLease = await startBpmnTestWorker(
      environment,
      workflowBundle,
      "bpmn-correlation-ingress-ensure",
    );
    const realClient = environment.client.workflow;
    const responseLosingClient = {
      start: async (workflowType: string, options: unknown) => {
        await realClient.start(workflowType, options as never);
        throw new Error("simulated lost start response");
      },
      getHandle: realClient.getHandle.bind(realClient),
    } as never;

    const request = {
      address,
      configuration: productionCorrelationIngressConfiguration,
      taskQueue: bpmnSemanticTaskQueue,
    };
    const workflowId = correlationIngressWorkflowId(address);
    assert.deepEqual(
      await ensureCorrelationIngress(responseLosingClient, request),
      { kind: CorrelationIngressEnsureResultKind.Ready, workflowId },
    );
    assert.deepEqual(
      await ensureCorrelationIngress(realClient as never, request),
      { kind: CorrelationIngressEnsureResultKind.Ready, workflowId },
    );

    handle = realClient.getHandle(workflowId);
    await withDeadline(
      handle.terminate("correlation ingress test cleanup"),
      operationDeadlineMs,
      "correlation ingress termination",
    );
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "correlation ingress history",
    );
    await stopBpmnTestWorker(workerLease);
    workerLease = undefined;
    await replayBpmnHistory(workflowBundle, history, workflowId);
  } finally {
    if (handle !== undefined) {
      await handle.terminate("correlation ingress failed-test cleanup").catch(() => undefined);
    }
    if (workerLease !== undefined) {
      await stopBpmnTestWorker(workerLease);
    }
    await environment.teardown();
  }
});
