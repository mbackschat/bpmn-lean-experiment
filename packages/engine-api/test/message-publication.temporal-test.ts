/**
 * Hosted witness of the engine API's Message publication and population result over a Temporal server: a publication
 * by Message name with a criterion and variables reaches the one matching order, a payload reaches its catch's Data
 * Output, a publication no wait takes falls back to the one Message start, and each settled publication reads back by
 * its command identifier; a population whose ingress never ran knows no command.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionStartStatus,
  EngineMessagePublicationMode,
  EngineMessagePublicationStatus,
  EngineOpenWorkStatus,
  EnginePopulationResolutionKind,
  EnginePopulationResultStatus,
  EnginePublicationStatus,
  compileBpmnDefinition,
  createEngineHostRuntime,
  engineProcessLocatorForCanonicalProcess,
  observeEnginePopulationResult,
  observeEngineProcessExecution,
  observeOpenWork,
  publishEngineMessage,
  startBpmnDefinitionVersion,
  type EngineBinding,
  type EngineHostRuntime,
  type EngineMessagePublicationRequest,
  type EngineProfile,
} from "@bpmn-lean/engine-api";
import { servesEverything } from "@bpmn-lean/engine-api/testing";
import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-host/testing";
import { EffectResultKind, createHostWorker } from "@bpmn-lean/temporal-host/worker";

import { cibProfile, deployed, limits, scenarioBytes, sha256 } from "./support.ts";

const taskQueue = `bpmn-lean-engine-api-publication-${randomUUID()}`;

type Model = Readonly<{ path: string; sourceId: string; processId: string }>;
const orders: Model = {
  path: "open-rows/message-correlation-criteria/order-confirmation.bpmn", sourceId: "orders", processId: "Process_OrderConfirmation",
};
const intake: Model = {
  path: "open-rows/message-start-population/confirmation-intake.bpmn", sourceId: "intake", processId: "Process_ConfirmationIntake",
};
const payloads: Model = {
  path: "open-rows/message-payload-catches/payload-catches.bpmn", sourceId: "payloads", processId: "Process_PayloadCatches",
};

const text = (value: string) => ({ kind: "string", value }) as const;
const onOrder = (orderId: string) => [{ target: { kind: "processVariable", name: "orderId" }, expected: text(orderId) }] as const;

let environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>;
let worker: Awaited<ReturnType<typeof createHostWorker>>;
let running: Promise<void>;
let runtime: EngineHostRuntime;
let idle: EngineHostRuntime;
let profile: EngineProfile;

before(async () => {
  environment = await createCachedLocalEnvironment({
    identity: "bpmn-lean-engine-api-publication",
    downloadDirectory: fileURLToPath(new URL("../../../.cache/temporal-cli/", import.meta.url)),
  });
  worker = await createHostWorker({
    connection: environment.nativeConnection,
    taskQueue,
    scriptTimeoutMs: 1_000,
    effects: async () => ({ kind: EffectResultKind.Success, outputs: [] }),
  });
  running = worker.run();
  const options = {
    address: environment.address, namespace: environment.namespace ?? "default", connectTimeoutMs: 10_000,
    served: servesEverything, effectStartToCloseMs: 10_000,
  };
  runtime = createEngineHostRuntime({ ...options, taskQueue });
  idle = createEngineHostRuntime({ ...options, taskQueue: `${taskQueue}-idle` });
  profile = await cibProfile();
});

after(async () => {
  await runtime.close();
  await idle.close();
  worker.shutdown();
  await running;
  await environment.teardown();
});

async function deploy(model: Model): Promise<void> {
  const bytes = await scenarioBytes(model.path);
  await deployed({
    host: runtime.host, bytes, sourceId: model.sourceId, expectedSha256: await sha256(bytes), profile,
    expectedProcessId: model.processId, version: 1, limits,
  });
}

async function start(model: Model, instance: string, variables: readonly EngineBinding[]): Promise<void> {
  const bytes = await scenarioBytes(model.path);
  const started = await startBpmnDefinitionVersion({
    host: runtime.host, bytes, sourceId: model.sourceId, expectedSha256: await sha256(bytes), profile,
    expectedProcessId: model.processId, version: 1, processInstanceId: instance, initialVariables: variables, limits,
  });
  assert.equal(started.status, EngineDefinitionStartStatus.Started);
}

async function variablesOf(model: Model, instance: string): Promise<readonly EngineBinding[]> {
  const compiled = await compileBpmnDefinition({ bytes: await scenarioBytes(model.path), sourceId: model.sourceId, profile, limits });
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error(`${model.sourceId} not admitted`);
  const definition = { ...compiled.definition, ref: { ...compiled.definition.ref, version: 1 } };
  const page = await observeEngineProcessExecution({
    host: runtime.host, locator: engineProcessLocatorForCanonicalProcess(taskQueue, instance), definition,
    processInstanceId: instance, afterRevision: 0,
  });
  if (page.status !== EnginePublicationStatus.Available || page.current === null) throw new Error(`no committed state of ${instance}`);
  return page.current.state.variables;
}

const publication = (overrides: Partial<EngineMessagePublicationRequest>): EngineMessagePublicationRequest => ({
  host: runtime.host,
  commandId: randomUUID(),
  message: { kind: "name", name: "order-confirmed" },
  definition: null,
  criteria: [],
  payload: null,
  variables: [],
  businessKey: null,
  mode: EngineMessagePublicationMode.ExecutionsOnly,
  ...overrides,
});

/** The publication's settled result, which must also be what its command identifier reads back. */
async function published(request: EngineMessagePublicationRequest) {
  const answer = await publishEngineMessage(request);
  if (answer.status !== EngineMessagePublicationStatus.Resolved) throw new Error(`publication ${answer.status}`);
  assert.deepEqual(await observeEnginePopulationResult({ host: runtime.host, commandId: request.commandId }),
    { status: EnginePopulationResultStatus.Settled, result: answer.result });
  return answer.result.resolution;
}

