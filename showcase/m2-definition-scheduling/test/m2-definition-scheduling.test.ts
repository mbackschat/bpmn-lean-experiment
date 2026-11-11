/** Live Product 2 evidence for engine-occurrence Timer Start scheduling. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { DefinitionScheduleStatus, PublicApiErrorCode } from "@bpmn-lean/platform-contracts";
import type { DefinitionSchedule, DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";
import {
  createPlatformServer,
  readPlatformServerConfig,
} from "@bpmn-lean/platform-server";
import type {
  PlatformServerRuntime,
} from "@bpmn-lean/platform-server";
import { ProcessClient, ResultKind, processInstanceWorkflowId, workflowType } from "@bpmn-lean/temporal-host/client";
import { timerFiringWorkflowType } from "@bpmn-lean/temporal-host/host";
import { replayHistory } from "@bpmn-lean/temporal-host/worker";

import { showcaseEngineDeploymentEnvironment } from "../../engine-deployment.ts";
import {
  ShowcaseWorker,
  createCachedLocalEnvironment,
  environmentNamespace,
  noEffects,
  withDeadline,
} from "../src/host-worker.ts";

import {
  deleteDefinitionSchedule,
  deleteDefinitionScheduleExpectingConflict,
  deployDefinition,
  getDefinitionSchedule,
  listDefinitionSchedules,
  listScheduleOccurrences,
  putDefinitionSchedule,
  putDefinitionScheduleExpectingRefusal,
} from "./http-support.ts";
import type {
  CapturedJson,
} from "./http-support.ts";
import {
  assertAnsweredFiringHistory,
  assertCompletedTimerStartHistory,
  assertWorkerAbsentHistory,
  listScheduleIds,
  listWorkflowIds,
  processHandle,
  requireOnlyNewIdentity,
  waitForExactScheduleAction,
  waitForOpenUserTask,
  waitForScheduleCleanup,
} from "./temporal-support.ts";
import type { ObservedScheduleAction, TemporalHistory } from "./temporal-support.ts";

const profileId = "bpmn-2.0.2";
const taskQueue = "bpmn-m2-definition-scheduling";
const operationDeadlineMs = 10_000;
const environmentStartupDeadlineMs = 40_000;
/**
 * The Timer Start's duration in the versions the witness fires: an occurrence counts from the version's engine
 * registration, so it must outlast the steps that run before the Worker leaves.
 */
const firedTimerDuration = { iso: "PT10S", ms: 10_000 } as const;
/** The cancelled version's Timer Start only has to outlast the cancellation. */
const cancelledTimerDuration = { iso: "PT4S", ms: 4_000 } as const;
/** The template's Start Event ID keeps its original spelling whatever duration a version rewrites. */
const timerStartEventId = "TimerStart_PT1S";
/** What a due action creates: its firing Workflow and, when the engine accepts the occurrence, the Process. */
const firedWorkflowTypes = [timerFiringWorkflowType, workflowType];
/** The tolerance for comparing the engine's registration time with this process's clock around the deploy call. */
const registrationClockToleranceMs = 1_000;
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../.cache/temporal-cli/", import.meta.url),
);
const sourceUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);

