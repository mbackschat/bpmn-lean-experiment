import {
  decodeExecutionPublicationPage,
  decodePublicProcessInstanceIdentity,
  serializeCanonicalExecutionPublicationValue,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrencePage,
  OpenFlowNodeOccurrence,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationProjectionImage,
} from "./execution-publication-contracts.js";
import {
  applyExecutionPublicationPage,
  createEmptyExecutionPublicationProjection,
  projectionIdentityFromRegistration,
} from "./execution-publication-projection.js";
import {
  applyFlowNodeOccurrencePage,
  canonicalBatchText,
  canonicalOccurrenceText,
  createEmptyFlowNodeOccurrenceProjection,
  FlowNodeOccurrenceIntegrityError,
  FlowNodeOccurrenceProjectionStatus,
  FlowNodeOccurrenceStoredValueError,
  occurrenceIdentityFromRegistration,
} from "./flow-node-occurrence-projection.js";
import type {
  FlowNodeOccurrenceProjectionImage,
  ProjectedFlowNodeOccurrence,
} from "./flow-node-occurrence-projection.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export type PostgresqlOccurrenceSnapshot = Readonly<{
  registration: OperateProcessRegistration;
  execution: ExecutionPublicationProjectionImage | null;
  occurrence: FlowNodeOccurrenceProjectionImage | null;
}>;

/** Reads registration, occurrence state, and complete E1 authority in one statement snapshot. */
export async function readPostgresqlOccurrenceSnapshot(
  session: PostgresqlSession,
  processInstanceId: string,
): Promise<PostgresqlOccurrenceSnapshot | null> {
  const result = await session.query({
    text: `
      SELECT
        p.ordinal::text AS registration_ordinal,
        p.public_identity_json,
        p.process_locator,
        p.observation,
        o.identity_json AS occurrence_identity_json,
        o.status AS occurrence_status,
        o.head_revision::text AS occurrence_head_revision,
        o.producer_head_revision::text AS occurrence_producer_head_revision,
        o.last_committed_at_epoch_ms::text AS occurrence_last_committed_at_epoch_ms,
        o.current_open_json AS occurrence_current_open_json,
        e.identity_json AS execution_identity_json,
        e.status AS execution_status,
        e.head_revision::text AS execution_head_revision,
        e.producer_head_revision::text AS execution_producer_head_revision,
        e.last_logical_time_ms::text AS execution_last_logical_time_ms,
        e.control_tokens_json AS execution_control_tokens_json,
        e.scopes_json AS execution_scopes_json,
        e.current_json AS execution_current_json,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'from_revision', b.from_revision::text,
            'through_revision', b.through_revision::text,
            'command_id_hex', encode(b.command_id, 'hex'),
            'batch_json', b.batch_json
          ) ORDER BY b.from_revision)
          FROM bpmn_platform.operate_execution_publication_batches b
          WHERE b.process_instance_id = p.process_instance_id
        ), '[]'::jsonb) AS execution_batches,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'revision', r.revision::text,
            'batch_from_revision', r.batch_from_revision::text,
            'record_json', r.record_json
          ) ORDER BY r.revision)
          FROM bpmn_platform.operate_execution_publication_records r
          WHERE r.process_instance_id = p.process_instance_id
        ), '[]'::jsonb) AS execution_records,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'from_revision', b.from_revision::text,
            'through_revision', b.through_revision::text,
            'command_id_hex', encode(b.command_id, 'hex'),
            'committed_at_epoch_ms', b.committed_at_epoch_ms::text,
            'batch_json', b.batch_json
          ) ORDER BY b.from_revision)
          FROM bpmn_platform.operate_flow_node_occurrence_batches b
          WHERE b.process_instance_id = p.process_instance_id
        ), '[]'::jsonb) AS occurrence_batches,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'start_revision', n.start_revision::text,
            'start_index', n.start_index::text,
            'occurrence_json', n.occurrence_json
          ) ORDER BY n.start_revision, n.start_index)
          FROM bpmn_platform.operate_flow_node_occurrences n
          WHERE n.hosting_process_instance_id = p.process_instance_id
        ), '[]'::jsonb) AS occurrence_rows
      FROM bpmn_platform.operate_process_instances p
      LEFT JOIN bpmn_platform.operate_execution_publications e
        ON e.process_instance_id = p.process_instance_id
      LEFT JOIN bpmn_platform.operate_flow_node_occurrence_publications o
        ON o.process_instance_id = p.process_instance_id
      WHERE p.process_instance_id = $1
    `,
    values: [encodePostgresqlText(processInstanceId)],
  });
  try {
    const row = result.rows[0];
    if (row === undefined) return null;
    const registration = decodeRegistration(row);
    const execution = decodeExecution(row, registration);
    return {
      registration,
      execution,
      occurrence: decodeOccurrence(row, registration, execution),
    };
  } catch (error: unknown) {
    if (error instanceof FlowNodeOccurrenceStoredValueError) throw error;
    throw new FlowNodeOccurrenceStoredValueError(error);
  }
}

