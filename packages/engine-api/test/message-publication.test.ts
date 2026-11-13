/**
 * Message publication without a process target, by channel or by Message name: the population delivers it to the one
 * open wait whose criteria, business key and address match at delivery time among the selected deployments' instances,
 * or, outside executions-only, starts the one Message start candidate; none is `noMatch`, several `ambiguous`. A
 * repeated command identifier answers the recorded result, other content under it is an identity conflict, and every
 * settled publication is read back by its command identifier.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionStartStatus,
  EngineMessagePublicationMode,
  EngineMessagePublicationStatus,
  EnginePopulationResolutionKind,
  EnginePopulationResultStatus,
  EnginePublicationStatus,
  compileBpmnDefinition,
  engineDefinitionNotDeployedCode,
  engineProcessLocatorForCanonicalProcess,
  observeEnginePopulationResult,
  observeEngineProcessExecution,
  publishEngineMessage,
  startBpmnDefinitionVersion,
  type EngineBinding,
  type EngineDefinitionIdentity,
  type EngineMessagePublicationRequest,
  type EngineProfile,
} from "@bpmn-lean/engine-api";

import { cibProfile, deployed, limits, scenarioBytes, servesEverything, sha256, testHost, testPopulation, type TestHost } from "./support.ts";

/** Modeled key correlation (CIB-LIM-0002): a key matches as a Process-variable criterion named by the key. */
const keyProfile: EngineProfile = { id: "test-correlation", relations: ["CIB-AGR-0001", "CIB-OP-0001", "CIB-LIM-0002"] };
/** Message names as addresses (CIB-LIM-0022), API criteria and installed delivery variables (CIB-EXT-0025). */
const criteriaProfile = await cibProfile();

