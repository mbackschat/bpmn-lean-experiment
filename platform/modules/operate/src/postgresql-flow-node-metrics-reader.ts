import { Buffer } from "node:buffer";

import {
  FlowNodeMetricsResultKind,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  FlowNodeMetricsResult,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import {
  ExecutionPublicationReconciliationKind,
} from "./execution-publication-reconciliation-service.js";
import {
  createEmptyExecutionPublicationProjection,
  projectionIdentityFromRegistration,
} from "./execution-publication-projection.js";
import { FlowNodeMetricsAggregationService } from "./flow-node-metrics-aggregation-service.js";
import {
  createEmptyFlowNodeOccurrenceProjection,
  FlowNodeOccurrenceProjectionStatus,
  occurrenceIdentityFromRegistration,
} from "./flow-node-occurrence-projection.js";
import {
  FlowNodeOccurrenceReconciliationKind,
} from "./flow-node-occurrence-reconciliation-service.js";
import {
  decodePostgresqlOccurrenceSnapshotRow,
} from "./flow-node-occurrence-storage.js";
import type {
  PostgresqlOccurrenceSnapshot,
} from "./flow-node-occurrence-storage.js";
import {
  PostgresqlProjectionReadKind,
  requireProjectionMaximumAge,
  unavailableProjectionRead,
} from "./postgresql-projection-read.js";
import type { PostgresqlProjectionRead } from "./postgresql-projection-read.js";

export type PostgresqlFlowNodeMetricsReaderOptions = Readonly<{
  runtime: PostgresqlRuntime;
  maxAgeMs: number;
}>;

/** Aggregates one exact-definition population captured and verified by one SQL statement. */
export class PostgresqlFlowNodeMetricsReader {
  readonly #runtime: PostgresqlRuntime;
  readonly #maxAgeMs: number;

  constructor(options: PostgresqlFlowNodeMetricsReaderOptions) {
    this.#runtime = options.runtime;
    this.#maxAgeMs = requireProjectionMaximumAge(options.maxAgeMs);
  }

  async read(
    definitionValue: DeployedDefinitionVersion,
  ): Promise<PostgresqlProjectionRead<FlowNodeMetricsResult>> {
    const definition = structuredClone(definitionValue);
    const result = await this.#runtime.query<MetricsReadRow>({
      text: metricsReadSql,
      values: [
        Buffer.from(exactText(definition.processId), "utf8"),
        positiveInput(definition.version),
        exactDigest(definition.source.sha256),
      ],
    });
    try {
      return await decodeMetricsRead(result.rows, definition, this.#maxAgeMs);
    } catch {
      return unavailableProjectionRead();
    }
  }
}

const metricsReadSql = `
  WITH statement_clock AS MATERIALIZED (
    SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_epoch_ms
  ),
  population_control AS MATERIALIZED (
    SELECT population_head
    FROM bpmn_platform.operate_incident_snapshot_control
    WHERE singleton = true
  ),
  exact_population AS MATERIALIZED (
    SELECT p.*
    FROM bpmn_platform.operate_process_instances AS p
    CROSS JOIN population_control AS control
    WHERE p.population_ordinal <= control.population_head
      AND p.process_id = $1
      AND p.definition_version = $2
      AND p.source_sha256 = $3
    ORDER BY p.population_ordinal
    LIMIT 101
  )
  SELECT
    clock.now_epoch_ms::text,
    control.population_head::text,
    (SELECT count(*)::text FROM bpmn_platform.operate_process_instances) AS registration_count,
    (SELECT count(*)::text FROM exact_population) AS exact_population_count,
    p.ordinal::text AS registration_ordinal,
    p.population_ordinal::text,
    p.process_instance_id,
    p.process_id,
    p.definition_version::text,
    p.source_sha256,
    p.public_identity_json,
    p.process_locator,
    p.observation,
    e.identity_json AS execution_identity_json,
    e.status AS execution_status,
    e.head_revision::text AS execution_head_revision,
    e.producer_head_revision::text AS execution_producer_head_revision,
    e.last_logical_time_ms::text AS execution_last_logical_time_ms,
    e.control_tokens_json AS execution_control_tokens_json,
    e.scopes_json AS execution_scopes_json,
    e.current_json AS execution_current_json,
    e.last_complete_observed_at_epoch_ms::text AS execution_observed_at_epoch_ms,
    e.current_process_status,
    o.identity_json AS occurrence_identity_json,
    o.status AS occurrence_status,
    o.head_revision::text AS occurrence_head_revision,
    o.producer_head_revision::text AS occurrence_producer_head_revision,
    o.last_committed_at_epoch_ms::text AS occurrence_last_committed_at_epoch_ms,
    o.current_open_json AS occurrence_current_open_json,
    o.last_complete_observed_at_epoch_ms::text AS occurrence_observed_at_epoch_ms,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'from_revision', b.from_revision::text,
        'through_revision', b.through_revision::text,
        'command_id_hex', encode(b.command_id, 'hex'),
        'batch_json', b.batch_json
      ) ORDER BY b.from_revision)
      FROM bpmn_platform.operate_execution_publication_batches AS b
      WHERE b.process_instance_id = p.process_instance_id
    ), '[]'::jsonb) AS execution_batches,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'revision', r.revision::text,
        'batch_from_revision', r.batch_from_revision::text,
        'record_json', r.record_json
      ) ORDER BY r.revision)
      FROM bpmn_platform.operate_execution_publication_records AS r
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
      FROM bpmn_platform.operate_flow_node_occurrence_batches AS b
      WHERE b.process_instance_id = p.process_instance_id
    ), '[]'::jsonb) AS occurrence_batches,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'start_revision', n.start_revision::text,
        'start_index', n.start_index::text,
        'occurrence_json', n.occurrence_json
      ) ORDER BY n.start_revision, n.start_index)
      FROM bpmn_platform.operate_flow_node_occurrences AS n
      WHERE n.hosting_process_instance_id = p.process_instance_id
    ), '[]'::jsonb) AS occurrence_rows
  FROM statement_clock AS clock
  LEFT JOIN population_control AS control ON true
  LEFT JOIN exact_population AS p ON true
  LEFT JOIN bpmn_platform.operate_execution_publications AS e
    ON e.process_instance_id = p.process_instance_id
  LEFT JOIN bpmn_platform.operate_flow_node_occurrence_publications AS o
    ON o.process_instance_id = p.process_instance_id
  ORDER BY p.population_ordinal ASC NULLS LAST
`;

