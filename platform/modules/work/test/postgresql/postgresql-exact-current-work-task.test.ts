import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import type {
  PublicWorkTask,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
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
import { runPostgresqlMigrations } from "@bpmn-lean/platform-postgresql-runtime/migrations";

import { ExactCurrentWorkTaskReader } from "@bpmn-lean/platform-work";
import {
  PostgresqlWorkRecoveryCandidateSource,
  WorkPostgresqlRecoveryFamily,
} from "@bpmn-lean/platform-work";
import { PostgresqlWorkRepository } from "@bpmn-lean/platform-work";
import { PostgresqlWorkSnapshotReader } from "@bpmn-lean/platform-work";
import {
  decodeWorkSnapshotCandidateKey,
  PostgresqlWorkSnapshotRecoveryStep,
  PostgresqlWorkSnapshotStepKind,
} from "@bpmn-lean/platform-work";
import { PostgresqlWorkSnapshotService } from "@bpmn-lean/platform-work";
import { WorkAuditOutboxService } from "@bpmn-lean/platform-work";
import { WorkMutationService } from "@bpmn-lean/platform-work";
import { WorkTaskDetailService } from "@bpmn-lean/platform-work";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL exact current Work task requires the explicit real-database witness", {
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

  test("targets one locator, blocks stale unseen mutations, and skips current reads for retained actions", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    for (const processInstanceId of ["other-host", "own\u0000host"]) {
      await repository.recordConfirmedProcessInstance(publication(processInstanceId));
    }
    const source = new PostgresqlWorkRecoveryCandidateSource(runtime);
    const candidates = await source.listCandidateKeys(
      WorkPostgresqlRecoveryFamily.WorkSnapshot,
      10,
      5_000,
    );
    for (const candidateKey of candidates) {
      const processInstanceId = decodeWorkSnapshotCandidateKey(candidateKey);
      const task = openTask(processInstanceId);
      const prepared = await new PostgresqlWorkSnapshotRecoveryStep({
        runtime,
        gateway: {
          observeOpenWork: async () => ({
            status: "open",
            openUserTasks: [structuredClone(task)],
          }),
        },
        catalogs: { readHumanTaskCatalog: async () => null },
        maxTasks: 10,
      }).prepare(candidateKey);
      assert.equal(prepared.kind, PostgresqlWorkSnapshotStepKind.Complete);
      if (prepared.kind !== PostgresqlWorkSnapshotStepKind.Complete) assert.fail("unreachable");
      await runtime.transaction(prepared.apply);
    }

    const counted = countingRuntime(runtime);
    const actors = new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] });
    const authorization = new TaskAuthorizationPolicy();
    const snapshot = new PostgresqlWorkSnapshotService({
      reader: new PostgresqlWorkSnapshotReader({
        runtime: counted.runtime,
        maxAgeMs: 5_000,
        maxProcesses: 10,
        maxTasks: 10,
      }),
      actors,
      authorization,
    });
    const currentTasks = new Map<string, PublicWorkTask["task"]>([
      ["other-host", openTask("other-host")],
      ["own\u0000host", openTask("own\u0000host")],
    ]);
    const detailCalls: Array<Readonly<{
      locator: string;
      hostingProcessInstanceId: string;
      inputVariableNames: readonly string[];
    }>> = [];
    let completionCalls = 0;
    const gateway = {
      readWorkDetail: async (request: Readonly<{
        locator: string;
        hostingProcessInstanceId: string;
        taskId: PublicWorkTask["task"]["id"];
        inputVariableNames: readonly string[];
      }>) => {
        detailCalls.push({
          locator: request.locator,
          hostingProcessInstanceId: request.hostingProcessInstanceId,
          inputVariableNames: [...request.inputVariableNames],
        });
        const current = currentTasks.get(request.hostingProcessInstanceId);
        return current === undefined
          ? { status: "notFound" as const }
          : {
              status: "found" as const,
              detail: {
                task: structuredClone(current),
                inputVariables: request.inputVariableNames.length === 0
                  ? []
                  : [{ name: "approved", value: { kind: "boolean", value: false } }],
              },
            };
      },
      completeWork: async (request: Readonly<{
        stimulus: Readonly<{ commandId: string }>;
      }>) => {
        completionCalls += 1;
        return {
          kind: "semantic" as const,
          commandId: request.stimulus.commandId,
          outcome: "committed" as const,
        };
      },
    };
    const exact = new ExactCurrentWorkTaskReader({
      candidates: snapshot,
      gateway,
      actors,
      authorization,
      catalogs: { readHumanTaskCatalog: async () => null },
    });
    const ownTask = openTask("own\u0000host");

    assert.equal(
      (await exact.findVisibleTask(ownTask.id))?.registration.instance.processInstanceId,
      "own\u0000host",
    );
    assert.equal(counted.queries(), 1);
    assert.deepEqual(detailCalls, [{
      locator: "private:own\u0000host",
      hostingProcessInstanceId: "own\u0000host",
      inputVariableNames: [],
    }]);

    const outbox = new WorkAuditOutboxService(repository, {
      record: async () => 1,
    });
    let eventOrdinal = 0;
    const mutations = new WorkMutationService({
      work: exact,
      details: new WorkTaskDetailService({ work: exact, gateway }),
      actors,
      repository,
      gateway,
      outbox,
      auditEvents: {
        create: (
          input: Omit<WorkAuditEvent, "eventId" | "recordedAt">,
        ): WorkAuditEvent => ({
          ...structuredClone(input),
          eventId: `event-${++eventOrdinal}`,
          recordedAt: "2026-08-17T10:00:00.000Z",
        }),
      },
    });

    currentTasks.delete("own\u0000host");
    const readsBeforeStaleMutations = detailCalls.length;
    assert.deepEqual(await mutations.claimTask(ownTask.id, {
      actionId: "stale-claim",
      expectedGeneration: 0,
    }), { kind: "notFound" });
    assert.deepEqual(await mutations.completeTask("stale-completion", {
      taskId: ownTask.id,
      expectedClaimGeneration: 0,
      submittedValues: [{ key: "approved", value: { kind: "boolean", value: true } }],
    }), { kind: "notFound" });
    assert.equal(await scalar(runtime, "SELECT count(*)::text AS value FROM bpmn_platform.work_claims"), "0");
    assert.equal(await scalar(runtime, "SELECT count(*)::text AS value FROM bpmn_platform.work_completions"), "0");
    assert.equal(await scalar(runtime, "SELECT count(*)::text AS value FROM bpmn_platform.work_audit_outbox"), "0");
    assert.equal(completionCalls, 0);
    assert.equal(detailCalls.length, readsBeforeStaleMutations + 2);

    currentTasks.set("own\u0000host", ownTask);
    const readsBeforeClaim = detailCalls.length;
    const claimed = await mutations.claimTask(ownTask.id, {
      actionId: "claim-1",
      expectedGeneration: 0,
    });
    assert.equal(claimed.kind, "claimed");
    assert.equal(detailCalls.length, readsBeforeClaim + 1);
    const readsAfterClaim = detailCalls.length;
    assert.equal(
      (await mutations.claimTask(ownTask.id, {
        actionId: "claim-1",
        expectedGeneration: 0,
      })).kind,
      "idempotent",
    );
    assert.equal(detailCalls.length, readsAfterClaim);

    const completionRequest = {
      taskId: ownTask.id,
      expectedClaimGeneration: 1,
      submittedValues: [{
        key: "approved",
        value: { kind: "boolean" as const, value: true },
      }],
    } as const;
    const readsBeforeCompletion = detailCalls.length;
    const completed = await mutations.completeTask("complete-1", completionRequest);
    assert.equal(
      completed.kind === "result" ? completed.result.state : completed.kind,
      "committed",
    );
    assert.equal(detailCalls.length, readsBeforeCompletion + 1);
    assert.deepEqual(detailCalls.at(-1)?.inputVariableNames, ["approved"]);
    const readsAfterCompletion = detailCalls.length;
    assert.deepEqual(await mutations.completeTask("complete-1", completionRequest), completed);
    assert.equal(detailCalls.length, readsAfterCompletion);
    assert.equal(completionCalls, 1);
  });
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

