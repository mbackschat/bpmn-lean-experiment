import type {
  PostgresqlRow,
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import { OperateIncidentIntegrityError } from "./incident-contracts.js";

const maximumCandidateLimit = 1_000;

/** Owns bounded incident generation creation, materialization, and pointer swaps. */
export class PostgresqlIncidentSnapshotGeneration {
  constructor(private readonly runtime: PostgresqlRuntime) {}

  async listCandidateKeys(
    limitValue: number,
    maxAgeMsValue: number,
  ): Promise<ReadonlyArray<Uint8Array>> {
    const limit = requireIncidentSnapshotCandidateLimit(limitValue);
    const maxAgeMs = requireIncidentSnapshotMaximumAge(maxAgeMsValue);
    return await this.runtime.transaction(async (session) => {
      const control = await lockControl(session);
      let generation = control.buildingGeneration;
      if (generation === null && await requiresGeneration(
        session,
        control.completedGeneration,
        control.populationHead,
        maxAgeMs,
      )) {
        generation = await createGeneration(session, control);
      }
      if (generation === null) return [];
      await materializeNextBatch(session, generation, limit);
      await completeIncidentSnapshotGenerationIfReady(session, generation);
      const result = await session.query<CandidateRow>({
        text: `
          SELECT item.process_instance_id AS candidate_key
          FROM bpmn_platform.operate_incident_snapshot_control AS control
          JOIN bpmn_platform.operate_incident_snapshot_generation_items AS item
            ON item.generation = control.building_generation
          WHERE control.singleton = true AND item.state = 'pending'
          ORDER BY item.process_instance_id ASC
          LIMIT $1
        `,
        values: [limit],
      });
      return result.rows.map(({ candidate_key: candidateKey }) => {
        if (!(candidateKey instanceof Uint8Array) || candidateKey.byteLength === 0) {
          throw new PostgresqlIncidentSnapshotStoredValueError();
        }
        return Uint8Array.from(candidateKey);
      });
    });
  }
}

/** Completes and swaps one fully materialized generation in the caller transaction. */
export async function completeIncidentSnapshotGenerationIfReady(
  session: PostgresqlSession,
  generation: number,
): Promise<boolean> {
  const result = await session.query<PostgresqlRow>({
    text: `
      SELECT state, target_population_head, materialized_through, succeeded_count
      FROM bpmn_platform.operate_incident_snapshot_generations
      WHERE generation = $1
      FOR UPDATE
    `,
    values: [generation],
  });
  const row = result.rows[0];
  if (row === undefined) throw new PostgresqlIncidentSnapshotStoredValueError();
  if (row.state === "completed") return false;
  if (row.state !== "building") throw new PostgresqlIncidentSnapshotStoredValueError();
  const target = safeCount(row.target_population_head);
  if (safeCount(row.materialized_through) !== target ||
      safeCount(row.succeeded_count) !== target) return false;

  const completed = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_snapshot_generations AS header
      SET state = 'completed',
          completed_at = clock_timestamp(),
          observed_after_at = (
            SELECT min(item.observed_at)
            FROM bpmn_platform.operate_incident_snapshot_generation_items AS item
            WHERE item.generation = header.generation AND item.observed_at IS NOT NULL
          )
      WHERE header.generation = $1
        AND header.state = 'building'
        AND header.materialized_through = header.target_population_head
        AND header.succeeded_count = header.target_population_head
    `,
    values: [generation],
  });
  if (completed.rowCount !== 1) throw new PostgresqlIncidentSnapshotStoredValueError();
  const swapped = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_snapshot_control
      SET building_generation = NULL, completed_generation = $1
      WHERE singleton = true AND building_generation = $1
    `,
    values: [generation],
  });
  if (swapped.rowCount !== 1) throw new PostgresqlIncidentSnapshotStoredValueError();
  return true;
}

export class PostgresqlIncidentSnapshotStoredValueError extends Error {
  constructor() {
    super("stored PostgreSQL incident snapshot value is invalid");
    this.name = "PostgresqlIncidentSnapshotStoredValueError";
  }
}

type SnapshotControl = Readonly<{
  populationHead: number;
  nextGeneration: number;
  buildingGeneration: number | null;
  completedGeneration: number | null;
}>;

type CandidateRow = PostgresqlRow & Readonly<{ candidate_key: unknown }>;

async function lockControl(session: PostgresqlSession): Promise<SnapshotControl> {
  const result = await session.query<PostgresqlRow>({
    text: `
      SELECT population_head, next_generation, building_generation, completed_generation
      FROM bpmn_platform.operate_incident_snapshot_control
      WHERE singleton = true
      FOR UPDATE
    `,
  });
  const row = result.rows[0];
  if (row === undefined || result.rows.length !== 1) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  return {
    populationHead: safeCount(row.population_head),
    nextGeneration: positive(row.next_generation),
    buildingGeneration: nullablePositive(row.building_generation),
    completedGeneration: nullablePositive(row.completed_generation),
  };
}

