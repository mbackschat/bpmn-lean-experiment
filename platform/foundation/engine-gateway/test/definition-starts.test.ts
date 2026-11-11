/**
 * Message starts and Timer start Schedules act only on a stored definition its bytes still compile to; the
 * publication and Schedule addresses are deterministic and domain-separated.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createMemoryEngineHost, pendingSchedule } from "@bpmn-lean/engine-api/testing";
import {
  BpmnDefinitionMessageStartGateway,
  BpmnDefinitionScheduleGateway,
  BpmnEngineGateway,
  DefinitionCompilationStatus,
  DefinitionMessageStartDescriptionStatus,
  DefinitionMessageStartStatus,
  DefinitionScheduleHostPhase,
  definitionScheduleHostId,
  messageStartPublicationCommandId,
  messageStartPublicationProcessInstanceId,
  messageStartPublicationWorkflowId,
  type DefinitionMessageStartRequest,
  type DefinitionScheduleHostRequest,
} from "@bpmn-lean/platform-engine-gateway";
import type { MemoryEngineHost } from "@bpmn-lean/engine-api/testing";

import { limits, profileRelations, register, scenarioBytes, sha256, standardProfile, testContext, testHost } from "./support.ts";

async function stored(host: MemoryEngineHost, path: string) {
  const bytes = await scenarioBytes(path);
  const gateway = new BpmnEngineGateway({ ...limits, host, profileRelations });
  const compiled = await gateway.compileDefinition({
    bytes, sourceId: "stored", semanticProfile: standardProfile, expectedSha256: await sha256(bytes) });
  if (compiled.status !== DefinitionCompilationStatus.Accepted) throw new Error("not accepted");
  await register(gateway, { bytes, sourceId: "stored", expectedSha256: compiled.source.sha256, semanticProfile: standardProfile,
    expectedProcessId: compiled.definition.processId, version: 1 });
  return {
    bytes,
    definition: {
      processId: compiled.definition.processId,
      version: 1,
      source: { id: "stored", sha256: compiled.source.sha256, byteLength: compiled.source.byteLength },
      semanticProfile: standardProfile,
      startCapabilities: compiled.startCapabilities,
    },
  };
}

async function messageStart(host: MemoryEngineHost): Promise<DefinitionMessageStartRequest> {
  const { bytes, definition } = await stored(host, "message-start-event/process.bpmn");
  const [start] = definition.startCapabilities.messageStarts;
  if (start === undefined) throw new Error("no Message start");
  const processInstanceId = messageStartPublicationProcessInstanceId("publication-1");
  return {
    bytes,
    definition,
    messageStart: start,
    processInstanceId,
    commandId: messageStartPublicationCommandId("publication-1"),
    workflowId: messageStartPublicationWorkflowId(processInstanceId),
  };
}

test("a Message start is prepared, started at most once, and described as matching", async () => {
  const host = testHost();
  const gateway = new BpmnDefinitionMessageStartGateway(testContext(host));
  const request = await messageStart(host);
  const prepared = await gateway.prepare(request);
  assert.equal(prepared.status, DefinitionMessageStartStatus.Admitted);
  if (prepared.status !== DefinitionMessageStartStatus.Admitted) return;
  const dispatch = { ...request, expectedIntent: prepared.intent };
  assert.deepEqual(await gateway.start(dispatch), { status: DefinitionMessageStartStatus.Started });
  assert.deepEqual(await gateway.start(dispatch), { status: DefinitionMessageStartStatus.Started });
  assert.deepEqual(await gateway.describe({ workflowId: request.workflowId, expectedIntent: prepared.intent }),
    { status: DefinitionMessageStartDescriptionStatus.Matching });
});

test("a stored definition whose capabilities differ from its bytes is an integrity failure", async () => {
  const host = testHost();
  const request = await messageStart(host);
  const drifted = {
    ...request,
    definition: { ...request.definition, startCapabilities: { messageStarts: [], timerStarts: [] } },
  };
  const result = await new BpmnDefinitionMessageStartGateway(testContext(host)).prepare(drifted);
  assert.equal(result.status, DefinitionMessageStartStatus.IntegrityFailure);
});

/** The memory host deploys at 1,000 ms, so the PT1S start's one occurrence is due one second later. */
const dueAt = new Date(2_000).toISOString();

