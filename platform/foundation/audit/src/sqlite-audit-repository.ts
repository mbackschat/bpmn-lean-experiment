import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";

import {
  decodeWorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";

import {
  AuditEventIntegrityError,
  AuditSchemaResetRequiredError,
  AuditStoredValueError,
} from "./audit-contracts.js";
import {
  readBoundedAuditSnapshot,
} from "./bounded-audit-snapshot.js";
import type {
  AuditRepository,
  AuditRepositoryQuery,
  StoredAuditEvent,
} from "./audit-contracts.js";
import type {
  AuditSnapshotLimits,
  AuditStreamSnapshot,
} from "./bounded-audit-snapshot.js";

const schemaEpoch = 2;
const defaultBusyTimeoutMs = 5_000;
const expectedSchemaObjects = [
  ["index", "sqlite_autoindex_work_audit_events_1", "work_audit_events"],
  ["index", "work_audit_actor_ordinal", "work_audit_events"],
  ["index", "work_audit_host_ordinal", "work_audit_events"],
  ["table", "work_audit_events", "work_audit_events"],
] as const;
const tableSql = `
  CREATE TABLE work_audit_events (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT CHECK (
      ordinal > 0 AND ordinal <= 9007199254740991
    ),
    event_id TEXT NOT NULL UNIQUE,
    actor_id TEXT NOT NULL,
    task_process_instance_id TEXT NOT NULL,
    hosting_process_instance_id TEXT NOT NULL,
    action_kind TEXT NOT NULL CHECK (action_kind IN ('claim', 'release', 'completion')),
    event_json TEXT NOT NULL CHECK (length(event_json) > 0)
  ) STRICT
`;

/** Append-only exact audit storage. Authorization remains outside this owner. */
export class SqliteAuditRepository implements AuditRepository {
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

  async record(event: WorkAuditEvent): Promise<number> {
    const exact = decodeWorkAuditEvent(structuredClone(event));
    const encoded = JSON.stringify(exact);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.#database.prepare(`
        SELECT ordinal, event_id, actor_id, task_process_instance_id,
          hosting_process_instance_id, action_kind, event_json
        FROM work_audit_events WHERE event_id = ?
      `).get(exact.eventId);
      if (existing !== undefined) {
        const stored = decodeRow(existing);
        if (JSON.stringify(stored.event) !== encoded) {
          throw new AuditEventIntegrityError(exact.eventId);
        }
        this.#database.exec("COMMIT");
        return stored.ordinal;
      }
      const result = this.#database.prepare(`
        INSERT INTO work_audit_events (
          event_id, actor_id, task_process_instance_id,
          hosting_process_instance_id, action_kind, event_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        exact.eventId,
        exact.actorId,
        exact.taskId.processInstanceId,
        exact.hostingProcessInstanceId,
        exact.action.kind,
        encoded,
      );
      const ordinal = requirePositiveSafeInteger(result.lastInsertRowid, "inserted audit ordinal");
      this.#database.exec("COMMIT");
      return ordinal;
    } catch (error: unknown) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  async search(
    query: AuditRepositoryQuery,
  ): Promise<ReadonlyArray<StoredAuditEvent>> {
    requireQuery(query);
    const parameters: SQLInputValue[] = [query.actorId];
    const predicates = ["actor_id = ?"];
    addOptionalFilter(predicates, parameters, "task_process_instance_id", query.taskProcessInstanceId);
    addOptionalFilter(predicates, parameters, "hosting_process_instance_id", query.hostingProcessInstanceId);
    addOptionalFilter(predicates, parameters, "action_kind", query.actionKind);
    if (query.afterOrdinal !== undefined) {
      predicates.push("ordinal > ?");
      parameters.push(query.afterOrdinal);
    }
    parameters.push(query.limit);
    const where = predicates.reduce(
      (sql, predicate) => sql.length === 0 ? predicate : `${sql} AND ${predicate}`,
      "",
    );
    return this.#database.prepare(`
      SELECT ordinal, event_id, actor_id, task_process_instance_id,
        hosting_process_instance_id, action_kind, event_json
      FROM work_audit_events
      WHERE ${where}
      ORDER BY ordinal ASC
      LIMIT ?
    `).all(...parameters).map(decodeRow);
  }

  async snapshotHostingProcessInstance(
    hostingProcessInstanceId: string,
    limits: AuditSnapshotLimits,
  ): Promise<AuditStreamSnapshot<WorkAuditEvent>> {
    return readBoundedAuditSnapshot(
      this.#database,
      hostingProcessInstanceId,
      limits,
      {
        headSql: `
          SELECT COUNT(*) AS event_count,
            COALESCE(SUM(length(CAST(event_json AS BLOB))), 0) AS stored_bytes,
            MAX(ordinal) AS head_ordinal
          FROM work_audit_events
          WHERE hosting_process_instance_id = ?
        `,
        rowsSql: `
          SELECT ordinal, event_id, actor_id, task_process_instance_id,
            hosting_process_instance_id, action_kind, event_json
          FROM work_audit_events
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
    const version = requireDatabaseInteger(database.prepare("PRAGMA user_version").get()?.user_version, "user_version");
    const tables = database.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map((row) => row.name);
    if (tables.length === 0 && version === 0) {
      database.exec(tableSql);
      database.exec(`CREATE INDEX work_audit_actor_ordinal ON work_audit_events (actor_id, ordinal)`);
      database.exec(`CREATE INDEX work_audit_host_ordinal ON work_audit_events (hosting_process_instance_id, ordinal)`);
      database.exec(`PRAGMA user_version = ${schemaEpoch}`);
      database.exec("COMMIT");
      return;
    }
    if (version !== schemaEpoch || tables.length !== 1 || tables[0] !== "work_audit_events") {
      throw new AuditSchemaResetRequiredError();
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
    ["task_process_instance_id", "TEXT", 1, 0],
    ["hosting_process_instance_id", "TEXT", 1, 0],
    ["action_kind", "TEXT", 1, 0],
    ["event_json", "TEXT", 1, 0],
  ];
  const actual = database.prepare(`
    SELECT name, type, "notnull", pk FROM pragma_table_info('work_audit_events') ORDER BY cid
  `).all().map((row) => [row.name, row.type, row.notnull, row.pk]);
  const strict = database.prepare(`
    SELECT strict FROM pragma_table_list WHERE schema = 'main' AND name = 'work_audit_events'
  `).get()?.strict;
  const objects = database.prepare(`
    SELECT type, name, tbl_name FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
      OR name = 'sqlite_autoindex_work_audit_events_1'
    ORDER BY type, name
  `).all().map((row) => [row.type, row.name, row.tbl_name]);
  if (
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    strict !== 1 ||
    JSON.stringify(objects) !== JSON.stringify(expectedSchemaObjects)
  ) {
    throw new AuditSchemaResetRequiredError();
  }
}

function decodeRow(row: Record<string, SQLOutputValue>): StoredAuditEvent {
  try {
    const ordinal = requirePositiveSafeInteger(row.ordinal, "stored audit ordinal");
    const encoded = requireString(row.event_json, "event_json");
    const event = decodeWorkAuditEvent(JSON.parse(encoded));
    if (
      event.eventId !== requireString(row.event_id, "event_id") ||
      event.actorId !== requireString(row.actor_id, "actor_id") ||
      event.taskId.processInstanceId !== requireString(row.task_process_instance_id, "task_process_instance_id") ||
      event.hostingProcessInstanceId !== requireString(row.hosting_process_instance_id, "hosting_process_instance_id") ||
      event.action.kind !== requireString(row.action_kind, "action_kind")
    ) {
      throw new TypeError("stored audit filters disagree with event JSON");
    }
    return { ordinal, event };
  } catch (error: unknown) {
    throw new AuditStoredValueError(error);
  }
}

function addOptionalFilter(predicates: string[], parameters: SQLInputValue[], column: string, value?: string): void {
  if (value !== undefined) {
    predicates.push(`${column} = ?`);
    parameters.push(value);
  }
}

function requireQuery(query: AuditRepositoryQuery): void {
  if (query.actorId.length === 0) throw new TypeError("audit actorId must be nonempty");
  requirePositiveSafeInteger(query.limit, "audit limit");
  if (query.afterOrdinal !== undefined) requirePositiveSafeInteger(query.afterOrdinal, "afterOrdinal");
}

function requireString(value: SQLOutputValue | undefined, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be nonempty text`);
  return value;
}

function requireDatabaseInteger(value: SQLOutputValue | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a nonnegative safe integer`);
  return value;
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" && typeof value !== "bigint") throw new TypeError(`${label} must be a positive safe integer`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive safe integer`);
  return number;
}
