/**
 * Timer start Schedules: an occurrence of the selected Timer start, counted from the registered deployment's deploy
 * time, is fired once through the population, and every read compares the stored Schedule with what the stored
 * definition produces now before reporting its phase and, once the action ran, the firing's verdict.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { timerInstanceId } from "@bpmn-lean/kernel";
import { processInstanceWorkflowId } from "@bpmn-lean/temporal-host/host";
import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionScheduleIntegrityCode,
  EngineDefinitionScheduleStatus,
  EngineTimerStartOccurrencesStatus,
  compileBpmnDefinition,
  createBpmnDefinitionSchedule,
  deleteBpmnDefinitionSchedule,
  engineDefinitionScheduleId,
  engineProcessLocatorForCanonicalProcess,
  inspectBpmnDefinitionSchedule,
  listEngineTimerStartOccurrences,
  pauseBpmnDefinitionSchedule,
  type EngineDefinitionScheduleBindingRequest,
} from "@bpmn-lean/engine-api";

import { deployed, limits, pendingSchedule, scenarioBytes, sha256, standardProfile, testHost, type TestHost } from "./support.ts";

/** The memory host deploys at 1,000 ms, so the PT1S start's one occurrence is due at 2,000 ms. */
const due = 2_000;
const startEvent = "TimerStart_PT1S";

async function request(host: TestHost, path = "timer-start-event/process.bpmn", version = 1, register = true):
  Promise<EngineDefinitionScheduleBindingRequest> {
  const bytes = await scenarioBytes(path);
  const compiled = await compileBpmnDefinition({ bytes, sourceId: "t", profile: standardProfile, limits });
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error("not admitted");
  const [start] = compiled.capabilities.starts;
  if (start?.schedule == null) throw new Error("no Timer start");
  const built: EngineDefinitionScheduleBindingRequest = {
    host,
    bytes,
    sourceId: "t",
    expectedSha256: await sha256(bytes),
    expectedByteLength: bytes.byteLength,
    profile: standardProfile,
    expectedProcessId: compiled.definition.ref.definitionKey,
    version,
    expectedStarts: compiled.capabilities.starts,
    timerStart: { startEventId: start.startEventId, schedule: start.schedule },
    scheduleId: engineDefinitionScheduleId({ processId: compiled.definition.ref.definitionKey, version, scheduleId: "s" }),
    dueAtEpochMs: due,
    limits,
  };
  return register ? deployed(built) : built;
}

test("creation stores one firing of the occurrence under the registered deployment and reports it pending", async () => {
  const host = testHost();
  const created = await createBpmnDefinitionSchedule(await request(host));
  assert.deepEqual(created, { status: EngineDefinitionScheduleStatus.Pending, paused: false });
  const [stored] = host.schedules.created;
  assert.deepEqual(stored?.firing, {
    population: host.population.population,
    config: { scheduling: "durable", effectStartToCloseMs: host.effectStartToCloseMs, historyEventBudget: null },
    deploymentId: 1,
    startEvent,
    dueMs: due,
  });
  assert.deepEqual(await createBpmnDefinitionSchedule(await request(host)), created);
  assert.equal(host.schedules.created.length, 1);
});

test("an instant that is no occurrence and an unregistered version create no Schedule", async () => {
  const host = testHost();
  const unknown = await createBpmnDefinitionSchedule({ ...await request(host), dueAtEpochMs: due + 1 });
  assert.equal(unknown.status, EngineDefinitionScheduleStatus.Rejected);
  if (unknown.status === EngineDefinitionScheduleStatus.Rejected) assert.equal(unknown.failure.code, "timer-occurrence-unknown");
  const unregistered = await createBpmnDefinitionSchedule(await request(testHost(), undefined, 1, false));
  assert.equal(unregistered.status, EngineDefinitionScheduleStatus.Rejected);
  if (unregistered.status === EngineDefinitionScheduleStatus.Rejected) assert.equal(unregistered.failure.code, "definition-not-deployed");
  assert.deepEqual(host.schedules.created, []);
});

