import { Buffer } from "node:buffer";

import {
  decodeExecutionPublicationExport,
  decodeExecutionPublicationPage,
  decodeExecutionPublicationRequest,
  decodePublicProcessInstanceIdentity,
  executionPublicationExportFormat,
  executionPublicationIdentityForPublicProcessInstance,
  serializeCanonicalExecutionPublicationValue,
} from "@bpmn-lean/platform-contracts";
import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  ExecutionPublicationExport,
  ExecutionPublicationIdentity,
  ExecutionPublicationPage,
  ExecutionPublicationRequest,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import {
  FlowNodeOccurrenceProjectionStatus,
} from "./flow-node-occurrence-projection.js";
import { occurrenceIdentityText } from "./flow-node-occurrence-storage.js";
import {
  PostgresqlProjectionReadKind,
  requireProjectionMaximumAge,
  unavailableProjectionRead,
} from "./postgresql-projection-read.js";
import type { PostgresqlProjectionRead } from "./postgresql-projection-read.js";

export type PostgresqlExecutionProjectionReaderOptions = Readonly<{
  runtime: PostgresqlRuntime;
  maxAgeMs: number;
}>;

/** Reads one complete aligned E1/occurrence projection from one statement snapshot. */
export class PostgresqlExecutionProjectionReader {
  readonly #runtime: PostgresqlRuntime;
  readonly #maxAgeMs: number;

  constructor(options: PostgresqlExecutionProjectionReaderOptions) {
    this.#runtime = options.runtime;
    this.#maxAgeMs = requireProjectionMaximumAge(options.maxAgeMs);
  }

  async page(
    processInstanceId: string,
    requestValue: ExecutionPublicationRequest,
  ): Promise<PostgresqlProjectionRead<ExecutionPublicationPage>> {
    const request = decodeExecutionPublicationRequest(structuredClone(requestValue));
    const processId = exactText(processInstanceId, "processInstanceId");
    return await this.#read(processId, request, false) as
      PostgresqlProjectionRead<ExecutionPublicationPage>;
  }

  async export(
    processInstanceId: string,
  ): Promise<PostgresqlProjectionRead<ExecutionPublicationExport>> {
    const processId = exactText(processInstanceId, "processInstanceId");
    return await this.#read(processId, { afterRevision: 0 }, true) as
      PostgresqlProjectionRead<ExecutionPublicationExport>;
  }

  async #read(
    processInstanceId: string,
    request: ExecutionPublicationRequest,
    exported: boolean,
  ): Promise<
    PostgresqlProjectionRead<ExecutionPublicationPage | ExecutionPublicationExport>
  > {
    const result = await this.#runtime.query<ExecutionReadRow>({
      text: executionReadSql,
      values: [
        Buffer.from(processInstanceId, "utf8"),
        request.afterRevision,
        request.limit ?? 50,
        exported,
      ],
    });
    try {
      return decodeRead(result.rows, request, exported, this.#maxAgeMs);
    } catch (error: unknown) {
      if (error instanceof RangeError && error.message === invalidCursorMessage) throw error;
      return unavailableProjectionRead();
    }
  }
}