test("M2 schedules engine occurrences, refuses a superseded version, decides cancellation races, and replays", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "bpmn-lean-m2-scheduling-"));
  const port = await allocatePort();
  const origin = `http://127.0.0.1:${port}`;
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: `bpmn-m2-scheduling-service-${process.pid}`,
      downloadDirectory: temporalCacheDirectory,
    }),
    environmentStartupDeadlineMs,
    "M2 Temporal environment startup",
  );
  const namespace = environmentNamespace(environment);
  const client = environment.client;
  let platform: PlatformServerRuntime | undefined;
  let worker: ShowcaseWorker | undefined;

  try {
    // Registering a version, listing its occurrences and reading a Schedule all query the population, so a Worker
    // polls until the occurrences are scheduled; it leaves before the first action, so the firing Workflows' first
    // tasks stay untaken until a replacement Worker returns.
    worker = await startWorker(environment, "first");
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      namespace,
    );
    const template = await readFile(sourceUrl, "utf8");
    assert.ok(template.includes(">PT1S<"), "the template must spell its Timer Start duration as PT1S");
    const versionBytes = (revision: number, duration: string): Buffer => Buffer.from(
      template
        .replace('name="Review"', `name="Review version ${revision}"`)
        .replace(">PT1S<", `>${duration}<`),
      "utf8",
    );
    const publicCaptures: CapturedJson<unknown>[] = [];

    const beforeVersionOne = Date.now();
    const versionOne = await deployDefinition(origin, {
      bytes: versionBytes(1, firedTimerDuration.iso),
      sourceId: "timer-start-version-1.bpmn",
      semanticProfile: profileId,
    });
    const afterVersionOne = Date.now();
    assert.equal(versionOne.value.version, 1);
    assert.deepEqual(versionOne.value.startCapabilities.messageStarts, []);
    assert.deepEqual(versionOne.value.startCapabilities.timerStarts, [{
      startEventId: timerStartEventId,
      durationMs: firedTimerDuration.ms,
    }]);

    const versionOneOccurrences = await listScheduleOccurrences(origin, versionOne.value);
    publicCaptures.push(versionOneOccurrences);
    const dueAtOne = onlyOccurrenceDueAt(versionOneOccurrences, "version 1");
    assertCountedFromRegistration(dueAtOne, beforeVersionOne, afterVersionOne, firedTimerDuration.ms);
    assert.equal(versionOneOccurrences.value.definition.version, 1);
    assert.equal(versionOneOccurrences.value.timerStart.startEventId, timerStartEventId);
    const laterThanOnly = await listScheduleOccurrences(origin, versionOne.value, {
      from: new Date(Date.parse(dueAtOne) + 1).toISOString(),
    });
    publicCaptures.push(laterThanOnly);
    assert.deepEqual(laterThanOnly.value.occurrences, [], "a one-shot Timer Start has no occurrence after its only one");

    const scheduleIdsBefore = await listScheduleIds(client);
    const primaryScheduleId = `schedule-version-1-${process.pid}`;
    const primaryPut = await putDefinitionSchedule(origin, versionOne.value, primaryScheduleId, dueAtOne);
    publicCaptures.push(primaryPut);
    assert.equal(primaryPut.status, 201);
    assert.equal(primaryPut.value.status, "scheduled");
    assert.equal(primaryPut.value.definition.version, 1);
    assert.equal(primaryPut.value.dueAt, dueAtOne);
    const scheduleIdsAfterOne = await listScheduleIds(client);
    const privateScheduleIdOne = requireOnlyNewIdentity(
      scheduleIdsBefore,
      scheduleIdsAfterOne,
      "version-1 schedule",
    );

    const retriedPut = await putDefinitionSchedule(origin, versionOne.value, primaryScheduleId, dueAtOne);
    publicCaptures.push(retriedPut);
    assert.equal(retriedPut.status, 200);
    assert.deepEqual(retriedPut.value, primaryPut.value, "a PUT retry answers as the first");
    const refusedPuts = [
      await putDefinitionScheduleExpectingRefusal(
        origin,
        versionOne.value,
        `second-identity-${process.pid}`,
        dueAtOne,
        { status: 409 },
      ),
      await putDefinitionScheduleExpectingRefusal(
        origin,
        versionOne.value,
        primaryScheduleId,
        new Date(Date.parse(dueAtOne) + 1_000).toISOString(),
        { status: 409 },
      ),
      await putDefinitionScheduleExpectingRefusal(
        origin,
        versionOne.value,
        `unlisted-occurrence-${process.pid}`,
        new Date(Date.parse(dueAtOne) + 1).toISOString(),
        { status: 422 },
      ),
      await putDefinitionScheduleExpectingRefusal(
        origin,
        versionOne.value,
        `past-occurrence-${process.pid}`,
        new Date(Date.now() - 1_000).toISOString(),
        { status: 422 },
      ),
    ];
    publicCaptures.push(...refusedPuts);
    assert.deepEqual(
      refusedPuts.map(({ value }) => value.error.code),
      [
        PublicApiErrorCode.Conflict,
        PublicApiErrorCode.Conflict,
        PublicApiErrorCode.InvalidRequest,
        PublicApiErrorCode.InvalidRequest,
      ],
    );
    assert.deepEqual(
      await listScheduleIds(client),
      scheduleIdsAfterOne,
      "a refused PUT must create no Temporal Schedule",
    );

    // A later version of the same process supersedes this one's Timer Start at the engine, not at the platform.
    const beforeVersionTwo = Date.now();
    const versionTwo = await deployDefinition(origin, {
      bytes: versionBytes(2, firedTimerDuration.iso),
      sourceId: "timer-start-version-2.bpmn",
      semanticProfile: profileId,
    });
    const afterVersionTwo = Date.now();
    assert.equal(versionTwo.value.version, 2);
    assert.notEqual(versionTwo.value.source.sha256, versionOne.value.source.sha256);
    assert.deepEqual(
      (await listDefinitionSchedules(origin, versionTwo.value)).value.schedules,
      [],
    );
    const versionTwoOccurrences = await listScheduleOccurrences(origin, versionTwo.value);
    publicCaptures.push(versionTwoOccurrences);
    const dueAtTwo = onlyOccurrenceDueAt(versionTwoOccurrences, "version 2");
    assertCountedFromRegistration(dueAtTwo, beforeVersionTwo, afterVersionTwo, firedTimerDuration.ms);
    assert.ok(Date.parse(dueAtTwo) > Date.parse(dueAtOne), "version 2 registered after version 1");
    const secondScheduleId = `schedule-version-2-${process.pid}`;
    const secondPut = await putDefinitionSchedule(origin, versionTwo.value, secondScheduleId, dueAtTwo);
    publicCaptures.push(secondPut);
    assert.equal(secondPut.status, 201);
    assert.equal(secondPut.value.status, "scheduled");
    assert.equal(secondPut.value.definition.version, 2);
    const privateScheduleIdTwo = requireOnlyNewIdentity(
      scheduleIdsAfterOne,
      await listScheduleIds(client),
      "version-2 schedule",
    );

    await platform.close();
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      namespace,
    );
    for (const [definition, scheduleId, version] of [
      [versionOne.value, primaryScheduleId, 1],
      [versionTwo.value, secondScheduleId, 2],
    ] as const) {
      const afterRestart = await getDefinitionSchedule(origin, definition, scheduleId);
      publicCaptures.push(afterRestart);
      assert.equal(afterRestart.value.status, "scheduled");
      assert.equal(afterRestart.value.definition.version, version);
    }

    await worker.shutdown();
    worker = undefined;
    assert.ok(Date.now() < Date.parse(dueAtOne), "the Worker must have left before the first action is due");

    const actions: readonly Readonly<{
      observed: ObservedScheduleAction;
      source: DeployedDefinitionVersion;
    }>[] = [
      {
        observed: await waitForExactScheduleAction(client, privateScheduleIdOne, dueAtOne),
        source: versionOne.value,
      },
      {
        observed: await waitForExactScheduleAction(client, privateScheduleIdTwo, dueAtTwo),
        source: versionTwo.value,
      },
    ];
    for (const { observed, source } of actions) {
      assert.equal(observed.description.action.taskQueue, taskQueue);
      assertDefinitionSource(observed.description.action.memo, source.source.sha256);
      assert.notEqual(observed.workflowId, observed.description.action.workflowId);
      assert.ok(
        observed.workflowId.startsWith(observed.description.action.workflowId),
        "Temporal appends the action time to the firing Workflow ID base",
      );
      assert.equal(observed.firing.startEvent, timerStartEventId);
      assertWorkerAbsentHistory(await fetchHistory(
        client.workflow.getHandle(observed.workflowId, observed.firstExecutionRunId),
        "firing Workflow history while the Worker is absent",
      ));
    }
    assert.deepEqual(
      await listWorkflowIds(client, [workflowType]),
      [],
      "no Process may start while no Worker polls",
    );

    worker = await startWorker(environment, "replacement");
    // The firing Workflow is the Schedule's action: deleting the Schedule cannot undo it, so the action wins the race.
    const actionWins = await deleteDefinitionScheduleExpectingConflict(
      origin,
      versionTwo.value,
      secondScheduleId,
    );
    publicCaptures.push(actionWins);
    assert.equal(actionWins.value.error.code, "conflict");

    const started = await waitForScheduleStatus(
      origin,
      versionTwo.value,
      secondScheduleId,
      DefinitionScheduleStatus.Started,
    );
    publicCaptures.push(started);
    const instance = started.value.instance;
    assert.equal(instance.definition.version, 2);
    assert.equal(instance.definition.source.sha256, versionTwo.value.source.sha256);
    assert.match(instance.processInstanceId, /^timer:/u, "the engine names the instance an occurrence starts");
    assert.equal(started.value.scheduleId, secondScheduleId);
    const versionTwoList = await listDefinitionSchedules(origin, versionTwo.value);
    publicCaptures.push(versionTwoList);
    assert.deepEqual(versionTwoList.value.schedules, [started.value]);

    // The occurrence of version 1 fired too, but registering version 2 superseded its Timer Start.
    const refused = await waitForScheduleStatus(
      origin,
      versionOne.value,
      primaryScheduleId,
      DefinitionScheduleStatus.Refused,
    );
    publicCaptures.push(refused);
    assert.equal(refused.value.refusal, "timer-start-superseded");
    assert.equal(refused.value.instance, null);
    assert.equal(refused.value.definition.version, 1);
    assert.equal(refused.value.dueAt, dueAtOne);
    const versionOneList = await listDefinitionSchedules(origin, versionOne.value);
    publicCaptures.push(versionOneList);
    assert.deepEqual(versionOneList.value.schedules, [refused.value]);
    await waitForScheduleCleanup(client, privateScheduleIdOne);
    await waitForScheduleCleanup(client, privateScheduleIdTwo);

    const processWorkflowId = processInstanceWorkflowId(instance.processInstanceId);
    assert.deepEqual(
      await listWorkflowIds(client, [workflowType]),
      [processWorkflowId],
      "only the occurrence that was not superseded starts a Process",
    );
    const processes = new ProcessClient(client, taskQueue);
    const handle = processHandle(client.workflow, processWorkflowId);
    const task = await waitForOpenUserTask(handle, "Review version 2");
    assert.equal(task.id.processInstanceId, instance.processInstanceId);
    const command = await withDeadline(
      processes.command(processWorkflowId, {
        kind: "command",
        commandId: `complete-scheduled-version-2-${process.pid}`,
        occurrence: task.id,
        action: { kind: "completeUserTask", values: [] },
      }),
      operationDeadlineMs,
      "scheduled Process User Task completion",
    );
    assert.equal(command.outcome, "committed");
    const terminal = await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "scheduled version-2 Process completion",
    );
    assert.equal(terminal.kind, ResultKind.Ended);
    assert.equal(terminal.kind === ResultKind.Ended ? terminal.status : null, "completed");
    const finalState = requireRecord(
      await withDeadline(processes.observation(processWorkflowId), operationDeadlineMs, "completed Process observation"),
      "completed Process observation",
    );
    assert.equal(finalState.instanceId, instance.processInstanceId);
    assert.equal(finalState.status, "completed");
    const completedDescription = await processes.describe(processWorkflowId);
    assert.ok(completedDescription !== null);
    assert.equal(completedDescription.workflowType, workflowType);
    assert.equal(completedDescription.taskQueue, taskQueue);
    assert.equal(completedDescription.running, false);

    const completedHistory = await fetchHistory(handle, "scheduled version-2 Process history");
    assertCompletedTimerStartHistory(completedHistory);
    await withDeadline(
      replayHistory(completedHistory, processWorkflowId),
      30_000,
      "scheduled version-2 history replay",
    );
    for (const { observed } of actions) {
      const firingHistory = await fetchHistory(
        client.workflow.getHandle(observed.workflowId, observed.firstExecutionRunId),
        "answered firing Workflow history",
      );
      assertAnsweredFiringHistory(firingHistory);
      await withDeadline(
        replayHistory(firingHistory, observed.workflowId),
        30_000,
        "firing Workflow history replay",
      );
    }

    // The third version's occurrence is cancelled before it is due, so its action never exists.
    const versionThree = await deployDefinition(origin, {
      bytes: versionBytes(3, cancelledTimerDuration.iso),
      sourceId: "timer-start-version-3.bpmn",
      semanticProfile: profileId,
    });
    assert.equal(versionThree.value.version, 3);
    const versionThreeOccurrences = await listScheduleOccurrences(origin, versionThree.value);
    publicCaptures.push(versionThreeOccurrences);
    const dueAtThree = onlyOccurrenceDueAt(versionThreeOccurrences, "version 3");
    const workflowsBeforeCancellation = await listWorkflowIds(client, firedWorkflowTypes);
    const cancellationScheduleId = `cancel-before-due-${process.pid}`;
    const cancellationSchedulesBefore = await listScheduleIds(client);
    const cancellationPut = await putDefinitionSchedule(
      origin,
      versionThree.value,
      cancellationScheduleId,
      dueAtThree,
    );
    publicCaptures.push(cancellationPut);
    assert.equal(cancellationPut.value.status, "scheduled");
    const cancellationPrivateId = requireOnlyNewIdentity(
      cancellationSchedulesBefore,
      await listScheduleIds(client),
      "cancellation schedule",
    );
    const cancelled = await deleteDefinitionSchedule(
      origin,
      versionThree.value,
      cancellationScheduleId,
    );
    publicCaptures.push(cancelled);
    assert.equal(cancelled.value.status, "cancelled");
    assert.equal(cancelled.value.instance, null);
    await waitForScheduleCleanup(client, cancellationPrivateId);

    await platform.close();
    platform = await startPlatform(
      origin,
      port,
      dataDirectory,
      environment.address,
      namespace,
    );
    const repeatedCancellation = await deleteDefinitionSchedule(
      origin,
      versionThree.value,
      cancellationScheduleId,
    );
    publicCaptures.push(repeatedCancellation);
    assert.deepEqual(repeatedCancellation.value, cancelled.value);
    // The action would have been taken at the first whole second not before the due instant.
    const waitPastCancellationDue = Date.parse(cancellationPut.value.dueAt) - Date.now() + 1_250;
    if (waitPastCancellationDue > 0) {
      await delay(waitPastCancellationDue);
    }
    assert.deepEqual(
      await listWorkflowIds(client, firedWorkflowTypes),
      workflowsBeforeCancellation,
      "a durably cancelled Schedule must start no firing and no Process",
    );

    assertPublicResponsesHidePrivateIdentities(publicCaptures, [
      privateScheduleIdOne,
      privateScheduleIdTwo,
      cancellationPrivateId,
      processWorkflowId,
      (await handle.describe()).runId,
      ...actions.flatMap(({ observed }) => [
        observed.workflowId,
        observed.firstExecutionRunId,
        observed.description.action.workflowId,
      ]),
    ]);
  } finally {
    const cleanupFailures: unknown[] = [];
    for (const cleanup of [
      worker === undefined ? undefined : () => worker?.shutdown(),
      platform === undefined ? undefined : () => platform?.close(),
      () => environment.teardown(),
      () => rm(dataDirectory, { recursive: true, force: true }),
    ]) {
      try {
        await cleanup?.();
      } catch (error: unknown) {
        cleanupFailures.push(error);
      }
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(cleanupFailures, "M2 scheduling cleanup failed");
    }
  }
});

