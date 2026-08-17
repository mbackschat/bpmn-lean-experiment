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

const schemaEpoch = 3;
const defaultBusyTimeoutMs = 5_000;
const expectedSchemaObjects = [
  ["index", "sqlite_autoindex_work_audit_events_1", "work_audit_events"],
  ["index", "sqlite_autoindex_work_audit_events_2", "work_audit_events"],
  ["index", "work_audit_actor_ordinal", "work_audit_events"],
  ["index", "work_audit_host_ordinal", "work_audit_events"],
  ["table", "work_audit_events", "work_audit_events"],
  ["table", "work_audit_sink_head", "work_audit_sink_head"],
] as const;
const tableSql = `
  CREATE TABLE work_audit_events (
    ordinal INTEGER PRIMARY KEY CHECK (
      ordinal > 0 AND ordinal <= 9007199254740991
    ),
    event_id TEXT NOT NULL UNIQUE,
    actor_id TEXT NOT NULL,
    task_process_instance_id TEXT NOT NULL,
    hosting_process_instance_id TEXT NOT NULL,
    action_kind TEXT NOT NULL CHECK (action_kind IN ('claim', 'release', 'completion')),
    action_id TEXT NOT NULL,
    action_outcome TEXT NOT NULL CHECK (action_outcome IN (
      'claimed', 'idempotent', 'conflict', 'released',
      'reserved', 'committed', 'rejected', 'indeterminate'
    )),
    event_json TEXT NOT NULL CHECK (length(event_json) > 0),
    UNIQUE (action_id, action_outcome)
  ) STRICT;
  CREATE TABLE work_audit_sink_head (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    head INTEGER NOT NULL CHECK (head >= 0 AND head <= 9007199254740991)
  ) STRICT;
  INSERT INTO work_audit_sink_head (singleton, head) VALUES (1, 0)
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

  async record(item: StoredAuditEvent): Promise<number> {
    const ordinal = requirePositiveSafeInteger(item.ordinal, "audit source ordinal");
    const exact = decodeWorkAuditEvent(structuredClone(item.event));
    const encoded = JSON.stringify(exact);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const head = requireDatabaseInteger(this.#database.prepare(`
        SELECT head FROM work_audit_sink_head WHERE singleton = 1
      `).get()?.head, "audit sink head");
      if (ordinal <= head) {
        const retained = this.#database.prepare(`
        SELECT ordinal, event_id, actor_id, task_process_instance_id,
          hosting_process_instance_id, action_kind, action_id,
          action_outcome, event_json
        FROM work_audit_events WHERE ordinal = ?
        `).get(ordinal);
        if (retained === undefined || JSON.stringify(decodeRow(retained).event) !== encoded) {
          throw new AuditEventIntegrityError(exact.eventId);
        }
        this.#database.exec("COMMIT");
        return ordinal;
      }
      if (ordinal !== head + 1) {
        throw new AuditEventIntegrityError(exact.eventId);
      }
      const occupied = this.#database.prepare(`
        SELECT ordinal FROM work_audit_events
        WHERE event_id = ? OR (action_id = ? AND action_outcome = ?)
      `).get(exact.eventId, exact.action.actionId, exact.action.outcome);
      if (occupied !== undefined) {
        throw new AuditEventIntegrityError(exact.eventId);
      }
      const result = this.#database.prepare(`
        INSERT INTO work_audit_events (
          ordinal,
          event_id, actor_id, task_process_instance_id,
          hosting_process_instance_id, action_kind, action_id,
          action_outcome, event_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ordinal,
        exact.eventId,
        exact.actorId,
        exact.taskId.processInstanceId,
        exact.hostingProcessInstanceId,
        exact.action.kind,
        exact.action.actionId,
        exact.action.outcome,
        encoded,
      );
      if (result.changes !== 1) throw new AuditEventIntegrityError(exact.eventId);
      const advanced = this.#database.prepare(`
        UPDATE work_audit_sink_head SET head = ?
        WHERE singleton = 1 AND head = ?
      `).run(ordinal, head);
      if (advanced.changes !== 1) throw new AuditEventIntegrityError(exact.eventId);
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
    this.#database.exec("BEGIN DEFERRED");
    try {
      requireCompleteStream(this.#database);
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
      const rows = this.#database.prepare(`
      SELECT ordinal, event_id, actor_id, task_process_instance_id,
        hosting_process_instance_id, action_kind, action_id,
        action_outcome, event_json
      FROM work_audit_events
      WHERE ${where}
      ORDER BY ordinal ASC
      LIMIT ?
      `).all(...parameters).map(decodeRow);
      this.#database.exec("COMMIT");
      return rows;
    } catch (error: unknown) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
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
            MAX(ordinal) AS head_ordinal,
            (SELECT head FROM work_audit_sink_head WHERE singleton = 1) AS stream_head,
            (SELECT COUNT(*) FROM work_audit_events) AS stream_count,
            (SELECT MIN(ordinal) FROM work_audit_events) AS stream_first,
            (SELECT MAX(ordinal) FROM work_audit_events) AS stream_last
          FROM work_audit_events
          WHERE hosting_process_instance_id = ?
        `,
        rowsSql: `
          SELECT ordinal, event_id, actor_id, task_process_instance_id,
            hosting_process_instance_id, action_kind, action_id,
            action_outcome, event_json
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
    if (
      version !== schemaEpoch ||
      JSON.stringify(tables) !== JSON.stringify(["work_audit_events", "work_audit_sink_head"])
    ) {
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
    ["action_id", "TEXT", 1, 0],
    ["action_outcome", "TEXT", 1, 0],
    ["event_json", "TEXT", 1, 0],
  ];
  const actual = database.prepare(`
    SELECT name, type, "notnull", pk FROM pragma_table_info('work_audit_events') ORDER BY cid
  `).all().map((row) => [row.name, row.type, row.notnull, row.pk]);
  const headActual = database.prepare(`
    SELECT name, type, "notnull", pk FROM pragma_table_info('work_audit_sink_head') ORDER BY cid
  `).all().map((row) => [row.name, row.type, row.notnull, row.pk]);
  const strict = database.prepare(`
    SELECT strict FROM pragma_table_list WHERE schema = 'main' AND name = 'work_audit_events'
  `).get()?.strict;
  const headStrict = database.prepare(`
    SELECT strict FROM pragma_table_list WHERE schema = 'main' AND name = 'work_audit_sink_head'
  `).get()?.strict;
  const objects = database.prepare(`
    SELECT type, name, tbl_name FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
      OR name IN (
        'sqlite_autoindex_work_audit_events_1',
        'sqlite_autoindex_work_audit_events_2'
      )
    ORDER BY type, name
  `).all().map((row) => [row.type, row.name, row.tbl_name]);
  if (
    JSON.stringify(actual) !== JSON.stringify(expected) ||
    JSON.stringify(headActual) !== JSON.stringify([
      ["singleton", "INTEGER", 0, 1],
      ["head", "INTEGER", 1, 0],
    ]) ||
    strict !== 1 ||
    headStrict !== 1 ||
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
      JSON.stringify(event) !== encoded ||
      event.eventId !== requireString(row.event_id, "event_id") ||
      event.actorId !== requireString(row.actor_id, "actor_id") ||
      event.taskId.processInstanceId !== requireString(row.task_process_instance_id, "task_process_instance_id") ||
      event.hostingProcessInstanceId !== requireString(row.hosting_process_instance_id, "hosting_process_instance_id") ||
      event.action.kind !== requireString(row.action_kind, "action_kind") ||
      event.action.actionId !== requireString(row.action_id, "action_id") ||
      event.action.outcome !== requireString(row.action_outcome, "action_outcome")
    ) {
      throw new TypeError("stored audit filters disagree with event JSON");
    }
    return { ordinal, event };
  } catch (error: unknown) {
    throw new AuditStoredValueError(error);
  }
}

function requireCompleteStream(database: DatabaseSync): void {
  const row = database.prepare(`
    SELECT h.head, COUNT(e.ordinal) AS event_count,
      MIN(e.ordinal) AS first_ordinal, MAX(e.ordinal) AS last_ordinal
    FROM work_audit_sink_head h
    LEFT JOIN work_audit_events e ON true
    WHERE h.singleton = 1
    GROUP BY h.head
  `).get();
  if (row === undefined) throw new AuditStoredValueError(new TypeError("audit sink head is absent"));
  const head = requireDatabaseInteger(row.head, "audit sink head");
  const count = requireDatabaseInteger(row.event_count, "audit event count");
  if (
    count !== head ||
    (head === 0 ? row.first_ordinal !== null || row.last_ordinal !== null :
      requirePositiveSafeInteger(row.first_ordinal, "first audit ordinal") !== 1 ||
      requirePositiveSafeInteger(row.last_ordinal, "last audit ordinal") !== head)
  ) {
    throw new AuditStoredValueError(new TypeError("audit sink is not a complete prefix"));
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
