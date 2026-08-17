import type { ProjectionRead } from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlRuntime,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  decodePostgresqlClaim,
  decodePostgresqlRegistration,
  decodePostgresqlWorkText,
  numeric,
} from "./postgresql-work-values.js";
import { requireMaximumAge } from "./postgresql-work-snapshot-generation.js";
import type { SystemWorkTask } from "./work-service.js";
import { WorkSnapshotUnavailableError } from "./work-service.js";
import {
  decodeStoredOpenWorkTask,
  decodeStoredStructuredTask,
} from "./work-task-projection.js";
import {
  requireNonnegativeSafeInteger,
  requirePositiveSafeInteger,
  sameJson,
} from "./work-repository-values.js";

export type PostgresqlWorkSnapshotReaderOptions = Readonly<{
  runtime: PostgresqlRuntime;
  maxAgeMs: number;
  maxProcesses: number;
  maxTasks: number;
}>;

/** Reads and proves one complete Work generation from one PostgreSQL statement snapshot. */
export class PostgresqlWorkSnapshotReader {
  readonly #options: PostgresqlWorkSnapshotReaderOptions;

  constructor(options: PostgresqlWorkSnapshotReaderOptions) {
    requireMaximumAge(options.maxAgeMs);
    requirePositive(options.maxProcesses, "Work snapshot Process ceiling");
    requirePositive(options.maxTasks, "Work snapshot task ceiling");
    this.#options = options;
  }

  async read(): Promise<ProjectionRead<readonly SystemWorkTask[]>> {
    const result = await this.#options.runtime.query<SnapshotReadRow>({
      text: workSnapshotReadSql,
      values: [
        this.#options.maxAgeMs,
        this.#options.maxProcesses,
        this.#options.maxTasks,
      ],
    });
    try {
      return decodeRead(
        result.rows,
        this.#options.maxAgeMs,
        this.#options.maxTasks,
      );
    } catch {
      throw new WorkSnapshotUnavailableError();
    }
  }
}

const workSnapshotReadSql = `
  WITH statement_clock AS MATERIALIZED (
    SELECT
      captured.observed_now,
      floor(extract(epoch FROM captured.observed_now) * 1000)::bigint AS now_epoch_ms
    FROM (SELECT clock_timestamp() AS observed_now) AS captured
  ),
  context AS MATERIALIZED (
    SELECT
      clock.now_epoch_ms,
      control.population_head,
      control.completed_generation,
      generation.target_population_head,
      generation.materialized_through,
      generation.succeeded_count,
      generation.state AS generation_state,
      generation.completed_at,
      generation.observed_after_at,
      (SELECT count(*) FROM bpmn_platform.work_snapshot_generation_items AS counted
        WHERE counted.generation = generation.generation) AS item_count,
      (SELECT count(*) FROM bpmn_platform.work_snapshot_generation_items AS counted
        WHERE counted.generation = generation.generation
          AND counted.state = 'succeeded') AS actual_succeeded_count,
      (SELECT count(*) FROM bpmn_platform.work_snapshot_tasks AS counted
        WHERE counted.generation = generation.generation) AS task_count,
      (SELECT min(counted.observed_at)
        FROM bpmn_platform.work_snapshot_generation_items AS counted
        WHERE counted.generation = generation.generation
          AND counted.observed_at IS NOT NULL) AS actual_observed_after_at,
      (
        control.singleton = true
        AND control.completed_generation IS NOT NULL
        AND generation.state = 'completed'
        AND generation.completed_at <= clock.observed_now
        AND generation.target_population_head = control.population_head
        AND generation.materialized_through = control.population_head
        AND generation.succeeded_count = control.population_head
        AND control.population_head <= $2
        AND (SELECT count(*) FROM bpmn_platform.work_snapshot_generation_items AS counted
          WHERE counted.generation = generation.generation) = control.population_head
        AND (SELECT count(*) FROM bpmn_platform.work_snapshot_generation_items AS counted
          WHERE counted.generation = generation.generation
            AND counted.state = 'succeeded') = control.population_head
        AND (SELECT count(*) FROM bpmn_platform.work_snapshot_tasks AS counted
          WHERE counted.generation = generation.generation) <= $3
        AND generation.observed_after_at IS NOT DISTINCT FROM (
          SELECT min(counted.observed_at)
          FROM bpmn_platform.work_snapshot_generation_items AS counted
          WHERE counted.generation = generation.generation
            AND counted.observed_at IS NOT NULL
        )
        AND (generation.observed_after_at IS NULL OR (
          generation.observed_after_at <= clock.observed_now
          AND clock.observed_now - generation.observed_after_at
            <= ($1::bigint * interval '1 millisecond')
        ))
      ) AS valid
    FROM statement_clock AS clock
    LEFT JOIN bpmn_platform.work_snapshot_control AS control
      ON control.singleton = true
    LEFT JOIN bpmn_platform.work_snapshot_generations AS generation
      ON generation.generation = control.completed_generation
  )
  SELECT
    context.*,
    item.population_ordinal AS item_population_ordinal,
    item.process_instance_id AS item_process_instance_id,
    item.expected_public_instance_json,
    item.expected_work_locator,
    item.expected_observation,
    item.state AS item_state,
    item.observed_at AS item_observed_at,
    process.process_instance_id,
    process.public_instance_json,
    process.work_locator,
    process.observation,
    process.population_ordinal AS current_population_ordinal,
    task.task_process_instance_id,
    task.element_id,
    task.activation,
    task.task_json,
    task.structured_task_json,
    task.worklist_priority,
    claim.claim_generation,
    claim.actor_id
  FROM context
  LEFT JOIN bpmn_platform.work_snapshot_generation_items AS item
    ON context.valid AND item.generation = context.completed_generation
  LEFT JOIN bpmn_platform.work_processes AS process
    ON process.process_instance_id = item.process_instance_id
  LEFT JOIN bpmn_platform.work_snapshot_tasks AS task
    ON task.generation = context.completed_generation
      AND task.process_instance_id = item.process_instance_id
  LEFT JOIN bpmn_platform.work_claims AS claim
    ON claim.hosting_process_instance_id = task.process_instance_id
      AND claim.task_process_instance_id = task.task_process_instance_id
      AND claim.element_id = task.element_id
      AND claim.activation = task.activation
  ORDER BY
    item.population_ordinal ASC,
    task.worklist_priority DESC NULLS LAST,
    task.task_process_instance_id ASC,
    task.element_id ASC,
    task.activation ASC
`;