const executionReadSql = `
  WITH statement_clock AS MATERIALIZED (
    SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_epoch_ms
  ),
  population_control AS MATERIALIZED (
    SELECT population_head
    FROM bpmn_platform.operate_incident_snapshot_control
    WHERE singleton = true
  ),
  registration AS MATERIALIZED (
    SELECT p.*
    FROM bpmn_platform.operate_process_instances AS p
    CROSS JOIN population_control AS control
    WHERE p.process_instance_id = $1
      AND p.population_ordinal <= control.population_head
  ),
  selected_batches AS MATERIALIZED (
    SELECT b.*
    FROM bpmn_platform.operate_execution_publication_batches AS b
    WHERE b.process_instance_id = $1
      AND ($4::boolean OR b.from_revision >= $2)
    ORDER BY b.from_revision
    LIMIT CASE WHEN $4::boolean THEN NULL::bigint ELSE $3::bigint END
  )
  SELECT
    clock.now_epoch_ms::text,
    control.population_head::text,
    (SELECT count(*)::text FROM bpmn_platform.operate_process_instances) AS registration_count,
    p.ordinal::text AS registration_ordinal,
    p.population_ordinal::text,
    p.process_instance_id,
    p.process_id,
    p.definition_version::text,
    p.source_sha256,
    p.public_identity_json,
    p.process_locator,
    p.observation,
    e.identity_json,
    e.status,
    e.head_revision::text,
    e.producer_head_revision::text,
    e.last_logical_time_ms::text,
    e.control_tokens_json,
    e.scopes_json,
    e.current_json,
    e.last_complete_observed_at_epoch_ms::text,
    e.current_process_status,
    o.identity_json AS occurrence_identity_json,
    o.status AS occurrence_status,
    o.head_revision::text AS occurrence_head_revision,
    o.producer_head_revision::text AS occurrence_producer_head_revision,
    o.current_open_json AS occurrence_current_open_json,
    o.last_complete_observed_at_epoch_ms::text AS occurrence_observed_at_epoch_ms,
    b.from_revision::text,
    b.through_revision::text,
    b.command_id,
    b.batch_json,
    x.revision::text,
    x.batch_from_revision::text,
    x.record_json
  FROM statement_clock AS clock
  LEFT JOIN population_control AS control ON true
  LEFT JOIN registration AS p ON true
  LEFT JOIN bpmn_platform.operate_execution_publications AS e
    ON e.process_instance_id = p.process_instance_id
  LEFT JOIN bpmn_platform.operate_flow_node_occurrence_publications AS o
    ON o.process_instance_id = p.process_instance_id
  LEFT JOIN selected_batches AS b
    ON b.process_instance_id = e.process_instance_id
  LEFT JOIN bpmn_platform.operate_execution_publication_records AS x
    ON x.process_instance_id = b.process_instance_id
      AND x.batch_from_revision = b.from_revision
  ORDER BY b.from_revision ASC NULLS LAST, x.revision ASC NULLS LAST
`;

function decodeRead(
  rows: readonly ExecutionReadRow[],
  request: ExecutionPublicationRequest,
  exported: boolean,
  maxAgeMs: number,
): PostgresqlProjectionRead<ExecutionPublicationPage | ExecutionPublicationExport> {
  const first = rows[0];
  if (first === undefined) throw new TypeError("projection read returned no context");
  const nowEpochMs = nonnegative(first.now_epoch_ms, "statement clock");
  const populationHead = nonnegative(first.population_head, "population head");
  if (nonnegative(first.registration_count, "registration count") !== populationHead) {
    throw new TypeError("projection population control drifted");
  }
  if (first.registration_ordinal === null) {
    return { kind: PostgresqlProjectionReadKind.NotFound };
  }
  const instance = decodeExactRegistration(first, populationHead);
  const identity = executionPublicationIdentityForPublicProcessInstance(instance);
  const headRevision = positive(first.head_revision, "execution head");
  const producerHead = positive(first.producer_head_revision, "execution producer head");
  const observedAfterEpochMs = nonnegative(
    first.last_complete_observed_at_epoch_ms,
    "execution completion watermark",
  );
  if (
    first.status !== ExecutionPublicationProjectionStatus.Healthy ||
    headRevision !== producerHead ||
    observedAfterEpochMs > nowEpochMs ||
    nowEpochMs - observedAfterEpochMs > maxAgeMs
  ) {
    throw new TypeError("execution projection is not fresh and complete");
  }
  requireAlignedOccurrence(first, identity, headRevision, nowEpochMs, maxAgeMs);
  const current = decodeExactJson<CurrentCommittedExecution>(first.current_json);
  if (
    current.revision !== headRevision ||
    current.state.status !== first.current_process_status ||
    current.state.logicalTimeMs !== nonnegative(first.last_logical_time_ms, "logical time") ||
    canonicalText(current.controlTokens) !== exactText(first.control_tokens_json, "tokens") ||
    canonicalText(current.scopes) !== exactText(first.scopes_json, "scopes")
  ) {
    throw new TypeError("execution current image drifted from redundant columns");
  }
  const storedIdentity = decodeExactJson<unknown>(first.identity_json);
  if (canonicalText(identity) !== canonicalText(storedIdentity)) {
    throw new TypeError("execution identity drifted from registration");
  }
  if (
    request.afterRevision > headRevision ||
    (request.afterRevision !== headRevision &&
      !rows.some((row) => nonnegative(row.from_revision, "batch cursor") === request.afterRevision))
  ) {
    throw new RangeError(invalidCursorMessage);
  }
  const batches = decodeBatches(rows);
  const throughRevision = batches.at(-1)?.throughRevision ?? request.afterRevision;
  const page = decodeExecutionPublicationPage({
    ...identity,
    requestedAfterRevision: request.afterRevision,
    pageThroughRevision: throughRevision,
    headRevision,
    batches,
    current: throughRevision === headRevision ? current : null,
  }, { ...identity, ...request });
  const value = exported
    ? decodeExecutionPublicationExport({
        format: executionPublicationExportFormat,
        ...identity,
        headRevision,
        batches,
        current,
      }, identity)
    : page;
  return {
    kind: PostgresqlProjectionReadKind.Available,
    read: {
      value: structuredClone(value),
      freshness: { observedAfterEpochMs, maxAgeMs },
    },
  };
}