export function snapshotRegistration(
  value: OperateProcessRegistration,
): OperateProcessRegistration {
  const instance = decodePublicProcessInstanceIdentity(structuredClone(value.instance));
  const ordinal = requireInputPositive(value.ordinal, "registration.ordinal");
  const locator = requireInputText(value.locator, "registration.locator");
  switch (value.observation) {
    case "active":
    case "closed":
    case "indeterminate":
      return { instance, ordinal, locator, observation: value.observation };
    default:
      throw new TypeError("registration.observation is invalid");
  }
}

export function snapshotProcessInstanceId(value: string): string {
  return requireInputText(value, "processInstanceId");
}

export function requireMatchingRegistration(
  expected: OperateProcessRegistration,
  actual: OperateProcessRegistration,
): void {
  if (canonicalText(expected) !== canonicalText(actual)) {
    throw new FlowNodeOccurrenceIntegrityError(
      "occurrence publication registration changed",
    );
  }
}

export function encodePostgresqlText(value: string): Buffer {
  const exact = requireInputText(value, "PostgreSQL exact text");
  return Buffer.from(exact, "utf8");
}

export function occurrenceIdentityText(
  image: Pick<FlowNodeOccurrenceProjectionImage, "identity">,
): string {
  return JSON.stringify({
    definition: {
      compiler: image.identity.definition.compiler,
      semanticProfile: image.identity.definition.semanticProfile,
      sourceId: image.identity.definition.sourceId,
      sourceSha256: image.identity.definition.sourceSha256,
      sourceOverlay: image.identity.definition.sourceOverlay,
    },
    processId: image.identity.processId,
    processInstanceId: image.identity.processInstanceId,
  });
}

function decodeRegistration(row: PostgresqlRow): OperateProcessRegistration {
  const encoded = requireString(row, "public_identity_json");
  const instance = decodePublicProcessInstanceIdentity(JSON.parse(encoded));
  if (JSON.stringify(instance) !== encoded) {
    throw new TypeError("stored Process instance identity is not canonical");
  }
  const observation = requireString(row, "observation");
  if (
    observation !== "active" &&
    observation !== "closed" &&
    observation !== "indeterminate"
  ) {
    throw new TypeError("stored Process instance observation is invalid");
  }
  return {
    ordinal: requirePositive(row, "registration_ordinal"),
    instance,
    locator: requireByteText(row, "process_locator"),
    observation,
  };
}

