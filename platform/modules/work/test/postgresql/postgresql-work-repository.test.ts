import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

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
import {
  PostgresqlWorkRepository,
  WorkRepositoryIntegrityError,
  WorkRepositoryStoredValueError,
} from "@bpmn-lean/platform-work";
import type {
  WorkClaimTransitionInput,
  WorkTaskReference,
} from "@bpmn-lean/platform-work";

import {
  claimInput,
  completionAudit,
  completionBinding,
  publication,
  releaseInput,
  registerWorkRepositoryContract,
  task,
} from "../support/work-repository-contract.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Work repository requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createTestRuntime(baseUrl, "work-contract", 24);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: [
        fileURLToPath(new URL("../../../../foundation/artifact-store/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../definitions/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../operate/migrations", import.meta.url)),
        fileURLToPath(new URL("../../migrations", import.meta.url)),
      ],
    });
  });

  after(async () => {
    await runtime.close();
  });

  registerWorkRepositoryContract("PostgreSQL Work repository", async () => {
    await resetDatabase(runtime);
    return {
      first: new PostgresqlWorkRepository(runtime),
      second: new PostgresqlWorkRepository(runtime),
      dispose: async () => undefined,
    };
  });

  test("rolled-back Work action consumes no audit ordinal and no state", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication);
    await runtime.query({
      text: `
        CREATE OR REPLACE FUNCTION bpmn_platform.reject_work_outbox_insert()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'injected Work outbox failure';
        END
        $$
      `,
    });
    await runtime.query({
      text: `
        CREATE TRIGGER reject_work_outbox_insert
        BEFORE INSERT ON bpmn_platform.work_audit_outbox
        FOR EACH ROW EXECUTE FUNCTION bpmn_platform.reject_work_outbox_insert()
      `,
    });
    try {
      await assert.rejects(
        repository.claimTask(claimInput("rollback-action", "rollback-actor", 0, "rollback")),
        /injected Work outbox failure/u,
      );
    } finally {
      await runtime.query({
        text: "DROP TRIGGER reject_work_outbox_insert ON bpmn_platform.work_audit_outbox",
      });
    }
    assert.deepEqual(await repository.getClaim(task), { claimGeneration: 0, claim: null });
    assert.equal(await repository.getClaimReleaseAction("rollback-action"), null);
    assert.deepEqual(await repository.listUndeliveredAuditEvents(), []);
    assert.equal(await readAuditSourceHead(runtime), 0);
    assert.equal(
      (await repository.claimTask(claimInput("after-rollback", "actor", 0, "after"))).kind,
      "claimed",
    );
    assert.deepEqual(
      (await repository.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      [1],
    );
    assert.equal(await readAuditSourceHead(runtime), 1);
  });

  test("concurrent committed actions append one exact audit prefix", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication);
    const inputs = Array.from({ length: 12 }, (_, index) =>
      claimForTask(index));
    const results = await Promise.all(
      inputs.map(async (input) =>
        await new PostgresqlWorkRepository(runtime).claimTask(input)),
    );
    assert.ok(results.every(({ kind }) => kind === "claimed"));
    assert.deepEqual(
      (await repository.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      Array.from({ length: inputs.length }, (_, index) => index + 1),
    );
    assert.equal(await readAuditSourceHead(runtime), inputs.length);
  });

  test("concurrent exact action retries classify from the retained winner", async () => {
    await resetDatabase(runtime);
    const claimRuntime = missingReadBarrier(runtime, "work_actions");
    const first = new PostgresqlWorkRepository(claimRuntime);
    const second = new PostgresqlWorkRepository(claimRuntime);
    await first.recordConfirmedProcessInstance(publication);
    const claim = claimInput("exact-claim", "actor", 0, "exact-claim");
    assert.deepEqual(
      (await Promise.all([first.claimTask(claim), second.claimTask(claim)]))
        .map(({ kind }) => kind).sort(),
      ["claimed", "idempotent"],
    );
    const release = releaseInput("exact-release", "actor", 1, "exact-release");
    const releaseRuntime = missingReadBarrier(runtime, "work_actions");
    assert.deepEqual(
      (await Promise.all([
        new PostgresqlWorkRepository(releaseRuntime).releaseTask(release),
        new PostgresqlWorkRepository(releaseRuntime).releaseTask(release),
      ]))
        .map(({ kind }) => kind).sort(),
      ["idempotent", "released"],
    );

    await resetDatabase(runtime);
    await first.recordConfirmedProcessInstance(publication);
    await first.claimTask(claimInput("completion-claim", "actor\u0000a", 0, "completion-claim"));
    const binding = completionBinding("exact-completion");
    const reservation = {
      binding,
      audit: completionAudit(binding, "reserved"),
    };
    const completionRuntime = missingReadBarrier(runtime, "work_completions");
    assert.deepEqual(
      (await Promise.all([
        new PostgresqlWorkRepository(completionRuntime).reserveCompletion(reservation),
        new PostgresqlWorkRepository(completionRuntime).reserveCompletion(reservation),
      ])).map(({ kind }) => kind).sort(),
      ["reserved", "retained"],
    );
  });

  test("privileged canonical JSON and redundant-column corruption fail closed", async () => {
    await resetDatabase(runtime);
    const repository = new PostgresqlWorkRepository(runtime);
    await repository.recordConfirmedProcessInstance(publication);
    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_processes
        SET public_instance_json = regexp_replace(public_instance_json, '^\\{', '{ ')
        WHERE process_instance_id = $1
      `,
      values: [Buffer.from(publication.instance.processInstanceId, "utf8")],
    });
    await assert.rejects(
      repository.listProcessRegistrations(),
      WorkRepositoryStoredValueError,
    );

    await resetDatabase(runtime);
    await repository.recordConfirmedProcessInstance(publication);
    await repository.claimTask(claimInput("corrupt-action", "actor", 0, "corrupt"));
    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_actions
        SET result_json = regexp_replace(result_json, '^\\{', '{ ')
        WHERE action_id = $1
      `,
      values: [Buffer.from("corrupt-action", "utf8")],
    });
    await assert.rejects(
      repository.getClaimReleaseAction("corrupt-action"),
      WorkRepositoryStoredValueError,
    );

    await resetDatabase(runtime);
    await repository.recordConfirmedProcessInstance(publication);
    await repository.claimTask(claimInput("completion-claim", "actor\u0000a", 0, "completion-claim"));
    const binding = completionBinding("corrupt-completion");
    await repository.reserveCompletion({
      binding,
      audit: completionAudit(binding, "reserved"),
    });
    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_completions
        SET binding_json = regexp_replace(binding_json, '^\\{', '{ ')
        WHERE action_id = $1
      `,
      values: [Buffer.from(binding.actionId, "utf8")],
    });
    await assert.rejects(
      repository.getCompletionAction(binding.actionId),
      WorkRepositoryStoredValueError,
    );

    await resetDatabase(runtime);
    await repository.recordConfirmedProcessInstance(publication);
    await repository.claimTask(claimInput("corrupt-outbox", "actor", 0, "corrupt-outbox"));
    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_audit_outbox
        SET event_json = regexp_replace(event_json, '^\\{', '{ ')
        WHERE ordinal = 1
      `,
    });
    await assert.rejects(
      repository.listUndeliveredAuditEvents(),
      WorkRepositoryStoredValueError,
    );

    await resetDatabase(runtime);
    await repository.recordConfirmedProcessInstance(publication);
    await repository.claimTask(claimInput("redundant-action", "actor", 0, "redundant"));
    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_audit_outbox
        SET action_id = $1
        WHERE ordinal = 1
      `,
      values: [Buffer.from("redundant-drift", "utf8")],
    });
    await assert.rejects(
      repository.listUndeliveredAuditEvents(),
      WorkRepositoryIntegrityError,
    );
  });
}

function missingReadBarrier(
  runtime: PostgresqlRuntime,
  relation: "work_actions" | "work_completions",
): PostgresqlRuntime {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const wrap = (session: PostgresqlSession): PostgresqlSession => {
    let intercepted = false;
    return {
      query: async <Row extends PostgresqlRow = PostgresqlRow>(
        query: PostgresqlQuery,
      ): Promise<PostgresqlQueryResult<Row>> => {
        const result = await session.query<Row>(query);
        if (!intercepted &&
            result.rows.length === 0 &&
            query.text.includes(`FROM bpmn_platform.${relation}`) &&
            query.text.includes("FOR UPDATE")) {
          intercepted = true;
          arrivals += 1;
          if (arrivals === 2) release?.();
          await barrier;
        }
        return result;
      },
    };
  };
  return {
    query: async <Row extends PostgresqlRow = PostgresqlRow>(
      query: PostgresqlQuery,
    ): Promise<PostgresqlQueryResult<Row>> => await runtime.query<Row>(query),
    transaction: async <Result>(
      run: (session: PostgresqlSession) => Promise<Result>,
    ): Promise<Result> => await runtime.transaction(async (session) => await run(wrap(session))),
    withDedicatedSession: async <Result>(
      run: (session: PostgresqlSession) => Promise<Result>,
    ): Promise<Result> => await runtime.withDedicatedSession(run),
    databaseClockEpochMs: async (): Promise<number> => await runtime.databaseClockEpochMs(),
    close: async (): Promise<void> => await runtime.close(),
  };
}

function createTestRuntime(
  connectionString: string,
  applicationName: string,
  maxConnections: number,
): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName,
    maxConnections,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 5_000,
    statementTimeoutMs: 5_000,
    lockTimeoutMs: 3_000,
    idleInTransactionSessionTimeoutMs: 5_000,
  });
}

async function resetDatabase(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.transaction(async (session) => {
    await session.query({
      text: `
        TRUNCATE
          bpmn_platform.work_audit_outbox,
          bpmn_platform.work_completions,
          bpmn_platform.work_actions,
          bpmn_platform.work_claims,
          bpmn_platform.work_processes
      `,
    });
    await session.query({
      text: `
        UPDATE bpmn_platform.work_audit_source_head
        SET head = 0 WHERE singleton = true
      `,
    });
  });
}

async function readAuditSourceHead(runtime: PostgresqlRuntime): Promise<number> {
  const result = await runtime.query({
    text: `
      SELECT head::text AS head
      FROM bpmn_platform.work_audit_source_head
      WHERE singleton = true
    `,
  });
  const head = result.rows[0]?.head;
  if (typeof head !== "string") throw new TypeError("Work audit source head is missing");
  return Number(head);
}

function claimForTask(index: number): WorkClaimTransitionInput {
  const exactTask: WorkTaskReference = {
    hostingProcessInstanceId: task.hostingProcessInstanceId,
    taskId: {
      processInstanceId: `${task.taskId.processInstanceId}-${index}`,
      elementId: `${task.taskId.elementId}-${index}`,
      activation: 1,
    },
  };
  const input = claimInput(`parallel-${index}`, `actor-${index}`, 0, `parallel-${index}`);
  return {
    ...input,
    task: exactTask,
    audit: {
      claimed: { ...input.audit.claimed, taskId: exactTask.taskId },
      idempotent: { ...input.audit.idempotent, taskId: exactTask.taskId },
      conflict: { ...input.audit.conflict, taskId: exactTask.taskId },
    },
  };
}
