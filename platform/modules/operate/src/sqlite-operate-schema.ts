import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import {
  currentProcessInstanceDatabaseSchemaEpoch,
  OperateSchemaResetRequiredError,
} from "./database-schema-epoch.js";

export const processInstanceTableSql = `
  CREATE TABLE process_instances (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT CHECK (
      ordinal > 0 AND ordinal <= 9007199254740991
    ),
    process_instance_id TEXT NOT NULL,
    process_id TEXT NOT NULL,
    definition_version INTEGER NOT NULL CHECK (definition_version > 0),
    source_sha256 TEXT NOT NULL CHECK (
      length(source_sha256) = 64
      AND source_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
    public_identity_json TEXT NOT NULL CHECK (length(public_identity_json) > 0),
    process_locator TEXT NOT NULL CHECK (length(process_locator) > 0),
    observation TEXT NOT NULL CHECK (observation IN ('active','closed','indeterminate'))
  ) STRICT
`;

const schemaObjects = new Map<string, string>([
  ["process_instances", processInstanceTableSql],
  ["process_instances_process_id_ordinal", `
    CREATE INDEX process_instances_process_id_ordinal
      ON process_instances (process_id, ordinal DESC)
  `],
  ["process_instances_source_sha256_ordinal", `
    CREATE INDEX process_instances_source_sha256_ordinal
      ON process_instances (source_sha256, ordinal DESC)
  `],
  ["process_instances_unique_identity", `
    CREATE UNIQUE INDEX process_instances_unique_identity
      ON process_instances (process_instance_id)
  `],
  ["process_instances_version_ordinal", `
    CREATE INDEX process_instances_version_ordinal
      ON process_instances (definition_version, ordinal DESC)
  `],
  ["process_instances_definition_population", `
    CREATE INDEX process_instances_definition_population
      ON process_instances (
        process_id,
        definition_version,
        source_sha256,
        ordinal ASC
      )
  `],
  ["incident_actions", `
    CREATE TABLE incident_actions (
      action_id TEXT PRIMARY KEY NOT NULL,
      actor_id TEXT NOT NULL,
      hosting_process_instance_id TEXT NOT NULL,
      incident_process_instance_id TEXT NOT NULL,
      incident_element_id TEXT NOT NULL,
      incident_activation INTEGER NOT NULL CHECK (incident_activation > 0),
      incident_generation INTEGER NOT NULL CHECK (incident_generation = 1),
      action_kind TEXT NOT NULL CHECK (action_kind IN ('retryIncident','cancelIncidentProcess')),
      binding_json TEXT NOT NULL CHECK (length(binding_json) > 0),
      state TEXT NOT NULL CHECK (state IN ('reserved','submitting','committed','rejected','indeterminate')),
      result_json TEXT
    ) STRICT
  `],
  ["incident_action_audit_outbox", `
    CREATE TABLE incident_action_audit_outbox (
      ordinal INTEGER PRIMARY KEY AUTOINCREMENT CHECK (
        ordinal > 0 AND ordinal <= 9007199254740991
      ),
      event_id TEXT NOT NULL UNIQUE,
      action_id TEXT NOT NULL,
      action_outcome TEXT NOT NULL CHECK (action_outcome IN ('reserved','committed','rejected','indeterminate')),
      event_json TEXT NOT NULL CHECK (length(event_json) > 0),
      delivered INTEGER NOT NULL CHECK (delivered IN (0,1)),
      UNIQUE (action_id, action_outcome)
    ) STRICT
  `],
  ["execution_publications", `
    CREATE TABLE execution_publications (
      process_instance_id TEXT PRIMARY KEY NOT NULL,
      identity_json TEXT NOT NULL CHECK (length(identity_json) > 0),
      status TEXT NOT NULL CHECK (status IN ('healthy','gap','unavailable')),
      head_revision INTEGER NOT NULL CHECK (
        head_revision >= 0 AND head_revision <= 9007199254740991
      ),
      producer_head_revision INTEGER CHECK (
        producer_head_revision >= head_revision
        AND producer_head_revision <= 9007199254740991
      ),
      last_logical_time_ms INTEGER CHECK (
        last_logical_time_ms >= 0
        AND last_logical_time_ms <= 9007199254740991
      ),
      control_tokens_json TEXT NOT NULL CHECK (length(control_tokens_json) > 0),
      scopes_json TEXT NOT NULL CHECK (length(scopes_json) > 0),
      current_json TEXT,
      CHECK (
        (head_revision = 0 AND last_logical_time_ms IS NULL)
        OR (head_revision > 0 AND last_logical_time_ms IS NOT NULL)
      )
    ) STRICT
  `],
  ["execution_publication_batches", `
    CREATE TABLE execution_publication_batches (
      process_instance_id TEXT NOT NULL,
      from_revision INTEGER NOT NULL CHECK (
        from_revision >= 0 AND from_revision <= 9007199254740991
      ),
      through_revision INTEGER NOT NULL CHECK (
        through_revision > from_revision
        AND through_revision <= 9007199254740991
      ),
      command_id TEXT NOT NULL CHECK (length(command_id) > 0),
      batch_json TEXT NOT NULL CHECK (length(batch_json) > 0),
      PRIMARY KEY (process_instance_id, from_revision),
      UNIQUE (process_instance_id, through_revision)
    ) STRICT
  `],
  ["execution_publication_records", `
    CREATE TABLE execution_publication_records (
      process_instance_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (
        revision > 0 AND revision <= 9007199254740991
      ),
      batch_from_revision INTEGER NOT NULL CHECK (
        batch_from_revision >= 0
        AND batch_from_revision < revision
      ),
      record_json TEXT NOT NULL CHECK (length(record_json) > 0),
      PRIMARY KEY (process_instance_id, revision)
    ) STRICT
  `],
  ["flow_node_occurrence_publications", `
    CREATE TABLE flow_node_occurrence_publications (
      process_instance_id TEXT PRIMARY KEY NOT NULL,
      identity_json TEXT NOT NULL CHECK (length(identity_json) > 0),
      status TEXT NOT NULL CHECK (status IN ('healthy','gap','unavailable')),
      head_revision INTEGER NOT NULL CHECK (
        head_revision >= 0 AND head_revision <= 9007199254740991
      ),
      producer_head_revision INTEGER CHECK (
        producer_head_revision >= head_revision
        AND producer_head_revision <= 9007199254740991
      ),
      last_committed_at_epoch_ms INTEGER CHECK (
        last_committed_at_epoch_ms >= 0
        AND last_committed_at_epoch_ms <= 9007199254740991
      ),
      current_open_json TEXT NOT NULL CHECK (length(current_open_json) > 0),
      CHECK (
        (head_revision = 0 AND last_committed_at_epoch_ms IS NULL)
        OR (head_revision > 0 AND last_committed_at_epoch_ms IS NOT NULL)
      )
    ) STRICT
  `],
  ["flow_node_occurrence_batches", `
    CREATE TABLE flow_node_occurrence_batches (
      process_instance_id TEXT NOT NULL,
      from_revision INTEGER NOT NULL CHECK (
        from_revision >= 0 AND from_revision <= 9007199254740991
      ),
      through_revision INTEGER NOT NULL CHECK (
        through_revision > from_revision
        AND through_revision <= 9007199254740991
      ),
      command_id TEXT NOT NULL CHECK (length(command_id) > 0),
      committed_at_epoch_ms INTEGER NOT NULL CHECK (
        committed_at_epoch_ms >= 0
        AND committed_at_epoch_ms <= 9007199254740991
      ),
      batch_json TEXT NOT NULL CHECK (length(batch_json) > 0),
      PRIMARY KEY (process_instance_id, from_revision),
      UNIQUE (process_instance_id, through_revision)
    ) STRICT
  `],
  ["flow_node_occurrences", `
    CREATE TABLE flow_node_occurrences (
      hosting_process_instance_id TEXT NOT NULL,
      start_revision INTEGER NOT NULL CHECK (
        start_revision > 0 AND start_revision <= 9007199254740991
      ),
      start_index INTEGER NOT NULL CHECK (
        start_index >= 0 AND start_index <= 9007199254740991
      ),
      occurrence_json TEXT NOT NULL CHECK (length(occurrence_json) > 0),
      PRIMARY KEY (
        hosting_process_instance_id,
        start_revision,
        start_index
      )
    ) STRICT
  `],
]);

