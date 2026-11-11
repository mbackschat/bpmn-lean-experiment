/**
 * Hosted witnesses of the generic Temporal host (W0.3b), run in hosted CI only: start, command, delivery, timer and
 * effect once each on durable scheduling, a Continue-As-New handoff, replay determinism of every captured history,
 * and the scenario runner on external scheduling against the TypeScript kernel's own canonical result.
 *
 * Programs are read from the retained scenarios' BPMN by `bpmn-source` at test time, so they follow the kernel IL as
 * it changes. The scenario models' timers are due at logical 1000 ms, which the local server reaches in real time.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";
import { runScenario as runKernelScenario } from "@bpmn-lean/kernel";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { Worker } from "@temporalio/worker";

import {
  PageKind,
  ProcessClient,
  ResultKind,
  ScheduleClient,
  Scheduling,
  type HostConfig,
  type HostSnapshot,
  type JsonValue,
} from "@bpmn-lean/temporal-host/client";
import { ScheduleCreation } from "@bpmn-lean/temporal-host/host";
import { createCachedLocalEnvironment, runScenario } from "@bpmn-lean/temporal-host/testing";
import { EffectResultKind, createHostWorker, replayHistory, type EffectRequest } from "@bpmn-lean/temporal-host/worker";

const projectRoot = new URL("../../../", import.meta.url);
const taskQueue = "bpmn-lean-temporal-host-test";
const deadlineMs = 20_000;

/** JSON serialization erases what a wire value cannot carry, as every Temporal payload does. */
const wire = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value)) as JsonValue;

type ScenarioDocument = Readonly<{
  profile: string;
  bpmn: Readonly<{ id: string; sha256: string; relativePath: string; sourceOverlay: null }>;
  stimuli: ReadonlyArray<JsonValue>;
}>;

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(new URL(relativePath, projectRoot), "utf8")) as T;
}

