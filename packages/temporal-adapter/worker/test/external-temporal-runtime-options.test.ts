import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { NativeConnection, Worker } from "@temporalio/worker";
import type { WorkerOptions } from "@temporalio/worker";
import proto from "@temporalio/proto";

import { ExternalTemporalRuntime } from "@bpmn-lean/temporal-worker";

const options = {
  address: "unreachable.invalid:7233",
  namespace: "native-deployment-test",
  taskQueue: "native-deployment-test",
  identity: "worker-1",
};
const activities = { executeBpmnEffect: async () => ({ kind: "technicalFailure" as const }) };

test("binds native PINNED deployment to a snapshot of the actual polling bytes", async (context) => {
  const bundle = { code: "original executable bytes", sourceMap: "{}" };
  const expectedCode = bundle.code;
  const closed: string[] = [];
  const connection = { close: async () => { closed.push("connection"); } };
  context.mock.method(NativeConnection, "connect", async () => {
    bundle.code = "changed while native connection was pending";
    return connection;
  });
  let received: WorkerOptions | undefined;
  const stopped = Promise.withResolvers<void>();
  context.mock.method(Worker, "create", async (input: WorkerOptions) => {
    received = input;
    return {
      run: () => stopped.promise,
      shutdown: () => { closed.push("worker"); stopped.resolve(); },
    };
  });
  const runtime = await ExternalTemporalRuntime.connectBundle(options, activities, bundle);
  try {
    assert.deepEqual(received?.workerDeploymentOptions, {
      version: {
        deploymentName: "bpmn-lean",
        buildId: createHash("sha256").update(expectedCode, "utf8").digest("hex"),
      },
      useWorkerVersioning: true,
      defaultVersioningBehavior: "PINNED",
    });
    assert.ok(received?.workflowBundle && "code" in received.workflowBundle);
    assert.equal(received.workflowBundle.code, expectedCode);
    assert.equal(received?.namespace, options.namespace);
    assert.equal(received?.taskQueue, options.taskQueue);
    runtime.assertHealthy();
  } finally {
    await runtime.shutdown();
  }
  assert.deepEqual(closed, ["worker", "connection"]);
});

test("refuses a configured digest mismatch before native connection or polling", async (context) => {
  const connect = context.mock.method(NativeConnection, "connect", async () => {
    throw new Error("native connection must not be attempted");
  });
  await assert.rejects(ExternalTemporalRuntime.connectBundle({
    ...options,
    expectedBundleSha256: "a".repeat(64),
  }, activities, { code: "different executable bytes", sourceMap: "{}" }), /expected.*bundle.*digest/iu);
  assert.equal(connect.mock.callCount(), 0);
});

test("fresh initialization refuses an existing Namespace before creating a Worker", async (context) => {
  const alreadyExists = new Error("Namespace already exists");
  const requests: unknown[] = [];
  let closed = false;
  context.mock.method(NativeConnection, "connect", async () => ({
    workflowService: {
      async registerNamespace(request: unknown) {
        requests.push(request);
        throw alreadyExists;
      },
    },
    withDeadline: async (_deadline: number, operation: () => Promise<unknown>) => operation(),
    close: async () => { closed = true; },
  }));
  const create = context.mock.method(Worker, "create", async () => {
    throw new Error("Worker must not be created");
  });
  await assert.rejects(ExternalTemporalRuntime.initializeFreshNamespace(
    options, activities, 86_400, { code: "fresh bundle", sourceMap: "{}" },
  ), (error: unknown) => error === alreadyExists);
  assert.deepEqual(requests, [{
    namespace: options.namespace,
    workflowExecutionRetentionPeriod: proto.google.protobuf.Duration.fromObject({ seconds: 86_400 }),
  }]);
  assert.equal(create.mock.callCount(), 0);
  assert.equal(closed, true);
});
