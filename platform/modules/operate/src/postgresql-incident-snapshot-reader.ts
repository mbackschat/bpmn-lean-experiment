import {
  comparePublicIncidents,
  decodePublicIncident,
  decodePublicIncidentSnapshot,
} from "@bpmn-lean/platform-contracts";
import type {
  ProjectionRead,
  PublicIncident,
  PublicIncidentSnapshot,
} from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import { IncidentSnapshotUnavailableError } from "./incident-contracts.js";
import { sameJson } from "./incident-values.js";
import {
  requireIncidentSnapshotMaximumAge,
} from "./postgresql-incident-snapshot-generation.js";
import {
  decodePostgresqlOperateRegistration,
} from "./postgresql-process-instance-repository.js";

export type PostgresqlIncidentSnapshotReaderOptions = Readonly<{
  runtime: PostgresqlRuntime;
  maxAgeMs: number;
  maxProcesses: number;
  maxIncidentsPerProcess: number;
  maxIncidents: number;
}>;

/** Reads and proves one complete incident generation from exactly one SQL statement. */
export class PostgresqlIncidentSnapshotReader {
  readonly #options: PostgresqlIncidentSnapshotReaderOptions;

  constructor(options: PostgresqlIncidentSnapshotReaderOptions) {
    requireIncidentSnapshotMaximumAge(options.maxAgeMs);
    requirePositive(options.maxProcesses, "incident snapshot Process ceiling");
    requirePositive(options.maxIncidentsPerProcess, "incident snapshot per-Process ceiling");
    requirePositive(options.maxIncidents, "incident snapshot total ceiling");
    this.#options = options;
  }

  async read(): Promise<ProjectionRead<PublicIncidentSnapshot>> {
    const result = await this.#options.runtime.query<SnapshotReadRow>({
      text: incidentSnapshotReadSql,
      values: [
        this.#options.maxAgeMs,
        this.#options.maxProcesses,
        this.#options.maxIncidents,
      ],
    });
    try {
      return decodeRead(result.rows, this.#options);
    } catch {
      throw new IncidentSnapshotUnavailableError();
    }
  }
}

const incidentSnapshotReadSql = `
  WITH statement_clock AS MATERIALIZED (
    SELECT
      captured.observed_now,
      floor(extract(epoch FROM captured.observed_now) * 1000)::bigint AS now_epoch_ms
    FROM (SELECT clock_timestamp() AS observed_now) AS captured
  ),
  context AS MATERIALIZED (
    SELECT
      clock.observed_now,
      clock.now_epoch_ms,
      control.population_head,
      control.completed_generation,
      generation.target_population_head,
      generation.materialized_through,
      generation.succeeded_count,
      generation.state AS generation_state,
      generation.completed_at,
      generation.observed_after_at,
      (SELECT count(*) FROM bpmn_platform.operate_incident_snapshot_generation_items AS counted
        WHERE counted.generation = generation.generation) AS item_count,
      (SELECT count(*) FROM bpmn_platform.operate_incident_snapshot_generation_items AS counted
        WHERE counted.generation = generation.generation AND counted.state = 'succeeded')
        AS actual_succeeded_count,
      (SELECT count(*) FROM bpmn_platform.operate_incident_snapshot_incidents AS counted
        WHERE counted.generation = generation.generation) AS incident_count,
      (SELECT min(counted.observed_at)
        FROM bpmn_platform.operate_incident_snapshot_generation_items AS counted
        WHERE counted.generation = generation.generation AND counted.observed_at IS NOT NULL)
        AS actual_observed_after_at,
      (
        control.singleton = true
        AND control.completed_generation IS NOT NULL
        AND generation.state = 'completed'
        AND generation.completed_at <= clock.observed_now
        AND generation.target_population_head = control.population_head
        AND generation.materialized_through = control.population_head
        AND generation.succeeded_count = control.population_head
        AND control.population_head <= $2
        AND (SELECT count(*)
          FROM bpmn_platform.operate_incident_snapshot_generation_items AS counted
          WHERE counted.generation = generation.generation) = control.population_head
        AND (SELECT count(*)
          FROM bpmn_platform.operate_incident_snapshot_generation_items AS counted
          WHERE counted.generation = generation.generation AND counted.state = 'succeeded')
          = control.population_head
        AND (SELECT count(*)
          FROM bpmn_platform.operate_incident_snapshot_incidents AS counted
          WHERE counted.generation = generation.generation) <= $3
        AND generation.observed_after_at IS NOT DISTINCT FROM (
          SELECT min(counted.observed_at)
          FROM bpmn_platform.operate_incident_snapshot_generation_items AS counted
          WHERE counted.generation = generation.generation AND counted.observed_at IS NOT NULL
        )
        AND (generation.observed_after_at IS NULL OR (
          generation.observed_after_at <= clock.observed_now
          AND clock.observed_now - generation.observed_after_at
            <= ($1::bigint * interval '1 millisecond')
        ))
      ) AS valid
    FROM statement_clock AS clock
    LEFT JOIN bpmn_platform.operate_incident_snapshot_control AS control
      ON control.singleton = true
    LEFT JOIN bpmn_platform.operate_incident_snapshot_generations AS generation
      ON generation.generation = control.completed_generation
  )
  SELECT
    context.*,
    item.population_ordinal AS item_population_ordinal,
    item.process_instance_id AS item_process_instance_id,
    item.expected_ordinal,
    item.expected_process_id,
    item.expected_definition_version,
    item.expected_source_sha256,
    item.expected_public_identity_json,
    item.expected_process_locator,
    item.expected_observation,
    item.state AS item_state,
    item.observed_at AS item_observed_at,
    process.ordinal,
    process.process_instance_id,
    process.process_id,
    process.definition_version,
    process.source_sha256,
    process.public_identity_json,
    process.process_locator,
    process.observation,
    process.population_ordinal AS current_population_ordinal,
    image.incident_process_instance_id,
    image.incident_element_id,
    image.incident_activation,
    image.incident_generation,
    image.incident_json
  FROM context
  LEFT JOIN bpmn_platform.operate_incident_snapshot_generation_items AS item
    ON context.valid AND item.generation = context.completed_generation
  LEFT JOIN bpmn_platform.operate_process_instances AS process
    ON process.process_instance_id = item.process_instance_id
  LEFT JOIN bpmn_platform.operate_incident_snapshot_incidents AS image
    ON image.generation = context.completed_generation
      AND image.process_instance_id = item.process_instance_id
  ORDER BY
    item.population_ordinal ASC,
    image.incident_process_instance_id ASC,
    image.incident_element_id ASC,
    image.incident_activation ASC,
    image.incident_generation ASC
`;

