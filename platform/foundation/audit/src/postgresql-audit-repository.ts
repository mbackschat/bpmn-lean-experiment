import {
  decodeWorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  AuditEventIntegrityError,
  AuditStoredValueError,
  AuditStreamUnavailableError,
} from "./audit-contracts.js";
import { AuditSnapshotLimitError } from "./bounded-audit-snapshot.js";
import type {
  AuditRepository,
  AuditRepositoryQuery,
  StoredAuditEvent,
} from "./audit-contracts.js";
import type {
  AuditSnapshotLimits,
  AuditStreamSnapshot,
} from "./bounded-audit-snapshot.js";
import {
  decodeAuditInteger,
  decodeAuditText,
  encodeAuditText,
  equalAuditBytes,
  requireAuditLimits,
  requireAuditOrdinal,
} from "./postgresql-audit-values.js";

type AuditRow = Readonly<Record<string, unknown>> & Readonly<{
  ordinal: unknown;
  event_id: unknown;
  actor_id: unknown;
  task_process_instance_id: unknown;
  hosting_process_instance_id: unknown;
  task_element_id: unknown;
  task_activation: unknown;
  action_kind: unknown;
  action_id: unknown;
  action_outcome: unknown;
  event_json: unknown;
}>;

type ReadRow = AuditRow & Readonly<{
  source_head: unknown;
  sink_head: unknown;
  source_count: unknown;
  sink_count: unknown;
  source_first: unknown;
  source_last: unknown;
  sink_first: unknown;
  sink_last: unknown;
  exact_coverage: unknown;
  event_count?: unknown;
  stored_bytes?: unknown;
}>;

/** Strict source-ordinal Work audit sink over a caller-owned PostgreSQL runtime. */
export class PostgresqlAuditRepository implements AuditRepository {
  readonly #database: Pick<PostgresqlRuntime, "query" | "transaction">;

  constructor(database: Pick<PostgresqlRuntime, "query" | "transaction">) {
    this.#database = database;
  }

