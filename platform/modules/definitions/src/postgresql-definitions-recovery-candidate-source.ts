import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

export const DefinitionsRecoveryFamily = {
  ConfirmedRegistration: "definitions.confirmed-registration",
  DirectStart: "definitions.direct-start",
  Schedule: "definitions.schedule",
  MessageStart: "definitions.message-start",
} as const;

export type DefinitionsRecoveryFamily =
  typeof DefinitionsRecoveryFamily[keyof typeof DefinitionsRecoveryFamily];

export type DefinitionsRecoveryCandidate =
  | Readonly<{
      family: typeof DefinitionsRecoveryFamily.ConfirmedRegistration;
      processInstanceId: string;
    }>
  | Readonly<{
      family: typeof DefinitionsRecoveryFamily.DirectStart;
      processInstanceId: string;
    }>
  | Readonly<{
      family: typeof DefinitionsRecoveryFamily.Schedule;
      reference: Readonly<{
        processId: string;
        version: number;
        scheduleId: string;
      }>;
    }>
  | Readonly<{
      family: typeof DefinitionsRecoveryFamily.MessageStart;
      publicationId: string;
    }>;

const candidateLimit = 10_000;
const itemKeyByteLimit = 4_096;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Bounded, read-only candidate discovery for shared Definitions recovery. */
export class PostgresqlDefinitionsRecoveryCandidateSource {
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async listCandidateKeys(
    family: DefinitionsRecoveryFamily,
    limit: number,
  ): Promise<readonly Uint8Array[]> {
    requireLimit(limit);
    const rows = await this.#query(family, limit);
    return rows.map((row) => encodeDefinitionsRecoveryCandidateKey(
      decodeCandidateRow(family, row),
    ));
  }

  async #query(
    family: DefinitionsRecoveryFamily,
    limit: number,
  ): Promise<readonly PostgresqlRow[]> {
    switch (family) {
      case DefinitionsRecoveryFamily.ConfirmedRegistration:
        return (await this.#runtime.query({
          text: `
            SELECT process_instance_id
            FROM bpmn_platform.confirmed_process_instances
            WHERE state = 'confirmed' AND (operate_pending OR work_pending)
            ORDER BY process_instance_id ASC
            LIMIT $1
          `,
          values: [limit],
        })).rows;
      case DefinitionsRecoveryFamily.DirectStart:
        return (await this.#runtime.query({
          text: `
            SELECT process_instance_id
            FROM bpmn_platform.confirmed_process_instances
            WHERE state IN ('reserved', 'starting', 'indeterminate')
            ORDER BY process_instance_id ASC
            LIMIT $1
          `,
          values: [limit],
        })).rows;
      case DefinitionsRecoveryFamily.Schedule:
        return (await this.#runtime.query({
          text: `
            SELECT schedule.process_id, schedule.version, schedule.schedule_id
            FROM bpmn_platform.definition_schedules AS schedule
            WHERE schedule.state IN ('creating', 'creatingHost', 'scheduled', 'cancelling')
              OR NOT schedule.cleanup_complete
              OR (
                schedule.state = 'started'
                AND NOT EXISTS (
                  SELECT 1
                  FROM bpmn_platform.confirmed_process_instances AS confirmed
                  WHERE confirmed.process_instance_id = schedule.process_instance_id
                    AND confirmed.state = 'confirmed'
                )
              )
            ORDER BY schedule.process_id ASC, schedule.version ASC, schedule.schedule_id ASC
            LIMIT $1
          `,
          values: [limit],
        })).rows;
      case DefinitionsRecoveryFamily.MessageStart:
        return (await this.#runtime.query({
          text: `
            SELECT publication.publication_id
            FROM bpmn_platform.message_start_publications AS publication
            WHERE publication.state IN ('reserved', 'starting', 'indeterminate')
              OR (
                publication.state = 'accepted'
                AND NOT EXISTS (
                  SELECT 1
                  FROM bpmn_platform.confirmed_process_instances AS confirmed
                  WHERE confirmed.process_instance_id = publication.process_instance_id
                    AND confirmed.state = 'confirmed'
                )
              )
            ORDER BY publication.publication_id ASC
            LIMIT $1
          `,
          values: [limit],
        })).rows;
      default:
        return assertNever(family);
    }
  }
}

