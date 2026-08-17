import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";

import {
  decodeIncidentAuditEvent,
  decodePublicEffectIncidentId,
} from "@bpmn-lean/platform-contracts";
import type { IncidentAuditEvent } from "@bpmn-lean/platform-contracts";

import {
  IncidentAuditEventIntegrityError,
  IncidentAuditSchemaResetRequiredError,
  IncidentAuditStoredValueError,
} from "./incident-audit-contracts.js";
import {
  readBoundedAuditSnapshot,
} from "./bounded-audit-snapshot.js";
import type {
  IncidentAuditRepository,
  IncidentAuditRepositoryQuery,
  StoredIncidentAuditEvent,
} from "./incident-audit-contracts.js";
import type {
  AuditSnapshotLimits,
  AuditStreamSnapshot,
} from "./bounded-audit-snapshot.js";

const schemaEpoch = 2;
const defaultBusyTimeoutMs = 5_000;
const expectedSchemaObjects = [
  ["index", "incident_audit_host_ordinal", "incident_audit_events"],
  ["index", "sqlite_autoindex_incident_audit_events_1", "incident_audit_events"],
  ["index", "sqlite_autoindex_incident_audit_events_2", "incident_audit_events"],
  ["table", "incident_audit_events", "incident_audit_events"],
] as const;
const tableSql = `
  CREATE TABLE incident_audit_events (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT CHECK (
      ordinal > 0 AND ordinal <= 9007199254740991
    ),
    event_id TEXT NOT NULL UNIQUE,
    actor_id TEXT NOT NULL,
    hosting_process_instance_id TEXT NOT NULL,
    incident_process_instance_id TEXT NOT NULL,
    incident_element_id TEXT NOT NULL,
    incident_activation INTEGER NOT NULL CHECK (
      incident_activation > 0 AND incident_activation <= 9007199254740991
    ),
    incident_generation INTEGER NOT NULL CHECK (incident_generation = 1),
    action_kind TEXT NOT NULL CHECK (
      action_kind IN ('retryIncident', 'cancelIncidentProcess')
    ),
    action_id TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (
      outcome IN ('reserved', 'committed', 'rejected', 'indeterminate')
    ),
    event_json TEXT NOT NULL CHECK (length(event_json) > 0),
    UNIQUE (action_id, outcome)
  ) STRICT
`;

/** Append-only incident-action audit storage with its own exact schema epoch. */
export class SqliteIncidentAuditRepository implements IncidentAuditRepository {
  readonly #database: DatabaseSync;