function decodeExactRegistration(row: ExecutionReadRow, populationHead: number) {
  const instance = decodePublicProcessInstanceIdentity(JSON.parse(
    exactText(row.public_identity_json, "registration identity"),
  ));
  if (
    canonicalPlainText(instance) !== row.public_identity_json ||
    exactByteText(row.process_instance_id) !== instance.processInstanceId ||
    exactByteText(row.process_id) !== instance.definition.processId ||
    positive(row.definition_version, "definition version") !== instance.definition.version ||
    exactText(row.source_sha256, "source digest") !== instance.definition.source.sha256 ||
    positive(row.population_ordinal, "population ordinal") > populationHead ||
    positive(row.registration_ordinal, "registration ordinal") < 1 ||
    exactByteText(row.process_locator).length < 1 ||
    !["active", "closed", "indeterminate"].includes(String(row.observation))
  ) {
    throw new TypeError("execution registration identity drifted");
  }
  return instance;
}

function requireAlignedOccurrence(
  row: ExecutionReadRow,
  identity: ExecutionPublicationIdentity,
  executionHead: number,
  nowEpochMs: number,
  maxAgeMs: number,
): void {
  const observedAt = nonnegative(
    row.occurrence_observed_at_epoch_ms,
    "occurrence completion watermark",
  );
  if (
    row.occurrence_status !== FlowNodeOccurrenceProjectionStatus.Healthy ||
    positive(row.occurrence_head_revision, "occurrence head") !== executionHead ||
    positive(row.occurrence_producer_head_revision, "occurrence producer head") !== executionHead ||
    observedAt > nowEpochMs ||
    nowEpochMs - observedAt > maxAgeMs ||
    exactText(row.occurrence_identity_json, "occurrence identity") !==
      occurrenceIdentityText({ identity })
  ) {
    throw new TypeError("occurrence projection is not aligned and fresh");
  }
  const currentOpenText = exactText(
    row.occurrence_current_open_json,
    "occurrence current-open",
  );
  const currentOpen = JSON.parse(currentOpenText) as unknown;
  if (!Array.isArray(currentOpen) || JSON.stringify(currentOpen) !== currentOpenText) {
    throw new TypeError("occurrence current-open is invalid");
  }
}

