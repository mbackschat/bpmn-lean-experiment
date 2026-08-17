import type { PublicWorkTask } from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import type { BoundHumanTaskDefinitionV1 } from "./human-task-catalog-reader.js";
import {
  completeWorkSnapshotGenerationIfReady,
  PostgresqlWorkSnapshotStoredValueError,
} from "./postgresql-work-snapshot-generation.js";
import {
  decodePostgresqlRegistration,
  decodePostgresqlWorkText,
  encodePostgresqlWorkText,
  numeric,
} from "./postgresql-work-values.js";
import type { WorkProcessRegistration } from "./work-contracts.js";
import {
  requireNonnegativeSafeInteger,
  requirePositiveSafeInteger,
  sameJson,
} from "./work-repository-values.js";
import {
  snapshotOpenWorkTask,
} from "./work-task-projection.js";

export type PreparedWorkSnapshotItem = Readonly<{
  generation: number;
  populationOrdinal: number;
  expectedRegistration: WorkProcessRegistration;
  currentRegistration: WorkProcessRegistration;
}>;

export type PreparedWorkSnapshotTask = Readonly<{
  task: PublicWorkTask["task"];
  structuredTask: BoundHumanTaskDefinitionV1 | null;
}>;

export const WorkSnapshotObservationKind = {
  Open: "open",
  Closed: "closed",
  RetainedClosed: "retainedClosed",
} as const;

export type WorkSnapshotObservationKind =
  typeof WorkSnapshotObservationKind[keyof typeof WorkSnapshotObservationKind];

