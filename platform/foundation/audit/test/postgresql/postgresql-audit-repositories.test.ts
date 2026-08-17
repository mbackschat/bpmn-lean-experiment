import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  PostgresqlAuditRepository,
  PostgresqlIncidentAuditRepository,
} from "@bpmn-lean/platform-audit";
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
  incidentItem,
  registerAuditRepositoryContract,
  workItem,
} from "../support/audit-repository-contract.ts";
import type {
  AuditRepositoryHarness,
} from "../support/audit-repository-contract.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL audit repositories require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createTestRuntime(baseUrl);

  before(async () => {
    await runPostgresqlMigrations({
      connectionString: baseUrl,
      migrationDirectories: [
        fileURLToPath(new URL("../../../artifact-store/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/definitions/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/operate/migrations", import.meta.url)),
        fileURLToPath(new URL("../../../../modules/work/migrations", import.meta.url)),
        fileURLToPath(new URL("../../migrations", import.meta.url)),
        fileURLToPath(new URL("../../../recovery-runtime/migrations", import.meta.url)),
      ],
    });
  });

  after(async () => {
    await runtime.close();
  });

  registerAuditRepositoryContract(
    "PostgreSQL audit repositories",
    async () => await createHarness(runtime),
  );

  test("reads fail closed while either exact source stream is ahead", async () => {
    const harness = await createHarness(runtime);
    try {
      const work = workItem(1);
      const incident = incidentItem(1);
      await harness.publishWork(work);
      await harness.publishIncident(incident);
      await assert.rejects(
        harness.work.search({ actorId: "actor", limit: 10 }),
        /unavailable/u,
      );
      await assert.rejects(harness.incident.search({ limit: 10 }), /unavailable/u);
      await harness.work.record(work);
      await harness.incident.record(incident);
      assert.equal((await harness.work.search({ actorId: "actor", limit: 10 })).length, 1);
      assert.equal((await harness.incident.search({ limit: 10 })).length, 1);
    } finally {
      await harness.dispose();
    }
  });

  test("applied retries revalidate both retained producer rows", async () => {
    const harness = await createHarness(runtime);
    try {
      const work = workItem(1);
      const incident = incidentItem(1);
      await harness.publishWork(work);
      await harness.publishIncident(incident);
      await harness.work.record(work);
      await harness.incident.record(incident);
      await runtime.query({
        text: "DELETE FROM bpmn_platform.work_audit_outbox WHERE ordinal = 1",
      });
      await runtime.query({
        text: "DELETE FROM bpmn_platform.operate_incident_action_audit_outbox WHERE ordinal = 1",
      });
      await assert.rejects(
        harness.work.search({ actorId: "actor", limit: 10 }),
        /unavailable/u,
      );
      await assert.rejects(harness.incident.search({ limit: 10 }), /unavailable/u);
      await assert.rejects(harness.work.record(work), /unavailable/u);
      await assert.rejects(harness.incident.record(incident), /unavailable/u);
    } finally {
      await harness.dispose();
    }
  });

  test("independent concurrent exact deliveries converge for both streams", async () => {
    const harness = await createHarness(runtime);
    try {
      const work = workItem(1);
      const incident = incidentItem(1);
      await harness.publishWork(work);
      await harness.publishIncident(incident);
      const workRepositories = Array.from({ length: 8 }, () => new PostgresqlAuditRepository(runtime));
      const incidentRepositories = Array.from(
        { length: 8 },
        () => new PostgresqlIncidentAuditRepository(runtime),
      );
      assert.deepEqual(
        await Promise.all(workRepositories.map(async (repository) => await repository.record(work))),
        Array.from({ length: 8 }, () => 1),
      );
      assert.deepEqual(
        await Promise.all(incidentRepositories.map(async (repository) => await repository.record(incident))),
        Array.from({ length: 8 }, () => 1),
      );
    } finally {
      await harness.dispose();
    }
  });

  test("concurrent distinct suffix attempts cannot falsely skip either stream head", async () => {
    const harness = await createHarness(runtime);
    try {
      const first = workItem(1);
      const second = workItem(2);
      await harness.publishWork(first);
      await harness.publishWork(second);
      const results = await Promise.allSettled([
        new PostgresqlAuditRepository(runtime).record(first),
        new PostgresqlAuditRepository(runtime).record(second),
      ]);
      assert.equal(results[0]?.status, "fulfilled");
      if (results[1]?.status === "rejected") {
        await assert.rejects(
          harness.work.search({ actorId: "actor", limit: 10 }),
          /unavailable/u,
        );
        assert.equal(await harness.work.record(second), 2);
      }
      assert.deepEqual(
        (await harness.work.search({ actorId: "actor", limit: 10 })).map(({ ordinal }) => ordinal),
        [1, 2],
      );
      const firstIncident = incidentItem(1);
      const secondIncident = incidentItem(2);
      await harness.publishIncident(firstIncident);
      await harness.publishIncident(secondIncident);
      const incidentResults = await Promise.allSettled([
        new PostgresqlIncidentAuditRepository(runtime).record(firstIncident),
        new PostgresqlIncidentAuditRepository(runtime).record(secondIncident),
      ]);
      assert.equal(incidentResults[0]?.status, "fulfilled");
      if (incidentResults[1]?.status === "rejected") {
        await assert.rejects(harness.incident.search({ limit: 10 }), /unavailable/u);
        assert.equal(await harness.incident.record(secondIncident), 2);
      }
      assert.deepEqual(
        (await harness.incident.search({ limit: 10 })).map(({ ordinal }) => ordinal),
        [1, 2],
      );
    } finally {
      await harness.dispose();
    }
  });

  test("failed sink insertions roll back both exact ordinals and heads", async () => {
    const harness = await createHarness(runtime);
    try {
      const item = workItem(1);
      await harness.publishWork(item);
      await runtime.query({
        text: `
          CREATE OR REPLACE FUNCTION bpmn_platform.reject_audit_work_insert()
          RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'injected audit sink failure';
          END
          $$
        `,
      });
      await runtime.query({
        text: `
          CREATE TRIGGER reject_audit_work_insert
          BEFORE INSERT ON bpmn_platform.audit_work_events
          FOR EACH ROW EXECUTE FUNCTION bpmn_platform.reject_audit_work_insert()
        `,
      });
      await assert.rejects(harness.work.record(item), /injected audit sink failure/u);
      await runtime.query({
        text: "DROP TRIGGER reject_audit_work_insert ON bpmn_platform.audit_work_events",
      });
      const status = await runtime.query<Readonly<Record<string, unknown>> & Readonly<{
        head: string;
        count: string;
      }>>({
        text: `
          SELECT head::text AS head,
            (SELECT COUNT(*) FROM bpmn_platform.audit_work_events)::text AS count
          FROM bpmn_platform.audit_work_sink_head
        `,
      });
      assert.deepEqual(status.rows, [{ head: "0", count: "0" }]);
      assert.equal(await harness.work.record(item), 1);
      const incident = incidentItem(1);
      await harness.publishIncident(incident);
      await runtime.query({
        text: `
          CREATE OR REPLACE FUNCTION bpmn_platform.reject_audit_incident_insert()
          RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'injected incident audit sink failure';
          END
          $$
        `,
      });
      await runtime.query({
        text: `
          CREATE TRIGGER reject_audit_incident_insert
          BEFORE INSERT ON bpmn_platform.audit_incident_events
          FOR EACH ROW EXECUTE FUNCTION bpmn_platform.reject_audit_incident_insert()
        `,
      });
      await assert.rejects(
        harness.incident.record(incident),
        /injected incident audit sink failure/u,
      );
      await runtime.query({
        text: "DROP TRIGGER reject_audit_incident_insert ON bpmn_platform.audit_incident_events",
      });
      const incidentStatus = await runtime.query<Readonly<Record<string, unknown>> & Readonly<{
        head: string;
        count: string;
      }>>({
        text: `
          SELECT head::text AS head,
            (SELECT COUNT(*) FROM bpmn_platform.audit_incident_events)::text AS count
          FROM bpmn_platform.audit_incident_sink_head
        `,
      });
      assert.deepEqual(incidentStatus.rows, [{ head: "0", count: "0" }]);
      assert.equal(await harness.incident.record(incident), 1);
    } finally {
      await runtime.query({
        text: "DROP TRIGGER IF EXISTS reject_audit_work_insert ON bpmn_platform.audit_work_events",
      });
      await runtime.query({
        text: "DROP TRIGGER IF EXISTS reject_audit_incident_insert ON bpmn_platform.audit_incident_events",
      });
      await harness.dispose();
    }
  });

  test("each PostgreSQL audit read is one statement and adapters leave runtime open", async () => {
    const harness = await createHarness(runtime);
    try {
      const work = workItem(1);
      const incident = incidentItem(1);
      await harness.publishWork(work);
      await harness.publishIncident(incident);
      await harness.work.record(work);
      await harness.incident.record(incident);
      let queries = 0;
      const counting = {
        query: async <Row extends Readonly<Record<string, unknown>>>(query: Readonly<{
          text: string;
          values?: readonly unknown[];
        }>) => {
          queries += 1;
          return await runtime.query<Row>(query);
        },
        transaction: async <Result>(run: (session: PostgresqlSession) => Promise<Result>) =>
          await runtime.transaction(run),
      };
      const workRepository = new PostgresqlAuditRepository(counting);
      const incidentRepository = new PostgresqlIncidentAuditRepository(counting);
      queries = 0;
      await workRepository.search({ actorId: "actor", limit: 10 });
      assert.equal(queries, 1);
      queries = 0;
      await workRepository.snapshotHostingProcessInstance("host", {
        maxEvents: 10,
        maxStoredBytes: 10_000,
      });
      assert.equal(queries, 1);
      queries = 0;
      await incidentRepository.search({ limit: 10 });
      assert.equal(queries, 1);
      queries = 0;
      await incidentRepository.snapshotHostingProcessInstance("host", {
        maxEvents: 10,
        maxStoredBytes: 10_000,
      });
      assert.equal(queries, 1);
      assert.deepEqual((await runtime.query({ text: "SELECT 1 AS alive" })).rows, [{ alive: 1 }]);
    } finally {
      await harness.dispose();
    }
  });

  test("privileged source, sink, canonical, and redundant corruption fails reads", async () => {
    const harness = await createHarness(runtime);
    try {
      const work = workItem(1);
      const incident = incidentItem(1);
      await harness.publishWork(work);
      await harness.publishIncident(incident);
      await harness.work.record(work);
      await harness.incident.record(incident);
      await runtime.query({
        text: "UPDATE bpmn_platform.audit_work_events SET actor_id = decode('636f7272757074', 'hex') WHERE ordinal = 1",
      });
      await runtime.query({
        text: "UPDATE bpmn_platform.operate_incident_action_audit_outbox SET event_json = ' ' || event_json WHERE ordinal = 1",
      });
      await assert.rejects(
        harness.work.search({ actorId: "corrupt", limit: 10 }),
        /stored audit|unavailable/u,
      );
      await assert.rejects(harness.incident.search({ limit: 10 }), /unavailable/u);
      await runtime.query({
        text: "UPDATE bpmn_platform.operate_incident_action_audit_outbox SET event_json = $1 WHERE ordinal = 1",
        values: [JSON.stringify(incident.event)],
      });
      await runtime.query({
        text: "UPDATE bpmn_platform.audit_incident_events SET event_json = ' ' || event_json WHERE ordinal = 1",
      });
      await assert.rejects(harness.incident.search({ limit: 10 }), /unavailable/u);
      await runtime.query({ text: "DELETE FROM bpmn_platform.audit_work_events WHERE ordinal = 1" });
      await assert.rejects(
        harness.work.snapshotHostingProcessInstance("host", {
          maxEvents: 10,
          maxStoredBytes: 10_000,
        }),
        /unavailable/u,
      );
    } finally {
      await harness.dispose();
    }
  });
}