  constructor(databaseFile: string, busyTimeoutMs = defaultBusyTimeoutMs) {
    requirePositiveSafeInteger(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      initializeSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  async record(event: IncidentAuditEvent): Promise<number> {
    const exact = decodeIncidentAuditEvent(structuredClone(event));
    const encoded = JSON.stringify(exact);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.#database.prepare(`
        SELECT ordinal, event_id, actor_id, hosting_process_instance_id,
          incident_process_instance_id, incident_element_id,
          incident_activation, incident_generation, action_kind,
          action_id, outcome, event_json
        FROM incident_audit_events WHERE event_id = ?
      `).get(exact.eventId);
      if (existing !== undefined) {
        const stored = decodeRow(existing);
        if (JSON.stringify(stored.event) !== encoded) {
          throw new IncidentAuditEventIntegrityError(exact.eventId);
        }
        this.#database.exec("COMMIT");
        return stored.ordinal;
      }
      const duplicateOutcome = this.#database.prepare(`
        SELECT event_id FROM incident_audit_events
        WHERE action_id = ? AND outcome = ?
      `).get(exact.actionId, exact.outcome);
      if (duplicateOutcome !== undefined) {
        throw new IncidentAuditEventIntegrityError(exact.eventId);
      }
      const result = this.#database.prepare(`
        INSERT INTO incident_audit_events (
          event_id, actor_id, hosting_process_instance_id,
          incident_process_instance_id, incident_element_id,
          incident_activation, incident_generation, action_kind,
          action_id, outcome, event_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        exact.eventId,
        exact.actorId,
        exact.hostingProcessInstanceId,
        exact.incidentId.effectId.processInstanceId,
        exact.incidentId.effectId.elementId,
        exact.incidentId.effectId.activation,
        exact.incidentId.generation,
        exact.actionKind,
        exact.actionId,
        exact.outcome,
        encoded,
      );
      const ordinal = requirePositiveSafeInteger(
        result.lastInsertRowid,
        "inserted incident audit ordinal",
      );
      this.#database.exec("COMMIT");
      return ordinal;
    } catch (error: unknown) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async search(
    query: IncidentAuditRepositoryQuery,
  ): Promise<ReadonlyArray<StoredIncidentAuditEvent>> {
    requireQuery(query);
    const parameters: SQLInputValue[] = [];
    const predicates: string[] = [];
    addOptionalFilter(predicates, parameters, "actor_id", query.actorId);
    addOptionalFilter(
      predicates,
      parameters,
      "hosting_process_instance_id",
      query.hostingProcessInstanceId,
    );
    if (query.incidentId !== undefined) {
      const incidentId = decodePublicEffectIncidentId(
        query.incidentId,
        "incident audit repository query.incidentId",
      );
      addFilter(
        predicates,
        parameters,
        "incident_process_instance_id",
        incidentId.effectId.processInstanceId,
      );
      addFilter(
        predicates,
        parameters,
        "incident_element_id",
        incidentId.effectId.elementId,
      );
      addFilter(
        predicates,
        parameters,
        "incident_activation",
        incidentId.effectId.activation,
      );
      addFilter(
        predicates,
        parameters,
        "incident_generation",
        incidentId.generation,
      );
    }
    addOptionalFilter(predicates, parameters, "action_kind", query.actionKind);
    if (query.afterOrdinal !== undefined) {
      addFilter(predicates, parameters, "ordinal", query.afterOrdinal, ">");
    }
    parameters.push(query.limit);
    const combinedPredicates = predicates.reduce(
      (sql, predicate) => sql.length === 0 ? predicate : `${sql} AND ${predicate}`,
      "",
    );
    const where = combinedPredicates.length === 0
      ? ""
      : `WHERE ${combinedPredicates}`;
    return this.#database.prepare(`
      SELECT ordinal, event_id, actor_id, hosting_process_instance_id,
        incident_process_instance_id, incident_element_id,
        incident_activation, incident_generation, action_kind,
        action_id, outcome, event_json
      FROM incident_audit_events
      ${where}
      ORDER BY ordinal ASC
      LIMIT ?
    `).all(...parameters).map(decodeRow);
  }

  async snapshotHostingProcessInstance(
    hostingProcessInstanceId: string,
    limits: AuditSnapshotLimits,
  ): Promise<AuditStreamSnapshot<IncidentAuditEvent>> {
    return readBoundedAuditSnapshot(
      this.#database,
      hostingProcessInstanceId,
      limits,
      {
        headSql: `
          SELECT COUNT(*) AS event_count,
            COALESCE(SUM(length(CAST(event_json AS BLOB))), 0) AS stored_bytes,
            MAX(ordinal) AS head_ordinal
          FROM incident_audit_events
          WHERE hosting_process_instance_id = ?
        `,
        rowsSql: `
          SELECT ordinal, event_id, actor_id, hosting_process_instance_id,
            incident_process_instance_id, incident_element_id,
            incident_activation, incident_generation, action_kind,
            action_id, outcome, event_json
          FROM incident_audit_events
          WHERE hosting_process_instance_id = ? AND ordinal <= ?
          ORDER BY ordinal ASC
        `,
        decodeRow,
      },
    );
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }
}

function initializeSchema(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    const version = requireDatabaseInteger(
      database.prepare("PRAGMA user_version").get()?.user_version,
      "user_version",
    );
    const tables = database.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map((row) => row.name);
    if (tables.length === 0 && version === 0) {
      database.exec(tableSql);
      database.exec(`CREATE INDEX incident_audit_host_ordinal ON incident_audit_events (hosting_process_instance_id, ordinal)`);
      database.exec(`PRAGMA user_version = ${schemaEpoch}`);
      database.exec("COMMIT");
      return;
    }
    if (
      version !== schemaEpoch ||
      tables.length !== 1 ||
      tables[0] !== "incident_audit_events"
    ) {
      throw new IncidentAuditSchemaResetRequiredError();
    }
    requireCurrentSchema(database);
    database.exec("COMMIT");
  } catch (error: unknown) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

function requireCurrentSchema(database: DatabaseSync): void {
  const expected = [
    ["ordinal", "INTEGER", 0, 1],
    ["event_id", "TEXT", 1, 0],
    ["actor_id", "TEXT", 1, 0],
    ["hosting_process_instance_id", "TEXT", 1, 0],
    ["incident_process_instance_id", "TEXT", 1, 0],
    ["incident_element_id", "TEXT", 1, 0],
    ["incident_activation", "INTEGER", 1, 0],
    ["incident_generation", "INTEGER", 1, 0],
    ["action_kind", "TEXT", 1, 0],
    ["action_id", "TEXT", 1, 0],
    ["outcome", "TEXT", 1, 0],
    ["event_json", "TEXT", 1, 0],
  ];
  const actual = database.prepare(`
    SELECT name, type, "notnull", pk
    FROM pragma_table_info('incident_audit_events') ORDER BY cid
  `).all().map((row) => [row.name, row.type, row.notnull, row.pk]);
  const strict = database.prepare(`
    SELECT strict FROM pragma_table_list
    WHERE schema = 'main' AND name = 'incident_audit_events'
  `).get()?.strict;
  const objects = database.prepare(`
    SELECT type, name, tbl_name FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
      OR name IN (
        'sqlite_autoindex_incident_audit_events_1',
        'sqlite_autoindex_incident_audit_events_2'
      )
    ORDER BY type, name
  `).all().map((row) => [row.type, row.name, row.tbl_name]);
  if (
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    strict !== 1 ||
    JSON.stringify(objects) !== JSON.stringify(expectedSchemaObjects)
  ) {
    throw new IncidentAuditSchemaResetRequiredError();
  }
}

function decodeRow(row: Record<string, SQLOutputValue>): StoredIncidentAuditEvent {
  try {
    const ordinal = requirePositiveSafeInteger(
      row.ordinal,
      "stored incident audit ordinal",
    );
    const encoded = requireString(row.event_json, "event_json");
    const event = decodeIncidentAuditEvent(JSON.parse(encoded));
    if (
      JSON.stringify(event) !== encoded ||
      event.eventId !== requireString(row.event_id, "event_id") ||
      event.actorId !== requireString(row.actor_id, "actor_id") ||
      event.hostingProcessInstanceId !== requireString(
        row.hosting_process_instance_id,
        "hosting_process_instance_id",
      ) ||
      event.incidentId.effectId.processInstanceId !== requireString(
        row.incident_process_instance_id,
        "incident_process_instance_id",
      ) ||
      event.incidentId.effectId.elementId !== requireString(
        row.incident_element_id,
        "incident_element_id",
      ) ||
      event.incidentId.effectId.activation !== requirePositiveSafeInteger(
        row.incident_activation,
        "incident_activation",
      ) ||
      event.incidentId.generation !== requirePositiveSafeInteger(
        row.incident_generation,
        "incident_generation",
      ) ||
      event.actionKind !== requireString(row.action_kind, "action_kind") ||
      event.actionId !== requireString(row.action_id, "action_id") ||
      event.outcome !== requireString(row.outcome, "outcome")
    ) {
      throw new TypeError("stored incident audit filters disagree with event JSON");
    }
    return { ordinal, event };
  } catch (error: unknown) {
    throw new IncidentAuditStoredValueError(error);
  }
}

function addOptionalFilter(
  predicates: string[],
  parameters: SQLInputValue[],
  column: string,
  value: string | undefined,
): void {
  if (value !== undefined) addFilter(predicates, parameters, column, value);
}

function addFilter(
  predicates: string[],
  parameters: SQLInputValue[],
  column: string,
  value: SQLInputValue,
  operator = "=",
): void {
  predicates.push(`${column} ${operator} ?`);
  parameters.push(value);
}

function requireQuery(query: IncidentAuditRepositoryQuery): void {
  if (query.actorId !== undefined) requireNonemptyString(query.actorId, "actorId");
  if (query.hostingProcessInstanceId !== undefined) {
    requireNonemptyString(
      query.hostingProcessInstanceId,
      "hostingProcessInstanceId",
    );
  }
  if (query.incidentId !== undefined) {
    decodePublicEffectIncidentId(
      query.incidentId,
      "incident audit repository query.incidentId",
    );
  }
  switch (query.actionKind) {
    case undefined:
    case "retryIncident":
    case "cancelIncidentProcess":
      break;
    default:
      throw new TypeError("incident audit actionKind is not public");
  }
  requirePositiveSafeInteger(query.limit, "incident audit limit");
  if (query.afterOrdinal !== undefined) {
    requirePositiveSafeInteger(query.afterOrdinal, "afterOrdinal");
  }
}

function requireNonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

function requireString(
  value: SQLOutputValue | undefined,
  label: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be nonempty text`);
  }
  return value;
}

function requireDatabaseInteger(
  value: SQLOutputValue | undefined,
  label: string,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" && typeof value !== "bigint") {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return number;
}
