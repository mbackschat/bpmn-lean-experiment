import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";
import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlQuery,
  PostgresqlQueryResult,
  PostgresqlRow,
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";

import { PostgresqlWorkRecoveryCandidateSource } from "@bpmn-lean/platform-work";
import { WorkPostgresqlRecoveryFamily } from "@bpmn-lean/platform-work";
import { PostgresqlWorkRepository } from "@bpmn-lean/platform-work";
import { PostgresqlWorkSnapshotReader } from "@bpmn-lean/platform-work";
import {
  PostgresqlWorkSnapshotRecoveryStep,
  PostgresqlWorkSnapshotStepKind,
  decodeWorkSnapshotCandidateKey,
} from "@bpmn-lean/platform-work";
import { PostgresqlWorkSnapshotService } from "@bpmn-lean/platform-work";
import { WorkSnapshotUnavailableError } from "@bpmn-lean/platform-work";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Work snapshot requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createRuntime(baseUrl);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: migrationDirectories(),
    });
  });

  after(async () => {
    await runtime.close();
  });

  test("zero and terminal populations complete without a Product 1 call", async () => {
    await resetDatabase(runtime);
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    assert.deepEqual(
      await source.listCandidateKeys(WorkPostgresqlRecoveryFamily.WorkSnapshot, 10, 5_000),
      [],
    );
    const zero = await new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read();
    assert.deepEqual(zero.value, []);
    assert.ok(zero.freshness !== null);

    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication("terminal\u0000process"));
    await repository.recordObservation("terminal\u0000process", "closed");
    assert.deepEqual(
      await source.listCandidateKeys(WorkPostgresqlRecoveryFamily.WorkSnapshot, 10, 5_000),
      [],
    );
    const terminal = await new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read();
    assert.deepEqual(terminal.value, []);
    assert.ok(
      terminal.freshness !== null &&
      terminal.freshness.observedAfterEpochMs <= Date.now() + 1_000,
    );
  });

  test("materializes bounded exact keys and installs a structured image behind the callback", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    for (const processInstanceId of ["é😀\u0000z", "a\u0000z", "a"]) {
      await repository.recordConfirmedProcessInstance(publication(processInstanceId));
    }
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const first = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      2,
      5_000,
    );
    assert.deepEqual(first.map(decodeWorkSnapshotCandidateKey), ["a\u0000z", "é😀\u0000z"]);
    assert.equal(await scalar(runtime, `
      SELECT materialized_through::text AS value
      FROM bpmn_platform.work_snapshot_generations WHERE state = 'building'
    `), "2");

    const observedTask = openTask("é😀\u0000z", "Review\u0000task", 1);
    let gatewayCalls = 0;
    const step = new PostgresqlWorkSnapshotRecoveryStep({
      runtime,
      gateway: {
        observeOpenWork: async () => {
          gatewayCalls += 1;
          return { status: "open", openUserTasks: [structuredClone(observedTask)] };
        },
      },
      catalogs: { readHumanTaskCatalog: async () => catalog("Review\u0000task") },
      maxTasks: 10,
    });
    const prepared = await step.prepare(Buffer.from("é😀\u0000z", "utf8"));
    assert.equal(prepared.kind, PostgresqlWorkSnapshotStepKind.Complete);
    assert.equal(gatewayCalls, 1);
    assert.equal(await scalar(runtime, "SELECT count(*)::text AS value FROM bpmn_platform.work_snapshot_tasks"), "0");
    if (prepared.kind !== PostgresqlWorkSnapshotStepKind.Complete) assert.fail("unreachable");
    await runtime.transaction(prepared.apply);

    const next = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      5_000,
    );
    assert.deepEqual(next.map(decodeWorkSnapshotCandidateKey), ["a", "a\u0000z"]);
    await completeOpenCandidates(runtime, next, "next");

    await runtime.query({
      text: `
        INSERT INTO bpmn_platform.work_claims (
          hosting_process_instance_id, task_process_instance_id,
          element_id, activation, claim_generation, actor_id
        ) VALUES ($1, $2, $3, 1, 1, $4)
      `,
      values: [
        Buffer.from("é😀\u0000z", "utf8"),
        Buffer.from("é😀\u0000z", "utf8"),
        Buffer.from("Review\u0000task", "utf8"),
        Buffer.from("demo-user", "utf8"),
      ],
    });

    const counted = countingRuntime(runtime);
    const reader = new PostgresqlWorkSnapshotReader(readerOptions(counted.runtime));
    const read = await reader.read();
    assert.equal(counted.queries(), 1);
    const projected = read.value.find(({ registration }) =>
      registration.instance.processInstanceId === "é😀\u0000z");
    assert.equal(projected?.claim.claim?.actorId, "demo-user");
    assert.equal(projected?.structuredTask?.taskDefinition.worklistPriority, 90);
    assert.notEqual(projected?.task, observedTask);
    (read.value[0]!.task as { name: string | null }).name = "mutated by caller";
    assert.notEqual((await reader.read()).value[0]?.task.name, "mutated by caller");

    const service = new PostgresqlWorkSnapshotService({
      reader,
      actors: new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] }),
      authorization: new TaskAuthorizationPolicy(),
    });
    const publicRead = await service.listTasks();
    assert.equal(publicRead.value.tasks[0]?.catalogPresentation?.worklistPriority, 90);
    assert.equal(counted.closes(), 0);
  });

  test("a registration committed after generation H prevents stale one-query success", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication("generation-H"));
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const candidates = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      5_000,
    );
    await completeOpenCandidates(runtime, candidates, "H");
    await new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read();

    await repository.recordConfirmedProcessInstance(publication("generation-H-plus-1"));
    const counted = countingRuntime(runtime);
    await assert.rejects(
      new PostgresqlWorkSnapshotReader(readerOptions(counted.runtime)).read(),
      WorkSnapshotUnavailableError,
    );
    assert.equal(counted.queries(), 1);
  });

  test("a canonical public registration identity change invalidates the completed image", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication("identity-drift"));
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const candidates = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      5_000,
    );
    await completeOpenCandidates(runtime, candidates, "identity");

    const changedInstance = publication("identity-drift").instance;
    changedInstance.definition.semanticProfile = "changed-profile";
    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_processes
        SET public_instance_json = $2
        WHERE process_instance_id = $1
      `,
      values: [
        Buffer.from("identity-drift", "utf8"),
        JSON.stringify(changedInstance),
      ],
    });
    await assert.rejects(
      new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read(),
      WorkSnapshotUnavailableError,
    );
  });

  test("active to indeterminate registration drift invalidates the completed image", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication("observation-drift"));
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const candidates = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      5_000,
    );
    await completeOpenCandidates(runtime, candidates, "observation");
    await repository.recordObservation("observation-drift", "indeterminate");

    await assert.rejects(
      new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read(),
      WorkSnapshotUnavailableError,
    );
  });

  test("unknown observations retry and stale callbacks cannot replace a newer generation", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication("stale\u0000process"));
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const [key] = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      5_000,
    );
    assert.ok(key !== undefined);
    const retry = await new PostgresqlWorkSnapshotRecoveryStep({
      runtime,
      gateway: { observeOpenWork: async () => ({ status: "unknown" }) },
      catalogs: { readHumanTaskCatalog: async () => null },
      maxTasks: 10,
    }).prepare(key);
    assert.equal(retry.kind, PostgresqlWorkSnapshotStepKind.Retry);
    assert.equal(await scalar(runtime, "SELECT count(*)::text AS value FROM bpmn_platform.work_snapshot_tasks"), "0");

    const oldStep = await openStep(runtime, key, "Old");
    if (oldStep.kind !== PostgresqlWorkSnapshotStepKind.Complete) assert.fail("unreachable");
    await runtime.transaction(oldStep.apply);
    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_snapshot_generation_items
        SET observed_at = clock_timestamp() - interval '1 hour'
        WHERE observed_at IS NOT NULL;
        UPDATE bpmn_platform.work_snapshot_generations
        SET observed_after_at = clock_timestamp() - interval '1 hour'
        WHERE state = 'completed'
      `,
    });
    const [newKey] = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      1,
    );
    assert.ok(newKey !== undefined);
    const newStep = await openStep(runtime, newKey, "New");
    if (newStep.kind !== PostgresqlWorkSnapshotStepKind.Complete) assert.fail("unreachable");
    await runtime.transaction(newStep.apply);
    const before = await taskNames(runtime);
    await runtime.transaction(oldStep.apply);
    assert.deepEqual(await taskNames(runtime), before);
    assert.deepEqual(before, ["New"]);
  });

  test("a registration closed after prepare installs an empty terminal image", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication("closed-during-observation"));
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const [key] = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      5_000,
    );
    assert.ok(key !== undefined);
    const prepared = await openStep(runtime, key, "Must not survive");
    if (prepared.kind !== PostgresqlWorkSnapshotStepKind.Complete) assert.fail("unreachable");
    await repository.recordObservation("closed-during-observation", "closed");
    await runtime.transaction(prepared.apply);
    assert.deepEqual(
      (await new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read()).value,
      [],
    );
    assert.equal(await scalar(runtime, "SELECT count(*)::text AS value FROM bpmn_platform.work_snapshot_tasks"), "0");
  });

  test("expired, incomplete, and corrupt generations fail unavailable", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication("corrupt"));
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const [key] = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      5_000,
    );
    assert.ok(key !== undefined);
    const step = await openStep(runtime, key, "Healthy");
    if (step.kind !== PostgresqlWorkSnapshotStepKind.Complete) assert.fail("unreachable");
    await runtime.transaction(step.apply);

    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_snapshot_generation_items
        SET observed_at = clock_timestamp() - interval '1 hour';
        UPDATE bpmn_platform.work_snapshot_generations
        SET observed_after_at = clock_timestamp() - interval '1 hour'
      `,
    });
    await assert.rejects(
      new PostgresqlWorkSnapshotReader({ ...readerOptions(runtime), maxAgeMs: 1 }).read(),
      WorkSnapshotUnavailableError,
    );

    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_snapshot_generation_items
        SET observed_at = clock_timestamp();
        UPDATE bpmn_platform.work_snapshot_generations
        SET observed_after_at = (
          SELECT min(observed_at) FROM bpmn_platform.work_snapshot_generation_items
        );
        UPDATE bpmn_platform.work_snapshot_tasks
        SET task_json = regexp_replace(task_json, '^\\{', '{ ')
      `,
    });
    await assert.rejects(
      new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read(),
      WorkSnapshotUnavailableError,
    );

    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_snapshot_tasks
        SET task_json = regexp_replace(task_json, '^\\{ ', '{'),
            element_id = $1
      `,
      values: [Buffer.from("redundant-drift", "utf8")],
    });
    await assert.rejects(
      new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read(),
      WorkSnapshotUnavailableError,
    );

    await runtime.query({
      text: "UPDATE bpmn_platform.work_snapshot_generations SET succeeded_count = 0",
    });
    await assert.rejects(
      new PostgresqlWorkSnapshotReader(readerOptions(runtime)).read(),
      WorkSnapshotUnavailableError,
    );
  });

  test("rejects malformed keys and unsafe bounds before any gateway or database call", async () => {
    assert.throws(
      () => decodeWorkSnapshotCandidateKey(Uint8Array.of(0xc3, 0x28)),
      /exact UTF-8/u,
    );
    let queries = 0;
    const wrapped = countingRuntime(runtime, () => { queries += 1; });
    await assert.rejects(
      new PostgresqlWorkRecoveryCandidateSource(wrapped.runtime).listCandidateKeys(
        WorkPostgresqlRecoveryFamily.WorkSnapshot,
        1,
      ),
      /maximum age is required/u,
    );
    assert.equal(queries, 0);
  });
}

async function completeOpenCandidates(
  runtime: PostgresqlRuntime,
  candidates: readonly Uint8Array[],
  label: string,
): Promise<void> {
  for (const key of candidates) {
    const step = await openStep(runtime, key, `${label}-${decodeWorkSnapshotCandidateKey(key)}`);
    if (step.kind !== PostgresqlWorkSnapshotStepKind.Complete) assert.fail("unreachable");
    await runtime.transaction(step.apply);
  }
}

async function openStep(runtime: PostgresqlRuntime, key: Uint8Array, name: string) {
  const processInstanceId = decodeWorkSnapshotCandidateKey(key);
  return await new PostgresqlWorkSnapshotRecoveryStep({
    runtime,
    gateway: {
      observeOpenWork: async () => ({
        status: "open",
        openUserTasks: [openTask(processInstanceId, name, 1)],
      }),
    },
    catalogs: { readHumanTaskCatalog: async () => null },
    maxTasks: 10,
  }).prepare(key);
}

function publication(processInstanceId: string) {
  return {
    instance: {
      processInstanceId,
      definition: {
        processId: "Review_Process",
        version: 1,
        source: {
          kind: "bpmnSource" as const,
          id: "review.bpmn",
          sha256: "a".repeat(64),
          byteLength: 42,
          declaredEncoding: null,
          decodedAs: "UTF-8" as const,
        },
        semanticProfile: "profile-1",
        startCapabilities: { messageStarts: [], timerStarts: [] },
      },
    },
    locator: `private:${processInstanceId}`,
  };
}

function openTask(processInstanceId: string, elementId: string, activation: number) {
  return {
    id: { processInstanceId, elementId, activation },
    name: elementId,
    state: "active" as const,
    metadata: {
      assignment: { candidates: [{ kind: "group" as const, id: "reviewers" }] as const },
    },
  };
}

function catalog(elementId: string) {
  return {
    schemaVersion: "bpmn-lean-human-task-catalog/v1" as const,
    processId: "Review_Process",
    semanticProfile: "profile-1",
    sourceSha256: "a".repeat(64),
    tasks: [{
      elementId,
      description: "Review the request",
      worklistPriority: 90,
      form: {
        schemaVersion: "bpmn-lean-structured-form/v1" as const,
        fields: [{
          key: "approved",
          label: "Approved",
          helpText: null,
          defaultValue: null,
          visibleForActions: "all" as const,
          requiredForActions: [],
          kind: "boolean" as const,
        }],
        actions: [{
          id: "approve",
          label: "Approve",
          intent: "primary" as const,
          resolutionValue: "approved",
        }, {
          id: "reject",
          label: "Reject",
          intent: "neutral" as const,
          resolutionValue: "rejected",
        }],
        resolutionVariable: "resolution",
      },
    }],
  };
}

function readerOptions(runtime: PostgresqlRuntime) {
  return { runtime, maxAgeMs: 5_000, maxProcesses: 100, maxTasks: 100 };
}

function countingRuntime(
  runtime: PostgresqlRuntime,
  onQuery: () => void = () => undefined,
) {
  let queryCount = 0;
  let closeCount = 0;
  return {
    runtime: {
      query: async <Row extends PostgresqlRow = PostgresqlRow>(
        query: PostgresqlQuery,
      ): Promise<PostgresqlQueryResult<Row>> => {
        queryCount += 1;
        onQuery();
        return await runtime.query<Row>(query);
      },
      transaction: async <Result>(
        run: (session: PostgresqlSession) => Promise<Result>,
      ): Promise<Result> => await runtime.transaction(run),
      withDedicatedSession: async <Result>(
        run: (session: PostgresqlSession) => Promise<Result>,
      ): Promise<Result> => await runtime.withDedicatedSession(run),
      databaseClockEpochMs: async () => await runtime.databaseClockEpochMs(),
      close: async () => { closeCount += 1; },
    } satisfies PostgresqlRuntime,
    queries: () => queryCount,
    closes: () => closeCount,
  };
}

async function scalar(runtime: PostgresqlRuntime, text: string): Promise<string> {
  const result = await runtime.query({ text });
  return String(result.rows[0]?.value);
}

async function taskNames(runtime: PostgresqlRuntime): Promise<readonly string[]> {
  const result = await runtime.query({
    text: `
      SELECT task_json
      FROM bpmn_platform.work_snapshot_tasks AS task
      JOIN bpmn_platform.work_snapshot_control AS control
        ON control.completed_generation = task.generation
      ORDER BY task.element_id
    `,
  });
  return result.rows.map(({ task_json: taskJson }) =>
    String((JSON.parse(String(taskJson)) as { name: string }).name));
}

async function resetDatabase(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.work_snapshot_control,
        bpmn_platform.work_snapshot_tasks,
        bpmn_platform.work_snapshot_generation_items,
        bpmn_platform.work_audit_outbox,
        bpmn_platform.work_completions,
        bpmn_platform.work_actions,
        bpmn_platform.work_claims,
        bpmn_platform.work_processes,
        bpmn_platform.work_snapshot_generations
    `,
  });
  await runtime.query({
    text: `
      INSERT INTO bpmn_platform.work_snapshot_control (
        singleton, population_head, next_generation,
        building_generation, completed_generation
      ) VALUES (true, 0, 1, NULL, NULL);
      UPDATE bpmn_platform.work_audit_source_head SET head = 0 WHERE singleton = true
    `,
  });
}

function migrationDirectories(): readonly string[] {
  return [
    fileURLToPath(new URL("../../../../foundation/artifact-store/migrations", import.meta.url)),
    fileURLToPath(new URL("../../../definitions/migrations", import.meta.url)),
    fileURLToPath(new URL("../../../operate/migrations", import.meta.url)),
    fileURLToPath(new URL("../../migrations", import.meta.url)),
    fileURLToPath(new URL("../../../../foundation/audit/migrations", import.meta.url)),
    fileURLToPath(new URL("../../../../foundation/recovery-runtime/migrations", import.meta.url)),
  ];
}

function createRuntime(connectionString: string): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName: "work-snapshot-generation-test",
    maxConnections: 16,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 5_000,
  });
}
