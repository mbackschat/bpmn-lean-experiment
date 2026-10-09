import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";

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
      getState: () => "RUNNING",
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
  await runtime.shutdown();
  assert.deepEqual(closed, ["worker", "connection"]);
});

for (const sdkState of ["STOPPING", "DRAINING"] as const) {
  test(`shutdown joins an SDK-initiated ${sdkState} Worker before closing its connection`, async (context) => {
    const closed: string[] = [];
    const stopped = Promise.withResolvers<void>();
    let state: ReturnType<Worker["getState"]> = "RUNNING";
    context.mock.method(NativeConnection, "connect", async () => ({
      close: async () => { closed.push("connection"); },
    }));
    const nativeShutdown = context.mock.fn(() => {
      if (state !== "RUNNING") throw new Error(`Not running. Current state: ${state}`);
      state = "DRAINING";
      stopped.resolve();
    });
    context.mock.method(Worker, "create", async () => ({
      run: () => stopped.promise,
      getState: () => state,
      shutdown: nativeShutdown,
    }));
    const runtime = await ExternalTemporalRuntime.connectBundle(
      options, activities, { code: "shutdown lifecycle bytes", sourceMap: "{}" },
    );
    state = sdkState;
    const shutdown = runtime.shutdown();
    let settled = false;
    const outcome = shutdown.then(
      () => { settled = true; return undefined; },
      (error: unknown) => { settled = true; return error; },
    );
    try {
      assert.equal(runtime.shutdown(), shutdown);
      await setImmediate();
      assert.equal(settled, false);
      assert.deepEqual(closed, []);
      assert.equal(nativeShutdown.mock.callCount(), 0);
    } finally {
      stopped.resolve();
    }
    assert.equal(await outcome, undefined);
    await runtime.shutdown();
    assert.deepEqual(closed, ["connection"]);
    assert.equal(nativeShutdown.mock.callCount(), 0);
  });
}

test("shutdown preserves an SDK-initiated Worker failure and closes its connection once", async (context) => {
  const workerFailure = new Error("SDK Worker run failed while draining");
  const closed: string[] = [];
  const stopped = Promise.withResolvers<void>();
  let state: ReturnType<Worker["getState"]> = "RUNNING";
  context.mock.method(NativeConnection, "connect", async () => ({
    close: async () => { closed.push("connection"); },
  }));
  const nativeShutdown = context.mock.fn(() => {
    if (state !== "RUNNING") throw new Error(`Not running. Current state: ${state}`);
    state = "DRAINING";
    stopped.resolve();
  });
  context.mock.method(Worker, "create", async () => ({
    run: () => stopped.promise,
    getState: () => state,
    shutdown: nativeShutdown,
  }));
  const runtime = await ExternalTemporalRuntime.connectBundle(
    options, activities, { code: "failed shutdown lifecycle bytes", sourceMap: "{}" },
  );
  state = "DRAINING";
  const rejected = assert.rejects(runtime.shutdown(), (error: unknown) => error === workerFailure);
  stopped.reject(workerFailure);
  await rejected;
  await assert.rejects(runtime.shutdown(), (error: unknown) => error === workerFailure);
  assert.throws(() => runtime.assertHealthy(), (error: unknown) => error === workerFailure);
  assert.deepEqual(closed, ["connection"]);
  assert.equal(nativeShutdown.mock.callCount(), 0);
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