function openTask(processInstanceId: string): PublicWorkTask["task"] {
  return {
    id: { processInstanceId, elementId: "Review\u0000task", activation: 1 },
    name: "Review",
    state: "active",
    metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: "approved", type: "boolean" }] },
    },
  };
}

function countingRuntime(runtime: PostgresqlRuntime) {
  let queryCount = 0;
  return {
    runtime: {
      query: async <Row extends PostgresqlRow = PostgresqlRow>(
        query: PostgresqlQuery,
      ): Promise<PostgresqlQueryResult<Row>> => {
        queryCount += 1;
        return await runtime.query<Row>(query);
      },
      transaction: async <Result>(
        run: (session: PostgresqlSession) => Promise<Result>,
      ): Promise<Result> => await runtime.transaction(run),
      withDedicatedSession: async <Result>(
        run: (session: PostgresqlSession) => Promise<Result>,
      ): Promise<Result> => await runtime.withDedicatedSession(run),
      databaseClockEpochMs: async () => await runtime.databaseClockEpochMs(),
      close: async () => undefined,
    } satisfies PostgresqlRuntime,
    queries: () => queryCount,
  };
}

async function scalar(runtime: PostgresqlRuntime, text: string): Promise<string> {
  const result = await runtime.query({ text });
  return String(result.rows[0]?.value);
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
    applicationName: "exact-current-work-task-test",
    maxConnections: 16,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 5_000,
  });
}
