/**
 * Hosted witnesses of the generic Temporal host (W0.3b), run in hosted CI only: start, command, delivery, timer and
 * effect once each on durable scheduling, a Continue-As-New handoff, a Script's committed result reused by a
 * replacement Worker (PC-AUTO-06), replay determinism of every captured history, and the scenario runner on external
 * scheduling against the TypeScript kernel's own canonical result.
 *
 * Programs are read from the retained scenarios' BPMN by `bpmn-source` at test time, so they follow the kernel IL as
 * it changes. The scenario models' timers are due at logical 1000 ms, which the local server reaches in real time.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

import { assembleProgram, kernelProfileOptions, readKernelProgram, type KernelJson } from "@bpmn-lean/bpmn-source";
import { admit, decodeProgram, runScenario as runKernelScenario, timerInstanceId } from "@bpmn-lean/kernel";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { Worker } from "@temporalio/worker";

import {
  PageKind,
  PopulationClient,
  ProcessClient,
  ResultKind,
  ScheduleClient,
  Scheduling,
  processInstanceWorkflowId,
  type HostConfig,
  type HostSnapshot,
  type JsonValue,
} from "@bpmn-lean/temporal-host/client";
import { ScheduleCreation, timerFiringWorkflowType, type CommandAnswer } from "@bpmn-lean/temporal-host/host";
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

async function profileOptions(profileId: string) {
  const profile = await readJson<Readonly<{ bpmn?: Readonly<{ relationships?: ReadonlyArray<string> }> }>>(
    `profiles/${profileId}/profile.json`);
  return kernelProfileOptions(profile.bpmn?.relationships ?? []);
}

async function programOf(profileId: string, bpmn: ScenarioDocument["bpmn"]): Promise<JsonValue> {
  const read = await readKernelProgram({
    bytes: await readFile(new URL(bpmn.relativePath, projectRoot)),
    expectedSha256: bpmn.sha256,
    overlay: null,
    profile: profileId,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  }, await profileOptions(profileId));
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

async function startWorker(): Promise<void> {
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
}

before(async () => {
  environment = await createCachedLocalEnvironment({
    identity: "bpmn-lean-temporal-host-test",
    downloadDirectory: fileURLToPath(new URL(".cache/temporal-cli/", projectRoot)),
  });
  await startWorker();
  client = new ProcessClient(environment.client, taskQueue);
});

after(async () => {
  worker.shutdown();
  await running;
  await environment.teardown();
});

test("start, effect and command: the host runs the effect as one Activity, a refused command changes nothing, and an ended chain is closed, not unknown", async () => {
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
  // Temporal raises `WorkflowNotFoundError` for both Updates; only describing the address tells them apart.
  assert.deepEqual(await client.command(id, stimulus(scenario, 2)), { outcome: "rejected", code: "workflow-closed", revision: null });
  assert.deepEqual(await client.command(workflowId("never-started"), stimulus(scenario, 2)),
    { outcome: "rejected", code: "workflow-unknown", revision: null });
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

test("chain handoff mid-population: Multi-Instance bodies continue as new with the kernel's canonical result", async () => {
  // PC-MI-04 and PC-MI-05: the body's slots, instance scopes and counters cross every handoff, and each Run replays.
  for (const path of [
    "scenarios/open-rows/multi-instance-sub-process/parallel-sixteen-bodies-reversed.scenario.json",
    "scenarios/open-rows/multi-instance-sub-process/sequential-two-bodies.scenario.json",
  ]) {
    const { program, scenario } = await retainedCase(path);
    const prefix = workflowId("mi-chain");
    const hosted = await runScenario(program, wire(scenario), { client, workflowIdPrefix: prefix, historyEventBudget: 12 });
    assert.deepEqual(wire(hosted), wire(runKernelScenario(program, scenario)), path);
    let runs = 0;
    for (let runId: string | undefined = undefined; ; runs += 1) {
      const history = await environment.client.workflow.getHandle(`${prefix}-1`, runId).fetchHistory();
      await replayHistory(history, `${prefix}-1`);
      runId = history.events?.[0]?.workflowExecutionStartedEventAttributes?.continuedExecutionRunId ?? undefined;
      if (runId === undefined || runId === "") break;
    }
    assert.ok(runs > 0, `${path}: the chain continued as new at least once`);
  }
});

/** A population of its own with the Timer start scenario registered once per `registrations` request ID. */
async function timerPopulation(...registrations: readonly string[]) {
  const { program, scenario } = await retainedCase("scenarios/timer-start-event/scenario.json");
  const config = durable(scenario);
  const name = `witness-${randomUUID()}`;
  const population = new PopulationClient(environment.client, taskQueue, name, config);
  const deployments = [];
  for (const request of registrations) {
    const answer = await population.registerDeployment({ deploymentRequestId: request, digest: request, program });
    if (!("deploymentId" in answer)) throw new Error(`deployment refused: ${answer.refused}`);
    deployments.push(answer);
  }
  return { name, config, population, deployments, program, scenario };
}

