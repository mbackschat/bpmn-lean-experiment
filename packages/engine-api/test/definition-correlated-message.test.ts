/**
 * Correlated Message ingress: a Message published to a definition version, without a process target, is delivered to
 * the one open correlated wait whose correlation key the kernel matches at delivery time among that version's
 * instances; none is `message.notCorrelated`, several are `message.correlationAmbiguous`, and a deployment that serves
 * no Messages refuses the publication. The model's first catch writes the settlement reference its correlated catch
 * then waits on.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineCorrelatedMessageStatus,
  EngineDefinitionStartStatus,
  compileBpmnDefinition,
  engineCorrelationAmbiguousCode,
  engineNotCorrelatedCode,
  engineProcessLocatorForCanonicalProcess,
  publishEngineCorrelatedMessage,
  startBpmnDefinitionVersion,
  EngineDefinitionCompilationStatus,
  type EngineDefinitionIdentity,
  type EngineProfile,
} from "@bpmn-lean/engine-api";

import { limits, scenarioBytes, servesEverything, sha256, testHost, type TestHost } from "./support.ts";

const profile: EngineProfile = { id: "test-correlation", relations: ["CIB-AGR-0001", "CIB-OP-0001", "CIB-LIM-0002"] };
const channel = {
  kind: "operationMessage",
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const;
const correlationKey = "CorrelationKey_SettlementReference";
const workflowIdOf = (instance: string): string =>
  decodeURIComponent(engineProcessLocatorForCanonicalProcess(instance).slice("bpmn-process:".length));

async function definition(): Promise<EngineDefinitionIdentity> {
  const bytes = await scenarioBytes("message-key-correlation/process.bpmn");
  const compiled = await compileBpmnDefinition({ bytes, sourceId: "settlement", profile, limits });
  assert.equal(compiled.status, EngineDefinitionCompilationStatus.Accepted);
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error("not admitted");
  return { ...compiled.definition, ref: { ...compiled.definition.ref, version: 1 } };
}

/** Starts one instance of version 1 per reference and lets each wait on its correlated catch for that reference. */
async function waiting(references: readonly string[], host: TestHost = testHost()): Promise<TestHost> {
  const bytes = await scenarioBytes("message-key-correlation/process.bpmn");
  for (const [index, reference] of references.entries()) {
    const instance = `settlement-${String(index)}`;
    const started = await startBpmnDefinitionVersion({
      host, bytes, sourceId: "settlement", expectedSha256: await sha256(bytes), profile,
      expectedProcessId: "Process_SettlementCorrelation", version: 1, processInstanceId: instance, initialVariables: [], limits,
    });
    assert.equal(started.status, EngineDefinitionStartStatus.Started);
    const initialized = await host.processes.deliver(workflowIdOf(instance), {
      kind: "deliver", commandId: `initialize-${instance}`,
      occurrence: { processInstanceId: instance, elementId: "MessageCatch_InitialSettlement", activation: 1 },
      trigger: { kind: "message", channel }, payload: { kind: "string", value: reference },
    });
    assert.equal(initialized.outcome, "committed");
  }
  return host;
}

const publish = async (host: TestHost, commandId: string, reference: string) => publishEngineCorrelatedMessage({
  host, definition: await definition(), channel, correlationKey, commandId, payload: { kind: "string", value: reference },
});

test("a publication is delivered to the one instance whose correlation key matches at delivery time", async () => {
  const host = await waiting(["settlement-42", "settlement-43"]);
  assert.deepEqual(await publish(host, "publication-1", "settlement-43"), {
    status: EngineCorrelatedMessageStatus.Delivered,
    ingressOrdinal: 1,
    target: { processInstanceId: "settlement-1", locator: engineProcessLocatorForCanonicalProcess("settlement-1") },
  });
  assert.deepEqual(await publish(host, "publication-2", "settlement-43"), {
    status: EngineCorrelatedMessageStatus.Rejected,
    ingressOrdinal: 2,
    target: null,
    failure: { code: engineNotCorrelatedCode, evidence: "No open correlated wait of the definition matches the publication." },
  });
  assert.equal(engineNotCorrelatedCode, "message.notCorrelated");
});

test("several matching instances reject the publication without delivering it", async () => {
  const host = await waiting(["settlement-42", "settlement-42"]);
  const result = await publish(host, "publication-1", "settlement-42");
  assert.equal(result.status, EngineCorrelatedMessageStatus.Rejected);
  assert.equal(result.status === EngineCorrelatedMessageStatus.Rejected ? result.failure.code : null, engineCorrelationAmbiguousCode);
  assert.equal(engineCorrelationAmbiguousCode, "message.correlationAmbiguous");
});

test("a repeated command identifier with other content is an identity conflict", async () => {
  const host = await waiting(["settlement-42"]);
  const first = await publish(host, "publication-1", "settlement-42");
  assert.equal(first.status, EngineCorrelatedMessageStatus.Delivered);
  assert.deepEqual(await publish(host, "publication-1", "settlement-42"), first);
  assert.deepEqual(await publish(host, "publication-1", "settlement-7"), { status: EngineCorrelatedMessageStatus.IdentityConflict });
});

test("a deployment that serves no Messages refuses the publication before it reaches any process", async () => {
  const host = testHost({ ...servesEverything, messages: false });
  assert.deepEqual(await publish(host, "publication-1", "settlement-42"), {
    status: EngineCorrelatedMessageStatus.Refused,
    failure: { code: "host.messages", evidence: "The deployment does not serve Messages." },
  });
});