  async record(item: StoredAuditEvent): Promise<number> {
    return await this.#database.transaction(async (session) =>
      await this.applyAuditRecord(session, item));
  }

  /** Applies one exact Work source ordinal without taking ownership of the caller transaction. */
  async applyAuditRecord(
    session: PostgresqlSession,
    item: StoredAuditEvent,
  ): Promise<number> {
    const exact = exactItem(item);
    const headResult = await session.query<Readonly<Record<string, unknown>> & Readonly<{ head: unknown }>>({
      text: `
          SELECT head::text AS head
          FROM bpmn_platform.audit_work_sink_head
          WHERE singleton = true
          FOR UPDATE
        `,
    });
    if (headResult.rows.length !== 1) {
      throw new AuditStreamUnavailableError(new TypeError("Work audit sink head is absent"));
    }
    const head = decodeAuditInteger(headResult.rows[0]?.head, "Work audit sink head");
    await requireExactSource(session, exact);
    if (exact.ordinal <= head) {
      const retained = await readOrdinal(session, exact.ordinal);
      if (retained === null || JSON.stringify(retained.event) !== exact.encoded) {
        throw new AuditEventIntegrityError(exact.event.eventId);
      }
      return exact.ordinal;
    }
    if (exact.ordinal !== head + 1) {
      throw new AuditEventIntegrityError(exact.event.eventId);
    }
    const collision = await session.query({
      text: `
          SELECT ordinal FROM bpmn_platform.audit_work_events
          WHERE event_id = $1 OR (action_id = $2 AND action_outcome = $3)
          LIMIT 1
        `,
      values: [exact.eventId, exact.actionId, exact.event.action.outcome],
    });
    if (collision.rows.length !== 0) {
      throw new AuditEventIntegrityError(exact.event.eventId);
    }
    const inserted = await session.query({
      text: `
          INSERT INTO bpmn_platform.audit_work_events (
            ordinal, event_id, actor_id, task_process_instance_id,
            hosting_process_instance_id, task_element_id, task_activation,
            action_kind, action_id, action_outcome, event_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
      values: [
        exact.ordinal,
        exact.eventId,
        encodeAuditText(exact.event.actorId, "actorId"),
        encodeAuditText(exact.event.taskId.processInstanceId, "task processInstanceId"),
        encodeAuditText(exact.event.hostingProcessInstanceId, "hostingProcessInstanceId"),
        encodeAuditText(exact.event.taskId.elementId, "task elementId"),
        exact.event.taskId.activation,
        exact.event.action.kind,
        exact.actionId,
        exact.event.action.outcome,
        exact.encoded,
      ],
    });
    if (inserted.rowCount !== 1) throw new AuditEventIntegrityError(exact.event.eventId);
    const advanced = await session.query({
      text: `
          UPDATE bpmn_platform.audit_work_sink_head SET head = $1
          WHERE singleton = true AND head = $2
        `,
      values: [exact.ordinal, head],
    });
    if (advanced.rowCount !== 1) throw new AuditEventIntegrityError(exact.event.eventId);
    return exact.ordinal;
  }

  async search(query: AuditRepositoryQuery): Promise<ReadonlyArray<StoredAuditEvent>> {
    requireQuery(query);
    const values: unknown[] = [encodeAuditText(query.actorId, "actorId")];
    const predicates = ["actor_id = $1"];
    addTextFilter(predicates, values, "task_process_instance_id", query.taskProcessInstanceId);
    addTextFilter(predicates, values, "hosting_process_instance_id", query.hostingProcessInstanceId);
    addScalarFilter(predicates, values, "action_kind", query.actionKind);
    addScalarFilter(predicates, values, "ordinal", query.afterOrdinal, ">");
    values.push(query.limit);
    const result = await this.#database.query<ReadRow>({
      text: `${coverageSql}
        SELECT status.*, selected.*
        FROM status
        LEFT JOIN LATERAL (
          SELECT ordinal AS order_ordinal, ordinal::text AS ordinal, event_id, actor_id,
            task_process_instance_id, hosting_process_instance_id,
            task_element_id, task_activation::text AS task_activation,
            action_kind, action_id, action_outcome, event_json
          FROM bpmn_platform.audit_work_events
          WHERE ${combinePredicates(predicates)}
          ORDER BY audit_work_events.ordinal ASC
          LIMIT $${values.length}
        ) selected ON true
        ORDER BY selected.order_ordinal ASC NULLS LAST
      `,
      values,
    });
    requireAvailable(result.rows);
    return result.rows[0]?.ordinal === null ? [] : result.rows.map(decodeRow);
  }

  async snapshotHostingProcessInstance(
    hostingProcessInstanceId: string,
    limits: AuditSnapshotLimits,
  ): Promise<AuditStreamSnapshot<WorkAuditEvent>> {
    const host = encodeAuditText(hostingProcessInstanceId, "hostingProcessInstanceId");
    requireAuditLimits(limits);
    const result = await this.#database.query<ReadRow>({
      text: `${coverageSql}, host_status AS (
          SELECT COUNT(*)::text AS event_count,
            COALESCE(SUM(octet_length(event_json)), 0)::text AS stored_bytes
          FROM bpmn_platform.audit_work_events
          WHERE hosting_process_instance_id = $1
        )
        SELECT status.*, host_status.*, selected.*
        FROM status CROSS JOIN host_status
        LEFT JOIN LATERAL (
          SELECT ordinal AS order_ordinal, ordinal::text AS ordinal, event_id, actor_id,
            task_process_instance_id, hosting_process_instance_id,
            task_element_id, task_activation::text AS task_activation,
            action_kind, action_id, action_outcome, event_json
          FROM bpmn_platform.audit_work_events
          WHERE hosting_process_instance_id = $1
          ORDER BY audit_work_events.ordinal ASC
        ) selected ON true
        ORDER BY selected.order_ordinal ASC NULLS LAST
      `,
      values: [host],
    });
    requireAvailable(result.rows);
    const first = result.rows[0];
    if (first === undefined) throw new AuditStreamUnavailableError();
    const eventCount = decodeAuditInteger(first.event_count, "Work audit event count");
    const storedBytes = decodeAuditInteger(first.stored_bytes, "Work audit stored bytes");
    if (eventCount > limits.maxEvents || storedBytes > limits.maxStoredBytes) {
      throw new AuditSnapshotLimitError();
    }
    const stored = first.ordinal === null ? [] : result.rows.map(decodeRow);
    if (stored.length !== eventCount) throw new AuditStreamUnavailableError();
    const events = stored.map(({ event }) => event);
    return { headEventId: events.at(-1)?.eventId ?? null, events };
  }
}

const coverageSql = `WITH status AS (
  SELECT source_head.head::text AS source_head,
    sink_head.head::text AS sink_head,
    (SELECT COUNT(*) FROM bpmn_platform.work_audit_outbox)::text AS source_count,
    (SELECT COUNT(*) FROM bpmn_platform.audit_work_events)::text AS sink_count,
    (SELECT MIN(ordinal)::text FROM bpmn_platform.work_audit_outbox) AS source_first,
    (SELECT MAX(ordinal)::text FROM bpmn_platform.work_audit_outbox) AS source_last,
    (SELECT MIN(ordinal)::text FROM bpmn_platform.audit_work_events) AS sink_first,
    (SELECT MAX(ordinal)::text FROM bpmn_platform.audit_work_events) AS sink_last,
    NOT EXISTS (
      SELECT 1
      FROM bpmn_platform.work_audit_outbox source
      FULL JOIN bpmn_platform.audit_work_events sink USING (ordinal)
      WHERE source.ordinal IS NULL OR sink.ordinal IS NULL
        OR source.event_id <> sink.event_id
        OR source.action_id <> sink.action_id
        OR source.action_outcome <> sink.action_outcome
        OR source.event_json <> sink.event_json
    ) AS exact_coverage
  FROM bpmn_platform.work_audit_source_head source_head
  CROSS JOIN bpmn_platform.audit_work_sink_head sink_head
  WHERE source_head.singleton = true AND sink_head.singleton = true
)`;

type ExactItem = Readonly<{
  ordinal: number;
  event: WorkAuditEvent;
  encoded: string;
  eventId: Buffer;
  actionId: Buffer;
}>;

function exactItem(item: StoredAuditEvent): ExactItem {
  const ordinal = requireAuditOrdinal(item.ordinal, "Work audit source ordinal");
  const event = decodeWorkAuditEvent(structuredClone(item.event));
  return {
    ordinal,
    event,
    encoded: JSON.stringify(event),
    eventId: encodeAuditText(event.eventId, "eventId"),
    actionId: encodeAuditText(event.action.actionId, "actionId"),
  };
}

async function requireExactSource(session: PostgresqlSession, exact: ExactItem): Promise<void> {
  const source = await session.query<Readonly<Record<string, unknown>> & Readonly<{
    event_id: unknown;
    action_id: unknown;
    action_outcome: unknown;
    event_json: unknown;
  }>>({
    text: `
      SELECT event_id, action_id, action_outcome, event_json
      FROM bpmn_platform.work_audit_outbox WHERE ordinal = $1
      FOR SHARE
    `,
    values: [exact.ordinal],
  });
  const row = source.rows[0];
  if (row === undefined) throw new AuditStreamUnavailableError();
  if (
    source.rows.length !== 1 ||
    !equalAuditBytes(row.event_id, exact.eventId) ||
    !equalAuditBytes(row.action_id, exact.actionId) ||
    row.action_outcome !== exact.event.action.outcome ||
    row.event_json !== exact.encoded
  ) {
    throw new AuditEventIntegrityError(exact.event.eventId);
  }
}

async function readOrdinal(
  session: PostgresqlSession,
  ordinal: number,
): Promise<StoredAuditEvent | null> {
  const result = await session.query<AuditRow>({
    text: `
      SELECT ordinal::text AS ordinal, event_id, actor_id,
        task_process_instance_id, hosting_process_instance_id,
        task_element_id, task_activation::text AS task_activation,
        action_kind, action_id, action_outcome, event_json
      FROM bpmn_platform.audit_work_events WHERE ordinal = $1
    `,
    values: [ordinal],
  });
  return result.rows[0] === undefined ? null : decodeRow(result.rows[0]);
}

function decodeRow(row: AuditRow): StoredAuditEvent {
  try {
    const encoded = requireString(row.event_json, "event_json");
    const event = decodeWorkAuditEvent(JSON.parse(encoded));
    if (
      JSON.stringify(event) !== encoded ||
      event.eventId !== decodeAuditText(row.event_id, "event_id") ||
      event.actorId !== decodeAuditText(row.actor_id, "actor_id") ||
      event.taskId.processInstanceId !== decodeAuditText(row.task_process_instance_id, "task_process_instance_id") ||
      event.hostingProcessInstanceId !== decodeAuditText(row.hosting_process_instance_id, "hosting_process_instance_id") ||
      event.taskId.elementId !== decodeAuditText(row.task_element_id, "task_element_id") ||
      event.taskId.activation !== requireAuditOrdinal(row.task_activation, "task_activation") ||
      event.action.kind !== row.action_kind ||
      event.action.actionId !== decodeAuditText(row.action_id, "action_id") ||
      event.action.outcome !== row.action_outcome
    ) throw new TypeError("stored Work audit columns disagree with event JSON");
    return { ordinal: requireAuditOrdinal(row.ordinal, "audit ordinal"), event };
  } catch (error: unknown) {
    throw new AuditStoredValueError(error);
  }
}

function requireAvailable(rows: readonly ReadRow[]): void {
  const status = rows[0];
  if (status === undefined) throw new AuditStreamUnavailableError();
  try {
    const sourceHead = decodeAuditInteger(status.source_head, "Work audit source head");
    const sinkHead = decodeAuditInteger(status.sink_head, "Work audit sink head");
    const sourceCount = decodeAuditInteger(status.source_count, "Work audit source count");
    const sinkCount = decodeAuditInteger(status.sink_count, "Work audit sink count");
    if (
      status.exact_coverage !== true || sourceHead !== sinkHead ||
      !exactPrefix(sourceHead, sourceCount, status.source_first, status.source_last) ||
      !exactPrefix(sinkHead, sinkCount, status.sink_first, status.sink_last)
    ) throw new TypeError("Work audit sink is not an exact source prefix");
  } catch (error: unknown) {
    throw new AuditStreamUnavailableError(error);
  }
}

function exactPrefix(
  head: number,
  count: number,
  first: unknown,
  last: unknown,
): boolean {
  return head === 0
    ? count === 0 && first === null && last === null
    : count === head &&
      requireAuditOrdinal(first, "audit first ordinal") === 1 &&
      requireAuditOrdinal(last, "audit last ordinal") === head;
}

function requireQuery(query: AuditRepositoryQuery): void {
  encodeAuditText(query.actorId, "actorId");
  requireAuditOrdinal(query.limit, "audit limit");
  if (query.afterOrdinal !== undefined) requireAuditOrdinal(query.afterOrdinal, "afterOrdinal");
  switch (query.actionKind) {
    case undefined:
    case "claim":
    case "release":
    case "completion":
      break;
    default:
      throw new TypeError("audit actionKind is not public");
  }
}

function addTextFilter(
  predicates: string[], values: unknown[], column: string, value?: string,
): void {
  if (value !== undefined) {
    values.push(encodeAuditText(value, column));
    predicates.push(`${column} = $${values.length}`);
  }
}

function addScalarFilter(
  predicates: string[], values: unknown[], column: string,
  value: string | number | undefined, operator = "=",
): void {
  if (value !== undefined) {
    values.push(value);
    predicates.push(`${column} ${operator} $${values.length}`);
  }
}

function combinePredicates(predicates: readonly string[]): string {
  return predicates.reduce(
    (combined, predicate) => combined.length === 0
      ? predicate
      : `${combined} AND ${predicate}`,
    "",
  );
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be nonempty text`);
  }
  return value;
}