function decodeBatches(rows: readonly ExecutionReadRow[]): CommittedTransitionBatch[] {
  const batches: CommittedTransitionBatch[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.from_revision === null) continue;
    const fromRevision = nonnegative(row.from_revision, "batch from revision");
    if (seen.has(fromRevision)) continue;
    const batch = decodeExactJson<CommittedTransitionBatch>(row.batch_json);
    if (
      batch.fromRevision !== fromRevision ||
      batch.throughRevision !== positive(row.through_revision, "batch through revision") ||
      batch.commandId !== exactByteText(row.command_id)
    ) {
      throw new TypeError("execution batch redundant columns drifted");
    }
    const records = rows.filter((candidate) =>
      candidate.batch_from_revision !== null &&
      nonnegative(candidate.batch_from_revision, "record batch cursor") === fromRevision
    );
    if (records.length !== batch.transitions.length) {
      throw new TypeError("execution record count drifted");
    }
    batch.transitions.forEach((transition, index) => {
      const record = records[index];
      if (
        record === undefined ||
        positive(record.revision, "record revision") !== transition.revision ||
        exactText(record.record_json, "record JSON") !== canonicalText(transition)
      ) {
        throw new TypeError("execution record redundant values drifted");
      }
    });
    batches.push(batch);
    seen.add(fromRevision);
  }
  return batches;
}

const invalidCursorMessage = "afterRevision must name a retained batch boundary";

function decodeExactJson<T>(value: unknown): T {
  const encoded = exactText(value, "canonical JSON");
  const decoded = JSON.parse(encoded) as T;
  if (canonicalText(decoded) !== encoded) throw new TypeError("stored JSON is not canonical");
  return decoded;
}

function canonicalText(value: unknown): string {
  return new TextDecoder().decode(serializeCanonicalExecutionPublicationValue(value));
}

function canonicalPlainText(value: unknown): string {
  return JSON.stringify(value);
}

function exactText(value: unknown, label = "text"): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed text`);
  }
  return value;
}

function exactByteText(value: unknown): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError("stored byte text is invalid");
  }
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
  if (!Buffer.from(decoded, "utf8").equals(Buffer.from(value))) {
    throw new TypeError("stored byte text is not exact UTF-8");
  }
  return decoded;
}

function nonnegative(value: unknown, label: string): number {
  const decoded = integer(value);
  if (decoded === null || decoded < 0) throw new TypeError(`${label} is invalid`);
  return decoded;
}

function positive(value: unknown, label: string): number {
  const decoded = nonnegative(value, label);
  if (decoded < 1) throw new TypeError(`${label} is not positive`);
  return decoded;
}

function integer(value: unknown): number | null {
  const decoded = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)
    ? Number(value)
    : typeof value === "bigint" ? Number(value) : value;
  return typeof decoded === "number" && Number.isSafeInteger(decoded) ? decoded : null;
}

type ExecutionReadRow = PostgresqlRow & Readonly<{
  now_epoch_ms: unknown;
  population_head: unknown;
  registration_count: unknown;
  registration_ordinal: unknown;
  population_ordinal: unknown;
  process_instance_id: unknown;
  process_id: unknown;
  definition_version: unknown;
  source_sha256: unknown;
  public_identity_json: unknown;
  process_locator: unknown;
  observation: unknown;
  identity_json: unknown;
  status: unknown;
  head_revision: unknown;
  producer_head_revision: unknown;
  last_logical_time_ms: unknown;
  control_tokens_json: unknown;
  scopes_json: unknown;
  current_json: unknown;
  last_complete_observed_at_epoch_ms: unknown;
  current_process_status: unknown;
  occurrence_identity_json: unknown;
  occurrence_status: unknown;
  occurrence_head_revision: unknown;
  occurrence_producer_head_revision: unknown;
  occurrence_current_open_json: unknown;
  occurrence_observed_at_epoch_ms: unknown;
  from_revision: unknown;
  through_revision: unknown;
  command_id: unknown;
  batch_json: unknown;
  revision: unknown;
  batch_from_revision: unknown;
  record_json: unknown;
}>;
