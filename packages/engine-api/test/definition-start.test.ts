/**
 * Direct start: preparation binds the exact start into an intent with no host call, the prepared start dispatches at
 * most once, a retry after a lost response is recognized by the retained intent, and recovery compares that intent.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionStartIntegrityCode,
  EngineDefinitionStartStatus,
  EngineStartDescriptionStatus,
  describeBpmnDefinitionVersionStart,
  engineDefinitionMessageStartWorkflowId,
  engineDirectStartProtocol,
  prepareBpmnDefinitionVersionStart,
  serializeEngineProcessLocator,
  startBpmnDefinitionVersion,
  startPreparedBpmnDefinitionVersion,
  type EngineDefinitionStartRequest,
} from "@bpmn-lean/engine-api";

import { deployed, limits, scenarioBytes, servesEverything, sha256, standardProfile, testHost, testPopulation, type TestHost } from "./support.ts";

async function request(host: TestHost, processInstanceId = "instance-1"): Promise<EngineDefinitionStartRequest> {
  const bytes = await scenarioBytes("user-task-preserved-notation/process.bpmn");
  return deployed({
    host,
    bytes,
    sourceId: "approval",
    expectedSha256: await sha256(bytes),
    profile: standardProfile,
    expectedProcessId: "Process_SequentialUserTask",
    version: 3,
    processInstanceId,
    initialVariables: [{ name: "requester", value: { kind: "string", value: "ada" } }],
    limits,
  });
}

test("preparation yields an intent and an opaque locator without touching the host", async () => {
  const host = testHost();
  const prepared = await prepareBpmnDefinitionVersionStart(await request(host));
  assert.equal(prepared.status, EngineDefinitionStartStatus.Admitted);
  if (prepared.status !== EngineDefinitionStartStatus.Admitted) return;
  assert.equal(prepared.intent.protocol, engineDirectStartProtocol);
  assert.match(prepared.intent.intentSha256, /^[0-9a-f]{64}$/u);
  assert.match(serializeEngineProcessLocator(prepared.locator), /^bpmn-process:bpmn-process-sha256%3A[0-9a-f]{64}$/u);
  assert.equal(await host.processes.describe("anything"), null);
  const again = await prepareBpmnDefinitionVersionStart(await request(host));
  assert.deepEqual(again, prepared);
});

test("the prepared start runs once; a retried dispatch is the same start; recovery finds it matching", async () => {
  const host = testHost();
  const prepared = await prepareBpmnDefinitionVersionStart(await request(host));
  if (prepared.status !== EngineDefinitionStartStatus.Admitted) throw new Error("not admitted");
  const started = await startPreparedBpmnDefinitionVersion({ ...await request(host), expectedIntent: prepared.intent });
  assert.equal(started.status, EngineDefinitionStartStatus.Started);
  assert.equal(started.definition.ref.version, 3);
  const retried = await startPreparedBpmnDefinitionVersion({ ...await request(host), expectedIntent: prepared.intent });
  assert.equal(retried.status, EngineDefinitionStartStatus.Started);
  assert.equal(await describeBpmnDefinitionVersionStart({ host, processInstanceId: "instance-1", expectedIntent: prepared.intent }),
    EngineStartDescriptionStatus.Matching);
  assert.equal(await describeBpmnDefinitionVersionStart({ host, processInstanceId: "instance-2", expectedIntent: prepared.intent }),
    EngineStartDescriptionStatus.Missing);
  assert.equal(await describeBpmnDefinitionVersionStart({
    host, processInstanceId: "instance-1", expectedIntent: { ...prepared.intent, intentSha256: "0".repeat(64) } }),
    EngineStartDescriptionStatus.Divergent);
});

test("a start whose content differs from its intent is refused, and so is a different start at a taken address", async () => {
  const host = testHost();
  const prepared = await prepareBpmnDefinitionVersionStart(await request(host));
  if (prepared.status !== EngineDefinitionStartStatus.Admitted) throw new Error("not admitted");
  const drifted = await startPreparedBpmnDefinitionVersion({
    ...await request(host), initialVariables: [], expectedIntent: prepared.intent });
  assert.equal(drifted.status, EngineDefinitionStartStatus.IntegrityFailure);
  if (drifted.status === EngineDefinitionStartStatus.IntegrityFailure) {
    assert.equal(drifted.failure.code, EngineDefinitionStartIntegrityCode.ConstructorDrift);
  }
  assert.equal((await startBpmnDefinitionVersion(await request(host))).status, EngineDefinitionStartStatus.Started);
  const other = await startBpmnDefinitionVersion({ ...await request(host), initialVariables: [] });
  assert.equal(other.status, EngineDefinitionStartStatus.IntegrityFailure);
});

test("a deployment that does not serve the definition's needs refuses it with the host refusal code", async () => {
  const host = testHost({ ...servesEverything, userTasks: false });
  const prepared = await prepareBpmnDefinitionVersionStart(await request(host));
  assert.equal(prepared.status, EngineDefinitionStartStatus.Rejected);
  if (prepared.status === EngineDefinitionStartStatus.Rejected) assert.equal(prepared.failure.code, "host.userTasks");
});

test("a start of a definition version no registration holds is rejected before any chain starts", async () => {
  const unregistered = testHost();
  const result = await startBpmnDefinitionVersion({ ...await request(testHost()), host: unregistered });
  assert.equal(result.status, EngineDefinitionStartStatus.Rejected);
  if (result.status === EngineDefinitionStartStatus.Rejected) assert.equal(result.failure.code, "definition-not-deployed");
  assert.equal(await unregistered.processes.describe(engineDefinitionMessageStartWorkflowId(testPopulation, "instance-1")), null);
});

test("a stored definition that no longer compiles, or compiles to another identity, is an integrity failure", async () => {
  const host = testHost();
  const wrongProcess = await prepareBpmnDefinitionVersionStart({ ...await request(host), expectedProcessId: "Other" });
  assert.equal(wrongProcess.status, EngineDefinitionStartStatus.IntegrityFailure);
  if (wrongProcess.status === EngineDefinitionStartStatus.IntegrityFailure) {
    assert.equal(wrongProcess.failure.code, EngineDefinitionStartIntegrityCode.IdentityDrift);
  }
  const wrongBytes = await prepareBpmnDefinitionVersionStart({ ...await request(host), expectedSha256: "0".repeat(64) });
  assert.equal(wrongBytes.status, EngineDefinitionStartStatus.IntegrityFailure);
  if (wrongBytes.status === EngineDefinitionStartStatus.IntegrityFailure) {
    assert.equal(wrongBytes.failure.code, EngineDefinitionStartIntegrityCode.CompilationRejected);
  }
});

test("a value outside the scenario contract is refused before dispatch", async () => {
  const host = testHost();
  const malformed = await prepareBpmnDefinitionVersionStart({
    ...await request(host),
    initialVariables: [{ name: "x", value: { kind: "bogus" } as never }],
  });
  assert.equal(malformed.status, EngineDefinitionStartStatus.Rejected);
  if (malformed.status === EngineDefinitionStartStatus.Rejected) assert.equal(malformed.failure.code, "stimulus.malformed");
});