async function startWorker(
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>,
  role: string,
): Promise<ShowcaseWorker> {
  return await withDeadline(
    ShowcaseWorker.start(environment, {
      taskQueue,
      identity: `bpmn-m2-scheduling-${role}-${process.pid}`,
      effects: noEffects,
    }),
    20_000,
    `${role} host Worker startup`,
  );
}

async function startPlatform(
  origin: string,
  port: number,
  dataDirectory: string,
  temporalAddress: string,
  temporalNamespace: string,
): Promise<PlatformServerRuntime> {
  const runtime = await createPlatformServer({
    ...readPlatformServerConfig(showcaseEngineDeploymentEnvironment()),
    host: "127.0.0.1",
    port,
    publicOrigin: origin,
    dataDirectory,
    maxSourceBytes: 1024 * 1024,
    parserDeadlineMs: 5_000,
    temporalAddress,
    temporalNamespace,
    temporalTaskQueue: taskQueue,
    temporalConnectTimeoutMs: 5_000,
    fakeActorId: "demo-user",
    fakeActorGroups: ["reviewers"],
    maxWorkProcesses: 100,
    maxWorkTasks: 1_000,
  });
  try {
    assert.equal(await runtime.listen(), origin);
    return runtime;
  } catch (error: unknown) {
    await runtime.close();
    throw error;
  }
}

