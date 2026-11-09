/**
 * Incident operations: a technical failure under a profile that turns it into an incident shows as an incident wait
 * with its generation; Retry reopens the effect; an operation naming a generation that is not open reaches the kernel,
 * which rejects it as stale in the same step that would apply it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionStartStatus,
  EngineIncidentObservationStatus,
  EngineIncidentOperationKind,
  engineProcessLocatorForCanonicalProcess,
  observeEngineProcessIncidents,
  startBpmnDefinitionVersion,
  submitEngineIncidentOperation,
} from "@bpmn-lean/engine-api";

import { incidentProfile, limits, scenarioBytes, sha256, testHost, type TestHost } from "./support.ts";

const occurrence = { processInstanceId: "incident-instance", elementId: "ServiceTask_Record", activation: 1 };
const locator = engineProcessLocatorForCanonicalProcess("incident-instance");
const workflowId = decodeURIComponent(locator.slice("bpmn-process:".length));

async function failed(): Promise<TestHost> {
  const host = testHost();
  const bytes = await scenarioBytes("service-task-effect/process.bpmn");
  const start = await startBpmnDefinitionVersion({
    host,
    bytes,
    sourceId: "effect",
    expectedSha256: await sha256(bytes),
    profile: incidentProfile,
    expectedProcessId: "Process_ServiceTaskEffectProbe",
    version: 1,
    processInstanceId: "incident-instance",
    initialVariables: [],
    limits,
  });
  assert.equal(start.status, EngineDefinitionStartStatus.Started);
  const failure = await host.processes.arrive(workflowId,
    { kind: "effectResult", commandId: "fail", occurrence, outcome: { kind: "technicalFailure" } });
  assert.equal(failure.outcome, "committed");
  return host;
}

test("a technical failure shows as one open incident with its generation", async () => {
  const host = await failed();
  const observed = await observeEngineProcessIncidents({ host, locator, hostingProcessInstanceId: "incident-instance" });
  assert.equal(observed.status, EngineIncidentObservationStatus.Observed);
  if (observed.status !== EngineIncidentObservationStatus.Observed) return;
  assert.equal(observed.incidents.length, 1);
  assert.deepEqual(observed.incidents[0]?.id, occurrence);
  assert.equal(observed.incidents[0]?.detail.kind, "incident");
  assert.equal(observed.incidents[0]?.detail["generation"], 1);
});

test("Retry of the open generation commits and closes the incident", async () => {
  const host = await failed();
  const retried = await submitEngineIncidentOperation({
    host, locator, hostingProcessInstanceId: "incident-instance",
    operation: { kind: EngineIncidentOperationKind.RetryIncident, commandId: "retry-1", incident: { occurrence, generation: 1 } },
  });
  assert.deepEqual(retried, { kind: "semantic", commandId: "retry-1", outcome: "committed", code: null });
  const observed = await observeEngineProcessIncidents({ host, locator, hostingProcessInstanceId: "incident-instance" });
  assert.deepEqual(observed, { status: EngineIncidentObservationStatus.Observed, incidents: [] });
});

test("an operation on a generation that is not open is rejected by the kernel as stale and changes nothing", async () => {
  const host = await failed();
  const before = await host.processes.hostView(workflowId);
  for (const kind of [EngineIncidentOperationKind.RetryIncident, EngineIncidentOperationKind.CancelIncidentProcess]) {
    const stale = await submitEngineIncidentOperation({
      host, locator, hostingProcessInstanceId: "incident-instance",
      operation: { kind, commandId: `${kind}-2`, incident: { occurrence, generation: 2 } },
    });
    assert.deepEqual(stale, { kind: "semantic", commandId: `${kind}-2`, outcome: "rejected", code: "incident-generation-stale" });
  }
  assert.deepEqual(await host.processes.hostView(workflowId), before);
});

test("Cancel ends the process when the profile lets an incident cancel it", async () => {
  const host = await failed();
  const cancelled = await submitEngineIncidentOperation({
    host, locator, hostingProcessInstanceId: "incident-instance",
    operation: { kind: EngineIncidentOperationKind.CancelIncidentProcess, commandId: "cancel-1", incident: { occurrence, generation: 1 } },
  });
  assert.deepEqual(cancelled, { kind: "semantic", commandId: "cancel-1", outcome: "committed", code: null });
  assert.deepEqual(await observeEngineProcessIncidents({ host, locator, hostingProcessInstanceId: "incident-instance" }),
    { status: EngineIncidentObservationStatus.Closed });
});