const settlementChannel = {
  kind: "operationMessage",
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const;
const correlationKey = "CorrelationKey_SettlementReference";

const orderModel = "open-rows/message-correlation-criteria/order-confirmation.bpmn";
const intakeModel = "open-rows/message-start-population/confirmation-intake.bpmn";
const payloadModel = "open-rows/message-payload-catches/payload-catches.bpmn";

const text = (value: string) => ({ kind: "string", value }) as const;
const locatorOf = (instance: string) => engineProcessLocatorForCanonicalProcess(testPopulation, instance);

type Model = Readonly<{ path: string; sourceId: string; processId: string; profile: EngineProfile }>;
const settlement: Model = { path: "message-key-correlation/process.bpmn", sourceId: "settlement", processId: "Process_SettlementCorrelation", profile: keyProfile };
const orders: Model = { path: orderModel, sourceId: "orders", processId: "Process_OrderConfirmation", profile: criteriaProfile };
const intake: Model = { path: intakeModel, sourceId: "intake", processId: "Process_ConfirmationIntake", profile: criteriaProfile };
const payloads: Model = { path: payloadModel, sourceId: "payloads", processId: "Process_PayloadCatches", profile: criteriaProfile };

async function identity(model: Model): Promise<EngineDefinitionIdentity> {
  const bytes = await scenarioBytes(model.path);
  const compiled = await compileBpmnDefinition({ bytes, sourceId: model.sourceId, profile: model.profile, limits });
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error(`not admitted: ${compiled.diagnostics[0].code}`);
  return { ...compiled.definition, ref: { ...compiled.definition.ref, version: 1 } };
}

async function deploy(host: TestHost, model: Model): Promise<void> {
  const bytes = await scenarioBytes(model.path);
  await deployed({
    host, bytes, sourceId: model.sourceId, expectedSha256: await sha256(bytes), profile: model.profile,
    expectedProcessId: model.processId, version: 1, limits,
  });
}

async function start(host: TestHost, model: Model, instance: string, variables: readonly EngineBinding[]): Promise<void> {
  const bytes = await scenarioBytes(model.path);
  const started = await startBpmnDefinitionVersion({
    host, bytes, sourceId: model.sourceId, expectedSha256: await sha256(bytes), profile: model.profile,
    expectedProcessId: model.processId, version: 1, processInstanceId: instance, initialVariables: variables, limits,
  });
  assert.equal(started.status, EngineDefinitionStartStatus.Started);
}

/** The committed variables of `instance`, read through the public execution publication. */
async function variablesOf(host: TestHost, model: Model, instance: string): Promise<readonly EngineBinding[]> {
  const page = await observeEngineProcessExecution({
    host, locator: locatorOf(instance), definition: await identity(model), processInstanceId: instance, afterRevision: 0,
  });
  if (page.status !== EnginePublicationStatus.Available || page.current === null) throw new Error("no committed state");
  return page.current.state.variables;
}

const request = (host: TestHost, overrides: Partial<EngineMessagePublicationRequest>): EngineMessagePublicationRequest => ({
  host,
  commandId: "publication-1",
  message: { kind: "name", name: "order-confirmed" },
  definition: null,
  criteria: [],
  payload: null,
  variables: [],
  businessKey: null,
  mode: EngineMessagePublicationMode.ExecutionsOnly,
  ...overrides,
});

/** Two orders waiting at their confirmation catch, `A-1` and `B-2`. */
async function waitingOrders(): Promise<TestHost> {
  const host = testHost();
  await deploy(host, orders);
  await start(host, orders, "order-a", [{ name: "orderId", value: text("A-1") }]);
  await start(host, orders, "order-b", [{ name: "orderId", value: text("B-2") }]);
  return host;
}

const onOrder = (orderId: string) => [{ target: { kind: "processVariable", name: "orderId" }, expected: text(orderId) }] as const;

test("a publication by name reaches the one instance its criterion matches and installs its variables there", async () => {
  const host = await waitingOrders();
  const published = await publishEngineMessage(request(host, {
    criteria: onOrder("B-2"), variables: [{ name: "confirmedBy", value: text("ops") }],
  }));
  assert.deepEqual(published, {
    status: EngineMessagePublicationStatus.Resolved,
    result: {
      commandId: "publication-1",
      ingressOrdinal: 1,
      resolution: {
        kind: EnginePopulationResolutionKind.Committed,
        target: { processInstanceId: "order-b", elementId: "AwaitConfirmation", activation: 1 },
        locator: locatorOf("order-b"),
        cascade: [],
      },
    },
  });
  assert.deepEqual((await variablesOf(host, orders, "order-b")).find((binding) => binding.name === "confirmedBy"),
    { name: "confirmedBy", value: text("ops") });
  assert.equal((await variablesOf(host, orders, "order-a")).some((binding) => binding.name === "confirmedBy"), false);
});

test("several matching instances, none, and another business key change no instance", async () => {
  const host = await waitingOrders();
  const resolution = async (commandId: string, overrides: Partial<EngineMessagePublicationRequest>) => {
    const published = await publishEngineMessage(request(host, { commandId, ...overrides }));
    return published.status === EngineMessagePublicationStatus.Resolved ? published.result.resolution : published;
  };
  assert.deepEqual(await resolution("ambiguous", {}), { kind: EnginePopulationResolutionKind.Ambiguous });
  assert.deepEqual(await resolution("unmatched", { criteria: onOrder("Z-9") }), { kind: EnginePopulationResolutionKind.NoMatch });
  assert.deepEqual(await resolution("other-key", { criteria: onOrder("A-1"), businessKey: "ORD-9" }),
    { kind: EnginePopulationResolutionKind.NoMatch });
  const matched = await resolution("matched", { criteria: onOrder("A-1") });
  assert.equal("kind" in matched && matched.kind, EnginePopulationResolutionKind.Committed);
});

test("a payload reaches the Data Output of the catch it is published to; a catch without one refuses it", async () => {
  const host = testHost();
  await deploy(host, payloads);
  await start(host, payloads, "payloads", [{ name: "items", value: { kind: "stringList", value: [] } }]);
  const quoted = await publishEngineMessage(request(host, { message: { kind: "name", name: "quote" }, payload: text("quote 7") }));
  assert.equal(quoted.status === EngineMessagePublicationStatus.Resolved && quoted.result.resolution.kind,
    EnginePopulationResolutionKind.Committed);
  assert.deepEqual((await variablesOf(host, payloads, "payloads")).find((binding) => binding.name === "Property_Quote"),
    { name: "Property_Quote", value: text("quote 7") });

  const ordered = await waitingOrders();
  const refused = await publishEngineMessage(request(ordered, { criteria: onOrder("A-1"), payload: text("unexpected") }));
  assert.deepEqual(refused.status === EngineMessagePublicationStatus.Resolved && refused.result.resolution, {
    kind: EnginePopulationResolutionKind.Failed,
    target: { processInstanceId: "order-a", elementId: "AwaitConfirmation", activation: 1 },
    locator: locatorOf("order-a"),
    outcome: "rejected",
    code: "message-payload-not-accepted",
  });
});

test("outside executions-only a publication no wait takes starts the one Message start of the selected key", async () => {
  const host = testHost();
  await deploy(host, intake);
  const executionsOnly = await publishEngineMessage(request(host, { commandId: "waits-only" }));
  assert.equal(executionsOnly.status === EngineMessagePublicationStatus.Resolved && executionsOnly.result.resolution.kind,
    EnginePopulationResolutionKind.NoMatch);
  const started = await publishEngineMessage(request(host, {
    commandId: "starts", mode: EngineMessagePublicationMode.Any,
    definition: { kind: "currentVersion", definitionKey: "Process_ConfirmationIntake" },
  }));
  assert.equal(started.status, EngineMessagePublicationStatus.Resolved);
  if (started.status !== EngineMessagePublicationStatus.Resolved) return;
  assert.equal(started.result.resolution.kind, EnginePopulationResolutionKind.FanOut);
  if (started.result.resolution.kind !== EnginePopulationResolutionKind.FanOut) return;
  const [entry] = started.result.resolution.entries;
  assert.equal(entry?.kind, "started");
  if (entry?.kind !== "started") return;
  assert.deepEqual({ ...entry, processInstanceId: null, locator: null },
    { kind: "started", processInstanceId: null, locator: null, deploymentId: 1, version: 1, startEventId: "StartConfirmation" });
  assert.equal(entry.locator, locatorOf(entry.processInstanceId));
  const unknownKey = await publishEngineMessage(request(host, {
    commandId: "unknown-key", mode: EngineMessagePublicationMode.StartOnly, definition: { kind: "currentVersion", definitionKey: "Process_Unknown" },
  }));
  assert.deepEqual(unknownKey.status === EngineMessagePublicationStatus.Resolved && unknownKey.result.resolution,
    { kind: EnginePopulationResolutionKind.Rejected, code: engineDefinitionNotDeployedCode });
});

test("a settled publication is read back by its command identifier; an unknown identifier is unknown", async () => {
  const host = await waitingOrders();
  const published = await publishEngineMessage(request(host, { criteria: onOrder("A-1") }));
  assert.equal(published.status, EngineMessagePublicationStatus.Resolved);
  if (published.status !== EngineMessagePublicationStatus.Resolved) return;
  assert.deepEqual(await observeEnginePopulationResult({ host, commandId: "publication-1" }),
    { status: EnginePopulationResultStatus.Settled, result: published.result });
  assert.deepEqual(await observeEnginePopulationResult({ host, commandId: "publication-2" }), { status: EnginePopulationResultStatus.Unknown });
});

test("a channel publication delivers by the modeled correlation key at delivery time", async () => {
  const host = testHost();
  await deploy(host, settlement);
  // The model's first catch writes the settlement reference its correlated catch then waits on.
  for (const [index, reference] of ["settlement-42", "settlement-43"].entries()) {
    const instance = `settlement-${String(index)}`;
    await start(host, settlement, instance, []);
    const initialized = await host.processes.deliver(decodeURIComponent(locatorOf(instance).slice("bpmn-process:".length)), {
      kind: "deliver", commandId: `initialize-${instance}`,
      occurrence: { processInstanceId: instance, elementId: "MessageCatch_InitialSettlement", activation: 1 },
      trigger: { kind: "message", channel: settlementChannel }, payload: text(reference),
    });
    assert.equal(initialized.outcome, "committed");
  }
  const settlementIdentity = await identity(settlement);
  const keyed = (commandId: string, reference: string) => publishEngineMessage(request(host, {
    commandId, message: { kind: "channel", channel: settlementChannel },
    definition: { kind: "version", definition: settlementIdentity },
    criteria: [{ target: { kind: "processVariable", name: correlationKey }, expected: text(reference) }],
  }));
  const first = await keyed("publication-1", "settlement-43");
  assert.deepEqual(first.status === EngineMessagePublicationStatus.Resolved && first.result.resolution, {
    kind: EnginePopulationResolutionKind.Committed,
    target: { processInstanceId: "settlement-1", elementId: "MessageCatch_CorrelatedSettlement", activation: 1 },
    locator: locatorOf("settlement-1"),
    cascade: [],
  });
  // A repeat answers the recorded result under the population's next ordinal (population contract §7).
  assert.deepEqual(await keyed("publication-1", "settlement-43"),
    first.status === EngineMessagePublicationStatus.Resolved ? { ...first, result: { ...first.result, ingressOrdinal: 2 } } : null);
  assert.deepEqual(await keyed("publication-1", "settlement-42"), { status: EngineMessagePublicationStatus.IdentityConflict });
  const again = await keyed("publication-2", "settlement-43");
  assert.deepEqual(again.status === EngineMessagePublicationStatus.Resolved && again.result.resolution,
    { kind: EnginePopulationResolutionKind.NoMatch });
});

test("a publication to an undeployed version, or to a deployment that serves no Messages, is refused before any process", async () => {
  const definition = await identity(orders);
  assert.deepEqual(await publishEngineMessage(request(testHost(), { definition: { kind: "version", definition } })), {
    status: EngineMessagePublicationStatus.Refused,
    failure: { code: engineDefinitionNotDeployedCode, evidence: "No population registration holds the definition version." },
  });
  assert.deepEqual(await publishEngineMessage(request(testHost({ ...servesEverything, messages: false }), {})), {
    status: EngineMessagePublicationStatus.Refused,
    failure: { code: "host.messages", evidence: "The deployment does not serve Messages." },
  });
});
