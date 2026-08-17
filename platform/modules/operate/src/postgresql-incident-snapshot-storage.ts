import { decodePublicIncident } from "@bpmn-lean/platform-contracts";
import type { PublicIncident } from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import type { OperateProcessRegistration } from "./incident-contracts.js";
import { sameJson } from "./incident-values.js";
import {
  completeIncidentSnapshotGenerationIfReady,
  PostgresqlIncidentSnapshotStoredValueError,
} from "./postgresql-incident-snapshot-generation.js";
import {
  decodePostgresqlOperateRegistration,
} from "./postgresql-process-instance-repository.js";
import { encodePostgresqlByteText } from "./process-instance-values.js";

export type PreparedIncidentSnapshotItem = Readonly<{
  generation: number;
  populationOrdinal: number;
  expectedRegistration: OperateProcessRegistration;
  currentRegistration: OperateProcessRegistration;
}>;

export const IncidentSnapshotObservationKind = {
  Observed: "observed",
  Closed: "closed",
  RetainedClosed: "retainedClosed",
} as const;

export type IncidentSnapshotObservationKind =
  typeof IncidentSnapshotObservationKind[keyof typeof IncidentSnapshotObservationKind];

/** Reads one pending incident-generation item and current registration without a lock. */
export async function readPreparedIncidentSnapshotItem(
  session: PostgresqlSession,
  processInstanceId: string,
): Promise<PreparedIncidentSnapshotItem | null> {
  const result = await session.query<PostgresqlRow>({
    text: `
      SELECT
        item.generation,
        item.population_ordinal,
        item.process_instance_id AS item_process_instance_id,
        item.expected_ordinal,
        item.expected_process_id,
        item.expected_definition_version,
        item.expected_source_sha256,
        item.expected_public_identity_json,
        item.expected_process_locator,
        item.expected_observation,
        item.state AS item_state,
        process.ordinal,
        process.process_instance_id,
        process.process_id,
        process.definition_version,
        process.source_sha256,
        process.public_identity_json,
        process.process_locator,
        process.observation,
        process.population_ordinal AS current_population_ordinal
      FROM bpmn_platform.operate_incident_snapshot_control AS control
      JOIN bpmn_platform.operate_incident_snapshot_generation_items AS item
        ON item.generation = control.building_generation
      JOIN bpmn_platform.operate_process_instances AS process
        ON process.process_instance_id = item.process_instance_id
      WHERE control.singleton = true AND item.process_instance_id = $1
    `,
    values: [text(processInstanceId)],
  });
  const row = result.rows[0];
  if (row === undefined) return null;
  if (result.rows.length !== 1 || row.item_state !== "pending") {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  try {
    const generation = positive(row.generation);
    const populationOrdinal = positive(row.population_ordinal);
    const expectedRegistration = decodeExpectedRegistration(row);
    const currentRegistration = decodePostgresqlOperateRegistration(row);
    if (decodeByteText(row.item_process_instance_id) !== processInstanceId ||
        currentRegistration.instance.processInstanceId !== processInstanceId ||
        positive(row.current_population_ordinal) !== populationOrdinal) {
      throw new TypeError("incident snapshot item identity drifted");
    }
    return {
      generation,
      populationOrdinal,
      expectedRegistration,
      currentRegistration,
    };
  } catch (error: unknown) {
    if (error instanceof PostgresqlIncidentSnapshotStoredValueError) throw error;
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
}

/** Applies one prepared image only through the caller's lease-fenced transaction. */
export async function applyPreparedIncidentSnapshot(
  session: PostgresqlSession,
  preparedValue: PreparedIncidentSnapshotItem,
  observationKindValue: IncidentSnapshotObservationKind,
  incidentsValue: readonly PublicIncident[],
  maximumIncidents: number,
  productObservationContributed: boolean,
): Promise<void> {
  const prepared = structuredClone(preparedValue);
  requireCeiling(maximumIncidents);
  const control = await session.query<PostgresqlRow>({
    text: `
      SELECT building_generation
      FROM bpmn_platform.operate_incident_snapshot_control
      WHERE singleton = true
      FOR UPDATE
    `,
  });
  if (nullablePositive(control.rows[0]?.building_generation) !== prepared.generation) return;

  const generation = await session.query<PostgresqlRow>({
    text: `
      SELECT target_population_head, materialized_through, succeeded_count, state
      FROM bpmn_platform.operate_incident_snapshot_generations
      WHERE generation = $1
      FOR UPDATE
    `,
    values: [prepared.generation],
  });
  const generationRow = generation.rows[0];
  if (generationRow === undefined || generationRow.state !== "building") return;
  validateGenerationCounts(generationRow, prepared.populationOrdinal);

  const item = await session.query<PostgresqlRow>({
    text: `
      SELECT
        generation, population_ordinal,
        process_instance_id AS item_process_instance_id,
        expected_ordinal, expected_process_id, expected_definition_version,
        expected_source_sha256, expected_public_identity_json,
        expected_process_locator, expected_observation, state AS item_state
      FROM bpmn_platform.operate_incident_snapshot_generation_items
      WHERE generation = $1 AND population_ordinal = $2
      FOR UPDATE
    `,
    values: [prepared.generation, prepared.populationOrdinal],
  });
  const itemRow = item.rows[0];
  if (itemRow === undefined || itemRow.item_state === "succeeded") return;
  if (itemRow.item_state !== "pending" ||
      !sameJson(decodeExpectedRegistration(itemRow), prepared.expectedRegistration)) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }

  const registration = await session.query<PostgresqlRow>({
    text: `
      SELECT *
      FROM bpmn_platform.operate_process_instances
      WHERE process_instance_id = $1
      FOR UPDATE
    `,
    values: [text(prepared.expectedRegistration.instance.processInstanceId)],
  });
  const registrationRow = registration.rows[0];
  if (registrationRow === undefined ||
      positive(registrationRow.population_ordinal) !== prepared.populationOrdinal) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  const current = decodePostgresqlOperateRegistration(registrationRow);

  let observationKind = observationKindValue;
  let incidents = incidentsValue.map((incident) => structuredClone(incident));
  if (current.ordinal !== prepared.currentRegistration.ordinal ||
      !sameJson(current.instance, prepared.currentRegistration.instance) ||
      current.locator !== prepared.currentRegistration.locator) {
    return;
  }
  if (current.observation === "closed") {
    observationKind = IncidentSnapshotObservationKind.RetainedClosed;
    incidents = [];
  } else if (current.observation !== prepared.currentRegistration.observation) {
    return;
  }
  if (incidents.length > maximumIncidents ||
      (observationKind !== IncidentSnapshotObservationKind.Observed && incidents.length !== 0)) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  const normalized = normalizeIncidents(incidents, current, maximumIncidents);

  await session.query({
    text: `
      DELETE FROM bpmn_platform.operate_incident_snapshot_incidents
      WHERE generation = $1 AND process_instance_id = $2
    `,
    values: [prepared.generation, text(current.instance.processInstanceId)],
  });
  for (const incident of normalized) {
    const id = incident.incident.id;
    await session.query({
      text: `
        INSERT INTO bpmn_platform.operate_incident_snapshot_incidents (
          generation, process_instance_id, incident_process_instance_id,
          incident_element_id, incident_activation, incident_generation, incident_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      values: [
        prepared.generation,
        text(current.instance.processInstanceId),
        text(id.effectId.processInstanceId),
        text(id.effectId.elementId),
        id.effectId.activation,
        id.generation,
        JSON.stringify(incident),
      ],
    });
  }

  const nextObservation = observationKind === IncidentSnapshotObservationKind.Observed
    ? "active"
    : "closed";
  const changedRegistration = await session.query({
    text: `
      UPDATE bpmn_platform.operate_process_instances
      SET observation = CASE WHEN observation = 'closed' THEN 'closed' ELSE $2 END
      WHERE process_instance_id = $1
    `,
    values: [text(current.instance.processInstanceId), nextObservation],
  });
  if (changedRegistration.rowCount !== 1) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  const succeeded = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_snapshot_generation_items
      SET state = 'succeeded',
          observed_at = CASE WHEN $3 THEN clock_timestamp() ELSE NULL END,
          expected_observation = $4
      WHERE generation = $1 AND population_ordinal = $2 AND state = 'pending'
    `,
    values: [
      prepared.generation,
      prepared.populationOrdinal,
      productObservationContributed,
      nextObservation,
    ],
  });
  if (succeeded.rowCount !== 1) throw new PostgresqlIncidentSnapshotStoredValueError();
  const counted = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_snapshot_generations
      SET succeeded_count = succeeded_count + 1
      WHERE generation = $1 AND state = 'building'
    `,
    values: [prepared.generation],
  });
  if (counted.rowCount !== 1) throw new PostgresqlIncidentSnapshotStoredValueError();
  await completeIncidentSnapshotGenerationIfReady(session, prepared.generation);
}

function normalizeIncidents(
  incidents: readonly PublicIncident[],
  registration: OperateProcessRegistration,
  ceiling: number,
): readonly PublicIncident[] {
  if (incidents.length > ceiling) throw new PostgresqlIncidentSnapshotStoredValueError();
  const seen = new Set<string>();
  return incidents.map((value) => {
    const incident = decodePublicIncident(value);
    if (!sameJson(incident.hostingInstance, registration.instance)) {
      throw new PostgresqlIncidentSnapshotStoredValueError();
    }
    const key = JSON.stringify(incident.incident.id);
    if (seen.has(key)) throw new PostgresqlIncidentSnapshotStoredValueError();
    seen.add(key);
    return incident;
  });
}

function decodeExpectedRegistration(row: PostgresqlRow): OperateProcessRegistration {
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

function validateGenerationCounts(row: PostgresqlRow, ordinal: number): void {
  const target = safeCount(row.target_population_head);
  const materialized = safeCount(row.materialized_through);
  const succeeded = safeCount(row.succeeded_count);
  if (ordinal > target || ordinal > materialized || succeeded >= target) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
}

function numeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) return Number(value);
  throw new PostgresqlIncidentSnapshotStoredValueError();
}

function safeCount(value: unknown): number {
  const decoded = numeric(value);
  if (!Number.isSafeInteger(decoded) || decoded < 0) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  return decoded;
}

function positive(value: unknown): number {
  const decoded = safeCount(value);
  if (decoded < 1) throw new PostgresqlIncidentSnapshotStoredValueError();
  return decoded;
}

function nullablePositive(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return positive(value);
}

function decodeByteText(value: unknown): string {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}

function text(value: string): Buffer {
  return encodePostgresqlByteText(value);
}

function requireCeiling(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("incident snapshot ceiling must be a positive safe integer");
  }
}
