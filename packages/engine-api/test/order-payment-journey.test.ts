/**
 * PC-JOURNEY-06 through the engine API alone: two orders wait for a correlated payment while an interrupting
 * withdrawal and a repeatable status update with a payload hang on their settlement. Every Message is published by name
 * with a criterion over the business value `orderId`, never by an occurrence, and every outcome is read back through
 * the public observations: the settled resolution by command identifier, the open work, the committed variables and
 * the closed process. The same model and schedules run against the kernel in
 * `scenarios/open-rows/journey-order-payment`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

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
  completeWork,
  engineProcessLocatorForCanonicalProcess,
  observeEnginePopulationResult,
  observeEngineProcessExecution,
  observeOpenWork,
  publishEngineMessage,
  startBpmnDefinitionVersion,
  type EngineBinding,
  type EngineDefinitionIdentity,
  type EnginePopulationResolution,
} from "@bpmn-lean/engine-api";

import { cibProfile, deployed, limits, scenarioBytes, sha256, testHost, testPopulation, type TestHost } from "./support.ts";

const profile = await cibProfile();
const modelPath = "open-rows/journey-order-payment/order-payment.bpmn";
const sourceId = "order-payment";
const processId = "Process_OrderPayment";

const text = (value: string) => ({ kind: "string", value }) as const;
const onOrder = (orderId: string) => [{ target: { kind: "processVariable", name: "orderId" }, expected: text(orderId) }] as const;
const locatorOf = (instance: string) => engineProcessLocatorForCanonicalProcess(testPopulation, instance);

async function identity(): Promise<EngineDefinitionIdentity> {
  const compiled = await compileBpmnDefinition({ bytes: await scenarioBytes(modelPath), sourceId, profile, limits });
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error(`not admitted: ${compiled.diagnostics[0].code}`);
  return { ...compiled.definition, ref: { ...compiled.definition.ref, version: 1 } };
}

async function deploy(host: TestHost): Promise<void> {
  const bytes = await scenarioBytes(modelPath);
  await deployed({
    host, bytes, sourceId, expectedSha256: await sha256(bytes), profile, expectedProcessId: processId, version: 1, limits,
  });
}

async function startOrder(host: TestHost, instance: string, orderId: string): Promise<void> {
  const bytes = await scenarioBytes(modelPath);
  const started = await startBpmnDefinitionVersion({
    host, bytes, sourceId, expectedSha256: await sha256(bytes), profile, expectedProcessId: processId, version: 1,
    processInstanceId: instance, initialVariables: [{ name: "orderId", value: text(orderId) }], limits,
  });
  assert.equal(started.status, EngineDefinitionStartStatus.Started);
}

/** Two orders, `A-1` as `order-a` and `B-2` as `order-b`, each waiting at its payment catch. */
async function twoOrders(): Promise<TestHost> {
  const host = testHost();
  await deploy(host);
  await startOrder(host, "order-a", "A-1");
  await startOrder(host, "order-b", "B-2");
  return host;
}

async function variablesOf(host: TestHost, instance: string): Promise<readonly EngineBinding[]> {
  const page = await observeEngineProcessExecution({
    host, locator: locatorOf(instance), definition: await identity(), processInstanceId: instance, afterRevision: 0,
  });
  if (page.status !== EnginePublicationStatus.Available || page.current === null) throw new Error("no committed state");
  return page.current.state.variables;
}

/** The open User Tasks of `instance` as `Element#activation`, sorted; `null` once the process is closed. */
async function openTasks(host: TestHost, instance: string): Promise<readonly string[] | null> {
  const work = await observeOpenWork({ host, locator: locatorOf(instance), hostingProcessInstanceId: instance });
  if (work.status === EngineOpenWorkStatus.Closed) return null;
  assert.equal(work.status, EngineOpenWorkStatus.Open);
  return work.status === EngineOpenWorkStatus.Open
    ? work.openUserTasks.map((task) => `${task.id.elementId}#${String(task.id.activation)}`).sort()
    : [];
}

async function complete(host: TestHost, instance: string, elementId: string, activation: number): Promise<void> {
  const result = await completeWork({
    host, locator: locatorOf(instance), hostingProcessInstanceId: instance,
    completion: {
      commandId: `complete-${instance}-${elementId}-${String(activation)}`,
      taskId: { processInstanceId: instance, elementId, activation },
      values: [],
    },
  });
  assert.equal(result.kind === "semantic" ? result.outcome : result.kind, "committed");
}