test("occurrences are the kernel's, counted from the deploy time, each with the instance identity it starts", async () => {
  const host = testHost();
  const cycle = await request(host, "open-rows/timer-start-forms/cycle-start.bpmn");
  const hour = 3_600_000;
  const listed = await listEngineTimerStartOccurrences({ ...cycle, fromEpochMs: 1_000 + hour + 1, limit: 2 });
  assert.deepEqual(listed, {
    status: EngineTimerStartOccurrencesStatus.Listed,
    occurrences: [1_000 + 2 * hour, 1_000 + 3 * hour].map((dueAtEpochMs) =>
      ({ dueAtEpochMs, processInstanceId: timerInstanceId(1, "StartEveryHour", dueAtEpochMs) })),
  });
  const once = await listEngineTimerStartOccurrences({ ...await request(testHost()), fromEpochMs: 0, limit: 3 });
  assert.deepEqual(once, {
    status: EngineTimerStartOccurrencesStatus.Listed,
    occurrences: [{ dueAtEpochMs: due, processInstanceId: timerInstanceId(1, startEvent, due) }],
  });
  await assert.rejects(listEngineTimerStartOccurrences({ ...cycle, fromEpochMs: 0, limit: 101 }), RangeError);
});

test("a fired occurrence reports the instance the kernel started under its derived identity", async () => {
  let now = 1_000;
  const host = testHost(undefined, () => now);
  const selected = await request(host);
  await createBpmnDefinitionSchedule(selected);
  await assert.rejects(host.schedules.fire(selected.scheduleId), /not due/);
  now = due;
  await host.schedules.fire(selected.scheduleId);
  const processInstanceId = timerInstanceId(1, startEvent, due);
  assert.deepEqual(await inspectBpmnDefinitionSchedule(selected), {
    status: EngineDefinitionScheduleStatus.Started,
    paused: false,
    processInstanceId,
    locator: engineProcessLocatorForCanonicalProcess(processInstanceId),
  });
  assert.equal((await host.processes.describe(processInstanceWorkflowId(processInstanceId)))?.running, true,
    "the population started the instance's chain");
});

test("a Schedule of a version a later registration superseded fires and is refused", async () => {
  let now = 1_000;
  const host = testHost(undefined, () => now);
  const first = await request(host);
  await createBpmnDefinitionSchedule(first);
  await request(host, undefined, 2);
  now = due;
  await host.schedules.fire(first.scheduleId);
  const refused = await inspectBpmnDefinitionSchedule(first);
  assert.equal(refused.status, EngineDefinitionScheduleStatus.Refused);
  if (refused.status === EngineDefinitionScheduleStatus.Refused) assert.equal(refused.failure.code, "timer-start-superseded");
});

test("a taken action is firing until its firing answers, and unanswered when no firing is retained", async () => {
  const host = testHost();
  const selected = await request(host);
  host.schedules.stored = (created) => ({
    ...pendingSchedule(created, host.taskQueue),
    remainingActions: 0,
    actionsTaken: 1,
    nextActionEpochMs: [],
    recentWorkflowIds: ["firing-2026-11-09T12:00:01Z"],
  });
  const unanswered = await createBpmnDefinitionSchedule(selected);
  assert.equal(unanswered.status, EngineDefinitionScheduleStatus.IntegrityFailure);
  if (unanswered.status === EngineDefinitionScheduleStatus.IntegrityFailure) {
    assert.equal(unanswered.failure.code, EngineDefinitionScheduleIntegrityCode.FiringUnanswered);
  }
  host.schedules.firing = async () => ({ kind: "running" });
  assert.deepEqual(await inspectBpmnDefinitionSchedule(selected), { status: EngineDefinitionScheduleStatus.Firing, paused: false });
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