function decodeRead(
  rows: readonly SnapshotReadRow[],
  options: PostgresqlIncidentSnapshotReaderOptions,
): ProjectionRead<PublicIncidentSnapshot> {
  const first = rows[0];
  if (first === undefined || first.valid !== true) throw new TypeError("snapshot unavailable");
  const nowEpochMs = safeCount(first.now_epoch_ms);
  const populationHead = safeCount(first.population_head);
  const generation = positive(first.completed_generation);
  const incidentCount = safeCount(first.incident_count);
  if (first.generation_state !== "completed" ||
      safeCount(first.target_population_head) !== populationHead ||
      safeCount(first.materialized_through) !== populationHead ||
      safeCount(first.succeeded_count) !== populationHead ||
      safeCount(first.item_count) !== populationHead ||
      safeCount(first.actual_succeeded_count) !== populationHead ||
      incidentCount > options.maxIncidents) {
    throw new TypeError("snapshot generation is incomplete");
  }
  const observedAfterEpochMs = first.actual_observed_after_at === null
    ? nowEpochMs
    : epochMs(first.actual_observed_after_at);
  if (observedAfterEpochMs > nowEpochMs ||
      nowEpochMs - observedAfterEpochMs > options.maxAgeMs) {
    throw new TypeError("snapshot freshness expired");
  }
  if (populationHead === 0) {
    if (rows.length !== 1 || first.item_population_ordinal !== null || incidentCount !== 0) {
      throw new TypeError("zero snapshot contains retained rows");
    }
    return {
      value: { incidents: [] },
      freshness: { observedAfterEpochMs, maxAgeMs: options.maxAgeMs },
    };
  }

  const registrations = new Map<number, string>();
  const processIncidentCounts = new Map<number, number>();
  const incidentKeys = new Set<string>();
  const incidents: PublicIncident[] = [];
  for (const row of rows) {
    if (positive(row.completed_generation) !== generation || row.item_state !== "succeeded") {
      throw new TypeError("snapshot row generation drifted");
    }
    const ordinal = positive(row.item_population_ordinal);
    const expected = decodeExpectedRegistration(row);
    const current = decodePostgresqlOperateRegistration(row);
    if (positive(row.current_population_ordinal) !== ordinal ||
        !sameJson(expected.instance, current.instance) ||
        expected.locator !== current.locator ||
        (expected.observation !== current.observation && current.observation !== "closed")) {
      throw new TypeError("snapshot registration drifted");
    }
    if (row.item_observed_at !== null && epochMs(row.item_observed_at) > nowEpochMs) {
      throw new TypeError("snapshot item timestamp is in the future");
    }
    if (row.item_observed_at === null && expected.observation !== "closed") {
      throw new TypeError("nonterminal snapshot item lacks a Product 1 observation");
    }
    const registrationKey = JSON.stringify(current);
    const prior = registrations.get(ordinal);
    if (prior !== undefined && prior !== registrationKey) {
      throw new TypeError("registration changed within snapshot");
    }
    registrations.set(ordinal, registrationKey);

    if (row.incident_json === null) continue;
    const encoded = requireString(row.incident_json);
    const incident = decodePublicIncident(JSON.parse(encoded));
    if (JSON.stringify(incident) !== encoded ||
        !sameJson(incident.hostingInstance, current.instance) ||
        decodeByteText(row.incident_process_instance_id) !==
          incident.incident.id.effectId.processInstanceId ||
        decodeByteText(row.incident_element_id) !== incident.incident.id.effectId.elementId ||
        positive(row.incident_activation) !== incident.incident.id.effectId.activation ||
        positive(row.incident_generation) !== incident.incident.id.generation) {
      throw new TypeError("snapshot incident redundant values drifted");
    }
    const key = JSON.stringify(incident.incident.id);
    if (incidentKeys.has(key)) throw new TypeError("snapshot incident identity duplicated");
    incidentKeys.add(key);
    const nextCount = (processIncidentCounts.get(ordinal) ?? 0) + 1;
    if (nextCount > options.maxIncidentsPerProcess) {
      throw new TypeError("snapshot per-Process ceiling exceeded");
    }
    processIncidentCounts.set(ordinal, nextCount);
    if (current.observation !== "closed") incidents.push(incident);
  }
  if (registrations.size !== populationHead || incidentKeys.size !== incidentCount) {
    throw new TypeError("snapshot coverage is incomplete");
  }
  incidents.sort(comparePublicIncidents);
  const value = decodePublicIncidentSnapshot({ incidents });
  return {
    value: structuredClone(value),
    freshness: { observedAfterEpochMs, maxAgeMs: options.maxAgeMs },
  };
}