function decodeExecution(
  row: PostgresqlRow,
  registration: OperateProcessRegistration,
): ExecutionPublicationProjectionImage | null {
  if (row.execution_identity_json === null) return null;
  const identity = projectionIdentityFromRegistration(registration);
  const storedIdentity = decodeExactJson(
    requireString(row, "execution_identity_json"),
    (value) => value,
    canonicalText,
  );
  if (canonicalText(identity) !== canonicalText(storedIdentity)) {
    throw new TypeError("stored E1 identity disagrees with registration");
  }
  const status = requireExecutionStatus(row);
  const headRevision = requireNonnegative(row, "execution_head_revision");
  const producerHeadRevision = requireNullablePositive(
    row,
    "execution_producer_head_revision",
  );
  const storedLastLogicalTime = requireNullableNonnegative(
    row,
    "execution_last_logical_time_ms",
  );
  const storedTokens = decodeExactJson(
    requireString(row, "execution_control_tokens_json"),
    requireArray,
    canonicalText,
  );
  const storedScopes = decodeExactJson(
    requireString(row, "execution_scopes_json"),
    requireArray,
    canonicalText,
  );
  const storedCurrent = row.execution_current_json === null
    ? null
    : decodeExactJson(
        requireString(row, "execution_current_json"),
        (value) => value as CurrentCommittedExecution,
        canonicalText,
      );
  const batches = decodeExecutionBatches(row);
  requireExactExecutionRecords(batches, requireObjectArray(row, "execution_records"));
  let image = createEmptyExecutionPublicationProjection(identity);
  if (headRevision > 0) {
    if (producerHeadRevision === null) {
      throw new TypeError("positive stored E1 head has no producer head");
    }
    for (const batch of batches) {
      image = applyExecutionPublicationPage(image, decodeExecutionPublicationPage({
        ...identity,
        requestedAfterRevision: batch.fromRevision,
        pageThroughRevision: batch.throughRevision,
        headRevision: producerHeadRevision,
        batches: [batch],
        current: batch.throughRevision === producerHeadRevision ? storedCurrent : null,
      }, { ...identity, afterRevision: batch.fromRevision, limit: 1 }));
    }
  } else if (
    batches.length > 0 ||
    producerHeadRevision !== null ||
    storedCurrent !== null
  ) {
    throw new TypeError("revision-zero E1 projection retained positive content");
  }
  if (
    image.headRevision !== headRevision ||
    image.lastLogicalTimeMs !== storedLastLogicalTime ||
    canonicalText(image.controlTokens) !== canonicalText(storedTokens) ||
    canonicalText(image.scopes) !== canonicalText(storedScopes) ||
    canonicalText(image.current) !== canonicalText(storedCurrent)
  ) {
    throw new TypeError("stored E1 projection columns disagree");
  }
  return { ...image, status };
}

function decodeExecutionBatches(row: PostgresqlRow): CommittedTransitionBatch[] {
  return requireObjectArray(row, "execution_batches").map((stored) => {
    const encoded = requireString(stored, "batch_json");
    const batch = decodeExactJson(
      encoded,
      (value) => value as CommittedTransitionBatch,
      canonicalText,
    );
    if (
      batch.fromRevision !== requireNonnegative(stored, "from_revision") ||
      batch.throughRevision !== requirePositive(stored, "through_revision") ||
      batch.commandId !== requireHexByteText(stored, "command_id_hex")
    ) {
      throw new TypeError("stored E1 batch columns disagree");
    }
    return batch;
  });
}

function requireExactExecutionRecords(
  batches: readonly CommittedTransitionBatch[],
  rows: readonly PostgresqlRow[],
): void {
  const expected = batches.flatMap((batch) => batch.transitions.map((record) => ({
    revision: record.revision,
    batchFromRevision: batch.fromRevision,
    encoded: canonicalText(record),
  })));
  if (expected.length !== rows.length) {
    throw new TypeError("stored E1 record count disagrees");
  }
  expected.forEach((record, index) => {
    const row = rows[index];
    if (
      row === undefined ||
      requirePositive(row, "revision") !== record.revision ||
      requireNonnegative(row, "batch_from_revision") !== record.batchFromRevision ||
      requireString(row, "record_json") !== record.encoded
    ) {
      throw new TypeError("stored E1 record changed");
    }
  });
}