/** The firing of the PT1S Timer start's first occurrence of `deployment`, counted from its deploy time. */
function firstFiring(name: string, config: HostConfig, deployment: Readonly<{ deploymentId: number; deployedAtMs: number }>) {
  return { population: name, config, deploymentId: deployment.deploymentId, startEvent: "TimerStart_PT1S", dueMs: deployment.deployedAtMs + 1_000 };
}

async function firedAnswer(schedules: ScheduleClient, scheduleId: string): Promise<CommandAnswer> {
  const taken = await until("the Schedule's action", () => schedules.describe(scheduleId),
    (stored) => (stored?.recentWorkflowIds.length ?? 0) > 0);
  const firingId = taken?.recentWorkflowIds[0] ?? "";
  const outcome = await until("the firing's answer", () => schedules.firing(firingId), (read) => read?.kind === "answered");
  if (outcome?.kind !== "answered") throw new Error("the firing did not answer");
  return outcome.answer;
}

test("schedule start: a one-shot Schedule fires the Timer start's occurrence through the population", async () => {
  const { name, config, deployments: [deployment], scenario } = await timerPopulation("v1");
  if (deployment === undefined) throw new Error("no deployment");
  const schedules = new ScheduleClient(environment.client, taskQueue);
  const scheduleId = workflowId("schedule");
  const firing = firstFiring(name, config, deployment);
  // The occurrence is due one second after the deploy; the action fires at the next whole second, after the create.
  assert.equal(await schedules.create({ scheduleId, firing, memo: { witness: scheduleId } }), ScheduleCreation.Created);
  try {
    const answer = await firedAnswer(schedules, scheduleId);
    const instanceId = timerInstanceId(firing.deploymentId, firing.startEvent, firing.dueMs);
    assert.deepEqual(answer.resolution, {
      kind: "fanOut",
      entries: [{ kind: "started", instanceId, deploymentId: firing.deploymentId, version: 1, startEvent: firing.startEvent }],
    });
    const id = processInstanceWorkflowId(name, instanceId);
    await until("the started instance", () => client.hostView(id), hasUserTask("UserTask_AfterTimer"));
    const complete = stimulus(scenario, 1) as Readonly<Record<string, JsonValue>>;
    const occurrence = complete["occurrence"] as Readonly<Record<string, JsonValue>>;
    assert.equal((await client.command(id, { ...complete, occurrence: { ...occurrence, processInstanceId: instanceId } })).outcome,
      "committed");
    assert.equal((await client.result(id)).kind, ResultKind.Ended);
    finished.push(id);
    const refired = await environment.client.workflow.execute(timerFiringWorkflowType, {
      workflowId: workflowId("refire"), taskQueue, args: [firing],
    }) as CommandAnswer;
    assert.deepEqual(refired.resolution, { kind: "rejected", code: "timer-start-occurrence-consumed" },
      "a second firing of a consumed occurrence starts nothing");
  } finally {
    await schedules.delete(scheduleId);
  }
});