function decodeRead(
  rows: readonly SnapshotReadRow[],
  maxAgeMs: number,
  maxTasks: number,
): ProjectionRead<readonly SystemWorkTask[]> {
  const first = rows[0];
  if (first === undefined || first.valid !== true) throw new TypeError("snapshot unavailable");
  const nowEpochMs = safeCount(first.now_epoch_ms, "statement clock");
  const populationHead = safeCount(first.population_head, "population head");
  const completedGeneration = positive(first.completed_generation, "completed generation");
  if (first.generation_state !== "completed" ||
      safeCount(first.target_population_head, "target population head") !== populationHead ||
      safeCount(first.materialized_through, "materialized through") !== populationHead ||
      safeCount(first.succeeded_count, "succeeded count") !== populationHead ||
      safeCount(first.item_count, "item count") !== populationHead ||
      safeCount(first.actual_succeeded_count, "actual succeeded count") !== populationHead) {
    throw new TypeError("snapshot generation is incomplete");
  }
  const taskCount = safeCount(first.task_count, "task count");
  if (taskCount > maxTasks) throw new TypeError("snapshot task ceiling exceeded");
  const observedAfterEpochMs = first.actual_observed_after_at === null
    ? nowEpochMs
    : epochMs(first.actual_observed_after_at, "observed after");
  if (observedAfterEpochMs > nowEpochMs ||
      nowEpochMs - observedAfterEpochMs > maxAgeMs) {
    throw new TypeError("snapshot freshness expired");
  }

  if (populationHead === 0) {
    if (rows.length !== 1 || first.item_population_ordinal !== null || taskCount !== 0) {
      throw new TypeError("zero-population snapshot contains retained rows");
    }
    return {
      value: [],
      freshness: { observedAfterEpochMs, maxAgeMs },
    };
  }

  const registrations = new Map<number, string>();
  const taskKeys = new Set<string>();
  const tasks: SystemWorkTask[] = [];
  for (const row of rows) {
    if (positive(row.completed_generation, "completed generation") !== completedGeneration ||
        row.item_state !== "succeeded") {
      throw new TypeError("snapshot row generation drifted");
    }
    const ordinal = positive(row.item_population_ordinal, "item population ordinal");
    const expected = decodePostgresqlRegistration({
      process_instance_id: row.item_process_instance_id,
      public_instance_json: row.expected_public_instance_json,
      work_locator: row.expected_work_locator,
      observation: row.expected_observation,
    });
    const current = decodePostgresqlRegistration(row);
    const currentOrdinal = positive(row.current_population_ordinal, "current population ordinal");
    if (currentOrdinal !== ordinal ||
        !sameJson(expected.instance, current.instance) ||
        expected.locator !== current.locator ||
        (expected.observation !== current.observation && current.observation !== "closed")) {
      throw new TypeError("snapshot registration identity drifted");
    }
    if (row.item_observed_at !== null &&
        epochMs(row.item_observed_at, "snapshot item observation") > nowEpochMs) {
      throw new TypeError("snapshot item timestamp is in the future");
    }
    if (row.item_observed_at === null && expected.observation !== "closed") {
      throw new TypeError("nonterminal snapshot item lacks a Product 1 observation");
    }
    const registrationKey = JSON.stringify(current);
    const priorRegistration = registrations.get(ordinal);
    if (priorRegistration !== undefined && priorRegistration !== registrationKey) {
      throw new TypeError("snapshot registration changed within one statement");
    }
    registrations.set(ordinal, registrationKey);

    if (row.task_json === null) continue;
    const task = decodeStoredOpenWorkTask(row.task_json, current.instance);
    if (decodePostgresqlWorkText(
      row.task_process_instance_id,
      "snapshot task process_instance_id",
    ) !== task.id.processInstanceId ||
        decodePostgresqlWorkText(row.element_id, "snapshot task element_id") !== task.id.elementId ||
        positive(row.activation, "snapshot task activation") !== task.id.activation) {
      throw new TypeError("snapshot task disagrees with redundant columns");
    }
    const structuredTask = decodeStoredStructuredTask(
      row.structured_task_json,
      { registration: current, task },
    );
    if ((structuredTask?.taskDefinition.worklistPriority ?? null) !==
        nullableNumber(row.worklist_priority)) {
      throw new TypeError("snapshot priority disagrees with structured task");
    }
    const claim = row.claim_generation === null
      ? { claimGeneration: 0, claim: null }
      : decodePostgresqlClaim(row);
    const key = JSON.stringify([
      current.instance.processInstanceId,
      task.id.processInstanceId,
      task.id.elementId,
      task.id.activation,
    ]);
    if (taskKeys.has(key)) throw new TypeError("snapshot task identity is duplicated");
    taskKeys.add(key);
    if (current.observation !== "closed") {
      tasks.push({ registration: current, task, claim, structuredTask });
    }
  }
  if (registrations.size !== populationHead || taskKeys.size !== taskCount) {
    throw new TypeError("snapshot row coverage is incomplete");
  }
  return {
    value: structuredClone(tasks),
    freshness: { observedAfterEpochMs, maxAgeMs },
  };
}

