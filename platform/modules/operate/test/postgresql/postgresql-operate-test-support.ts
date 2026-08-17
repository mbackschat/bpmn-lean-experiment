import { fileURLToPath } from "node:url";

import {
  createPostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import type {
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";
import {
  runPostgresqlMigrations,
} from "@bpmn-lean/platform-postgresql-runtime/migrations";

export function createOperateTestRuntime(
  connectionString: string,
  applicationName: string,
  maxConnections = 12,
): PostgresqlRuntime {
  return createPostgresqlRuntime({
    connectionString,
    applicationName,
    maxConnections,
    connectionTimeoutMs: 2_000,
    idleTimeoutMs: 2_000,
    queryTimeoutMs: 4_000,
    statementTimeoutMs: 4_000,
    lockTimeoutMs: 2_000,
    idleInTransactionSessionTimeoutMs: 4_000,
  });
}

export async function migrateOperateDatabase(connectionString: string): Promise<void> {
  await runPostgresqlMigrations({
    connectionString,
    migrationDirectories: [
      fileURLToPath(
        new URL(
          "../../../../foundation/artifact-store/migrations",
          import.meta.url,
        ),
      ),
      fileURLToPath(new URL("../../../definitions/migrations", import.meta.url)),
      fileURLToPath(new URL("../../migrations", import.meta.url)),
      fileURLToPath(new URL("../../../work/migrations", import.meta.url)),
      fileURLToPath(new URL("../../../../foundation/audit/migrations", import.meta.url)),
      fileURLToPath(
        new URL("../../../../foundation/recovery-runtime/migrations", import.meta.url),
      ),
    ],
  });
}

export async function resetOperateDatabase(
  runtime: PostgresqlRuntime,
): Promise<void> {
  await runtime.query({
    text: `
      TRUNCATE
        bpmn_platform.operate_incident_snapshot_incidents,
        bpmn_platform.operate_incident_snapshot_generation_items,
        bpmn_platform.operate_incident_snapshot_control,
        bpmn_platform.operate_incident_snapshot_generations,
        bpmn_platform.operate_flow_node_occurrences,
        bpmn_platform.operate_flow_node_occurrence_batches,
        bpmn_platform.operate_flow_node_occurrence_publications,
        bpmn_platform.operate_execution_publication_records,
        bpmn_platform.operate_execution_publication_batches,
        bpmn_platform.operate_execution_publications,
        bpmn_platform.operate_incident_action_audit_outbox,
        bpmn_platform.operate_incident_actions,
        bpmn_platform.operate_process_instances
      RESTART IDENTITY
    `,
  });
  await runtime.query({
    text: `
      INSERT INTO bpmn_platform.operate_incident_snapshot_control (
        singleton, population_head, next_generation, building_generation, completed_generation
      ) VALUES (true, 0, 1, NULL, NULL);

      UPDATE bpmn_platform.operate_incident_action_audit_source_head
      SET head = 0
      WHERE singleton = true
    `,
  });
}