async function decodeMetricsRead(
  rows: readonly MetricsReadRow[],
  definition: DeployedDefinitionVersion,
  maxAgeMs: number,
): Promise<PostgresqlProjectionRead<FlowNodeMetricsResult>> {
  const first = rows[0];
  if (first === undefined) throw new TypeError("metrics statement returned no context");
  const nowEpochMs = nonnegative(first.now_epoch_ms);
  const populationHead = nonnegative(first.population_head);
  if (nonnegative(first.registration_count) !== populationHead) {
    throw new TypeError("metrics population control drifted");
  }
  const populationCount = nonnegative(first.exact_population_count);
  if (populationCount > 100) throw new TypeError("metrics population ceiling exceeded");
  if (populationCount === 0) {
    if (rows.length !== 1 || first.registration_ordinal !== null) {
      throw new TypeError("empty population retained a member row");
    }
    return available(await aggregate(definition, []), nowEpochMs, maxAgeMs);
  }
  if (rows.length !== populationCount) throw new TypeError("metrics population is incomplete");

  const snapshots: PostgresqlOccurrenceSnapshot[] = [];
  const observedAt: number[] = [];
  const ordinals = new Set<number>();
  for (const row of rows) {
    const snapshot = decodePostgresqlOccurrenceSnapshotRow(row);
    requireExactRegistration(row, snapshot, definition, populationHead, ordinals);
    if (snapshot.registration.observation === "indeterminate") {
      throw new TypeError("indeterminate registration cannot prove metrics coverage");
    }
    if (snapshot.execution === null && snapshot.occurrence === null) {
      if (snapshot.registration.observation !== "closed") {
        throw new TypeError("nonterminal registration has no projections");
      }
      snapshots.push(snapshot);
      continue;
    }
    if (snapshot.execution === null || snapshot.occurrence === null) {
      throw new TypeError("metrics projection pair is incomplete");
    }
    const executionObserved = nonnegative(row.execution_observed_at_epoch_ms);
    const occurrenceObserved = nonnegative(row.occurrence_observed_at_epoch_ms);
    if (
      snapshot.execution.status !== ExecutionPublicationProjectionStatus.Healthy ||
      snapshot.execution.current === null ||
      snapshot.execution.headRevision !== snapshot.execution.producerHeadRevision ||
      snapshot.occurrence.status !== FlowNodeOccurrenceProjectionStatus.Healthy ||
      snapshot.occurrence.headRevision !== snapshot.occurrence.producerHeadRevision ||
      snapshot.occurrence.headRevision !== snapshot.execution.headRevision ||
      row.current_process_status !== snapshot.execution.current.state.status ||
      executionObserved > nowEpochMs ||
      occurrenceObserved > nowEpochMs
    ) {
      throw new TypeError("metrics projection pair is not complete and aligned");
    }
    const terminal = snapshot.registration.observation === "closed" &&
      (snapshot.execution.current.state.status === "completed" ||
        snapshot.execution.current.state.status === "cancelled") &&
      snapshot.occurrence.currentOpen.length === 0;
    if (snapshot.registration.observation === "closed" && !terminal) {
      throw new TypeError("closed metrics projection pair is not terminal");
    }
    if (!terminal) observedAt.push(executionObserved, occurrenceObserved);
    snapshots.push(snapshot);
  }
  if (snapshots.length !== populationCount || ordinals.size !== populationCount) {
    throw new TypeError("metrics population membership drifted");
  }
  const observedAfterEpochMs = observedAt.length === 0
    ? nowEpochMs
    : Math.min(...observedAt);
  if (nowEpochMs - observedAfterEpochMs > maxAgeMs) {
    throw new TypeError("metrics projection freshness expired");
  }
  return available(
    await aggregate(definition, snapshots),
    observedAfterEpochMs,
    maxAgeMs,
  );
}

