/** Evaluation-only Worker configuration, effect simulation, and lifecycle contract. */

import assert from "node:assert/strict";
import test from "node:test";
import { allocatePlaywrightLoopbackPort } from "../../../../scripts/playwright-loopback-ports.ts";

import {
  createEvaluationEffectActivities,
  executeEvaluationWorkerCommand,
  loadEvaluationWorkerConfig,
  runEvaluationWorker,
  startEvaluationWorkerHealthServer,
} from "@bpmn-lean/temporal-runner";
import type {
  EvaluationWorkerDependencies,
  EvaluationWorkerCommandDependencies,
  EvaluationWorkerRuntime,
} from "@bpmn-lean/temporal-runner";

const environment = {
  BPMN_TEMPORAL_ADDRESS: "temporal:7233",
  BPMN_TEMPORAL_NAMESPACE: "default",
  BPMN_TEMPORAL_TASK_QUEUE: "bpmn-evaluation",
  BPMN_WORKER_IDENTITY: "bpmn-evaluation-worker",
  BPMN_WORKER_HEALTH_PORT: "8081",
} as const;

test("readiness refuses an unenrolled fleet while the poller remains live", async () => {
  const port = await allocatePlaywrightLoopbackPort();
  let ready = false;
  let healthy = true;
  const runtime = {
    assertHealthy() { if (!healthy) throw new Error("poller stopped"); },
    async requireEnrollment() { if (!ready) throw new Error("Current absent"); },
    async shutdown() {},
  };
  const server = await startEvaluationWorkerHealthServer(port, runtime);
  const status = async (path: string) => (await fetch(`http://127.0.0.1:${port}${path}`)).status;
  try {
    assert.equal(await status("/healthz"), 204);
    assert.equal(await status("/readyz"), 503);
    ready = true;
    assert.equal(await status("/readyz"), 204);
    healthy = false;
    assert.equal(await status("/healthz"), 503);
    assert.equal(await status("/readyz"), 503);
    assert.equal(await status("/unknown"), 404);
  } finally {
    await server.close();
  }
});

test("snapshots every required environment value and validates the health port", () => {
  const mutableEnvironment: NodeJS.ProcessEnv = { ...environment };
  const config = loadEvaluationWorkerConfig(mutableEnvironment);
  mutableEnvironment.BPMN_TEMPORAL_ADDRESS = "changed:7233";
  mutableEnvironment.BPMN_TEMPORAL_NAMESPACE = "changed";

  assert.deepEqual(config, {
    temporal: {
      address: "temporal:7233",
      namespace: "default",
      taskQueue: "bpmn-evaluation",
      identity: "bpmn-evaluation-worker",
    },
    healthPort: 8081,
  });
  for (const name of Object.keys(environment)) {
    assert.throws(
      () => loadEvaluationWorkerConfig({ ...environment, [name]: undefined }),
      new RegExp(name),
    );
  }
  for (const healthPort of ["0", "65536", "1.5", " 8081", "8081 "]) {
    assert.throws(
      () => loadEvaluationWorkerConfig({
        ...environment,
        BPMN_WORKER_HEALTH_PORT: healthPort,
      }),
      /BPMN_WORKER_HEALTH_PORT/,
    );
  }
});

test("fails once for each exact effect transport key and then succeeds", async () => {
  const activities = createEvaluationEffectActivities();
  const request = (idempotencyKey: string) => ({
    protocol: "urn:example:protocol",
    operation: "example-operation",
    idempotencyKey,
    arguments: [],
  });

  assert.deepEqual(
    await activities.executeBpmnEffect(request("effect:key:1")),
    { kind: "technicalFailure" },
  );
  assert.deepEqual(
    await activities.executeBpmnEffect(request("effect:key:1")),
    { kind: "success", localPatch: [] },
  );
  assert.deepEqual(
    await activities.executeBpmnEffect(request("effect:key:2")),
    { kind: "technicalFailure" },
  );
  assert.deepEqual(
    await activities.executeBpmnEffect(request("effect:key:2")),
    { kind: "success", localPatch: [] },
  );
  await assert.rejects(
    activities.executeBpmnEffect(request("\uD800")),
    /well-formed nonempty string/,
  );
});

