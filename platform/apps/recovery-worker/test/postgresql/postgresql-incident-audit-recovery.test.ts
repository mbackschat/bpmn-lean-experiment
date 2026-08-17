import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  OperatePostgresqlRecoveryFamily,
  PostgresqlIncidentActionRepository,
  PostgresqlOperateRecoveryCandidateSource,
  PostgresqlProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  PostgresqlIncidentAuditRepository,
} from "@bpmn-lean/platform-audit";
import {
  PostgresqlIncidentAuditRecoveryStep,
} from "@bpmn-lean/platform-operate";
import {
  incidentAudit,
  incidentBinding,
} from "../../../../modules/operate/test/support/incident-action-repository-contract.ts";
import {
  processPublication,
} from "../../../../modules/operate/test/support/process-instance-repository-contract.ts";
import {
  createOperateTestRuntime,
} from "../../../../modules/operate/test/postgresql/postgresql-operate-test-support.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL incident audit recovery requires the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createOperateTestRuntime(baseUrl, "incident-audit-recovery", 4);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: [
        fileURLToPath(new URL("../../../../foundation/artifact-store/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/definitions/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/operate/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/work/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../foundation/audit/migrations", import.meta.url)),
        fileURLToPath(
          new URL("../../../../foundation/recovery-runtime/migrations", import.meta.url),
        ),
      ],
    });
  });

  after(async () => {
    await runtime.close();
  });

  test("applies a bounded incident audit prefix atomically behind the caller transaction", async () => {
    await resetDatabase(runtime);
    const processes = new PostgresqlProcessInstanceRepository(runtime);
    const source = new PostgresqlIncidentActionRepository(runtime);
    const sink = new PostgresqlIncidentAuditRepository(runtime);
    await processes.recordConfirmed(
      processPublication("incident-instance", "Incident_Process"),
    );
    for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
      const binding = incidentBinding(`incident-action-${ordinal}`);
      assert.equal(
        (await source.reserve(
          binding,
          incidentAudit(binding, "reserved", `incident-event\u0000${ordinal}`),
        )).kind,
        "reserved",
      );
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
      text: `
        UPDATE bpmn_platform.operate_incident_action_audit_outbox
        SET delivered = false WHERE ordinal = 1
      `,
    });

    const leaseLost = await new PostgresqlIncidentAuditRecoveryStep({ source, sink })
      .prepare(streamKey, 2);
    assert.equal((await auditStatus(runtime)).sinkCount, 0);
    assert.deepEqual(
      (await source.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      [1, 2, 3],
    );
    void leaseLost;

    let sinkCalls = 0;
    const rollback = await new PostgresqlIncidentAuditRecoveryStep({
      source,
      sink: {
        applyAuditRecord: async (session, item) => {
          sinkCalls += 1;
          if (sinkCalls === 2) throw new Error("forced second incident audit failure");
          return await sink.applyAuditRecord(session, item);
        },
      },
    }).prepare(streamKey, 2);
    await assert.rejects(
      runtime.transaction(rollback.apply),
      /forced second incident audit failure/u,
    );
    assert.deepEqual(await auditStatus(runtime), { sinkHead: 0, sinkCount: 0 });
    assert.deepEqual(
      (await source.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      [1, 2, 3],
    );

    const firstPrefix = await new PostgresqlIncidentAuditRecoveryStep({ source, sink })
      .prepare(streamKey, 2);
    await runtime.transaction(firstPrefix.apply);
    assert.deepEqual(await auditStatus(runtime), { sinkHead: 2, sinkCount: 2 });
    assert.deepEqual(
      (await source.listUndeliveredAuditEvents()).map(({ ordinal }) => ordinal),
      [3],
    );
    assert.deepEqual(
      (await new PostgresqlOperateRecoveryCandidateSource(runtime).listCandidateKeys(
        OperatePostgresqlRecoveryFamily.IncidentAudit,
        1,
      )).map((key) => new TextDecoder().decode(key)),
      ["stream"],
    );

    const suffix = await new PostgresqlIncidentAuditRecoveryStep({ source, sink })
      .prepare(streamKey, 2);
    await runtime.transaction(suffix.apply);
    assert.deepEqual(await auditStatus(runtime), { sinkHead: 3, sinkCount: 3 });
    assert.deepEqual(await source.listUndeliveredAuditEvents(), []);
    assert.deepEqual(
      await new PostgresqlOperateRecoveryCandidateSource(runtime).listCandidateKeys(
        OperatePostgresqlRecoveryFamily.IncidentAudit,
        1,
      ),
      [],
    );
    await runtime.query({
      text: `
        UPDATE bpmn_platform.operate_incident_action_audit_outbox
        SET event_json = ' ' || event_json WHERE ordinal = 1
      `,
    });
    await assert.rejects(
      runtime.transaction(async (session) => {
        await source.applyAuditAcknowledgement(session, exactFirst);
      }),
      { name: "OperateIncidentStoredValueError" },
    );
  });
}

const streamKey = new TextEncoder().encode("stream");

async function auditStatus(
  session: PostgresqlSession,
): Promise<Readonly<{ sinkHead: number; sinkCount: number }>> {
  const result = await session.query({
    text: `
      SELECT head::text AS sink_head,
        (SELECT COUNT(*) FROM bpmn_platform.audit_incident_events)::text AS sink_count
      FROM bpmn_platform.audit_incident_sink_head WHERE singleton = true
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
        bpmn_platform.audit_incident_events,
        bpmn_platform.operate_incident_action_audit_outbox,
        bpmn_platform.operate_incident_actions,
        bpmn_platform.operate_process_instances
      CASCADE
    `,
  });
  await runtime.query({
    text: `
      UPDATE bpmn_platform.audit_incident_sink_head SET head = 0 WHERE singleton = true;
      UPDATE bpmn_platform.operate_incident_action_audit_source_head
      SET head = 0 WHERE singleton = true
    `,
  });
}
