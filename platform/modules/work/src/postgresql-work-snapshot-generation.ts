import type {
  PostgresqlRow,
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import { WorkRepositoryIntegrityError } from "./work-contracts.js";
import {
  numeric,
} from "./postgresql-work-values.js";
import {
  requireNonnegativeSafeInteger,
  requirePositiveSafeInteger,
} from "./work-repository-values.js";

const maximumCandidateLimit = 1_000;

/** Owns bounded Work snapshot generation creation, materialization, and pointer swaps. */
export class PostgresqlWorkSnapshotGeneration {
  constructor(private readonly runtime: PostgresqlRuntime) {}

  async listCandidateKeys(
    limitValue: number,
    maxAgeMsValue: number,
  ): Promise<ReadonlyArray<Uint8Array>> {
    const limit = requireCandidateLimit(limitValue);
    const maxAgeMs = requireMaximumAge(maxAgeMsValue);
    return await this.runtime.transaction(async (session) => {
      const control = await lockControl(session);
      let generation = control.buildingGeneration;
      if (generation === null) {
        const shouldBuild = await requiresGeneration(
          session,
          control.completedGeneration,
          control.populationHead,
          maxAgeMs,
        );
        if (shouldBuild) {
          generation = await createGeneration(session, control);
        }
      }
      if (generation === null) return [];
      await materializeNextBatch(session, generation, limit);
      await completeWorkSnapshotGenerationIfReady(session, generation);
      const pending = await session.query<CandidateRow>({
        text: `
          SELECT item.process_instance_id AS candidate_key
          FROM bpmn_platform.work_snapshot_control AS control
          JOIN bpmn_platform.work_snapshot_generation_items AS item
            ON item.generation = control.building_generation
          WHERE control.singleton = true
            AND item.state = 'pending'
          ORDER BY item.process_instance_id ASC
          LIMIT $1
        `,
        values: [limit],
      });
      return pending.rows.map(({ candidate_key: candidateKey }) => {
        if (!(candidateKey instanceof Uint8Array) || candidateKey.byteLength === 0) {
          throw new PostgresqlWorkSnapshotStoredValueError();
        }
        return Uint8Array.from(candidateKey);
      });
    });
  }
}

/** Completes and swaps one fully materialized generation in the caller transaction. */
export async function completeWorkSnapshotGenerationIfReady(
  session: PostgresqlSession,
  generation: number,
): Promise<boolean> {
  const result = await session.query<PostgresqlRow & Readonly<{
    state: unknown;
    target_population_head: unknown;
    materialized_through: unknown;
    succeeded_count: unknown;
  }>>({
    text: `
      SELECT state, target_population_head, materialized_through, succeeded_count
      FROM bpmn_platform.work_snapshot_generations
      WHERE generation = $1
      FOR UPDATE
    `,
    values: [generation],
  });
  const row = result.rows[0];
  if (row === undefined) throw new PostgresqlWorkSnapshotStoredValueError();
  if (row.state === "completed") return false;
  if (row.state !== "building") throw new PostgresqlWorkSnapshotStoredValueError();
  const target = safeCount(row.target_population_head, "target population head");
  const materialized = safeCount(row.materialized_through, "materialized through");
  const succeeded = safeCount(row.succeeded_count, "succeeded count");
  if (materialized !== target || succeeded !== target) return false;

  const completed = await session.query({
    text: `
      UPDATE bpmn_platform.work_snapshot_generations AS generation
      SET state = 'completed',
          completed_at = clock_timestamp(),
          observed_after_at = (
            SELECT min(item.observed_at)
            FROM bpmn_platform.work_snapshot_generation_items AS item
            WHERE item.generation = generation.generation
              AND item.observed_at IS NOT NULL
          )
      WHERE generation.generation = $1
        AND generation.state = 'building'
        AND generation.materialized_through = generation.target_population_head
        AND generation.succeeded_count = generation.target_population_head
    `,
    values: [generation],
  });
  if (completed.rowCount !== 1) throw new PostgresqlWorkSnapshotStoredValueError();
  const swapped = await session.query({
    text: `
      UPDATE bpmn_platform.work_snapshot_control
      SET building_generation = NULL,
          completed_generation = $1
      WHERE singleton = true
        AND building_generation = $1
    `,
    values: [generation],
  });
  if (swapped.rowCount !== 1) throw new PostgresqlWorkSnapshotStoredValueError();
  return true;
}

export class PostgresqlWorkSnapshotStoredValueError extends Error {
  constructor() {
    super("stored Work snapshot generation value is invalid");
    this.name = "PostgresqlWorkSnapshotStoredValueError";
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
  const result = await session.query<PostgresqlRow & Readonly<{
    population_head: unknown;
    next_generation: unknown;
    building_generation: unknown;
    completed_generation: unknown;
  }>>({
    text: `
      SELECT population_head, next_generation, building_generation, completed_generation
      FROM bpmn_platform.work_snapshot_control
      WHERE singleton = true
      FOR UPDATE
    `,
  });
  const row = result.rows[0];
  if (row === undefined || result.rows.length !== 1) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  return {
    populationHead: safeCount(row.population_head, "population head"),
    nextGeneration: positiveCount(row.next_generation, "next generation"),
    buildingGeneration: nullablePositive(row.building_generation, "building generation"),
    completedGeneration: nullablePositive(row.completed_generation, "completed generation"),
  };
}

async function requiresGeneration(
  session: PostgresqlSession,
  completedGeneration: number | null,
  populationHead: number,
  maxAgeMs: number,
): Promise<boolean> {
  if (completedGeneration === null) return true;
  const result = await session.query<PostgresqlRow & Readonly<{
    state: unknown;
    target_population_head: unknown;
    expired: unknown;
  }>>({
    text: `
      SELECT
        state,
        target_population_head,
        CASE
          WHEN observed_after_at IS NULL THEN false
          ELSE clock_timestamp() - observed_after_at > ($2::bigint * interval '1 millisecond')
        END AS expired
      FROM bpmn_platform.work_snapshot_generations
      WHERE generation = $1
    `,
    values: [completedGeneration, maxAgeMs],
  });
  const row = result.rows[0];
  if (row === undefined || row.state !== "completed" || typeof row.expired !== "boolean") {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  return safeCount(row.target_population_head, "completed target") !== populationHead ||
    row.expired;
}

async function createGeneration(
  session: PostgresqlSession,
  control: SnapshotControl,
): Promise<number> {
  if (control.nextGeneration >= Number.MAX_SAFE_INTEGER) {
    throw new WorkRepositoryIntegrityError("Work snapshot generation space is exhausted");
  }
  await session.query({
    text: `
      INSERT INTO bpmn_platform.work_snapshot_generations (
        generation, target_population_head, materialized_through,
        succeeded_count, state, completed_at, observed_after_at
      ) VALUES ($1, $2, 0, 0, 'building', NULL, NULL)
    `,
    values: [control.nextGeneration, control.populationHead],
  });
  const changed = await session.query({
    text: `
      UPDATE bpmn_platform.work_snapshot_control
      SET next_generation = $2,
          building_generation = $1
      WHERE singleton = true
        AND next_generation = $1
        AND building_generation IS NULL
    `,
    values: [control.nextGeneration, control.nextGeneration + 1],
  });
  if (changed.rowCount !== 1) throw new PostgresqlWorkSnapshotStoredValueError();
  return control.nextGeneration;
}

async function materializeNextBatch(
  session: PostgresqlSession,
  generation: number,
  limit: number,
): Promise<void> {
  const header = await session.query<PostgresqlRow & Readonly<{
    state: unknown;
    target_population_head: unknown;
    materialized_through: unknown;
  }>>({
    text: `
      SELECT state, target_population_head, materialized_through
      FROM bpmn_platform.work_snapshot_generations
      WHERE generation = $1
      FOR UPDATE
    `,
    values: [generation],
  });
  const row = header.rows[0];
  if (row === undefined || row.state !== "building") {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  const target = safeCount(row.target_population_head, "target population head");
  const through = safeCount(row.materialized_through, "materialized through");
  if (through >= target) return;

  const inserted = await session.query<PostgresqlRow & Readonly<{
    population_ordinal: unknown;
    state: unknown;
  }>>({
    text: `
      INSERT INTO bpmn_platform.work_snapshot_generation_items (
        generation, population_ordinal, process_instance_id,
        expected_public_instance_json, expected_work_locator,
        expected_observation, state, observed_at
      )
      SELECT
        $1,
        process.population_ordinal,
        process.process_instance_id,
        process.public_instance_json,
        process.work_locator,
        process.observation,
        CASE WHEN process.observation = 'closed' THEN 'succeeded' ELSE 'pending' END,
        NULL
      FROM bpmn_platform.work_processes AS process
      WHERE process.population_ordinal > $2
        AND process.population_ordinal <= $3
      ORDER BY process.population_ordinal ASC
      LIMIT $4
      RETURNING population_ordinal, state
    `,
    values: [generation, through, target, limit],
  });
  if (inserted.rows.length === 0) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  const ordinals = inserted.rows.map((item) =>
    positiveCount(item.population_ordinal, "materialized ordinal"));
  const nextThrough = ordinals[ordinals.length - 1]!;
  if (ordinals[0] !== through + 1 ||
      ordinals.some((ordinal, index) => ordinal !== through + index + 1)) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  const terminalCount = inserted.rows.filter(({ state }) => state === "succeeded").length;
  if (inserted.rows.some(({ state }) => state !== "pending" && state !== "succeeded")) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  const changed = await session.query({
    text: `
      UPDATE bpmn_platform.work_snapshot_generations
      SET materialized_through = $2,
          succeeded_count = succeeded_count + $3
      WHERE generation = $1
        AND state = 'building'
        AND materialized_through = $4
    `,
    values: [generation, nextThrough, terminalCount, through],
  });
  if (changed.rowCount !== 1) throw new PostgresqlWorkSnapshotStoredValueError();
}

function safeCount(value: unknown, label: string): number {
  try {
    return requireNonnegativeSafeInteger(numeric(value), label);
  } catch {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
}

function positiveCount(value: unknown, label: string): number {
  try {
    return requirePositiveSafeInteger(numeric(value), label);
  } catch {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
}

function nullablePositive(value: unknown, label: string): number | null {
  return value === null ? null : positiveCount(value, label);
}

export function requireCandidateLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximumCandidateLimit) {
    throw new TypeError(
      `Work snapshot candidate limit must be a positive safe integer at most ${maximumCandidateLimit}`,
    );
  }
  return value;
}

export function requireMaximumAge(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Work snapshot maximum age must be a positive safe integer");
  }
  return value;
}