test("publishes health only after connection and shuts down once", async () => {
  let resolveConnection: ((runtime: EvaluationWorkerRuntime) => void) | undefined;
  let healthStarts = 0;
  let healthCloses = 0;
  let shutdowns = 0;
  const termination = new AbortController();
  const runtime: EvaluationWorkerRuntime = {
    assertHealthy() {},
    async requireEnrollment() {},
    async shutdown() {
      shutdowns += 1;
    },
  };
  const dependencies: EvaluationWorkerDependencies = {
    connect: () => new Promise((resolve) => {
      resolveConnection = resolve;
    }),
    startHealthServer: async () => {
      healthStarts += 1;
      return {
        async close() {
          healthCloses += 1;
        },
      };
    },
    terminationSignal: termination.signal,
    healthPollIntervalMs: 5,
  };

  const running = runEvaluationWorker(environment, dependencies);
  await Promise.resolve();
  assert.equal(healthStarts, 0);

  resolveConnection?.(runtime);
  await waitUntil(() => healthStarts === 1);
  termination.abort();
  termination.abort();
  await running;

  assert.equal(healthCloses, 1);
  assert.equal(shutdowns, 1);
});

test("stops and shuts down once when the Worker becomes unhealthy", async () => {
  let healthy = true;
  let shutdowns = 0;
  const runtime: EvaluationWorkerRuntime = {
    async requireEnrollment() {},
    assertHealthy() {
      if (!healthy) {
        throw new Error("worker stopped");
      }
    },
    async shutdown() {
      shutdowns += 1;
    },
  };
  const dependencies: EvaluationWorkerDependencies = {
    connect: async () => runtime,
    startHealthServer: async () => ({ close: async () => undefined }),
    terminationSignal: new AbortController().signal,
    healthPollIntervalMs: 1,
  };

  const running = runEvaluationWorker(environment, dependencies);
  await Promise.resolve();
  healthy = false;
  await assert.rejects(running, /worker stopped/);
  assert.equal(shutdowns, 1);
});

test("explicit initialization forwards retention and closes without entering the serving lifecycle", async () => {
  const calls: string[] = [];
  const dependencies = initializationDependencies(calls);
  await executeEvaluationWorkerCommand(environment,
    ["initialize-fresh-namespace", "--retention-seconds", "86400"], dependencies);
  assert.deepEqual(calls, ["initialize:default:86400", "shutdown"]);
});

test("initialization failure never connects a replacement or promotes an existing Namespace", async () => {
  const calls: string[] = [];
  const failure = new Error("NamespaceAlreadyExists");
  await assert.rejects(executeEvaluationWorkerCommand(environment,
    ["initialize-fresh-namespace", "--retention-seconds", "86400"], {
      ...initializationDependencies(calls),
      async initializeFreshNamespace() { throw failure; },
    }), (error: unknown) => error === failure);
  assert.deepEqual(calls, []);
});

test("invalid initialization arguments and config refuse before connecting", async () => {
  const calls: string[] = [];
  for (const args of [
    ["unknown"], ["initialize-fresh-namespace"],
    ["initialize-fresh-namespace", "--retention-seconds", "0"],
    ["initialize-fresh-namespace", "--retention-seconds", "1.5"],
    ["initialize-fresh-namespace", "--retention-seconds", " 86400"],
    ["initialize-fresh-namespace", "--retention-seconds", "9007199254740992"],
    ["initialize-fresh-namespace", "--retention-seconds", "86400", "extra"],
  ]) {
    await assert.rejects(executeEvaluationWorkerCommand(environment, args, initializationDependencies(calls)), TypeError);
  }
  await assert.rejects(executeEvaluationWorkerCommand({},
    ["initialize-fresh-namespace", "--retention-seconds", "86400"], initializationDependencies(calls)), /BPMN_TEMPORAL_ADDRESS/);
  assert.deepEqual(calls, []);
});

test("ordinary command startup connects once and never initializes", async () => {
  const calls: string[] = [];
  const dependencies = initializationDependencies(calls);
  await executeEvaluationWorkerCommand(environment, [], dependencies);
  assert.deepEqual(calls, ["connect", "health", "health-close", "shutdown"]);
});

function initializationDependencies(calls: string[]): EvaluationWorkerCommandDependencies {
  const runtime: EvaluationWorkerRuntime = {
    assertHealthy() {},
    async requireEnrollment() {},
    async shutdown() { calls.push("shutdown"); },
  };
  return {
    async connect() { calls.push("connect"); return runtime; },
    async initializeFreshNamespace(options, activities, retentionSeconds) {
      assert.deepEqual(options, loadEvaluationWorkerConfig(environment).temporal);
      assert.equal(typeof activities.executeBpmnEffect, "function");
      calls.push(`initialize:${options.namespace}:${retentionSeconds}`);
      return runtime;
    },
    async startHealthServer() {
      calls.push("health");
      return { async close() { calls.push("health-close"); } };
    },
    terminationSignal: AbortSignal.abort(),
    healthPollIntervalMs: 5,
  };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for evaluation Worker lifecycle event");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