test("schedule superseded: a Schedule of a deployment a redeploy superseded fires and starts nothing", async () => {
  const { name, config, population, deployments: [deployment], program } = await timerPopulation("v1");
  if (deployment === undefined) throw new Error("no deployment");
  const schedules = new ScheduleClient(environment.client, taskQueue);
  const scheduleId = workflowId("superseded");
  const firing = firstFiring(name, config, deployment);
  assert.equal(await schedules.create({ scheduleId, firing, memo: { witness: scheduleId } }), ScheduleCreation.Created);
  try {
    const redeployed = await population.registerDeployment({ deploymentRequestId: "v2", digest: "v2", program });
    assert.ok("deploymentId" in redeployed && redeployed.deploymentId > deployment.deploymentId);
    assert.deepEqual((await firedAnswer(schedules, scheduleId)).resolution, { kind: "rejected", code: "timer-start-superseded" });
    const instanceId = timerInstanceId(firing.deploymentId, firing.startEvent, firing.dueMs);
    assert.equal(await client.describe(processInstanceWorkflowId(name, instanceId)), null);
  } finally {
    await schedules.delete(scheduleId);
  }
});

/** A read program of one Definitions document in the `urn:calls` namespace, whose unprefixed Calls name its processes. */
async function callsProgram(body: string): Promise<JsonValue> {
  const read = await readKernelProgram({
    bytes: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions
      xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions" targetNamespace="urn:calls">${body}</bpmn:definitions>`),
    overlay: null, profile: "witness-profile", limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions([]));
  if (read.kind === "refused") throw new Error(`kernel reader refused ${read.code}`);
  return wire(read.program);
}

const caller = (calledElement: string): Promise<JsonValue> => callsProgram(`<bpmn:process id="Caller" isExecutable="true">
  <bpmn:startEvent id="Start"/><bpmn:callActivity id="Call" calledElement="${calledElement}"/><bpmn:endEvent id="End"/>
  <bpmn:sequenceFlow id="f1" sourceRef="Start" targetRef="Call"/><bpmn:sequenceFlow id="f2" sourceRef="Call" targetRef="End"/>
</bpmn:process>`);

/** Kernel admission of `program` assembled, as the next deployment, with `registered` (the engine API's classification). */
function assembledRefusal(registered: readonly Readonly<{ deploymentId: number; program: JsonValue }>[], program: JsonValue): string | null {
  const deploymentId = Math.max(...registered.map((deployment) => deployment.deploymentId)) + 1;
  const assembled = assembleProgram([...registered, { deploymentId, program }].map((deployment) =>
    ({ deploymentId: deployment.deploymentId, program: deployment.program as KernelJson, versionTag: null })), deploymentId);
  const decoded = decodeProgram(wire(assembled));
  if (!decoded.ok) throw new Error(decoded.refusal);
  return admit(decoded.value);
}

test("deployments: the ingress lists its registered programs, so a Call only deployment 1 answers is found from deployment 2", async () => {
  const callee = await callsProgram(`<bpmn:process id="Callee" isExecutable="true">
    <bpmn:startEvent id="Start"/><bpmn:endEvent id="End"/><bpmn:sequenceFlow id="f" sourceRef="Start" targetRef="End"/>
  </bpmn:process>`);
  const population = new PopulationClient(environment.client, taskQueue, `witness-${randomUUID()}`, { scheduling: Scheduling.Durable, effectStartToCloseMs: 10_000, historyEventBudget: null });
  assert.deepEqual(await population.deployments(), [], "no ingress runs before the first registration");
  assert.ok("deploymentId" in await population.registerDeployment({ deploymentRequestId: "callee", digest: "callee", program: callee }));
  const missing = await caller("Nowhere");
  assert.deepEqual(await population.registerDeployment({ deploymentRequestId: "missing", digest: "missing", program: missing }),
    { refused: "work.call.calledProcessMissing" });
  const registered = await population.deployments();
  assert.deepEqual(registered, [{ deploymentId: 1, program: callee }], "a refused request takes an ordinal but is no deployment");
  const crossing = await caller("Callee");
  const own = decodeProgram(crossing);
  assert.ok(own.ok);
  assert.equal(admit(own.value), "work.call.calledProcessMissing", "deployment 2's own document cannot bind the Call");
  assert.equal(assembledRefusal(registered, crossing), null, "deployment 1's Callee answers it once assembled");
  assert.equal(assembledRefusal(registered, missing), "work.call.calledProcessMissing", "a Call nothing answers stays missing");
});

/**
 * A Script Task whose result is a fresh random draw, shown as the next User Task's input, read under the
 * `cibseven-2.2.0` profile that admits JavaScript Scripts (CIB-EXT-0048). Evaluating the Script again would draw
 * another value with near certainty, so an equal value after recovery is the reuse of the committed one.
 */
const drawXml = `<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions" targetNamespace="urn:script-recovery">
  <bpmn:process id="Draw" isExecutable="true">
    <bpmn:startEvent id="Start"/>
    <bpmn:scriptTask id="Script_Draw" scriptFormat="javascript" camunda:resultVariable="draw">
      <bpmn:script>Math.floor(Math.random() * 2147483647)</bpmn:script>
    </bpmn:scriptTask>
    <bpmn:userTask id="UserTask_Inspect"><bpmn:extensionElements><camunda:inputOutput>
      <camunda:inputParameter name="shown">\${draw}</camunda:inputParameter>
    </camunda:inputOutput></bpmn:extensionElements></bpmn:userTask>
    <bpmn:endEvent id="End"/>
    <bpmn:sequenceFlow id="f1" sourceRef="Start" targetRef="Script_Draw"/>
    <bpmn:sequenceFlow id="f2" sourceRef="Script_Draw" targetRef="UserTask_Inspect"/>
    <bpmn:sequenceFlow id="f3" sourceRef="UserTask_Inspect" targetRef="End"/>
  </bpmn:process>
</bpmn:definitions>`;

function shownDraw(snapshot: HostSnapshot): JsonValue {
  const task = snapshot.view?.openWaits.find((wait) => wait.id.elementId === "UserTask_Inspect")?.userTask;
  const inputs = (task as Readonly<{ inputs?: ReadonlyArray<Readonly<{ name: string; value: JsonValue }>> }> | undefined)?.inputs;
  const shown = inputs?.find((input) => input.name === "shown");
  if (shown === undefined) throw new Error("the User Task shows no draw");
  return shown.value;
}

test("script recovery: a replacement Worker reuses the committed Script result instead of evaluating it again", async () => {
  const read = await readKernelProgram({
    bytes: new TextEncoder().encode(drawXml), overlay: null, profile: "cibseven-2.2.0",
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  }, await profileOptions("cibseven-2.2.0"));
  if (read.kind === "refused") throw new Error(`kernel reader refused ${read.code}`);
  const id = workflowId("script");
  const start = { kind: "start", commandId: "start", instanceId: "Draw_1", variables: [] };
  const config: HostConfig = { scheduling: Scheduling.Durable, effectStartToCloseMs: 10_000, historyEventBudget: null };
  assert.equal((await client.start({ workflowId: id, program: wire(read.program), config, start })).outcome, "committed");
  const drawn = shownDraw(await until("the Script's result", () => client.hostView(id), hasUserTask("UserTask_Inspect")));

  // The replacement holds no cached Workflow state, so its first task rebuilds the instance from the history alone.
  worker.shutdown();
  await running;
  await startWorker();
  assert.deepEqual(shownDraw(await client.hostView(id)), drawn);
  const complete = { kind: "command", commandId: "complete-inspect",
    occurrence: { processInstanceId: "Draw_1", elementId: "UserTask_Inspect", activation: 1 },
    action: { kind: "completeUserTask", values: [] } };
  assert.equal((await client.command(id, complete)).outcome, "committed");
  assert.equal((await client.result(id)).kind, ResultKind.Ended);
  const history = await environment.client.workflow.getHandle(id).fetchHistory();
  const evaluations = history.events?.filter((event) =>
    event.activityTaskScheduledEventAttributes?.activityType?.name === "evaluateScript") ?? [];
  assert.equal(evaluations.length, 1, "the Script was evaluated once, by its recorded Activity, and never inside the Workflow");
  finished.push(id);
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
