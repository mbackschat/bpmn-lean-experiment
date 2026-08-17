import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import type {
  PostgresqlQuery,
  PostgresqlQueryResult,
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  OperatePostgresqlRecoveryFamily,
  PostgresqlOperateRecoveryCandidateSource,
} from "@bpmn-lean/platform-operate";

import {
  createOperateTestRuntime,
  migrateOperateDatabase,
  resetOperateDatabase,
} from "./postgresql-operate-test-support.ts";

const baseUrl = process.env.BPMN_TEST_POSTGRES_URL;

if (baseUrl === undefined) {
  test("PostgreSQL Operate recovery candidates require the explicit real-database witness", {
    skip: "BPMN_TEST_POSTGRES_URL is not set",
  });
} else {
  const runtime = createOperateTestRuntime(baseUrl, "operate-recovery-candidates");

  before(async () => {
    await migrateOperateDatabase(baseUrl);
  });

  after(async () => {
    await runtime.close();
  });

  test("discovers bounded active recovery populations without crossing unhealthy boundaries", async () => {
    await resetOperateDatabase(runtime);
    await insertProcess(runtime, "é😀\u0000z", "active");
    await insertProcess(runtime, "a\u0000z", "indeterminate");
    await insertProcess(runtime, "a", "active");
    await insertProcess(runtime, "without-execution", "active");
    await insertExecution(runtime, "a", "gap");

    await insertIncidentAction(runtime, "é😀\u0000-action", "é😀\u0000z", "reserved");
    await insertIncidentAction(runtime, "a\u0000-action", "a\u0000z", "submitting");
    await insertIncidentAction(runtime, "a-action", "a", "indeterminate");
    await insertIncidentAction(runtime, "terminal-committed", "é😀\u0000z", "committed");
    await insertIncidentAction(runtime, "terminal-rejected", "é😀\u0000z", "rejected");

    const source = new PostgresqlOperateRecoveryCandidateSource(runtime);
    assert.deepEqual(
      await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.FlowNodeOccurrence, 10),
      [],
    );
    await insertExecution(runtime, "é😀\u0000z", "healthy");
    await insertExecution(runtime, "a\u0000z", "healthy");
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.IncidentAction, 2)),
      ["a\u0000-action", "a-action"],
    );
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.IncidentAction, 10)),
      ["a\u0000-action", "a-action", "é😀\u0000-action"],
    );
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.CommittedExecution, 3)),
      ["a", "a\u0000z", "without-execution"],
    );
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.CommittedExecution, 10)),
      ["a", "a\u0000z", "without-execution", "é😀\u0000z"],
    );
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.FlowNodeOccurrence, 10)),
      ["a\u0000z", "é😀\u0000z"],
    );
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(
        OperatePostgresqlRecoveryFamily.IncidentSnapshot,
        2,
        5_000,
      )),
      ["a\u0000z", "é😀\u0000z"],
    );
  });

  test("retains a closed Process as a candidate until both final projections are complete", async () => {
    await resetOperateDatabase(runtime);
    await insertProcess(runtime, "closed", "closed");
    const source = new PostgresqlOperateRecoveryCandidateSource(runtime);

    assert.deepEqual(
      textKeys(await source.listCandidateKeys(
        OperatePostgresqlRecoveryFamily.CommittedExecution,
        10,
      )),
      ["closed"],
    );
    await insertExecution(runtime, "closed", "healthy");
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(
        OperatePostgresqlRecoveryFamily.CommittedExecution,
        10,
      )),
      ["closed"],
    );

    await markFinalExecution(runtime, "closed");
    assert.deepEqual(
      await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.CommittedExecution, 10),
      [],
    );
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(
        OperatePostgresqlRecoveryFamily.FlowNodeOccurrence,
        10,
      )),
      ["closed"],
    );

    await insertFinalOccurrence(runtime, "closed");
    assert.deepEqual(
      await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.FlowNodeOccurrence, 10),
      [],
    );
  });

  test("leases one fixed incident-audit stream key instead of individual ordinals", async () => {
    await resetOperateDatabase(runtime);
    await insertProcess(runtime, "audit-host", "active");
    await insertIncidentAction(runtime, "audit-action-1", "audit-host", "reserved");
    await insertIncidentAction(runtime, "audit-action-2", "audit-host", "submitting");
    await insertIncidentAudit(runtime, 1, "event-1", "audit-action-1");
    await insertIncidentAudit(runtime, 2, "event-2", "audit-action-2");

    const source = new PostgresqlOperateRecoveryCandidateSource(runtime);
    const first = await source.listCandidateKeys(
      OperatePostgresqlRecoveryFamily.IncidentAudit,
      99,
    );
    assert.deepEqual(textKeys(first), ["stream"]);
    assert.equal(Buffer.isBuffer(first[0]), false);
    first[0]![0] = 0;
    assert.deepEqual(
      textKeys(await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.IncidentAudit, 1)),
      ["stream"],
    );

    await runtime.query({
      text: `
        UPDATE bpmn_platform.operate_incident_action_audit_outbox
        SET delivered = true
      `,
    });
    assert.deepEqual(
      await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.IncidentAudit, 1),
      [],
    );
  });

  test("rejects unsafe bounds and unknown families before issuing SQL", async () => {
    let queryCount = 0;
    const source = new PostgresqlOperateRecoveryCandidateSource({
      query: async <Row extends PostgresqlRow = PostgresqlRow>(
        query: PostgresqlQuery,
      ): Promise<PostgresqlQueryResult<Row>> => {
        queryCount += 1;
        return await runtime.query<Row>(query);
      },
      transaction: async (run) => await runtime.transaction(run),
      withDedicatedSession: async (run) => await runtime.withDedicatedSession(run),
      databaseClockEpochMs: async () => await runtime.databaseClockEpochMs(),
      close: async () => await runtime.close(),
    });
    await assert.rejects(
      source.listCandidateKeys(OperatePostgresqlRecoveryFamily.IncidentSnapshot, 0),
      /positive safe integer/u,
    );
    await assert.rejects(
      source.listCandidateKeys(OperatePostgresqlRecoveryFamily.IncidentSnapshot, 1),
      /maximum age is required/u,
    );
    await assert.rejects(
      source.listCandidateKeys(OperatePostgresqlRecoveryFamily.IncidentAction, 1_001),
      /at most 1000/u,
    );
    await assert.rejects(
      source.listCandidateKeys("future-family" as OperatePostgresqlRecoveryFamily, 1),
      /unknown Operate PostgreSQL recovery family/u,
    );
    assert.equal(queryCount, 0);
    await source.listCandidateKeys(OperatePostgresqlRecoveryFamily.IncidentAudit, 1);
    assert.equal(queryCount, 1);
  });
}