function decodeOccurrence(
  row: PostgresqlRow,
  registration: OperateProcessRegistration,
  execution: ExecutionPublicationProjectionImage | null,
): FlowNodeOccurrenceProjectionImage | null {
  if (row.occurrence_identity_json === null) return null;
  const identity = occurrenceIdentityFromRegistration(registration);
  if (
    requireString(row, "occurrence_identity_json") !==
      occurrenceIdentityText({ identity })
  ) {
    throw new TypeError("stored occurrence identity disagrees with registration");
  }
  const status = requireOccurrenceStatus(row);
  const headRevision = requireNonnegative(row, "occurrence_head_revision");
  const producerHeadRevision = requireNullablePositive(
    row,
    "occurrence_producer_head_revision",
  );
  const storedLastCommittedAt = requireNullableNonnegative(
    row,
    "occurrence_last_committed_at_epoch_ms",
  );
  const storedCurrentOpenText = requireString(row, "occurrence_current_open_json");
  const batches = decodeOccurrenceBatches(row);
  let image = createEmptyFlowNodeOccurrenceProjection(identity);
  if (headRevision > 0) {
    if (producerHeadRevision === null || execution === null) {
      throw new TypeError("positive occurrence head has no E1 authority");
    }
    for (const batch of batches) {
      const page: FlowNodeOccurrencePage = {
        ...identity,
        requestedAfterRevision: batch.fromRevision,
        pageThroughRevision: batch.throughRevision,
        headRevision: producerHeadRevision,
        batches: [batch],
        currentOpen: batch.throughRevision === producerHeadRevision
          ? JSON.parse(storedCurrentOpenText) as OpenFlowNodeOccurrence[]
          : null,
      };
      image = applyFlowNodeOccurrencePage(image, page, execution, "mayBeAhead");
    }
  } else if (
    batches.length > 0 ||
    producerHeadRevision !== null ||
    storedLastCommittedAt !== null ||
    storedCurrentOpenText !== "[]"
  ) {
    throw new TypeError("revision-zero occurrence projection retained content");
  }
  const storedOccurrences = decodeOccurrenceRows(row, identity.processInstanceId);
  if (
    image.headRevision !== headRevision ||
    image.lastCommittedAtEpochMs !== storedLastCommittedAt ||
    JSON.stringify(image.currentOpen) !== storedCurrentOpenText ||
    storedOccurrences.length !== image.occurrences.length ||
    storedOccurrences.some((occurrence, index) =>
      canonicalOccurrenceText(occurrence) !==
        canonicalOccurrenceText(image.occurrences[index]!)
    )
  ) {
    throw new TypeError("stored occurrence projection columns disagree");
  }
  return { ...image, status };
}

function decodeOccurrenceBatches(row: PostgresqlRow): FlowNodeOccurrenceBatch[] {
  return requireObjectArray(row, "occurrence_batches").map((stored) => {
    const encoded = requireString(stored, "batch_json");
    const batch = JSON.parse(encoded) as FlowNodeOccurrenceBatch;
    if (
      canonicalBatchText(batch) !== encoded ||
      batch.fromRevision !== requireNonnegative(stored, "from_revision") ||
      batch.throughRevision !== requirePositive(stored, "through_revision") ||
      batch.commandId !== requireHexByteText(stored, "command_id_hex") ||
      batch.committedAtEpochMs !==
        requireNonnegative(stored, "committed_at_epoch_ms")
    ) {
      throw new TypeError("stored occurrence batch columns disagree");
    }
    return batch;
  });
}