function safeCount(value: unknown, label: string): number {
  return requireNonnegativeSafeInteger(numeric(value), label);
}

function positive(value: unknown, label: string): number {
  return requirePositiveSafeInteger(numeric(value), label);
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  return safeCount(value, "worklist priority");
}

function epochMs(value: unknown, label: string): number {
  if (!(value instanceof Date) || !Number.isSafeInteger(value.getTime())) {
    throw new TypeError(`${label} must be a PostgreSQL timestamp`);
  }
  return value.getTime();
}

function requirePositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

type SnapshotReadRow = PostgresqlRow & Readonly<{
  now_epoch_ms: unknown;
  population_head: unknown;
  completed_generation: unknown;
  target_population_head: unknown;
  materialized_through: unknown;
  succeeded_count: unknown;
  generation_state: unknown;
  completed_at: unknown;
  observed_after_at: unknown;
  item_count: unknown;
  actual_succeeded_count: unknown;
  task_count: unknown;
  actual_observed_after_at: unknown;
  valid: unknown;
  item_population_ordinal: unknown;
  item_process_instance_id: unknown;
  expected_public_instance_json: unknown;
  expected_work_locator: unknown;
  expected_observation: unknown;
  item_state: unknown;
  item_observed_at: unknown;
  process_instance_id: unknown;
  public_instance_json: unknown;
  work_locator: unknown;
  observation: unknown;
  current_population_ordinal: unknown;
  task_process_instance_id: unknown;
  element_id: unknown;
  activation: unknown;
  task_json: unknown;
  structured_task_json: unknown;
  worklist_priority: unknown;
  claim_generation: unknown;
  actor_id: unknown;
}>;
