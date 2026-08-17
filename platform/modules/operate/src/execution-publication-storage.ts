import { Buffer } from "node:buffer";

import {
  decodeExecutionPublicationPage,
  decodePublicProcessInstanceIdentity,
  serializeCanonicalExecutionPublicationValue,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  ExecutionPublicationIdentity,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  ExecutionPublicationProjectionStatus,
  ExecutionPublicationStoredValueError,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationProjectionImage,
} from "./execution-publication-contracts.js";
import {
  applyExecutionPublicationPage,
  createEmptyExecutionPublicationProjection,
  projectionIdentityFromRegistration,
} from "./execution-publication-projection.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";
import {
  requireObservation,
} from "./incident-values.js";

export type StoredExecutionPublication = Readonly<{
  registration: OperateProcessRegistration;
  image: ExecutionPublicationProjectionImage | null;
}>;

/** Reads one registration and its complete publication prefix from one MVCC snapshot. */
export async function readStoredExecutionPublication(
  session: PostgresqlSession,
  processInstanceId: string,
  lockRegistration: boolean,
): Promise<StoredExecutionPublication | null> {
  const result = await session.query({
    text: publicationReadSql(lockRegistration),
    values: [encodeByteText(processInstanceId)],
  });
  try {
    return decodeStoredPublication(result.rows);
  } catch (error: unknown) {
    if (error instanceof ExecutionPublicationStoredValueError) throw error;
    throw new ExecutionPublicationStoredValueError(error);
  }
}

export async function writeExecutionPublicationHeader(
  session: PostgresqlSession,
  image: ExecutionPublicationProjectionImage,
): Promise<void> {
  await session.query({
    text: `
      INSERT INTO bpmn_platform.operate_execution_publications (
        process_instance_id, identity_json, status, head_revision,
        producer_head_revision, last_logical_time_ms, control_tokens_json,
        scopes_json, current_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (process_instance_id) DO UPDATE SET
        identity_json = excluded.identity_json,
        status = excluded.status,
        head_revision = excluded.head_revision,
        producer_head_revision = excluded.producer_head_revision,
        last_logical_time_ms = excluded.last_logical_time_ms,
        control_tokens_json = excluded.control_tokens_json,
        scopes_json = excluded.scopes_json,
        current_json = excluded.current_json
    `,
    values: [
      encodeByteText(image.identity.processInstanceId),
      canonicalText(image.identity),
      image.status,
      image.headRevision,
      image.producerHeadRevision,
      image.lastLogicalTimeMs,
      canonicalText(image.controlTokens),
      canonicalText(image.scopes),
      image.current === null ? null : canonicalText(image.current),
    ],
  });
}

export async function insertExecutionPublicationBatches(
  session: PostgresqlSession,
  processInstanceId: string,
  batches: readonly CommittedTransitionBatch[],
): Promise<void> {
  for (const batch of batches) {
    await session.query({
      text: `
        INSERT INTO bpmn_platform.operate_execution_publication_batches (
          process_instance_id, from_revision, through_revision, command_id, batch_json
        ) VALUES ($1, $2, $3, $4, $5)
      `,
      values: [
        encodeByteText(processInstanceId),
        batch.fromRevision,
        batch.throughRevision,
        encodeByteText(batch.commandId),
        canonicalText(batch),
      ],
    });
    for (const record of batch.transitions) {
      await session.query({
        text: `
          INSERT INTO bpmn_platform.operate_execution_publication_records (
            process_instance_id, revision, batch_from_revision, record_json
          ) VALUES ($1, $2, $3, $4)
        `,
        values: [
          encodeByteText(processInstanceId),
          record.revision,
          batch.fromRevision,
          canonicalText(record),
        ],
      });
    }
  }
}

export async function deleteExecutionPublicationPrefix(
  session: PostgresqlSession,
  processInstanceId: string,
): Promise<void> {
  const encodedId = encodeByteText(processInstanceId);
  await session.query({
    text: `
      DELETE FROM bpmn_platform.operate_execution_publication_records
      WHERE process_instance_id = $1
    `,
    values: [encodedId],
  });
  await session.query({
    text: `
      DELETE FROM bpmn_platform.operate_execution_publication_batches
      WHERE process_instance_id = $1
    `,
    values: [encodedId],
  });
}

export function encodeByteText(value: string): Uint8Array {
  if (value.length === 0 || !value.isWellFormed()) {
    throw new TypeError("PostgreSQL byte text must be nonempty well-formed Unicode");
  }
  return Buffer.from(value, "utf8");
}

export function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return canonicalText(left) === canonicalText(right);
}

