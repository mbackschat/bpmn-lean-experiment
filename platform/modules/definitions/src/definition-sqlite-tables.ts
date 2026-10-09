/** One SQL owner supplies fresh tables and the supported prior-schema comparison. */
export const definitionSourceOverlaySqliteColumns = [
  "source_overlay_id TEXT",
  "source_overlay_sha256 TEXT CHECK (source_overlay_sha256 IS NULL OR (length(source_overlay_sha256) = 64 AND source_overlay_sha256 NOT GLOB '*[^0-9a-f]*'))",
] as const;
const definitionSourceOverlaySqliteColumnsSql =
  `${definitionSourceOverlaySqliteColumns[0]},\n      ${definitionSourceOverlaySqliteColumns[1]}`;

export const definitionVersionsTableSql = `
      CREATE TABLE definition_versions (
        process_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        source_kind TEXT NOT NULL CHECK (source_kind = 'bpmnSource'),
        source_id TEXT NOT NULL,
        source_sha256 TEXT NOT NULL CHECK (
          length(source_sha256) = 64
          AND source_sha256 NOT GLOB '*[^0-9a-f]*'
        ),
        source_byte_length INTEGER NOT NULL CHECK (source_byte_length >= 0),
        source_declared_encoding TEXT,
        source_decoded_as TEXT CHECK (
          source_decoded_as IS NULL OR source_decoded_as = 'UTF-8'
        ),
      ${definitionSourceOverlaySqliteColumnsSql},
        semantic_profile TEXT NOT NULL,
        start_capabilities_json TEXT NOT NULL CHECK (
          length(start_capabilities_json) > 0
        ),
        human_task_catalog_json TEXT,
        PRIMARY KEY (process_id, version)
      ) STRICT
    `;

export const definitionSchedulesTableSql = `
    CREATE TABLE IF NOT EXISTS definition_schedules (
      process_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      schedule_id TEXT NOT NULL,
      source_kind TEXT NOT NULL CHECK (source_kind = 'bpmnSource'),
      source_id TEXT NOT NULL,
      source_sha256 TEXT NOT NULL CHECK (
        length(source_sha256) = 64
        AND source_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      source_byte_length INTEGER NOT NULL CHECK (source_byte_length >= 0),
      source_declared_encoding TEXT,
      source_decoded_as TEXT CHECK (
        source_decoded_as IS NULL OR source_decoded_as = 'UTF-8'
      ),
      ${definitionSourceOverlaySqliteColumnsSql},
      semantic_profile TEXT NOT NULL,
      start_capabilities_json TEXT NOT NULL,
      timer_start_event_id TEXT NOT NULL,
      timer_duration_ms INTEGER NOT NULL CHECK (timer_duration_ms > 0),
      activation_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      process_instance_id TEXT NOT NULL UNIQUE,
      host_schedule_id TEXT NOT NULL UNIQUE,
      configured_workflow_id_base TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK (state IN (
        'creating', 'creatingHost', 'scheduled', 'cancelling',
        'started', 'missed', 'cancelled'
      )),
      cleanup_complete INTEGER NOT NULL CHECK (cleanup_complete IN (0, 1)),
      cancellation_origin TEXT CHECK (
        cancellation_origin IS NULL
        OR cancellation_origin IN ('creatingHost', 'scheduled')
      ),
      process_locator TEXT,
      PRIMARY KEY (process_id, version, schedule_id),
      CHECK (
        (state = 'cancelling' AND cancellation_origin IS NOT NULL)
        OR (state <> 'cancelling' AND cancellation_origin IS NULL)
      ),
      CHECK (
        (state = 'started' AND process_locator IS NOT NULL)
        OR (state <> 'started' AND process_locator IS NULL)
      ),
      CHECK (
        state IN ('started', 'missed', 'cancelled') OR cleanup_complete = 0
      )
    ) STRICT
  `;

export const messageStartPublicationsTableSql = `
    CREATE TABLE IF NOT EXISTS message_start_publications (
      publication_id TEXT NOT NULL PRIMARY KEY,
      process_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      source_kind TEXT NOT NULL CHECK (source_kind = 'bpmnSource'),
      source_id TEXT NOT NULL,
      source_sha256 TEXT NOT NULL CHECK (
        length(source_sha256) = 64
        AND source_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      source_byte_length INTEGER NOT NULL CHECK (source_byte_length >= 0),
      source_declared_encoding TEXT,
      source_decoded_as TEXT CHECK (
        source_decoded_as IS NULL OR source_decoded_as = 'UTF-8'
      ),
      ${definitionSourceOverlaySqliteColumnsSql},
      semantic_profile TEXT NOT NULL,
      start_capabilities_json TEXT NOT NULL CHECK (
        length(start_capabilities_json) > 0
      ),
      message_start_event_id TEXT NOT NULL,
      message_interface_id TEXT NOT NULL,
      message_interface_operation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      process_instance_id TEXT NOT NULL UNIQUE,
      command_id TEXT NOT NULL UNIQUE,
      workflow_id TEXT NOT NULL UNIQUE,
      intent_protocol TEXT NOT NULL,
      intent_sha256 TEXT NOT NULL CHECK (
        length(intent_sha256) = 64
        AND intent_sha256 NOT GLOB '*[^0-9a-f]*'
      ),
      state TEXT NOT NULL CHECK (state IN (
        'reserved', 'starting', 'accepted', 'indeterminate', 'integrityFailure'
      ))
    ) STRICT
  `;

export const definitionSqliteTables = [
  { name: "definition_versions", sql: definitionVersionsTableSql },
  { name: "definition_schedules", sql: definitionSchedulesTableSql },
  { name: "message_start_publications", sql: messageStartPublicationsTableSql },
] as const;

/** Prior admission contained no overlay columns; all other table meaning is identical. */
export function priorDefinitionSqliteTableSql(currentSql: string): string {
  return currentSql.replace(definitionSourceOverlaySqliteColumnsSql + ",", "");
}