function requireExactRegistration(
  row: MetricsReadRow,
  snapshot: PostgresqlOccurrenceSnapshot,
  definition: DeployedDefinitionVersion,
  populationHead: number,
  ordinals: Set<number>,
): void {
  const populationOrdinal = positive(row.population_ordinal);
  if (
    populationOrdinal > populationHead ||
    ordinals.has(populationOrdinal) ||
    exactByteText(row.process_instance_id) !== snapshot.registration.instance.processInstanceId ||
    exactByteText(row.process_id) !== definition.processId ||
    positive(row.definition_version) !== definition.version ||
    exactText(row.source_sha256) !== definition.source.sha256 ||
    JSON.stringify(snapshot.registration.instance.definition) !== JSON.stringify(definition)
  ) {
    throw new TypeError("metrics registration drifted from the exact-definition cut");
  }
  ordinals.add(populationOrdinal);
}

async function aggregate(
  definition: DeployedDefinitionVersion,
  snapshots: readonly PostgresqlOccurrenceSnapshot[],
): Promise<FlowNodeMetricsResult> {
  const byId = new Map(snapshots.map((snapshot) => [
    snapshot.registration.instance.processInstanceId,
    snapshot,
  ]));
  const service = new FlowNodeMetricsAggregationService({
    definitions: { get: async () => structuredClone(definition) },
    population: {
      listExactDefinitionVersion: async () => snapshots.map(({ registration }) =>
        structuredClone(registration)),
    },
    executions: {
      reconcile: async (processInstanceId) => {
        const snapshot = byId.get(processInstanceId);
        return snapshot === undefined
          ? { kind: ExecutionPublicationReconciliationKind.NotFound }
          : {
              kind: ExecutionPublicationReconciliationKind.Available,
              projection: snapshot.execution ?? createEmptyExecutionPublicationProjection(
                projectionIdentityFromRegistration(snapshot.registration),
              ),
            };
      },
    },
    occurrences: {
      reconcile: async (registration) => {
        const snapshot = byId.get(registration.instance.processInstanceId)!;
        return {
          kind: FlowNodeOccurrenceReconciliationKind.Available,
          projection: snapshot.occurrence ?? createEmptyFlowNodeOccurrenceProjection(
            occurrenceIdentityFromRegistration(registration),
          ),
        };
      },
    },
  });
  const result = await service.get({
    processId: definition.processId,
    version: definition.version,
  });
  if (result === null || result.kind !== FlowNodeMetricsResultKind.Available) {
    throw new TypeError("validated metrics cut did not aggregate");
  }
  return result;
}

function available(
  value: FlowNodeMetricsResult,
  observedAfterEpochMs: number,
  maxAgeMs: number,
): PostgresqlProjectionRead<FlowNodeMetricsResult> {
  return {
    kind: PostgresqlProjectionReadKind.Available,
    read: {
      value: structuredClone(value),
      freshness: { observedAfterEpochMs, maxAgeMs },
    },
  };
}

function exactText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError("metrics exact text is invalid");
  }
  return value;
}

function exactDigest(value: unknown): string {
  const decoded = exactText(value);
  if (!/^[0-9a-f]{64}$/u.test(decoded)) throw new TypeError("metrics digest is invalid");
  return decoded;
}

function exactByteText(value: unknown): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError("metrics byte text is invalid");
  }
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
  if (!Buffer.from(decoded, "utf8").equals(Buffer.from(value))) {
    throw new TypeError("metrics byte text is not exact UTF-8");
  }
  return decoded;
}

function positiveInput(value: unknown): number {
  const decoded = positive(value);
  return decoded;
}

function positive(value: unknown): number {
  const decoded = nonnegative(value);
  if (decoded < 1) throw new TypeError("metrics number is not positive");
  return decoded;
}

function nonnegative(value: unknown): number {
  const decoded = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)
    ? Number(value)
    : typeof value === "bigint" ? Number(value) : value;
  if (typeof decoded !== "number" || !Number.isSafeInteger(decoded) || decoded < 0) {
    throw new TypeError("metrics number is not a nonnegative safe integer");
  }
  return decoded;
}

type MetricsReadRow = PostgresqlRow & Readonly<{
  now_epoch_ms: unknown;
  population_head: unknown;
  registration_count: unknown;
  exact_population_count: unknown;
  registration_ordinal: unknown;
  population_ordinal: unknown;
  process_instance_id: unknown;
  process_id: unknown;
  definition_version: unknown;
  source_sha256: unknown;
  execution_observed_at_epoch_ms: unknown;
  occurrence_observed_at_epoch_ms: unknown;
  current_process_status: unknown;
}>;