function createTestRuntime(connectionString: string): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName: "bpmn-platform-audit-test",
    maxConnections: 24,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 4_000,
    statementTimeoutMs: 4_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 4_000,
  });
}

async function createHarness(runtime: PostgresqlRuntime): Promise<AuditRepositoryHarness> {
  await resetDatabase(runtime);
  return {
    work: new PostgresqlAuditRepository(runtime),
    incident: new PostgresqlIncidentAuditRepository(runtime),
    publishWork: async (item) => await publishWork(runtime, item),
    publishIncident: async (item) => await publishIncident(runtime, item),
    dispose: async () => undefined,
  };
}

async function publishWork(
  runtime: PostgresqlRuntime,
  item: ReturnType<typeof workItem>,
): Promise<void> {
  await runtime.transaction(async (session) => {
    await requireAndAdvanceSourceHead(
      session,
      "work_audit_source_head",
      item.ordinal,
      async () => {
        await session.query({
          text: `
            INSERT INTO bpmn_platform.work_audit_outbox (
              ordinal, event_id, action_id, action_outcome, event_json, delivered
            ) VALUES ($1, $2, $3, $4, $5, false)
          `,
          values: [
            item.ordinal,
            Buffer.from(item.event.eventId),
            Buffer.from(item.event.action.actionId),
            item.event.action.outcome,
            JSON.stringify(item.event),
          ],
        });
      },
    );
  });
}

