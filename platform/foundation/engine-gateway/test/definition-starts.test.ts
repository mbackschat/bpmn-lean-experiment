/**
 * Message starts and Timer start Schedules act only on a stored definition its bytes still compile to; the
 * publication and Schedule addresses are deterministic and domain-separated.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { pendingSchedule } from "@bpmn-lean/engine-api/testing";
import {
  BpmnDefinitionMessageStartGateway,
  BpmnDefinitionScheduleGateway,
  BpmnEngineGateway,
  DefinitionCompilationStatus,
  DefinitionMessageStartDescriptionStatus,
  DefinitionMessageStartStatus,
  DefinitionScheduleHostPhase,
  definitionScheduleHostId,
  definitionScheduleWorkflowIdBase,
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

const activationAt = "2026-11-09T12:00:00Z";
const dueAt = "2026-11-09T12:00:01Z";

async function scheduleRequest(host: MemoryEngineHost): Promise<DefinitionScheduleHostRequest> {
  const { bytes, definition } = await stored(host, "timer-start-event/process.bpmn");
  const [timerStart] = definition.startCapabilities.timerStarts;
  if (timerStart === undefined) throw new Error("no Timer start");
  return {
    bytes,
    definition,
    timerStart,
    activationAt,
    dueAt,
    processInstanceId: "timer-instance",
    hostScheduleId: definitionScheduleHostId({ processId: definition.processId, version: 1, scheduleId: "s" }),
    configuredWorkflowIdBase: definitionScheduleWorkflowIdBase("timer-instance"),
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
  assert.equal(host.schedules.created[0]?.dueAtEpochMs, Date.parse(dueAt));
  await gateway.delete(request);
  assert.deepEqual(host.schedules.deleted, [request.hostScheduleId]);
});

test("a due instant before activation is refused before the host is touched", async () => {
  const host = testHost();
  const request = { ...await scheduleRequest(host), dueAt: "2026-11-09T11:59:59Z" };
  await assert.rejects(new BpmnDefinitionScheduleGateway(testContext(host)).createOrCompare(request), RangeError);
  assert.deepEqual(host.schedules.created, []);
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
