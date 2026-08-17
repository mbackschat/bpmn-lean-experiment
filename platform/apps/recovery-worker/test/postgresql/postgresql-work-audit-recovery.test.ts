import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";
import {
  PostgresqlWorkRecoveryCandidateSource,
  PostgresqlWorkRepository,
  WorkPostgresqlRecoveryFamily,
} from "@bpmn-lean/platform-work";
import type {
  WorkClaimTransitionInput,
  WorkTaskReference,
} from "@bpmn-lean/platform-work";

import {
  PostgresqlAuditRepository,
} from "@bpmn-lean/platform-audit";
import {
  PostgresqlWorkAuditRecoveryStep,
} from "@bpmn-lean/platform-work";
import {
  claimInput,
  publication,
  task,
} from "../../../../modules/work/test/support/work-repository-contract.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Work audit recovery requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createTestRuntime(baseUrl);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: [
        fileURLToPath(new URL("../../../../foundation/artifact-store/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/definitions/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/operate/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/work/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../foundation/audit/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../foundation/recovery-runtime/migrations", import.meta.url)),
      ],
    });
  });

  after(async () => {
    await runtime.close();
  });

  test("applies a bounded Work audit prefix atomically behind the caller transaction", async () => {
    await resetDatabase(runtime);
    const source = new PostgresqlWorkRepository(runtime);
    const sink = new PostgresqlAuditRepository(runtime);
    await source.recordConfirmedProcessInstance(publication);
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      assert.equal((await source.claimTask(workClaim(ordinal))).kind, "claimed");
    }
    const exactFirst = structuredClone((await source.listUndeliveredAuditEvents())[0]!);
    assert.match(exactFirst.event.eventId, /\u0000/u);
    const mutableFirst = structuredClone(exactFirst);
    await runtime.transaction(async (session) => {
      const acknowledgement = source.applyAuditAcknowledgement(session, mutableFirst);
      (mutableFirst.event as { eventId: string }).eventId = "mutated-after-invocation";
      await acknowledgement;
    });
    await runtime.transaction(async (session) => {
      await source.applyAuditAcknowledgement(session, exactFirst);
    });
    await runtime.query({
      text: "UPDATE bpmn_platform.work_audit_outbox SET delivered = false WHERE ordinal = 1",
    });

    const leaseLost = await new PostgresqlWorkAuditRecoveryStep({ source, sink })
      .prepare(streamKey, 2);
    assert.equal((await auditStatus(runtime)).sinkCount, 0);
    assert.deepEqual(
      (await source.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      [1, 2, 3],
    );
    void leaseLost;

    let sinkCalls = 0;
    const rollback = await new PostgresqlWorkAuditRecoveryStep({
      source,
      sink: {
        applyAuditRecord: async (session, item) => {
          sinkCalls += 1;
          if (sinkCalls === 2) throw new Error("forced second Work audit failure");
          return await sink.applyAuditRecord(session, item);
        },
      },
    }).prepare(streamKey, 2);
    await assert.rejects(
      runtime.transaction(rollback.apply),
      /forced second Work audit failure/u,
    );
    assert.deepEqual(await auditStatus(runtime), { sinkHead: 0, sinkCount: 0 });
    assert.deepEqual(
      (await source.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      [1, 2, 3],
    );

    const firstPrefix = await new PostgresqlWorkAuditRecoveryStep({ source, sink })
      .prepare(streamKey, 2);
    await runtime.transaction(firstPrefix.apply);
    assert.deepEqual(await auditStatus(runtime), { sinkHead: 2, sinkCount: 2 });
    assert.deepEqual(
      (await source.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      [3],
    );
    assert.deepEqual(
      (await new PostgresqlWorkRecoveryCandidateSource(runtime).listCandidateKeys(
        WorkPostgresqlRecoveryFamily.WorkAudit,
        1,
      )).map((key) => new TextDecoder().decode(key)),
      ["stream"],
    );

    const suffix = await new PostgresqlWorkAuditRecoveryStep({ source, sink })
      .prepare(streamKey, 2);
    await runtime.transaction(suffix.apply);
    assert.deepEqual(await auditStatus(runtime), { sinkHead: 3, sinkCount: 3 });
    assert.deepEqual(await source.listUndeliveredAuditEvents(), []);
    assert.deepEqual(
      await new PostgresqlWorkRecoveryCandidateSource(runtime).listCandidateKeys(
        WorkPostgresqlRecoveryFamily.WorkAudit,
        1,
      ),
      [],
    );
    await runtime.query({
      text: `
        UPDATE bpmn_platform.work_audit_outbox
        SET event_json = ' ' || event_json WHERE ordinal = 1
      `,
    });
    await assert.rejects(
      runtime.transaction(async (session) => {
        await source.applyAuditAcknowledgement(session, exactFirst);
      }),
      { name: "WorkRepositoryStoredValueError" },
    );
  });
}

const streamKey = new TextEncoder().encode("stream");

function workClaim(ordinal: number): WorkClaimTransitionInput {
  const base = claimInput(
    `work-action-${ordinal}`,
    `work-actor-${ordinal}`,
    0,
    `work-event\u0000${ordinal}`,
  );
  const exactTask: WorkTaskReference = {
    hostingProcessInstanceId: task.hostingProcessInstanceId,
    taskId: {
      processInstanceId: `work-task-${ordinal}`,
      elementId: `Review-${ordinal}`,
      activation: 1,
    },
  };
  const retarget = <Event extends typeof base.audit.claimed>(event: Event): Event => ({
    ...event,
    taskId: exactTask.taskId,
  });
  return {
    ...base,
    task: exactTask,
    audit: {
      claimed: retarget(base.audit.claimed),
      idempotent: retarget(base.audit.idempotent),
      conflict: retarget(base.audit.conflict),
    },
  };
}

function createTestRuntime(connectionString: string): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName: "work-audit-recovery-test",
    maxConnections: 4,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 4_000,
    statementTimeoutMs: 4_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 4_000,
  });
}

async function auditStatus(
  session: PostgresqlSession,
): Promise<Readonly<{ sinkHead: number; sinkCount: number }>> {
  const result = await session.query({
    text: `
      SELECT head::text AS sink_head,
        (SELECT COUNT(*) FROM bpmn_platform.audit_work_events)::text AS sink_count
      FROM bpmn_platform.audit_work_sink_head WHERE singleton = true
    `,
  });
  return {
    sinkHead: Number(result.rows[0]?.sink_head),
    sinkCount: Number(result.rows[0]?.sink_count),
  };
}

async function resetDatabase(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.audit_work_events,
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
      UPDATE bpmn_platform.audit_work_sink_head SET head = 0 WHERE singleton = true;
      UPDATE bpmn_platform.work_audit_source_head SET head = 0 WHERE singleton = true;
      INSERT INTO bpmn_platform.work_snapshot_control (
        singleton, population_head, next_generation,
        building_generation, completed_generation
      ) VALUES (true, 0, 1, NULL, NULL)
    `,
  });
}