async function programOf(profileId: string, bpmn: ScenarioDocument["bpmn"]): Promise<JsonValue> {
  const profile = await readJson<Readonly<{ bpmn?: Readonly<{ relationships?: ReadonlyArray<string> }> }>>(
    `profiles/${profileId}/profile.json`);
  const read = await readKernelProgram({
    bytes: await readFile(new URL(bpmn.relativePath, projectRoot)),
    expectedSha256: bpmn.sha256,
    overlay: null,
    profile: profileId,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions(profile.bpmn?.relationships ?? []));
  if (read.kind === "refused") throw new Error(`${bpmn.relativePath}: kernel reader refused ${read.code}`);
  return wire(read.program);
}

async function retainedCase(relativePath: string): Promise<Readonly<{ program: JsonValue; scenario: ScenarioDocument }>> {
  const scenario = await readJson<ScenarioDocument>(relativePath);
  return { program: await programOf(scenario.profile, scenario.bpmn), scenario };
}

function stimulus(scenario: ScenarioDocument, index: number): JsonValue {
  const found = scenario.stimuli[index];
  if (found === undefined) throw new Error(`scenario has no stimulus ${String(index)}`);
  return found;
}

function durable(scenario: ScenarioDocument, historyEventBudget: number | null = null): HostConfig {
  return {
    scheduling: Scheduling.Durable,
    effectStartToCloseMs: 10_000,
    historyEventBudget,
  };
}

async function until<T>(label: string, read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const stop = Date.now() + deadlineMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > stop) throw new Error(`${label} not reached within ${String(deadlineMs)} ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const hasUserTask = (name: string) => (snapshot: HostSnapshot): boolean =>
  snapshot.view?.openWaits.some((wait) => wait.id.elementId === name) ?? false;

let environment: TestWorkflowEnvironment;
let worker: Worker;
let running: Promise<void>;
let client: ProcessClient;
const effectRequests: EffectRequest[] = [];
const finished: string[] = [];
const workflowId = (label: string): string => `temporal-host-${label}-${randomUUID()}`;

before(async () => {
  environment = await createCachedLocalEnvironment({
    identity: "bpmn-lean-temporal-host-test",
    downloadDirectory: fileURLToPath(new URL(".cache/temporal-cli/", projectRoot)),
  });
  worker = await createHostWorker({
    connection: environment.nativeConnection,
    taskQueue,
    scriptTimeoutMs: 1_000,
    effects: async (request) => {
      effectRequests.push(request);
      return { kind: EffectResultKind.Success, outputs: [] };
    },
  });
  running = worker.run();
  client = new ProcessClient(environment.client, taskQueue);
});

after(async () => {
  worker.shutdown();
  await running;
  await environment.teardown();
});

test("start, effect and command: the host runs the effect as one Activity and a refused command changes nothing", async () => {
  const { program, scenario } = await retainedCase("scenarios/configured-task/scenario.json");
  const id = workflowId("effect");
  assert.equal((await client.start({ workflowId: id, program, config: durable(scenario), start: stimulus(scenario, 0) })).outcome,
    "committed");

  const review = await until("the effect's result", () => client.hostView(id), hasUserTask("UserTask_Review"));
  const effects = effectRequests.filter((request) => request.occurrence.elementId === "ConfiguredTask_Probe");
  assert.equal(effects.length, 1);
  const page = await client.publication(id, 0);
  assert.equal(page.kind, PageKind.Available);
  assert.ok(page.kind === PageKind.Available &&
    page.execution.some((batch) => batch.commandId.startsWith("host:effect:")));

  const complete = stimulus(scenario, 2) as Readonly<{ occurrence: Readonly<Record<string, JsonValue>> }>;
  const stale = await client.command(id, wire({ ...complete, occurrence: { ...complete.occurrence, activation: 2 } }));
  assert.equal(stale.outcome, "rejected");
  assert.equal((await client.hostView(id)).revision, review.revision);

  assert.equal((await client.command(id, stimulus(scenario, 2))).outcome, "committed");
  const result = await client.result(id);
  assert.equal(result.kind, ResultKind.Ended);
  assert.equal(result.kind === ResultKind.Ended ? result.status : null, "completed");
  finished.push(id);
});

test("delivery: a Message delivery is an Update routed by the subscription's occurrence identity", async () => {
  const { program, scenario } = await retainedCase("scenarios/intermediate-catch-message/scenario.json");
  const id = workflowId("delivery");
  await client.start({ workflowId: id, program, config: durable(scenario), start: stimulus(scenario, 0) });
  assert.equal((await client.command(id, stimulus(scenario, 1))).code, "wrong-update");
  assert.equal((await client.deliver(id, stimulus(scenario, 1))).outcome, "committed");
  assert.ok(hasUserTask("UserTask_Approve")(await client.hostView(id)));
  assert.equal((await client.command(id, stimulus(scenario, 2))).outcome, "committed");
  assert.equal((await client.result(id)).kind, ResultKind.Ended);
  finished.push(id);
});

test("timer: a durable timer fires the boundary deadline, and a client's timer firing is refused", async () => {
  const { program, scenario } = await retainedCase("scenarios/activity-boundary-timer/deadline-wins.scenario.json");
  const id = workflowId("timer");
  await client.start({ workflowId: id, program, config: durable(scenario), start: stimulus(scenario, 0) });
  assert.equal((await client.timerFire(id, stimulus(scenario, 1))).code, "host-scheduled-input");
  await until("the boundary deadline", () => client.hostView(id), hasUserTask("BoundaryTask"));
  const history = await environment.client.workflow.getHandle(id).fetchHistory();
  assert.ok(history.events?.some((event) => event.timerFiredEventAttributes != null));
  const page = await client.publication(id, 0);
  assert.ok(page.kind === PageKind.Available && page.occurrences.some((batch) => batch.transitions.some((transition) =>
    transition.ended.some((ended) => ended.occurrence.elementId === "BoundedTask" && ended.terminal === "cancelled"))));
  assert.equal((await client.command(id, stimulus(scenario, 2))).outcome, "committed");
  assert.equal((await client.result(id)).kind, ResultKind.Ended);
  finished.push(id);
});

test("chain handoff: a Run past its history budget continues as new with its state and publication cursor", async () => {
  const { program, scenario } = await retainedCase("scenarios/intermediate-catch-message/scenario.json");
  const id = workflowId("chain");
  await client.start({ workflowId: id, program, config: durable(scenario, 5), start: stimulus(scenario, 0) });
  const delivered = await client.deliver(id, stimulus(scenario, 1));
  assert.equal(delivered.outcome, "committed");
  const handed = await until("the next Run", () => environment.client.workflow.getHandle(id).fetchHistory(),
    (history) => history.events?.[0]?.workflowExecutionStartedEventAttributes?.continuedExecutionRunId != null);
  assert.ok(hasUserTask("UserTask_Approve")(await client.hostView(id)));
  const retainedAfter = delivered.revision ?? -1;
  assert.deepEqual(await client.publication(id, 0), { kind: PageKind.Gap, retainedAfterRevision: retainedAfter });

  assert.equal((await client.command(id, stimulus(scenario, 2))).outcome, "committed");
  const page = await client.publication(id, retainedAfter);
  assert.ok(page.kind === PageKind.Available && page.execution[0]?.fromRevision === retainedAfter);
  assert.equal((await client.result(id)).kind, ResultKind.Ended);
  const previousRun = handed.events?.[0]?.workflowExecutionStartedEventAttributes?.continuedExecutionRunId ?? "";
  await replayHistory(await environment.client.workflow.getHandle(id, previousRun).fetchHistory(), id);
  finished.push(id);
});

test("schedule start: a one-shot Schedule starts the Timer start at its due instant", async () => {
  const { program, scenario } = await retainedCase("scenarios/timer-start-event/scenario.json");
  const schedules = new ScheduleClient(environment.client, taskQueue);
  // A calendar spec has whole UTC seconds; three seconds ahead leaves the creation call time to land first.
  const due = Math.ceil(Date.now() / 1_000) * 1_000 + 3_000;
  const scheduleId = workflowId("schedule");
  const base = workflowId("scheduled");
  const start = stimulus(scenario, 0) as Readonly<Record<string, JsonValue>>;
  assert.equal(await schedules.create({
    scheduleId, dueAtEpochMs: due, workflowIdBase: base, program, config: durable(scenario),
    start: { ...start, trigger: { kind: "timer", logicalTimeMs: due } },
    population: { population: `witness-${randomUUID()}`, deploymentId: 1 },
    memo: { witness: scheduleId },
  }), ScheduleCreation.Created);
  try {
    const taken = await until("the Schedule's action", () => schedules.describe(scheduleId),
      (stored) => (stored?.recentWorkflowIds.length ?? 0) > 0);
    const id = taken?.recentWorkflowIds[0] ?? "";
    assert.ok(id.startsWith(base));
    await until("the started instance", () => client.hostView(id), hasUserTask("UserTask_AfterTimer"));
    assert.equal((await client.command(id, stimulus(scenario, 1))).outcome, "committed");
    assert.equal((await client.result(id)).kind, ResultKind.Ended);
    finished.push(id);
  } finally {
    await schedules.delete(scheduleId);
  }
});

test("replay: every captured history replays deterministically on the same bundle", async () => {
  assert.ok(finished.length >= 4, "the witnesses above recorded their histories");
  for (const id of finished) await replayHistory(await environment.client.workflow.getHandle(id).fetchHistory(), id);
});

test("the scenario runner on external scheduling returns the kernel's canonical result", async () => {
  for (const path of [
    "scenarios/configured-task/scenario.json",
    "scenarios/activity-boundary-timer/deadline-wins.scenario.json",
    "scenarios/activity-boundary-timer/activity-wins.scenario.json",
    "scenarios/intermediate-catch-message/scenario.json",
  ]) {
    const { program, scenario } = await retainedCase(path);
    const hosted = await runScenario(program, wire(scenario), { client, workflowIdPrefix: workflowId("scenario") });
    assert.deepEqual(wire(hosted), wire(runKernelScenario(program, scenario)), path);
  }
});
