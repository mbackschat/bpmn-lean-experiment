/**
 * Hosted witness that a start description reads the retained start's own verdict over a Temporal server: a committed
 * start is `matching`, while a start the kernel refuses leaves a chain that retains the intent, ends `NotStarted` and is
 * described `notCommitted`, and a retried dispatch of it answers that refusal (#141).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  EngineDefinitionStartStatus,
  EngineStartDescriptionStatus,
  createEngineHostRuntime,
  describeBpmnDefinitionVersionStart,
  prepareBpmnDefinitionVersionStart,
  startPreparedBpmnDefinitionVersion,
  type EngineDefinitionStartRequest,
  type EngineHostRuntime,
} from "@bpmn-lean/engine-api";
import { servesEverything } from "@bpmn-lean/engine-api/testing";
import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-host/testing";
import { EffectResultKind, createHostWorker } from "@bpmn-lean/temporal-host/worker";

import { deployed, limits, scenarioBytes, sha256, standardProfile } from "./support.ts";

const taskQueue = `bpmn-lean-engine-api-start-${randomUUID()}`;

let environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
let worker: Awaited<ReturnType<typeof createHostWorker>>;
let running: Promise<void>;
let runtime: EngineHostRuntime;

before(async () => {
  environment = await createCachedLocalEnvironment({
    identity: "bpmn-lean-engine-api-start",
    downloadDirectory: fileURLToPath(new URL("../../../.cache/temporal-cli/", import.meta.url)),
  });
  worker = await createHostWorker({
    connection: environment.nativeConnection,
    taskQueue,
    scriptTimeoutMs: 1_000,
    effects: async () => ({ kind: EffectResultKind.Success, outputs: [] }),
  });
  running = worker.run();
  runtime = createEngineHostRuntime({
    address: environment.address, namespace: environment.namespace ?? "default", connectTimeoutMs: 10_000,
    served: servesEverything, effectStartToCloseMs: 10_000, taskQueue,
  });
});

after(async () => {
  await runtime.close();
  worker.shutdown();
  await running;
  await environment.teardown();
});

async function request(path: string, processId: string, processInstanceId: string): Promise<EngineDefinitionStartRequest> {
  const bytes = await scenarioBytes(path);
  return deployed({
    host: runtime.host, bytes, sourceId: processId, expectedSha256: await sha256(bytes), profile: standardProfile,
    expectedProcessId: processId, version: 1, processInstanceId, initialVariables: [], limits,
  });
}

async function startAndDescribe(start: EngineDefinitionStartRequest) {
  const prepared = await prepareBpmnDefinitionVersionStart(start);
  if (prepared.status !== EngineDefinitionStartStatus.Admitted) throw new Error("not admitted");
  const started = await startPreparedBpmnDefinitionVersion({ ...start, expectedIntent: prepared.intent });
  const description = await describeBpmnDefinitionVersionStart({
    host: runtime.host, processInstanceId: start.processInstanceId, expectedIntent: prepared.intent });
  const retried = await startPreparedBpmnDefinitionVersion({ ...start, expectedIntent: prepared.intent });
  return { started, description, retried };
}

test("a committed start is described matching", async () => {
  const { started, description, retried } = await startAndDescribe(
    await request("user-task-preserved-notation/process.bpmn", "Process_SequentialUserTask", `committed-${randomUUID()}`));
  assert.equal(started.status, EngineDefinitionStartStatus.Started);
  assert.equal(description, EngineStartDescriptionStatus.Matching);
  assert.equal(retried.status, EngineDefinitionStartStatus.Started);
});

test("a start the kernel refuses is described notCommitted and its retry answers that refusal", async () => {
  // The model's only start is a Message start, so the kernel refuses a direct start (`no-start-event`).
  const { started, description, retried } = await startAndDescribe(
    await request("message-start-event/process.bpmn", "Process_MessageStart", `refused-${randomUUID()}`));
  assert.equal(started.status, EngineDefinitionStartStatus.Rejected);
  if (started.status === EngineDefinitionStartStatus.Rejected) assert.equal(started.failure.code, "no-start-event");
  assert.equal(description, EngineStartDescriptionStatus.NotCommitted);
  assert.equal(retried.status, EngineDefinitionStartStatus.Rejected);
  if (retried.status === EngineDefinitionStartStatus.Rejected) assert.equal(retried.failure.code, "startNotCommitted");
});
