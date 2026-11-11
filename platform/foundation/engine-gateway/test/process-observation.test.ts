/** Incident operations and publication pages through the gateway's serialized locators and Product 2 stimuli. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BpmnEngineGateway,
  BpmnProcessExecutionPublicationGateway,
  BpmnProcessFlowNodeOccurrenceGateway,
  BpmnProcessOperationsGateway,
  BpmnProcessWorkGateway,
  BpmnDefinitionCorrelatedMessageGateway,
  DefinitionCorrelatedMessageCapabilityStatus,
  DefinitionCorrelatedMessagePublicationStatus,
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
  DefinitionCompilationStatus,
  DefinitionStartStatus,
  ProcessIncidentObservationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import { engineProcessLocatorForCanonicalProcess } from "@bpmn-lean/engine-api";
import type { MemoryEngineHost } from "@bpmn-lean/engine-api/testing";

import {
  register,
  correlationProfile,
  incidentProfile,
  limits,
  profileRelations,
  scenarioBytes,
  sha256,
  standardProfile,
  testContext,
  testHost,
} from "./support.ts";

async function start(host: MemoryEngineHost, path: string, processId: string, profile: string, processInstanceId: string) {
  const bytes = await scenarioBytes(path);
  const sourceSha256 = await sha256(bytes);
  const gateway = new BpmnEngineGateway({ ...limits, host, profileRelations });
  const version = { bytes, sourceId: "s", expectedSha256: sourceSha256, semanticProfile: profile, expectedProcessId: processId, version: 2 };
  await register(gateway, version);
  const started = await gateway.startDefinitionVersion({ ...version, processInstanceId, initialVariables: [] });
  assert.equal(started.status, DefinitionStartStatus.Started);
  return { sourceSha256, locator: new BpmnProcessWorkGateway(host).canonicalLocator(processInstanceId) };
}

test("a technical failure shows as an incident that a Retry stimulus resolves", async () => {
  const host = testHost();
  const processInstanceId = "incident-instance";
  const { locator } = await start(host, "service-task-effect/process.bpmn", "Process_ServiceTaskEffectProbe",
    incidentProfile, processInstanceId);
  const effectId = { processInstanceId, elementId: "ServiceTask_Record", activation: 1 };
  const workflowId = decodeURIComponent(locator.slice("bpmn-process:".length));
  const failure = await host.processes.arrive(workflowId,
    { kind: "effectResult", commandId: "fail", occurrence: effectId, outcome: { kind: "technicalFailure" } });
  assert.equal(failure.outcome, "committed");
  const operations = new BpmnProcessOperationsGateway(host);
  const observed = await operations.observeIncidents({ locator, hostingProcessInstanceId: processInstanceId });
  assert.equal(observed.status, ProcessIncidentObservationStatus.Observed);
  if (observed.status !== ProcessIncidentObservationStatus.Observed) return;
  const incidentId = { effectId, generation: 1 };
  assert.equal(observed.incidents.length, 1);
  assert.equal(observed.incidents[0]?.incident.kind, "effectExecutionFailed");
  assert.deepEqual(observed.incidents[0]?.incident.id, incidentId);
  assert.deepEqual(observed.incidents[0]?.interactions[0], { kind: "retryIncident", incidentId });
  const retried = await operations.submitIncidentOperation({
    locator, hostingProcessInstanceId: processInstanceId,
    stimulus: { kind: "retryIncident", commandId: "retry-1", incidentId: { effectId, generation: 1 } },
  });
  assert.deepEqual(retried, { kind: "semantic", commandId: "retry-1", outcome: "committed", code: null });
});

test("execution and occurrence pages read from revision 0 under Product 2's publication identity", async () => {
  const host = testHost();
  const processInstanceId = "published";
  const processId = "Process_SequentialUserTask";
  const { sourceSha256, locator } = await start(host, "user-task-preserved-notation/process.bpmn", processId,
    standardProfile, processInstanceId);
  const definition = {
    ref: { definitionKey: processId, version: 2, sha256: sourceSha256 },
    profile: standardProfile,
    sourceOverlay: null,
  };
  const request = { locator, definition, processInstanceId, afterRevision: 0 };
  const execution = await new BpmnProcessExecutionPublicationGateway(host).observe(request);
  assert.equal(execution.kind, "available");
  if (execution.kind !== "available") return;
  assert.deepEqual(execution.page.definition, definition);
  assert.equal(execution.page.requestedAfterRevision, 0);
  assert.equal(execution.page.pageThroughRevision, execution.page.headRevision);
  assert.equal(execution.page.current?.revision, execution.page.headRevision);
  assert.equal(execution.page.current?.state.status, "running");
  const occurrences = await new BpmnProcessFlowNodeOccurrenceGateway(host).observe(request);
  assert.equal(occurrences.kind, "available");
  if (occurrences.kind !== "available") return;
  assert.deepEqual(occurrences.page.batches.map((batch) => batch.throughRevision),
    execution.page.batches.map((batch) => batch.throughRevision));
  const otherProfile = await new BpmnProcessExecutionPublicationGateway(host).observe({
    ...request, definition: { ...definition, profile: incidentProfile } });
  assert.equal(otherProfile.kind, "integrityFailure");
  const otherVersion = await new BpmnProcessExecutionPublicationGateway(host).observe({
    ...request, definition: { ...definition, ref: { ...definition.ref, version: 1 } } });
  assert.equal(otherVersion.kind, "integrityFailure");
});

async function storedCorrelated(host: MemoryEngineHost) {
  const bytes = await scenarioBytes("message-key-correlation/process.bpmn");
  const gateway = new BpmnEngineGateway({ ...limits, host, profileRelations });
  const compiled = await gateway.compileDefinition({
    bytes, sourceId: "s", semanticProfile: correlationProfile, expectedSha256: undefined });
  assert.equal(compiled.status, DefinitionCompilationStatus.Accepted);
  if (compiled.status !== DefinitionCompilationStatus.Accepted) throw new Error("not accepted");
  await register(gateway, { bytes, sourceId: "s", expectedSha256: compiled.source.sha256, semanticProfile: correlationProfile,
    expectedProcessId: compiled.definition.processId, version: 1 });
  return {
    bytes,
    definition: {
      processId: compiled.definition.processId,
      version: 1,
      source: { id: "s", sha256: compiled.source.sha256, byteLength: compiled.source.byteLength },
      semanticProfile: correlationProfile,
      startCapabilities: compiled.startCapabilities,
    },
  };
}

const settlementChannel = {
  kind: "operationMessage",
  interfaceId: "Interface_ClearingHouse",
  interfaceOperationId: "Operation_ConfirmSettlement",
  messageId: "Message_SettlementConfirmed",
} as const;

test("a correlated Message is described from the definition and delivered to the one instance whose key matches", async () => {
  const host = testHost();
  const { bytes, definition } = await storedCorrelated(host);
  const gateway = new BpmnDefinitionCorrelatedMessageGateway(testContext(host));
  const described = await gateway.describe({ bytes, definition });
  const message = { catchEventId: "MessageCatch_CorrelatedSettlement", channel: settlementChannel,
    correlationKeyId: "CorrelationKey_SettlementReference" };
  assert.deepEqual(described, { status: DefinitionCorrelatedMessageCapabilityStatus.Available, messages: [message] });

  const started = await new BpmnEngineGateway({ ...limits, host, profileRelations }).startDefinitionVersion({
    bytes, sourceId: "s", expectedSha256: definition.source.sha256, semanticProfile: correlationProfile,
    expectedProcessId: definition.processId, version: 1, processInstanceId: "settlement-a", initialVariables: [] });
  assert.equal(started.status, DefinitionStartStatus.Started);
  const workflowId = decodeURIComponent(engineProcessLocatorForCanonicalProcess(host.population.population, "settlement-a").slice("bpmn-process:".length));
  assert.equal((await host.processes.deliver(workflowId, {
    kind: "deliver", commandId: "initialize", trigger: { kind: "message", channel: settlementChannel },
    occurrence: { processInstanceId: "settlement-a", elementId: "MessageCatch_InitialSettlement", activation: 1 },
    payload: { kind: "string", value: "ref-1" },
  })).outcome, "committed");

  const publish = (commandId: string, value: string) =>
    gateway.publish({ bytes, definition, message, commandId, payload: { kind: "string", value } });
  assert.deepEqual(await publish("message-1", "ref-1"), {
    status: DefinitionCorrelatedMessagePublicationStatus.Resolved,
    resolution: {
      kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
      commandId: "message-1",
      ingressOrdinal: 1,
      outcome: { kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed, target: { processInstanceId: "settlement-a" } },
    },
  });
  assert.deepEqual(await publish("message-2", "ref-1"), {
    status: DefinitionCorrelatedMessagePublicationStatus.Resolved,
    resolution: {
      kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
      commandId: "message-2",
      ingressOrdinal: 2,
      outcome: { kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch },
    },
  });
  assert.deepEqual(await publish("message-1", "ref-2"), { status: DefinitionCorrelatedMessagePublicationStatus.IdentityConflict });
  const drifted = await gateway.describe({ bytes, definition: { ...definition, processId: "Other" } });
  assert.equal(drifted.status, DefinitionCorrelatedMessageCapabilityStatus.IntegrityFailure);
});

test("a deployment that serves no Messages answers correlated Messages as unavailable with its refusal code", async () => {
  const host = { ...testHost(), served: { timers: true, messages: false, effects: true, userTasks: true, calls: true } };
  const { bytes, definition } = await storedCorrelated(host);
  const gateway = new BpmnDefinitionCorrelatedMessageGateway(testContext(host));
  const described = await gateway.describe({ bytes, definition });
  assert.equal(described.status === DefinitionCorrelatedMessageCapabilityStatus.Unavailable && described.code, "host.messages");
  const published = await gateway.publish({
    bytes, definition, commandId: "message-1", payload: { kind: "string", value: "ref-1" },
    message: { catchEventId: "MessageCatch_CorrelatedSettlement", channel: settlementChannel,
      correlationKeyId: "CorrelationKey_SettlementReference" },
  });
  assert.equal(published.status === DefinitionCorrelatedMessagePublicationStatus.Unavailable && published.code, "host.messages");
});
