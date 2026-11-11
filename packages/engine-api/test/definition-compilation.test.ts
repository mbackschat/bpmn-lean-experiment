/**
 * Compilation reads exact bytes through the kernel reader under the profile's relations, admits through the kernel,
 * and publishes identity, host requirements and capabilities; every refusal is one coded diagnostic.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  compileBpmnDefinition,
  engineHostRefusal,
  type EngineTimerSchedule,
} from "@bpmn-lean/engine-api";

import { limits, scenarioBytes, sha256, standardProfile } from "./support.ts";

const { engineDefinitionCapabilitiesFromJson, engineTimerScheduleFromJson } =
  await import(new URL("../dist/definition-capabilities.js", import.meta.url).href) as typeof import("../src/definition-capabilities.ts");

test("an admitted definition publishes its identity, its host requirements and a none start", async () => {
  const bytes = await scenarioBytes("user-task-preserved-notation/process.bpmn");
  const result = await compileBpmnDefinition({ bytes, sourceId: "approval", profile: standardProfile, limits });
  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  if (result.status !== EngineDefinitionCompilationStatus.Accepted) return;
  assert.deepEqual(result.source, {
    id: "approval", sha256: await sha256(bytes), byteLength: bytes.byteLength, declaredEncoding: "UTF-8", decodedAs: "UTF-8" });
  assert.deepEqual(result.definition, {
    ref: { definitionKey: "Process_SequentialUserTask", version: null, sha256: await sha256(bytes) },
    profile: standardProfile.id,
    sourceOverlay: null,
  });
  assert.equal(result.hostRequirements.userTasks, true);
  assert.equal(result.hostRequirements.effects, false);
  assert.deepEqual(result.capabilities.starts.map((start) => [start.trigger, start.schedule]), [[{ kind: "none" }, null]]);
});

test("a Message start publishes its channel and a Timer start the schedule the kernel resolves", async () => {
  const message = await compileBpmnDefinition({
    bytes: await scenarioBytes("message-start-event/process.bpmn"), sourceId: "m", profile: standardProfile, limits });
  assert.equal(message.status, EngineDefinitionCompilationStatus.Accepted);
  if (message.status !== EngineDefinitionCompilationStatus.Accepted) return;
  assert.deepEqual(message.capabilities.starts, [{
    startEventId: "MessageStart_ApprovalRequest",
    trigger: {
      kind: "message",
      channel: {
        kind: "operationMessage",
        interfaceId: "Interface_ProcessMessages",
        interfaceOperationId: "Operation_ReceiveApprovalRequest",
        messageId: "Message_ApprovalRequest",
      },
      messageName: "Approval request",
    },
    schedule: null,
  }]);
  const timer = await compileBpmnDefinition({
    bytes: await scenarioBytes("timer-start-event/process.bpmn"), sourceId: "t", profile: standardProfile, limits });
  assert.equal(timer.status, EngineDefinitionCompilationStatus.Accepted);
  if (timer.status !== EngineDefinitionCompilationStatus.Accepted) return;
  assert.deepEqual(timer.capabilities.starts, [{ startEventId: "TimerStart_PT1S", trigger: { kind: "timer" }, schedule: { durationMs: 1_000 } }]);
});

/** One line per schedule form, so that a form the type does not declare fails the type check. */
function describeSchedule(schedule: EngineTimerSchedule): string {
  if ("durationMs" in schedule) return `after ${String(schedule.durationMs)} ms`;
  if ("instantMs" in schedule) return `at ${new Date(schedule.instantMs).toISOString()}`;
  if ("cycle" in schedule) return `every ${String(schedule.cycle.periodMs)} ms, ${String(schedule.cycle.repetitions)} times`;
  return `on Cron ${schedule.cron}`;
}

test("a Timer start publishes a date as its instant, a cycle as its period and a Cron expression as its text", async () => {
  const offered = async (path: string): Promise<readonly string[]> => {
    const result = await compileBpmnDefinition({ bytes: await scenarioBytes(path), sourceId: path, profile: standardProfile, limits });
    assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted, path);
    if (result.status !== EngineDefinitionCompilationStatus.Accepted) return [];
    return result.capabilities.starts.flatMap((start) => (start.schedule === null ? [] : [describeSchedule(start.schedule)]));
  };
  assert.deepEqual(await offered("open-rows/timer-start-forms/date-start.bpmn"), ["at 1970-01-01T02:00:00.000Z"]);
  assert.deepEqual(await offered("open-rows/timer-start-population/cron-start.bpmn"), ["on Cron 0 0/30 * * * ?"]);
  assert.deepEqual(await offered("open-rows/timer-start-population/bounded-cycle-start.bpmn"), ["every 600000 ms, 3 times"]);
});