let published = 0;
/** One publication by Message name in executions-only mode, whose settled result must read back by its identifier. */
async function publish(
  host: TestHost, name: string, criteria: ReturnType<typeof onOrder> | readonly [], payload?: string,
): Promise<EnginePopulationResolution> {
  published += 1;
  const commandId = `publication-${String(published)}`;
  const answer = await publishEngineMessage({
    host, commandId, message: { kind: "name", name }, definition: null, criteria,
    payload: payload === undefined ? null : text(payload), variables: [], businessKey: null,
    mode: EngineMessagePublicationMode.ExecutionsOnly,
  });
  if (answer.status !== EngineMessagePublicationStatus.Resolved) throw new Error(`publication ${answer.status}`);
  assert.deepEqual(await observeEnginePopulationResult({ host, commandId }),
    { status: EnginePopulationResultStatus.Settled, result: answer.result });
  return answer.result.resolution;
}

const reached = (resolution: EnginePopulationResolution): string | null =>
  resolution.kind === EnginePopulationResolutionKind.Committed
    ? `${resolution.target.processInstanceId}/${resolution.target.elementId}`
    : resolution.kind;

test("a payment reaches the order its criterion names and leaves the sibling's subscription waiting", async () => {
  const host = await twoOrders();
  assert.equal(reached(await publish(host, "payment-received", [])), EnginePopulationResolutionKind.Ambiguous);
  assert.equal(reached(await publish(host, "payment-received", onOrder("Z-9"))), EnginePopulationResolutionKind.NoMatch);
  assert.equal(reached(await publish(host, "payment-received", onOrder("B-2"))), "order-b/AwaitPayment");
  assert.deepEqual(await openTasks(host, "order-b"), ["RecordPayment#1"]);
  assert.deepEqual(await openTasks(host, "order-a"), []);
  assert.equal(reached(await publish(host, "payment-received", onOrder("B-2"))), EnginePopulationResolutionKind.NoMatch);

  await complete(host, "order-b", "RecordPayment", 1);
  await complete(host, "order-b", "ShipOrder", 1);
  assert.equal(await openTasks(host, "order-b"), null);
  assert.equal(reached(await publish(host, "payment-received", onOrder("A-1"))), "order-a/AwaitPayment");
  await complete(host, "order-a", "RecordPayment", 1);
  await complete(host, "order-a", "ShipOrder", 1);
  assert.equal(await openTasks(host, "order-a"), null);
});

test("status updates repeat with their payload, and a withdrawal cancels the settlement beside an open handler", async () => {
  const host = await twoOrders();
  assert.equal(reached(await publish(host, "order-status", onOrder("A-1"), "Packing started")), "order-a/StatusReceived");
  assert.equal(reached(await publish(host, "order-status", onOrder("A-1"), "Packed, awaiting payment")), "order-a/StatusReceived");
  assert.deepEqual(await openTasks(host, "order-a"), ["NoteStatus#1", "NoteStatus#2"]);
  assert.deepEqual((await variablesOf(host, "order-a")).find((binding) => binding.name === "Property_StatusNote"),
    { name: "Property_StatusNote", value: text("Packed, awaiting payment") });
  assert.equal((await variablesOf(host, "order-b")).some((binding) => binding.name === "Property_StatusNote"), false);

  assert.equal(reached(await publish(host, "order-withdrawn", onOrder("A-1"))), "order-a/WithdrawalReceived");
  assert.deepEqual(await openTasks(host, "order-a"), ["CancelOrder#1", "NoteStatus#1", "NoteStatus#2"]);
  assert.equal(reached(await publish(host, "payment-received", onOrder("A-1"))), EnginePopulationResolutionKind.NoMatch);
  assert.equal(reached(await publish(host, "order-status", onOrder("A-1"), "Too late")), EnginePopulationResolutionKind.NoMatch);
  assert.equal(reached(await publish(host, "order-withdrawn", onOrder("A-1"))), EnginePopulationResolutionKind.NoMatch);

  assert.equal(reached(await publish(host, "payment-received", onOrder("B-2"))), "order-b/AwaitPayment");
  await complete(host, "order-b", "RecordPayment", 1);
  assert.equal(reached(await publish(host, "order-withdrawn", onOrder("B-2"))), EnginePopulationResolutionKind.NoMatch);
  await complete(host, "order-b", "ShipOrder", 1);
  assert.equal(await openTasks(host, "order-b"), null);

  await complete(host, "order-a", "NoteStatus", 2);
  await complete(host, "order-a", "NoteStatus", 1);
  await complete(host, "order-a", "CancelOrder", 1);
  assert.equal(await openTasks(host, "order-a"), null);
});
