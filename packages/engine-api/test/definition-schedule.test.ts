/**
 * Timer start Schedules: creation stores one Schedule whose single action starts the selected Timer start at the due
 * instant under the deployment's Task Queue, and every read compares the stored Schedule with what the stored
 * definition produces now before reporting its phase.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionScheduleIntegrityCode,
  EngineDefinitionScheduleStatus,
  compileBpmnDefinition,
  createBpmnDefinitionSchedule,
  deleteBpmnDefinitionSchedule,
  engineDefinitionScheduleId,
  inspectBpmnDefinitionSchedule,
  pauseBpmnDefinitionSchedule,
  serializeEngineProcessLocator,
  type EngineDefinitionScheduleBindingRequest,
} from "@bpmn-lean/engine-api";

import { deployed, limits, pendingSchedule, scenarioBytes, sha256, standardProfile, testHost, type TestHost } from "./support.ts";

const due = Date.UTC(2026, 10, 9, 12, 0, 1);

async function request(host: TestHost): Promise<EngineDefinitionScheduleBindingRequest> {
  const bytes = await scenarioBytes("timer-start-event/process.bpmn");
  const compiled = await compileBpmnDefinition({ bytes, sourceId: "t", profile: standardProfile, limits });
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error("not admitted");
  const [start] = compiled.capabilities.starts;
  if (start?.schedule == null) throw new Error("no Timer start");
  return deployed({
    host,
    bytes,
    sourceId: "t",
    expectedSha256: await sha256(bytes),
    expectedByteLength: bytes.byteLength,
    profile: standardProfile,
    expectedProcessId: compiled.definition.ref.definitionKey,
    version: 1,
    expectedStarts: compiled.capabilities.starts,
    timerStart: { startEventId: start.startEventId, schedule: start.schedule },
    processInstanceId: "timer-instance",
    scheduleId: engineDefinitionScheduleId({ processId: compiled.definition.ref.definitionKey, version: 1, scheduleId: "s" }),
    workflowIdBase: "timer-workflow",
    dueAtEpochMs: due,
    limits,
  });
}

test("creation stores one Timer-triggered start at the due instant and reports it pending", async () => {
  const host = testHost();
  host.schedules.stored = (created) => pendingSchedule(created, host.taskQueue);
  const created = await createBpmnDefinitionSchedule(await request(host));
  assert.deepEqual(created, { status: EngineDefinitionScheduleStatus.Pending, paused: false });
  const [stored] = host.schedules.created;
  assert.equal(stored?.dueAtEpochMs, due);
  assert.equal(stored?.workflowIdBase, "timer-workflow");
  assert.deepEqual(stored?.population, { population: host.population.population, deploymentId: 1 },
    "the started instance runs under its version's registered deployment");
  assert.deepEqual(stored?.start, {
    kind: "start",
    commandId: "timer-start:timer-instance",
    instanceId: "timer-instance",
    startEvent: "TimerStart_PT1S",
    trigger: { kind: "timer", logicalTimeMs: due },
    variables: [],
  });
  assert.deepEqual(await createBpmnDefinitionSchedule(await request(host)), created);
});

test("a started Schedule reports the opaque locator of the process its action started", async () => {
  const host = testHost();
  host.schedules.stored = (created) => ({
    ...pendingSchedule(created, host.taskQueue),
    remainingActions: 0,
    actionsTaken: 1,
    nextActionEpochMs: [],
    recentWorkflowIds: ["timer-workflow-2026-11-09T12:00:01Z"],
  });
  const started = await createBpmnDefinitionSchedule(await request(host));
  assert.equal(started.status, EngineDefinitionScheduleStatus.Started);
  if (started.status === EngineDefinitionScheduleStatus.Started) {
    assert.equal(serializeEngineProcessLocator(started.locator),
      `bpmn-process:${encodeURIComponent("timer-workflow-2026-11-09T12:00:01Z")}`);
  }
});

test("a stored Schedule whose action no longer matches the definition is drift; an absent one is missing", async () => {
  const host = testHost();
  host.schedules.stored = (created) => ({ ...pendingSchedule(created, host.taskQueue), memo: { intent: "other" } });
  const drift = await createBpmnDefinitionSchedule(await request(host));
  assert.deepEqual(drift.status, EngineDefinitionScheduleStatus.IntegrityFailure);
  if (drift.status === EngineDefinitionScheduleStatus.IntegrityFailure) {
    assert.equal(drift.failure.code, EngineDefinitionScheduleIntegrityCode.ScheduleDrift);
  }
  const missing = await inspectBpmnDefinitionSchedule(await request(testHost()));
  assert.equal(missing.status, EngineDefinitionScheduleStatus.IntegrityFailure);
  if (missing.status === EngineDefinitionScheduleStatus.IntegrityFailure) {
    assert.equal(missing.failure.code, EngineDefinitionScheduleIntegrityCode.ScheduleMissing);
  }
});

test("pause expects the Schedule paused afterwards; delete removes it by identifier", async () => {
  const host = testHost();
  host.schedules.stored = (created) => ({ ...pendingSchedule(created, host.taskQueue), paused: host.schedules.paused.length > 0 });
  await createBpmnDefinitionSchedule(await request(host));
  assert.deepEqual(await pauseBpmnDefinitionSchedule(await request(host)), { status: EngineDefinitionScheduleStatus.Pending, paused: true });
  const scheduleId = (await request(host)).scheduleId;
  await deleteBpmnDefinitionSchedule({ host, scheduleId });
  assert.deepEqual(host.schedules.deleted, [scheduleId]);
});

test("a selected Timer start the definition does not publish is capability drift", async () => {
  const host = testHost();
  const result = await createBpmnDefinitionSchedule({ ...await request(host), timerStart: { startEventId: "Other", schedule: { durationMs: 1_000 } } });
  assert.equal(result.status, EngineDefinitionScheduleStatus.IntegrityFailure);
  if (result.status === EngineDefinitionScheduleStatus.IntegrityFailure) {
    assert.equal(result.failure.code, EngineDefinitionScheduleIntegrityCode.CapabilityDrift);
  }
  assert.deepEqual(host.schedules.created, []);
});