function decodeOccurrenceRows(
  row: PostgresqlRow,
  processInstanceId: string,
): ProjectedFlowNodeOccurrence[] {
  return requireObjectArray(row, "occurrence_rows").map((stored) => {
    const encoded = requireString(stored, "occurrence_json");
    const occurrence = JSON.parse(encoded) as ProjectedFlowNodeOccurrence;
    if (
      canonicalOccurrenceText(occurrence) !== encoded ||
      occurrence.id.processInstanceId !== processInstanceId ||
      occurrence.id.startRevision !== requirePositive(stored, "start_revision") ||
      occurrence.id.startIndex !== requireNonnegative(stored, "start_index")
    ) {
      throw new TypeError("stored occurrence row columns disagree");
    }
    return occurrence;
  });
}

function requireExecutionStatus(row: PostgresqlRow): ExecutionPublicationProjectionStatus {
  switch (row.execution_status) {
    case ExecutionPublicationProjectionStatus.Healthy:
    case ExecutionPublicationProjectionStatus.Gap:
    case ExecutionPublicationProjectionStatus.Unavailable:
      return row.execution_status;
    default:
      throw new TypeError("stored E1 status is invalid");
  }
}

function requireOccurrenceStatus(row: PostgresqlRow): FlowNodeOccurrenceProjectionStatus {
  switch (row.occurrence_status) {
    case FlowNodeOccurrenceProjectionStatus.Healthy:
    case FlowNodeOccurrenceProjectionStatus.Gap:
    case FlowNodeOccurrenceProjectionStatus.Unavailable:
      return row.occurrence_status;
    default:
      throw new TypeError("stored occurrence status is invalid");
  }
}

function decodeExactJson<T>(
  encoded: string,
  decode: (value: unknown) => T,
  encode: (value: T) => string,
): T {
  const decoded = decode(JSON.parse(encoded));
  if (encode(decoded) !== encoded) {
    throw new TypeError("stored publication JSON is not canonical");
  }
  return decoded;
}

function canonicalText(value: unknown): string {
  return new TextDecoder().decode(serializeCanonicalExecutionPublicationValue(value));
}

function requireObjectArray(row: PostgresqlRow, field: string): PostgresqlRow[] {
  const value = row[field];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "object" || item === null || Array.isArray(item))
  ) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value as PostgresqlRow[];
}

function requireArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError("stored publication value is not an array");
  return value;
}

function requireString(row: PostgresqlRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

function requireByteText(row: PostgresqlRow, field: string): string {
  const value = row[field];
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  try {
    return requireInputText(utf8Decoder.decode(value), field);
  } catch (error: unknown) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`, { cause: error });
  }
}

function requireHexByteText(row: PostgresqlRow, field: string): string {
  const value = requireString(row, field);
  if (!/^(?:[0-9a-f]{2})+$/u.test(value)) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  try {
    return requireInputText(utf8Decoder.decode(Buffer.from(value, "hex")), field);
  } catch (error: unknown) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`, { cause: error });
  }
}

function requirePositive(row: PostgresqlRow, field: string): number {
  const value = requireSafeInteger(row, field);
  if (value <= 0) throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  return value;
}

function requireNonnegative(row: PostgresqlRow, field: string): number {
  const value = requireSafeInteger(row, field);
  if (value < 0) throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  return value;
}

function requireNullablePositive(row: PostgresqlRow, field: string): number | null {
  return row[field] === null ? null : requirePositive(row, field);
}

function requireNullableNonnegative(row: PostgresqlRow, field: string): number | null {
  return row[field] === null ? null : requireNonnegative(row, field);
}

function requireSafeInteger(row: PostgresqlRow, field: string): number {
  const raw = row[field];
  const value = typeof raw === "string" && /^(?:0|[1-9][0-9]*)$/u.test(raw)
    ? Number(raw)
    : raw;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`PostgreSQL stored value has invalid ${field}`);
  }
  return value;
}

function requireInputText(value: string, field: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${field} must be nonempty well-formed text`);
  }
  return value;
}

function requireInputPositive(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive safe integer`);
  }
  return value;
}