test("a capability rendering outside the contract is a fault, never a capability", () => {
  const channel = { kind: "operationMessage", interfaceId: "I", interfaceOperationId: "O", messageId: "M" };
  const of = (starts: unknown[], correlatedChannels: unknown[] = []) =>
    engineDefinitionCapabilitiesFromJson({ starts, correlatedChannels, relations: [] });
  assert.deepEqual(of([{ startEventId: "S", trigger: { kind: "signal" } }, { startEventId: "C", trigger: { kind: "condition" } }]).starts, [
    { startEventId: "S", trigger: { kind: "signal" }, schedule: null },
    { startEventId: "C", trigger: { kind: "condition" }, schedule: null },
  ]);
  assert.deepEqual(of([{ startEventId: "M", trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" } } }]).starts,
    [{ startEventId: "M", trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M" }, messageName: null }, schedule: null }]);
  const correlated = { channel, catches: [{ elementId: "T", criteria: [{ key: "K", value: { variable: { name: "k" } } }] }] };
  assert.deepEqual(of([], [correlated]).correlatedChannels, [correlated]);
  for (const [starts, correlatedChannels] of [
    [[{ startEventId: "S", trigger: { kind: "timer" } }], []],
    [[{ startEventId: "S", trigger: { kind: "none" }, schedule: { durationMs: 1 } }], []],
    [[{ startEventId: "S", trigger: { kind: "escalation" } }], []],
    [[{ startEventId: "S", trigger: { kind: "none" }, channel }], []],
    [[{ startEventId: "", trigger: { kind: "none" } }], []],
    [[{ startEventId: "S", trigger: { kind: "message" } }], []],
    [[{ startEventId: "S", trigger: { kind: "message", channel: { ...channel, interfaceId: 7 } } }], []],
    [[{ startEventId: "S", trigger: { kind: "message", channel: { kind: "directMessage", messageId: "M", extra: 1 } } }], []],
    [[], [{ channel, catches: [{ elementId: "T", criteria: [{ key: "K" }] }] }]],
    [[], [{ channel: { kind: "named" }, catches: [] }]],
    [[], [{ channel, catches: {} }]],
  ] as const) {
    assert.throws(() => of([...starts], [...correlatedChannels]), TypeError, JSON.stringify([starts, correlatedChannels]));
  }
  assert.throws(() => engineDefinitionCapabilitiesFromJson({ starts: [], correlatedChannels: [] }), TypeError);
});

test("a schedule rendering outside the contract is a fault, never a schedule", () => {
  assert.deepEqual(engineTimerScheduleFromJson({ cron: "0 0 12 * * ?" }), { cron: "0 0 12 * * ?" });
  assert.deepEqual(engineTimerScheduleFromJson({ cycle: { periodMs: 1_000, repetitions: null } }),
    { cycle: { periodMs: 1_000, repetitions: null } });
  for (const rendering of [
    null, [], {}, { durationMs: -1 }, { durationMs: 1.5 }, { instantMs: "1970" }, { cron: "" }, { cron: 7 },
    { durationMs: 1, instantMs: 2 }, { cycle: { periodMs: 1 } }, { cycle: { periodMs: 1, repetitions: null, extra: 0 } },
    { cycle: { periodMs: 1, repetitions: -2 } }, { seconds: 3 },
  ]) {
    assert.throws(() => engineTimerScheduleFromJson(rendering), TypeError, JSON.stringify(rendering));
  }
});

test("a correlated catch publishes its channel, its element and the correlation key the kernel evaluates", async () => {
  const result = await compileBpmnDefinition({
    bytes: await scenarioBytes("message-key-correlation/process.bpmn"), sourceId: "c", limits,
    profile: { id: "test-correlation", relations: ["CIB-AGR-0001", "CIB-OP-0001", "CIB-LIM-0002"] } });
  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  if (result.status !== EngineDefinitionCompilationStatus.Accepted) return;
  assert.deepEqual(result.capabilities.correlatedChannels, [{
    channel: {
      kind: "operationMessage",
      interfaceId: "Interface_ClearingHouse",
      interfaceOperationId: "Operation_ConfirmSettlement",
      messageId: "Message_SettlementConfirmed",
    },
    catches: [{
      elementId: "MessageCatch_CorrelatedSettlement",
      criteria: [{ key: "CorrelationKey_SettlementReference", value: { variable: { name: "Property_SettlementReference" } } }],
    }],
  }]);
});

test("unreadable bytes and a digest other than expected are refused with the reader's code", async () => {
  const garbage = await compileBpmnDefinition({
    bytes: new TextEncoder().encode("<not-bpmn"), sourceId: "x", profile: standardProfile, limits });
  assert.equal(garbage.status, EngineDefinitionCompilationStatus.Rejected);
  const bytes = await scenarioBytes("user-task-preserved-notation/process.bpmn");
  const drifted = await compileBpmnDefinition({
    bytes, sourceId: "x", expectedSha256: "0".repeat(64), profile: standardProfile, limits });
  assert.equal(drifted.status, EngineDefinitionCompilationStatus.Rejected);
  if (drifted.status !== EngineDefinitionCompilationStatus.Rejected) return;
  assert.equal(drifted.diagnostics.length, 1);
  assert.match(drifted.diagnostics[0].code, /^source\./u);
  assert.deepEqual([drifted.source.declaredEncoding, drifted.source.decodedAs], ["UTF-8", null]);
});

test("a kernel admission refusal of one element names that element", async () => {
  const source = new TextDecoder().decode(await scenarioBytes("user-task-preserved-notation/process.bpmn"));
  const result = await compileBpmnDefinition({
    bytes: new TextEncoder().encode(source.replaceAll("bpmn:userTask", "bpmn:scriptTask")), sourceId: "x", profile: standardProfile, limits });
  assert.equal(result.status, EngineDefinitionCompilationStatus.Rejected);
  if (result.status !== EngineDefinitionCompilationStatus.Rejected) return;
  assert.deepEqual(result.diagnostics.map(({ code, element }) => [code, element]), [["work.script", "UserTask_Approve"]]);
});

test("the host refusal table names the first required capability a deployment does not serve", () => {
  const requirements = { timers: true, messages: false, effects: true, userTasks: true, calls: false, maxConcurrentWaits: null };
  const served = { timers: true, messages: true, effects: false, userTasks: false, calls: true };
  assert.equal(engineHostRefusal(requirements, served), "host.effects");
  assert.equal(engineHostRefusal(requirements, { ...served, effects: true, userTasks: true }), null);
});