/** Reads one exact pending item and its current registration without holding a lock. */
export async function readPreparedWorkSnapshotItem(
  session: PostgresqlSession,
  processInstanceId: string,
): Promise<PreparedWorkSnapshotItem | null> {
  const result = await session.query<PostgresqlRow & SnapshotItemColumns>({
    text: `
      SELECT
        item.generation,
        item.population_ordinal,
        item.process_instance_id AS item_process_instance_id,
        item.expected_public_instance_json,
        item.expected_work_locator,
        item.expected_observation,
        item.state AS item_state,
        process.process_instance_id,
        process.public_instance_json,
        process.work_locator,
        process.observation,
        process.population_ordinal AS current_population_ordinal
      FROM bpmn_platform.work_snapshot_control AS control
      JOIN bpmn_platform.work_snapshot_generation_items AS item
        ON item.generation = control.building_generation
      JOIN bpmn_platform.work_processes AS process
        ON process.process_instance_id = item.process_instance_id
      WHERE control.singleton = true
        AND item.process_instance_id = $1
    `,
    values: [text(processInstanceId, "processInstanceId")],
  });
  const row = result.rows[0];
  if (row === undefined) return null;
  if (result.rows.length !== 1 || row.item_state !== "pending") {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  try {
    const generation = requirePositiveSafeInteger(numeric(row.generation), "generation");
    const populationOrdinal = requirePositiveSafeInteger(
      numeric(row.population_ordinal),
      "population ordinal",
    );
    const itemProcessInstanceId = decodePostgresqlWorkText(
      row.item_process_instance_id,
      "snapshot item process_instance_id",
    );
    const expectedRegistration = decodePostgresqlRegistration({
      process_instance_id: row.item_process_instance_id,
      public_instance_json: row.expected_public_instance_json,
      work_locator: row.expected_work_locator,
      observation: row.expected_observation,
    });
    const currentRegistration = decodePostgresqlRegistration(row);
    const currentOrdinal = requirePositiveSafeInteger(
      numeric(row.current_population_ordinal),
      "current population ordinal",
    );
    if (itemProcessInstanceId !== processInstanceId ||
        currentRegistration.instance.processInstanceId !== processInstanceId ||
        currentOrdinal !== populationOrdinal) {
      throw new TypeError("Work snapshot item identity disagrees with registration");
    }
    return {
      generation,
      populationOrdinal,
      expectedRegistration,
      currentRegistration,
    };
  } catch (error: unknown) {
    if (error instanceof PostgresqlWorkSnapshotStoredValueError) throw error;
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
}

/**
 * Revalidates the complete prepared identity and replaces one process image only in the
 * caller's lease-fenced transaction. Locks are always control, generation, item, registration.
 */
export async function applyPreparedWorkSnapshot(
  session: PostgresqlSession,
  preparedValue: PreparedWorkSnapshotItem,
  observationKind: WorkSnapshotObservationKind,
  tasksValue: readonly PreparedWorkSnapshotTask[],
  maximumTasks: number,
): Promise<void> {
  const prepared = structuredClone(preparedValue);
  if (!Number.isSafeInteger(maximumTasks) || maximumTasks < 1) {
    throw new TypeError("Work snapshot task ceiling must be a positive safe integer");
  }
  const control = await session.query({
    text: `
      SELECT building_generation
      FROM bpmn_platform.work_snapshot_control
      WHERE singleton = true
      FOR UPDATE
    `,
  });
  const building = nullablePositive(control.rows[0]?.building_generation);
  if (building !== prepared.generation) return;

  const generation = await session.query({
    text: `
      SELECT target_population_head, materialized_through, succeeded_count, state
      FROM bpmn_platform.work_snapshot_generations
      WHERE generation = $1
      FOR UPDATE
    `,
    values: [prepared.generation],
  });
  const generationRow = generation.rows[0];
  if (generationRow === undefined || generationRow.state !== "building") return;
  validateGenerationCounts(generationRow, prepared.populationOrdinal);

  const item = await session.query<PostgresqlRow & SnapshotItemColumns>({
    text: `
      SELECT
        generation,
        population_ordinal,
        process_instance_id AS item_process_instance_id,
        expected_public_instance_json,
        expected_work_locator,
        expected_observation,
        state AS item_state
      FROM bpmn_platform.work_snapshot_generation_items
      WHERE generation = $1 AND population_ordinal = $2
      FOR UPDATE
    `,
    values: [prepared.generation, prepared.populationOrdinal],
  });
  const itemRow = item.rows[0];
  if (itemRow === undefined || itemRow.item_state === "succeeded") return;
  if (itemRow.item_state !== "pending") throw new PostgresqlWorkSnapshotStoredValueError();
  const retainedExpected = decodeExpectedRegistration(itemRow);
  if (!sameJson(retainedExpected, prepared.expectedRegistration)) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }

  const registration = await session.query({
    text: `
      SELECT * FROM bpmn_platform.work_processes
      WHERE process_instance_id = $1
      FOR UPDATE
    `,
    values: [text(
      prepared.expectedRegistration.instance.processInstanceId,
      "processInstanceId",
    )],
  });
  const registrationRow = registration.rows[0];
  if (registrationRow === undefined) throw new PostgresqlWorkSnapshotStoredValueError();
  const current = decodePostgresqlRegistration(registrationRow);
  const currentOrdinal = requirePositiveSafeInteger(
    numeric(registrationRow.population_ordinal),
    "population_ordinal",
  );
  if (currentOrdinal !== prepared.populationOrdinal) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }

  let observation = observationKind;
  let tasks = tasksValue.map((itemValue) => structuredClone(itemValue));
  if (current.observation === "closed") {
    observation = WorkSnapshotObservationKind.RetainedClosed;
    tasks = [];
  } else if (!sameJson(current, prepared.currentRegistration)) {
    return;
  }
  if (tasks.length > maximumTasks) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  if (observation !== WorkSnapshotObservationKind.Open && tasks.length !== 0) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
  const normalized = normalizePreparedTasks(tasks, current);

  await session.query({
    text: `
      DELETE FROM bpmn_platform.work_snapshot_tasks
      WHERE generation = $1 AND process_instance_id = $2
    `,
    values: [prepared.generation, text(current.instance.processInstanceId, "processInstanceId")],
  });
  for (const task of normalized) {
    await session.query({
      text: `
        INSERT INTO bpmn_platform.work_snapshot_tasks (
          generation, process_instance_id, task_process_instance_id,
          element_id, activation, task_json,
          structured_task_json, worklist_priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      values: [
        prepared.generation,
        text(current.instance.processInstanceId, "processInstanceId"),
        text(task.task.id.processInstanceId, "task processInstanceId"),
        text(task.task.id.elementId, "task elementId"),
        task.task.id.activation,
        JSON.stringify(task.task),
        task.structuredTask === null
          ? null
          : JSON.stringify(task.structuredTask.taskDefinition),
        task.structuredTask?.taskDefinition.worklistPriority ?? null,
      ],
    });
  }

  const nextObservation = observation === WorkSnapshotObservationKind.Open
    ? "active"
    : "closed";
  const changedRegistration = await session.query({
    text: `
      UPDATE bpmn_platform.work_processes
      SET observation = CASE WHEN observation = 'closed' THEN 'closed' ELSE $2 END
      WHERE process_instance_id = $1
    `,
    values: [text(current.instance.processInstanceId, "processInstanceId"), nextObservation],
  });
  if (changedRegistration.rowCount !== 1) {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }

  const succeeded = await session.query({
    text: `
      UPDATE bpmn_platform.work_snapshot_generation_items
      SET state = 'succeeded',
          observed_at = CASE WHEN $3 THEN clock_timestamp() ELSE NULL END,
          expected_observation = $4
      WHERE generation = $1
        AND population_ordinal = $2
        AND state = 'pending'
    `,
    values: [
      prepared.generation,
      prepared.populationOrdinal,
      observation !== WorkSnapshotObservationKind.RetainedClosed,
      nextObservation,
    ],
  });
  if (succeeded.rowCount !== 1) throw new PostgresqlWorkSnapshotStoredValueError();
  const counted = await session.query({
    text: `
      UPDATE bpmn_platform.work_snapshot_generations
      SET succeeded_count = succeeded_count + 1
      WHERE generation = $1 AND state = 'building'
    `,
    values: [prepared.generation],
  });
  if (counted.rowCount !== 1) throw new PostgresqlWorkSnapshotStoredValueError();
  await completeWorkSnapshotGenerationIfReady(session, prepared.generation);
}

function normalizePreparedTasks(
  tasks: readonly PreparedWorkSnapshotTask[],
  registration: WorkProcessRegistration,
): readonly PreparedWorkSnapshotTask[] {
  const seen = new Set<string>();
  return tasks.map((item) => {
    const task = snapshotOpenWorkTask(item.task, registration.instance);
    const key = JSON.stringify(task.id);
    if (seen.has(key)) throw new PostgresqlWorkSnapshotStoredValueError();
    seen.add(key);
    if (item.structuredTask !== null &&
        (item.structuredTask.taskDefinition.elementId !== task.id.elementId ||
          item.structuredTask.catalogIdentity.processId !== registration.instance.definition.processId ||
          item.structuredTask.catalogIdentity.version !== registration.instance.definition.version ||
          item.structuredTask.catalogIdentity.sourceSha256 !== registration.instance.definition.source.sha256 ||
          item.structuredTask.catalogIdentity.semanticProfile !== registration.instance.definition.semanticProfile)) {
      throw new PostgresqlWorkSnapshotStoredValueError();
    }
    return {
      task,
      structuredTask: item.structuredTask === null
        ? null
        : structuredClone(item.structuredTask),
    };
  });
}

function decodeExpectedRegistration(row: SnapshotItemColumns): WorkProcessRegistration {
  try {
    return decodePostgresqlRegistration({
      process_instance_id: row.item_process_instance_id,
      public_instance_json: row.expected_public_instance_json,
      work_locator: row.expected_work_locator,
      observation: row.expected_observation,
    });
  } catch {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
}

function validateGenerationCounts(row: PostgresqlRow, ordinal: number): void {
  try {
    const target = requireNonnegativeSafeInteger(
      numeric(row.target_population_head),
      "target population head",
    );
    const through = requireNonnegativeSafeInteger(
      numeric(row.materialized_through),
      "materialized through",
    );
    const succeeded = requireNonnegativeSafeInteger(
      numeric(row.succeeded_count),
      "succeeded count",
    );
    if (ordinal > target || ordinal > through || succeeded >= target) {
      throw new TypeError("Work snapshot generation counts disagree");
    }
  } catch {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
}

function nullablePositive(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  try {
    return requirePositiveSafeInteger(numeric(value), "building generation");
  } catch {
    throw new PostgresqlWorkSnapshotStoredValueError();
  }
}

function text(value: string, label: string): Buffer {
  return encodePostgresqlWorkText(value, label);
}

type SnapshotItemColumns = Readonly<{
  generation: unknown;
  population_ordinal: unknown;
  item_process_instance_id: unknown;
  expected_public_instance_json: unknown;
  expected_work_locator: unknown;
  expected_observation: unknown;
  item_state: unknown;
}>;