test("hosted Message publication by name with criteria, variables and payload, its start fallback and its result", async () => {
  assert.deepEqual(await observeEnginePopulationResult({ host: idle.host, commandId: "never" }),
    { status: EnginePopulationResultStatus.Unknown });
  await deploy(orders);
  await deploy(intake);
  await deploy(payloads);
  await start(orders, "order-a", [{ name: "orderId", value: text("A-1") }]);
  await start(orders, "order-b", [{ name: "orderId", value: text("B-2") }]);

  assert.deepEqual(await published(publication({ criteria: onOrder("B-2"), variables: [{ name: "confirmedBy", value: text("ops") }] })), {
    kind: EnginePopulationResolutionKind.Committed,
    target: { processInstanceId: "order-b", elementId: "AwaitConfirmation", activation: 1 },
    locator: engineProcessLocatorForCanonicalProcess(taskQueue, "order-b"),
    cascade: [],
  });
  assert.deepEqual((await variablesOf(orders, "order-b")).find((binding) => binding.name === "confirmedBy"),
    { name: "confirmedBy", value: text("ops") });

  const fallback = await published(publication({ criteria: onOrder("Z-9"), mode: EngineMessagePublicationMode.Any }));
  assert.equal(fallback.kind, EnginePopulationResolutionKind.FanOut);
  const [entry] = fallback.kind === EnginePopulationResolutionKind.FanOut ? fallback.entries : [];
  assert.equal(entry?.kind, "started");
  if (entry?.kind !== "started") return;
  assert.equal(entry.startEventId, "StartConfirmation");
  const work = await observeOpenWork({ host: runtime.host, locator: entry.locator, hostingProcessInstanceId: entry.processInstanceId });
  assert.deepEqual(work.status === EngineOpenWorkStatus.Open && work.openUserTasks.map((task) => task.id.elementId),
    ["RecordConfirmation"]);

  await start(payloads, "payloads", [{ name: "items", value: { kind: "stringList", value: [] } }]);
  assert.equal((await published(publication({ message: { kind: "name", name: "quote" }, payload: text("quote 7") }))).kind,
    EnginePopulationResolutionKind.Committed);
  assert.deepEqual((await variablesOf(payloads, "payloads")).find((binding) => binding.name === "Property_Quote"),
    { name: "Property_Quote", value: text("quote 7") });
});