function publicationReadSql(lockRegistration: boolean): string {
  return `
    WITH registration AS MATERIALIZED (
      SELECT
        ordinal,
        process_instance_id,
        public_identity_json,
        process_locator,
        observation
      FROM bpmn_platform.operate_process_instances
      WHERE process_instance_id = $1
      ${lockRegistration ? "FOR UPDATE" : ""}
    )
    SELECT
      r.ordinal AS registration_ordinal,
      r.process_instance_id AS registration_process_instance_id,
      r.public_identity_json AS registration_identity_json,
      r.process_locator AS registration_locator,
      r.observation AS registration_observation,
      e.identity_json,
      e.status,
      e.head_revision,
      e.producer_head_revision,
      e.last_logical_time_ms,
      e.control_tokens_json,
      e.scopes_json,
      e.current_json,
      b.from_revision,
      b.through_revision,
      b.command_id,
      b.batch_json,
      x.revision,
      x.batch_from_revision,
      x.record_json
    FROM registration r
    LEFT JOIN bpmn_platform.operate_execution_publications e
      ON e.process_instance_id = r.process_instance_id
    LEFT JOIN bpmn_platform.operate_execution_publication_batches b
      ON b.process_instance_id = e.process_instance_id
    LEFT JOIN bpmn_platform.operate_execution_publication_records x
      ON x.process_instance_id = b.process_instance_id
      AND x.batch_from_revision = b.from_revision
    ORDER BY b.from_revision ASC NULLS LAST, x.revision ASC NULLS LAST
  `;
}

function decodeStoredPublication(
  rows: readonly PostgresqlRow[],
): StoredExecutionPublication | null {
  const first = rows[0];
  if (first === undefined) return null;
  const registration = decodeRegistration(first);
  if (first.identity_json === null) {
    requireAllNull(first, [
      "status", "head_revision", "producer_head_revision", "last_logical_time_ms",
      "control_tokens_json", "scopes_json", "current_json", "from_revision",
      "through_revision", "command_id", "batch_json", "revision",
      "batch_from_revision", "record_json",
    ]);
    return { registration, image: null };
  }
  return { registration, image: decodeImage(rows, registration) };
}

function decodeRegistration(row: PostgresqlRow): OperateProcessRegistration {
  const processInstanceId = decodeByteText(
    row.registration_process_instance_id,
    "registration_process_instance_id",
  );
  const identityJson = requireText(
    row.registration_identity_json,
    "registration_identity_json",
  );
  const instance = decodePublicProcessInstanceIdentity(JSON.parse(identityJson));
  if (
    JSON.stringify(instance) !== identityJson ||
    instance.processInstanceId !== processInstanceId
  ) {
    throw new TypeError("stored registration identity disagrees with its key");
  }
  return {
    ordinal: requirePositive(row.registration_ordinal, "registration_ordinal"),
    instance,
    locator: decodeByteText(row.registration_locator, "registration_locator"),
    observation: requireObservation(row.registration_observation),
  };
}

function decodeImage(
  rows: readonly PostgresqlRow[],
  registration: OperateProcessRegistration,
): ExecutionPublicationProjectionImage {
  const first = rows[0]!;
  const identity = projectionIdentityFromRegistration(registration);
  const storedIdentity = decodeExactJson(
    requireText(first.identity_json, "identity_json"),
    (value) => value as ExecutionPublicationIdentity,
  );
  if (!sameCanonicalValue(identity, storedIdentity)) {
    throw new TypeError("stored publication identity disagrees with registration");
  }
  const header = decodeHeader(first);
  const batches = decodeBatches(rows);
  requireExactRecords(batches, rows);
  let image = createEmptyExecutionPublicationProjection(identity);
  if (header.headRevision > 0) {
    if (header.producerHeadRevision === null) {
      throw new TypeError("positive stored head has no producer head");
    }
    for (const batch of batches) {
      const reachesProducer = batch.throughRevision === header.producerHeadRevision;
      image = applyExecutionPublicationPage(image, decodeExecutionPublicationPage({
        ...identity,
        requestedAfterRevision: batch.fromRevision,
        pageThroughRevision: batch.throughRevision,
        headRevision: header.producerHeadRevision,
        batches: [batch],
        current: reachesProducer ? header.current : null,
      }, {
        ...identity,
        afterRevision: batch.fromRevision,
        limit: 1,
      }));
    }
  } else if (
    batches.length > 0 ||
    header.producerHeadRevision !== null ||
    header.current !== null
  ) {
    throw new TypeError("revision-zero projection retained positive publication content");
  }
  if (
    image.headRevision !== header.headRevision ||
    image.lastLogicalTimeMs !== header.lastLogicalTimeMs ||
    !sameCanonicalValue(image.controlTokens, header.controlTokens) ||
    !sameCanonicalValue(image.scopes, header.scopes) ||
    !sameCanonicalValue(image.current, header.current)
  ) {
    throw new TypeError("stored publication projection columns disagree");
  }
  return { ...image, status: header.status };
}

