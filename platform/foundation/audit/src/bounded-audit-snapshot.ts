import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

export type AuditSnapshotLimits = Readonly<{
  maxEvents: number;
  maxStoredBytes: number;
}>;

export type AuditStreamSnapshot<Event> = Readonly<{
  headEventId: string | null;
  events: ReadonlyArray<Event>;
}>;

export class AuditSnapshotLimitError extends Error {
  constructor() {
    super("audit snapshot limit exceeded");
    this.name = "AuditSnapshotLimitError";
  }
}

type StoredEvent<Event extends Readonly<{ eventId: string }>> = Readonly<{
  ordinal: number;
  event: Event;
}>;

type AuditSnapshotQueries<Event extends Readonly<{ eventId: string }>> = Readonly<{
  headSql: string;
  rowsSql: string;
  decodeRow: (row: Record<string, SQLOutputValue>) => StoredEvent<Event>;
}>;

/** Reads one source-local, insertion-ordered audit snapshot inside one SQLite read transaction. */
export function readBoundedAuditSnapshot<
  Event extends Readonly<{ eventId: string }>,
>(
  database: DatabaseSync,
  hostingProcessInstanceId: string,
  limits: AuditSnapshotLimits,
  queries: AuditSnapshotQueries<Event>,
): AuditStreamSnapshot<Event> {
  requireNonemptyString(hostingProcessInstanceId, "hostingProcessInstanceId");
  requirePositiveSafeInteger(limits.maxEvents, "maxEvents");
  requirePositiveSafeInteger(limits.maxStoredBytes, "maxStoredBytes");
  database.exec("BEGIN DEFERRED");
  try {
    const head = database.prepare(queries.headSql).get(hostingProcessInstanceId);
    if (head === undefined) throw new TypeError("audit snapshot head is absent");
    if (head.stream_head !== undefined || head.stream_count !== undefined) {
      const streamHead = requireNonnegativeSafeInteger(head.stream_head, "audit stream head");
      const streamCount = requireNonnegativeSafeInteger(head.stream_count, "audit stream count");
      const complete = streamHead === 0
        ? streamCount === 0 && head.stream_first === null && head.stream_last === null
        : streamCount === streamHead &&
          requirePositiveSafeInteger(head.stream_first, "audit stream first ordinal") === 1 &&
          requirePositiveSafeInteger(head.stream_last, "audit stream last ordinal") === streamHead;
      if (!complete) {
        throw new TypeError("audit stream is not a complete prefix");
      }
    }
    const eventCount = requireNonnegativeSafeInteger(
      head.event_count,
      "audit snapshot event count",
    );
    const storedBytes = requireNonnegativeSafeInteger(
      head.stored_bytes,
      "audit snapshot stored bytes",
    );
    if (eventCount > limits.maxEvents || storedBytes > limits.maxStoredBytes) {
      throw new AuditSnapshotLimitError();
    }
    if (eventCount === 0) {
      if (head.head_ordinal !== null) {
        throw new TypeError("empty audit snapshot has a head ordinal");
      }
      database.exec("COMMIT");
      return { headEventId: null, events: [] };
    }
    const headOrdinal = requirePositiveSafeInteger(
      head.head_ordinal,
      "audit snapshot head ordinal",
    );
    const stored = database.prepare(queries.rowsSql)
      .all(hostingProcessInstanceId, headOrdinal)
      .map(queries.decodeRow);
    if (stored.length !== eventCount || stored.at(-1)?.ordinal !== headOrdinal) {
      throw new TypeError("audit snapshot rows disagree with its head");
    }
    const events = stored.map(({ event }) => event);
    const headEventId = events.at(-1)?.eventId;
    if (headEventId === undefined) {
      throw new TypeError("nonempty audit snapshot has no head event");
    }
    database.exec("COMMIT");
    return { headEventId, events };
  } catch (error: unknown) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

function requireNonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

function requireNonnegativeSafeInteger(
  value: SQLOutputValue | undefined,
  label: string,
): number {
  if (typeof value !== "number" && typeof value !== "bigint") {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return number;
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