/** Encodes one closed candidate as strict canonical JSON bytes. */
export function encodeDefinitionsRecoveryCandidateKey(
  candidate: DefinitionsRecoveryCandidate,
): Uint8Array {
  let value: readonly unknown[];
  switch (candidate.family) {
    case DefinitionsRecoveryFamily.ConfirmedRegistration:
    case DefinitionsRecoveryFamily.DirectStart:
      requireIdentity(candidate.processInstanceId, "processInstanceId");
      value = [candidate.processInstanceId];
      break;
    case DefinitionsRecoveryFamily.Schedule:
      requireIdentity(candidate.reference.processId, "processId");
      requireVersion(candidate.reference.version);
      requireIdentity(candidate.reference.scheduleId, "scheduleId");
      value = [
        candidate.reference.processId,
        candidate.reference.version,
        candidate.reference.scheduleId,
      ];
      break;
    case DefinitionsRecoveryFamily.MessageStart:
      requireIdentity(candidate.publicationId, "publicationId");
      value = [candidate.publicationId];
      break;
    default:
      return assertNever(candidate);
  }
  const encoded = encoder.encode(JSON.stringify(value));
  if (encoded.byteLength > itemKeyByteLimit) {
    throw new TypeError("Definitions recovery candidate key exceeds 4096 bytes");
  }
  return encoded;
}

/** Decodes only the exact canonical form for the supplied closed family. */
export function decodeDefinitionsRecoveryCandidateKey(
  family: DefinitionsRecoveryFamily,
  itemKey: Uint8Array,
): DefinitionsRecoveryCandidate {
  if (!(itemKey instanceof Uint8Array) || itemKey.byteLength === 0) {
    throw new TypeError("Definitions recovery candidate key must be nonempty bytes");
  }
  if (itemKey.byteLength > itemKeyByteLimit) {
    throw new TypeError("Definitions recovery candidate key exceeds 4096 bytes");
  }
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(itemKey));
  } catch (cause: unknown) {
    throw new TypeError("Definitions recovery candidate key is not UTF-8 JSON", {
      cause,
    });
  }
  if (!Array.isArray(value)) {
    throw new TypeError("Definitions recovery candidate key must be a JSON array");
  }
  let candidate: DefinitionsRecoveryCandidate;
  switch (family) {
    case DefinitionsRecoveryFamily.ConfirmedRegistration:
    case DefinitionsRecoveryFamily.DirectStart:
      requireArrayLength(value, 1);
      requireIdentity(value[0], "processInstanceId");
      candidate = { family, processInstanceId: value[0] };
      break;
    case DefinitionsRecoveryFamily.Schedule:
      requireArrayLength(value, 3);
      requireIdentity(value[0], "processId");
      requireVersion(value[1]);
      requireIdentity(value[2], "scheduleId");
      candidate = {
        family,
        reference: {
          processId: value[0],
          version: value[1],
          scheduleId: value[2],
        },
      };
      break;
    case DefinitionsRecoveryFamily.MessageStart:
      requireArrayLength(value, 1);
      requireIdentity(value[0], "publicationId");
      candidate = { family, publicationId: value[0] };
      break;
    default:
      return assertNever(family);
  }
  if (!sameBytes(itemKey, encodeDefinitionsRecoveryCandidateKey(candidate))) {
    throw new TypeError("Definitions recovery candidate key is not canonical JSON");
  }
  return candidate;
}

function decodeCandidateRow(
  family: DefinitionsRecoveryFamily,
  row: PostgresqlRow,
): DefinitionsRecoveryCandidate {
  switch (family) {
    case DefinitionsRecoveryFamily.ConfirmedRegistration:
    case DefinitionsRecoveryFamily.DirectStart:
      return {
        family,
        processInstanceId: decodeByteText(row.process_instance_id),
      };
    case DefinitionsRecoveryFamily.Schedule:
      return {
        family,
        reference: {
          processId: decodeByteText(row.process_id),
          version: decodeVersion(row.version),
          scheduleId: decodeByteText(row.schedule_id),
        },
      };
    case DefinitionsRecoveryFamily.MessageStart:
      return {
        family,
        publicationId: decodeByteText(row.publication_id),
      };
    default:
      return assertNever(family);
  }
}

function decodeByteText(value: unknown): string {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("PostgreSQL Definitions recovery identity must be bytea");
  }
  const decoded = decoder.decode(value);
  requireIdentity(decoded, "PostgreSQL recovery identity");
  return decoded;
}

function decodeVersion(value: unknown): number {
  const decoded = typeof value === "string" ? Number(value) : value;
  requireVersion(decoded);
  return decoded;
}

function requireLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > candidateLimit) {
    throw new TypeError("Definitions recovery candidate limit must be 1..10000");
  }
}

function requireIdentity(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
}

function requireVersion(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new TypeError("Definitions recovery version must be a positive safe integer");
  }
}

function requireArrayLength(value: unknown[], length: number): void {
  if (value.length !== length) {
    throw new TypeError("Definitions recovery candidate key has the wrong shape");
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index]);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Definitions recovery family: ${String(value)}`);
}