async function publishIncident(
  runtime: PostgresqlRuntime,
  item: ReturnType<typeof incidentItem>,
): Promise<void> {
  await runtime.transaction(async (session) => {
    const event = item.event;
    await session.query({
      text: `
        INSERT INTO bpmn_platform.operate_process_instances (
          process_instance_id, process_id, definition_version, source_sha256,
          public_identity_json, process_locator, observation
        ) VALUES ($1, $2, 1, $3, $4, $5, 'active')
        ON CONFLICT (process_instance_id) DO NOTHING
      `,
      values: [
        Buffer.from(event.hostingProcessInstanceId),
        Buffer.from("process"),
        "a".repeat(64),
        JSON.stringify({ processInstanceId: event.hostingProcessInstanceId }),
        Buffer.from(`locator:${event.hostingProcessInstanceId}`),
      ],
    });
    await session.query({
      text: `
        INSERT INTO bpmn_platform.operate_incident_actions (
          action_id, actor_id, hosting_process_instance_id,
          incident_process_instance_id, incident_element_id,
          incident_activation, incident_generation, action_kind,
          binding_json, state, result_json
        ) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, '{}', 'reserved', NULL)
      `,
      values: [
        Buffer.from(event.actionId),
        Buffer.from(event.actorId),
        Buffer.from(event.hostingProcessInstanceId),
        Buffer.from(event.incidentId.effectId.processInstanceId),
        Buffer.from(event.incidentId.effectId.elementId),
        event.incidentId.effectId.activation,
        event.actionKind,
      ],
    });
    await requireAndAdvanceSourceHead(
      session,
      "operate_incident_action_audit_source_head",
      item.ordinal,
      async () => {
        await session.query({
          text: `
            INSERT INTO bpmn_platform.operate_incident_action_audit_outbox (
              ordinal, event_id, action_id, action_outcome, event_json, delivered
            ) VALUES ($1, $2, $3, $4, $5, false)
          `,
          values: [
            item.ordinal,
            Buffer.from(event.eventId),
            Buffer.from(event.actionId),
            event.outcome,
            JSON.stringify(event),
          ],
        });
      },
    );
  });
}