async function insertProcess(
  runtime: PostgresqlRuntime,
  processInstanceId: string,
  observation: "active" | "closed" | "indeterminate",
): Promise<void> {
  await runtime.query({
    text: `
      WITH locked AS MATERIALIZED (
        SELECT population_head
        FROM bpmn_platform.operate_incident_snapshot_control
        WHERE singleton = true
        FOR UPDATE
      ), advanced AS (
        UPDATE bpmn_platform.operate_incident_snapshot_control AS control
        SET population_head = locked.population_head + 1
        FROM locked
        WHERE control.singleton = true
        RETURNING control.population_head
      )
      INSERT INTO bpmn_platform.operate_process_instances (
        process_instance_id,
        process_id,
        definition_version,
        source_sha256,
        public_identity_json,
        process_locator,
        observation,
        population_ordinal
      ) SELECT $1, $2, 1, $3, '{}', $4, $5, population_head FROM advanced
    `,
    values: [
      Buffer.from(processInstanceId, "utf8"),
      Buffer.from(`process-${processInstanceId}`, "utf8"),
      "0".repeat(64),
      Buffer.from(`locator-${processInstanceId}`, "utf8"),
      observation,
    ],
  });
}

async function insertExecution(
  runtime: PostgresqlRuntime,
  processInstanceId: string,
  status: "healthy" | "gap" | "unavailable",
): Promise<void> {
  await runtime.query({
    text: `
      INSERT INTO bpmn_platform.operate_execution_publications (
        process_instance_id,
        identity_json,
        status,
        head_revision,
        producer_head_revision,
        last_logical_time_ms,
        control_tokens_json,
        scopes_json,
        current_json
      ) VALUES ($1, '{}', $2, 0, 0, NULL, '[]', '[]', NULL)
    `,
    values: [Buffer.from(processInstanceId, "utf8"), status],
  });
}

async function markFinalExecution(
  runtime: PostgresqlRuntime,
  processInstanceId: string,
): Promise<void> {
  await runtime.query({
    text: `
      UPDATE bpmn_platform.operate_execution_publications
      SET head_revision = 1,
          producer_head_revision = 1,
          last_logical_time_ms = 0,
          current_json = '{"state":{"status":"completed"}}',
          current_process_status = 'completed',
          last_complete_observed_at_epoch_ms = 0
      WHERE process_instance_id = $1
    `,
    values: [Buffer.from(processInstanceId, "utf8")],
  });
}

async function insertFinalOccurrence(
  runtime: PostgresqlRuntime,
  processInstanceId: string,
): Promise<void> {
  await runtime.query({
    text: `
      INSERT INTO bpmn_platform.operate_flow_node_occurrence_publications (
        process_instance_id,
        identity_json,
        status,
        head_revision,
        producer_head_revision,
        last_committed_at_epoch_ms,
        current_open_json,
        last_complete_observed_at_epoch_ms
      ) VALUES ($1, '{}', 'healthy', 1, 1, 0, '[]', 0)
    `,
    values: [Buffer.from(processInstanceId, "utf8")],
  });
}

async function insertIncidentAction(
  runtime: PostgresqlRuntime,
  actionId: string,
  hostingProcessInstanceId: string,
  state: "reserved" | "submitting" | "committed" | "rejected" | "indeterminate",
): Promise<void> {
  await runtime.query({
    text: `
      INSERT INTO bpmn_platform.operate_incident_actions (
        action_id,
        actor_id,
        hosting_process_instance_id,
        incident_process_instance_id,
        incident_element_id,
        incident_activation,
        incident_generation,
        action_kind,
        binding_json,
        state,
        result_json
      ) VALUES ($1, $2, $3, $3, $4, 1, 1, 'retryIncident', '{}', $5, NULL)
    `,
    values: [
      Buffer.from(actionId, "utf8"),
      Buffer.from("actor", "utf8"),
      Buffer.from(hostingProcessInstanceId, "utf8"),
      Buffer.from("element", "utf8"),
      state,
    ],
  });
}

async function insertIncidentAudit(
  runtime: PostgresqlRuntime,
  ordinal: number,
  eventId: string,
  actionId: string,
): Promise<void> {
  await runtime.query({
    text: `
      INSERT INTO bpmn_platform.operate_incident_action_audit_outbox (
        ordinal, event_id, action_id, action_outcome, event_json, delivered
      ) VALUES ($1, $2, $3, 'reserved', '{}', false)
    `,
    values: [ordinal, Buffer.from(eventId, "utf8"), Buffer.from(actionId, "utf8")],
  });
}

function textKeys(keys: readonly Uint8Array[]): readonly string[] {
  return keys.map((key) => Buffer.from(key).toString("utf8"));
}