function decodeHeader(row: PostgresqlRow): Readonly<{
  status: ExecutionPublicationProjectionStatus;
  headRevision: number;
  producerHeadRevision: number | null;
  lastLogicalTimeMs: number | null;
  controlTokens: readonly unknown[];
  scopes: readonly unknown[];
  current: CurrentCommittedExecution | null;
}> {
  return {
    status: requireStatus(row.status),
    headRevision: requireNonnegative(row.head_revision, "head_revision"),
    producerHeadRevision: row.producer_head_revision === null
      ? null
      : requirePositive(row.producer_head_revision, "producer_head_revision"),
    lastLogicalTimeMs: row.last_logical_time_ms === null
      ? null
      : requireNonnegative(row.last_logical_time_ms, "last_logical_time_ms"),
    controlTokens: decodeExactJson(
      requireText(row.control_tokens_json, "control_tokens_json"),
      requireArray,
    ),
    scopes: decodeExactJson(requireText(row.scopes_json, "scopes_json"), requireArray),
    current: row.current_json === null
      ? null
      : decodeExactJson(
          requireText(row.current_json, "current_json"),
          (value) => value as CurrentCommittedExecution,
        ),
  };
}

function decodeBatches(rows: readonly PostgresqlRow[]): CommittedTransitionBatch[] {
  const batches: CommittedTransitionBatch[] = [];
  let priorFromRevision: number | null = null;
  for (const row of rows) {
    if (row.from_revision === null) continue;
    const fromRevision = requireNonnegative(row.from_revision, "from_revision");
    if (fromRevision === priorFromRevision) continue;
    const batch = decodeExactJson(
      requireText(row.batch_json, "batch_json"),
      (value) => value as CommittedTransitionBatch,
    );
    if (
      batch.fromRevision !== fromRevision ||
      batch.throughRevision !== requirePositive(row.through_revision, "through_revision") ||
      batch.commandId !== decodeByteText(row.command_id, "command_id")
    ) {
      throw new TypeError("stored publication batch columns disagree");
    }
    batches.push(batch);
    priorFromRevision = fromRevision;
  }
  return batches;
}

function requireExactRecords(
  batches: readonly CommittedTransitionBatch[],
  rows: readonly PostgresqlRow[],
): void {
  const expected = batches.flatMap((batch) => batch.transitions.map((record) => ({
    revision: record.revision,
    batchFromRevision: batch.fromRevision,
    encoded: canonicalText(record),
  })));
  const actual = rows.filter((row) => row.revision !== null);
  if (expected.length !== actual.length) {
    throw new TypeError("stored publication record count disagrees");
  }
  expected.forEach((record, index) => {
    const row = actual[index];
    if (
      row === undefined ||
      requirePositive(row.revision, "revision") !== record.revision ||
      requireNonnegative(row.batch_from_revision, "batch_from_revision") !==
        record.batchFromRevision ||
      requireText(row.record_json, "record_json") !== record.encoded
    ) {
      throw new TypeError("stored publication record changed");
    }
  });
}

function requireAllNull(row: PostgresqlRow, names: readonly string[]): void {
  for (const name of names) {
    if (row[name] !== null) throw new TypeError("publication outer join is inconsistent");
  }
}

function requireStatus(value: unknown): ExecutionPublicationProjectionStatus {
  switch (value) {
    case ExecutionPublicationProjectionStatus.Healthy:
    case ExecutionPublicationProjectionStatus.Gap:
    case ExecutionPublicationProjectionStatus.Unavailable:
      return value;
    default:
      throw new TypeError("stored publication status is invalid");
  }
}

function decodeExactJson<T>(
  encoded: string,
  decode: (value: unknown) => T,
): T {
  const decoded = decode(JSON.parse(encoded));
  if (canonicalText(decoded) !== encoded) {
    throw new TypeError("stored publication JSON is not canonical");
  }
  return decoded;
}

function requireArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError("stored publication collection is invalid");
  return value;
}

function decodeByteText(value: unknown, name: string): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError(`${name} must be nonempty bytes`);
  }
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
  if (!Buffer.from(decoded, "utf8").equals(Buffer.from(value))) {
    throw new TypeError(`${name} must be exact UTF-8`);
  }
  return decoded;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be nonempty text`);
  }
  return value;
}

function requirePositive(value: unknown, name: string): number {
  const decoded = decodeInteger(value);
  if (decoded === null || decoded <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return decoded;
}

function requireNonnegative(value: unknown, name: string): number {
  const decoded = decodeInteger(value);
  if (decoded === null || decoded < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  }
  return decoded;
}

function decodeInteger(value: unknown): number | null {
  const decoded = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)
    ? Number(value)
    : typeof value === "bigint" ? Number(value) : value;
  return typeof decoded === "number" && Number.isSafeInteger(decoded) ? decoded : null;
}

function canonicalText(value: unknown): string {
  return new TextDecoder().decode(serializeCanonicalExecutionPublicationValue(value));
}