async function requiresGeneration(
  session: PostgresqlSession,
  completedGeneration: number | null,
  populationHead: number,
  maxAgeMs: number,
): Promise<boolean> {
  if (completedGeneration === null) return true;
  const result = await session.query<PostgresqlRow>({
    text: `
      SELECT
        state,
        target_population_head,
        CASE WHEN observed_after_at IS NULL THEN false
          ELSE clock_timestamp() - observed_after_at > ($2::bigint * interval '1 millisecond')
        END AS expired
      FROM bpmn_platform.operate_incident_snapshot_generations
      WHERE generation = $1
    `,
    values: [completedGeneration, maxAgeMs],
  });
  const row = result.rows[0];
  if (row === undefined || row.state !== "completed" || typeof row.expired !== "boolean") {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  return safeCount(row.target_population_head) !== populationHead || row.expired;
}

async function createGeneration(
  session: PostgresqlSession,
  control: SnapshotControl,
): Promise<number> {
  if (control.nextGeneration >= Number.MAX_SAFE_INTEGER) {
    throw new OperateIncidentIntegrityError("incident snapshot generation space is exhausted");
  }
  await session.query({
    text: `
      INSERT INTO bpmn_platform.operate_incident_snapshot_generations (
        generation, target_population_head, materialized_through,
        succeeded_count, state, completed_at, observed_after_at
      ) VALUES ($1, $2, 0, 0, 'building', NULL, NULL)
    `,
    values: [control.nextGeneration, control.populationHead],
  });
  const changed = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_snapshot_control
      SET next_generation = $2, building_generation = $1
      WHERE singleton = true AND next_generation = $1 AND building_generation IS NULL
    `,
    values: [control.nextGeneration, control.nextGeneration + 1],
  });
  if (changed.rowCount !== 1) throw new PostgresqlIncidentSnapshotStoredValueError();
  return control.nextGeneration;
}

async function materializeNextBatch(
  session: PostgresqlSession,
  generation: number,
  limit: number,
): Promise<void> {
  const header = await session.query<PostgresqlRow>({
    text: `
      SELECT state, target_population_head, materialized_through
      FROM bpmn_platform.operate_incident_snapshot_generations
      WHERE generation = $1
      FOR UPDATE
    `,
    values: [generation],
  });
  const row = header.rows[0];
  if (row === undefined || row.state !== "building") {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  const target = safeCount(row.target_population_head);
  const through = safeCount(row.materialized_through);
  if (through >= target) return;

  const inserted = await session.query<PostgresqlRow>({
    text: `
      INSERT INTO bpmn_platform.operate_incident_snapshot_generation_items (
        generation, population_ordinal, process_instance_id,
        expected_ordinal, expected_process_id, expected_definition_version,
        expected_source_sha256, expected_public_identity_json,
        expected_process_locator, expected_observation, state, observed_at
      )
      SELECT
        $1, process.population_ordinal, process.process_instance_id,
        process.ordinal, process.process_id, process.definition_version,
        process.source_sha256, process.public_identity_json,
        process.process_locator, process.observation,
        CASE WHEN process.observation = 'closed' THEN 'succeeded' ELSE 'pending' END,
        NULL
      FROM bpmn_platform.operate_process_instances AS process
      WHERE process.population_ordinal > $2 AND process.population_ordinal <= $3
      ORDER BY process.population_ordinal ASC
      LIMIT $4
      RETURNING population_ordinal, state
    `,
    values: [generation, through, target, limit],
  });
  if (inserted.rows.length === 0) throw new PostgresqlIncidentSnapshotStoredValueError();
  const ordinals = inserted.rows.map(({ population_ordinal: value }) => positive(value));
  if (ordinals.some((ordinal, index) => ordinal !== through + index + 1)) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  const terminalCount = inserted.rows.filter(({ state }) => state === "succeeded").length;
  if (inserted.rows.some(({ state }) => state !== "pending" && state !== "succeeded")) {
    throw new PostgresqlIncidentSnapshotStoredValueError();
  }
  const nextThrough = ordinals[ordinals.length - 1]!;
  const changed = await session.query({
    text: `
      UPDATE bpmn_platform.operate_incident_snapshot_generations
      SET materialized_through = $2, succeeded_count = succeeded_count + $3
      WHERE generation = $1 AND state = 'building' AND materialized_through = $4
    `,
    values: [generation, nextThrough, terminalCount, through],
  });
  if (changed.rowCount !== 1) throw new PostgresqlIncidentSnapshotStoredValueError();
}

function numeric(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) return Number(value);
  if (typeof value === "number") return value;
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
  return value === null ? null : positive(value);
}

export function requireIncidentSnapshotCandidateLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximumCandidateLimit) {
    throw new TypeError(
      `incident snapshot candidate limit must be a positive safe integer at most ${maximumCandidateLimit}`,
    );
  }
  return value;
}

export function requireIncidentSnapshotMaximumAge(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("incident snapshot maximum age must be a positive safe integer");
  }
  return value;
}