async function scheduleRequest(host: MemoryEngineHost): Promise<DefinitionScheduleHostRequest> {
  const { bytes, definition } = await stored(host, "timer-start-event/process.bpmn");
  const [timerStart] = definition.startCapabilities.timerStarts;
  if (timerStart === undefined) throw new Error("no Timer start");
  const listed = await new BpmnDefinitionScheduleGateway(testContext(host))
    .occurrences({ bytes, definition, timerStart, from: dueAt, limit: 1 });
  if (listed.kind !== "listed" || listed.occurrences[0]?.dueAt !== dueAt) throw new Error("no occurrence at the due instant");
  return {
    bytes,
    definition,
    timerStart,
    dueAt,
    processInstanceId: listed.occurrences[0].processInstanceId,
    hostScheduleId: definitionScheduleHostId({ processId: definition.processId, version: 1, scheduleId: "s" }),
  };
}

test("a stored Timer start validates and its Schedule is created pending, then deleted", async () => {
  const host = testHost();
  host.schedules.stored = (created) => pendingSchedule(created, host.taskQueue);
  const gateway = new BpmnDefinitionScheduleGateway(testContext(host));
  const request = await scheduleRequest(host);
  const validated = await gateway.validateDefinition({
    bytes: request.bytes,
    sourceId: "stored",
    expectedSha256: request.definition.source.sha256,
    semanticProfile: standardProfile,
    expectedProcessId: request.definition.processId,
  });
  assert.equal(validated.status, "accepted");
  assert.deepEqual(await gateway.createOrCompare(request), { phase: DefinitionScheduleHostPhase.Pending, paused: false });
  assert.equal(host.schedules.created[0]?.firing.dueMs, Date.parse(dueAt));
  await gateway.delete(request);
  assert.deepEqual(host.schedules.deleted, [request.hostScheduleId]);
});

test("occurrences carry the engine's instance identity; another instant is refused as no occurrence", async () => {
  const host = testHost();
  const gateway = new BpmnDefinitionScheduleGateway(testContext(host));
  const request = await scheduleRequest(host);
  // The kernel's `timerInstanceId` of deployment 1, start TimerStart_PT1S and the occurrence due at 2,000 ms.
  assert.equal(request.processInstanceId, "timer:1:1:15:TimerStart_PT1S:2000");
  assert.deepEqual(await gateway.occurrences({ ...request, from: new Date(2_001).toISOString(), limit: 5 }),
    { kind: "listed", occurrences: [] });
  const other = await gateway.createOrCompare({ ...request, dueAt: new Date(2_500).toISOString() });
  assert.equal(other.phase, DefinitionScheduleHostPhase.IntegrityFailure);
  await assert.rejects(gateway.createOrCompare({ ...request, dueAt: "1970-01-01T00:00:02Z" }), TypeError,
    "a noncanonical instant is refused before the host is touched");
  assert.deepEqual(host.schedules.created, []);
});

test("a fired Schedule reports the started instance under the occurrence's identity", async () => {
  let now = 1_000;
  const host = createMemoryEngineHost({ taskQueue: "gateway-test", now: () => now });
  const gateway = new BpmnDefinitionScheduleGateway(testContext(host));
  const request = await scheduleRequest(host);
  await gateway.createOrCompare(request);
  now = Date.parse(dueAt);
  await host.schedules.fire(request.hostScheduleId);
  const started = await gateway.inspect(request);
  assert.equal(started.phase, DefinitionScheduleHostPhase.Started);
  if (started.phase === DefinitionScheduleHostPhase.Started) assert.equal(started.processInstanceId, request.processInstanceId);
  assert.equal((await gateway.inspect({ ...request, processInstanceId: "other" })).phase, DefinitionScheduleHostPhase.IntegrityFailure,
    "an instance identity other than the occurrence's is never accepted");
});

test("publication and Schedule addresses are deterministic and domain-separated", () => {
  assert.equal(messageStartPublicationProcessInstanceId("p"), messageStartPublicationProcessInstanceId("p"));
  assert.notEqual(messageStartPublicationProcessInstanceId("p"), messageStartPublicationProcessInstanceId("q"));
  assert.notEqual(messageStartPublicationProcessInstanceId("p").split(":")[1],
    messageStartPublicationCommandId("p").split(":")[1]);
  const reference = { processId: "P", version: 1, scheduleId: "s" };
  assert.equal(definitionScheduleHostId(reference), definitionScheduleHostId({ ...reference }));
  assert.notEqual(definitionScheduleHostId(reference), definitionScheduleHostId({ ...reference, version: 2 }));
  assert.throws(() => messageStartPublicationProcessInstanceId(""), TypeError);
});