async function requireAndAdvanceSourceHead(
  session: PostgresqlSession,
  table: string,
  ordinal: number,
  insert: () => Promise<void>,
): Promise<void> {
  const head = await session.query<Readonly<Record<string, unknown>> & Readonly<{ head: string }>>({
    text: `SELECT head::text AS head FROM bpmn_platform.${table} WHERE singleton = true FOR UPDATE`,
  });
  assert.equal(Number(head.rows[0]?.head) + 1, ordinal);
  await insert();
  const advanced = await session.query({
    text: `UPDATE bpmn_platform.${table} SET head = $1 WHERE singleton = true AND head = $2`,
    values: [ordinal, ordinal - 1],
  });
  assert.equal(advanced.rowCount, 1);
}

async function resetDatabase(runtime: PostgresqlRuntime): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.audit_work_events,
        bpmn_platform.audit_incident_events,
        bpmn_platform.work_audit_outbox,
        bpmn_platform.operate_incident_action_audit_outbox,
        bpmn_platform.operate_incident_actions,
        bpmn_platform.operate_process_instances
      CASCADE
    `,
  });
  await runtime.query({
    text: `
      UPDATE bpmn_platform.audit_work_sink_head SET head = 0 WHERE singleton = true;
      UPDATE bpmn_platform.audit_incident_sink_head SET head = 0 WHERE singleton = true;
      UPDATE bpmn_platform.work_audit_source_head SET head = 0 WHERE singleton = true;
      UPDATE bpmn_platform.operate_incident_action_audit_source_head SET head = 0 WHERE singleton = true
    `,
  });
}