/** Creates or verifies the one exact pre-release Operate epoch-4 schema. */
export function initializeOperateSchema(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const version = readNonnegativeInteger(
      database.prepare("PRAGMA user_version").get()?.user_version,
    );
    const objects = readSchemaObjects(database);
    if (version === 0 && objects.size === 0) {
      for (const sql of schemaObjects.values()) database.exec(sql);
      database.exec(`PRAGMA user_version = ${currentProcessInstanceDatabaseSchemaEpoch}`);
    } else {
      requireExactSchema(version, objects, database);
    }
    database.exec("COMMIT");
  } catch (error: unknown) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

function requireExactSchema(
  version: number,
  objects: ReadonlyMap<string, string>,
  database: DatabaseSync,
): void {
  if (
    version !== currentProcessInstanceDatabaseSchemaEpoch ||
    objects.size !== schemaObjects.size
  ) {
    throw new OperateSchemaResetRequiredError();
  }
  for (const [name, expectedSql] of schemaObjects) {
    const actualSql = objects.get(name);
    if (
      actualSql === undefined ||
      normalizeSql(actualSql) !== normalizeSql(expectedSql)
    ) {
      throw new OperateSchemaResetRequiredError();
    }
  }
  const strictTables = database.prepare(`
    SELECT name, strict FROM pragma_table_list
    WHERE schema = 'main' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  if (
    strictTables.length !== 9 ||
    strictTables.some((row) => row.strict !== 1)
  ) {
    throw new OperateSchemaResetRequiredError();
  }
}

function readSchemaObjects(database: DatabaseSync): ReadonlyMap<string, string> {
  const rows = database.prepare(`
    SELECT name, sql FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  return new Map(rows.map((row) => [requireText(row.name), requireText(row.sql)]));
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim();
}

function requireText(value: SQLOutputValue | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new OperateSchemaResetRequiredError();
  }
  return value;
}

function readNonnegativeInteger(value: SQLOutputValue | undefined): number {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) {
    throw new OperateSchemaResetRequiredError();
  }
  return number;
}