async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("ephemeral listener did not expose a TCP address");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
  return address.port;
}

/** The source digest of the definition a Schedule's memo names (`packages/engine-api/src/definition-schedule.ts`). */
function definitionSha256(memo: unknown): unknown {
  const definition = requireRecord(requireRecord(memo, "Schedule memo").definition, "Schedule memo definition");
  return requireRecord(definition.ref, "Schedule memo definition ref").sha256;
}

function assertDefinitionSource(memo: unknown, sourceSha256: string): void {
  assert.equal(definitionSha256(memo), sourceSha256);
}

function onlyOccurrenceDueAt(
  listing: CapturedJson<Readonly<{ occurrences: readonly Readonly<{ dueAt: string }>[] }>>,
  label: string,
): string {
  assert.equal(listing.value.occurrences.length, 1, `${label}: a duration Timer Start has exactly one occurrence`);
  const [occurrence] = listing.value.occurrences;
  assert.ok(occurrence !== undefined);
  return occurrence.dueAt;
}

/** An occurrence is due one duration after the version's engine registration, which happened during the deploy call. */
function assertCountedFromRegistration(
  dueAt: string,
  deployStartedMs: number,
  deployReturnedMs: number,
  durationMs: number,
): void {
  const dueMs = Date.parse(dueAt);
  assert.ok(
    dueMs >= deployStartedMs + durationMs - registrationClockToleranceMs &&
      dueMs <= deployReturnedMs + durationMs + registrationClockToleranceMs,
    `occurrence ${dueAt} is not one duration after the deploy`,
  );
}