function decodeExpectedRegistration(row: SnapshotReadRow) {
  return decodePostgresqlOperateRegistration({
    ordinal: row.expected_ordinal,
    process_instance_id: row.item_process_instance_id,
    process_id: row.expected_process_id,
    definition_version: row.expected_definition_version,
    source_sha256: row.expected_source_sha256,
    public_identity_json: row.expected_public_identity_json,
    process_locator: row.expected_process_locator,
    observation: row.expected_observation,
  });
}

function numeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) return Number(value);
  throw new TypeError("stored incident snapshot number is invalid");
}

function safeCount(value: unknown): number {
  const decoded = numeric(value);
  if (!Number.isSafeInteger(decoded) || decoded < 0) throw new TypeError("unsafe count");
  return decoded;
}

function positive(value: unknown): number {
  const decoded = safeCount(value);
  if (decoded < 1) throw new TypeError("nonpositive count");
  return decoded;
}

function epochMs(value: unknown): number {
  if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime())) {
    throw new TypeError("stored incident snapshot timestamp is invalid");
  }
  return value.getTime();
}

function decodeByteText(value: unknown): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new TypeError("stored incident snapshot byte text is invalid");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError("invalid text");
  return value;
}

function requirePositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

type SnapshotReadRow = PostgresqlRow & Readonly<{
  valid: unknown;
  now_epoch_ms: unknown;
  population_head: unknown;
  completed_generation: unknown;
  generation_state: unknown;
  target_population_head: unknown;
  materialized_through: unknown;
  succeeded_count: unknown;
  item_count: unknown;
  actual_succeeded_count: unknown;
  incident_count: unknown;
  actual_observed_after_at: unknown;
  item_population_ordinal: unknown;
  item_process_instance_id: unknown;
  item_state: unknown;
  item_observed_at: unknown;
  expected_ordinal: unknown;
  expected_process_id: unknown;
  expected_definition_version: unknown;
  expected_source_sha256: unknown;
  expected_public_identity_json: unknown;
  expected_process_locator: unknown;
  expected_observation: unknown;
  current_population_ordinal: unknown;
  incident_process_instance_id: unknown;
  incident_element_id: unknown;
  incident_activation: unknown;
  incident_generation: unknown;
  incident_json: unknown;
}>;