async function waitForScheduleStatus<Status extends DefinitionSchedule["status"]>(
  origin: string,
  definition: DeployedDefinitionVersion,
  scheduleId: string,
  status: Status,
): Promise<CapturedJson<Extract<DefinitionSchedule, { status: Status }>>> {
  let latest: CapturedJson<DefinitionSchedule> | undefined;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    latest = await getDefinitionSchedule(origin, definition, scheduleId);
    if (latest.value.status === status) {
      return latest as CapturedJson<Extract<DefinitionSchedule, { status: Status }>>;
    }
    await delay(50);
  }
  throw new Error(`Schedule ${scheduleId} did not reach ${status}: ${JSON.stringify(latest?.value)}`);
}

async function fetchHistory(
  handle: ReturnType<typeof processHandle>,
  label: string,
): Promise<TemporalHistory> {
  return await withDeadline(handle.fetchHistory(), operationDeadlineMs, label) as TemporalHistory;
}

function assertPublicResponsesHidePrivateIdentities(
  captures: readonly CapturedJson<unknown>[],
  privateIdentities: readonly string[],
): void {
  const forbiddenKeys = new Set([
    "configuredWorkflowId",
    "configuredWorkflowIdBase",
    "firstExecutionRunId",
    "hostScheduleId",
    "runId",
    "temporalScheduleId",
    "workflowId",
  ]);
  for (const capture of captures) {
    assertNoForbiddenKeys(capture.value, forbiddenKeys, "$public");
    for (const privateIdentity of privateIdentities) {
      assert.equal(
        capture.text.includes(privateIdentity),
        false,
        `public response disclosed private identity ${privateIdentity}`,
      );
    }
  }
}

function assertNoForbiddenKeys(
  value: unknown,
  forbidden: ReadonlySet<string>,
  path: string,
): void {
  if (Array.isArray(value)) {
    value.forEach((candidate, index) =>
      assertNoForbiddenKeys(candidate, forbidden, `${path}[${index}]`)
    );
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, candidate] of Object.entries(value)) {
    assert.equal(forbidden.has(key), false, `${path}.${key} is private`);
    assertNoForbiddenKeys(candidate, forbidden, `${path}.${key}`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
