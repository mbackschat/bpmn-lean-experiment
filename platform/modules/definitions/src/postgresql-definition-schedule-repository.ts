import type {
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";
import type { PostgresqlRow } from "@bpmn-lean/platform-postgresql-runtime";

import type { DefinitionReference } from "./contracts.js";
import {
  DefinitionScheduleIntegrityError,
  DefinitionScheduleState,
} from "./definition-schedule-contracts.js";
import type {
  DefinitionScheduleCancellationOrigin,
  DefinitionScheduleRecord,
  DefinitionScheduleReference,
  DefinitionScheduleRepository,
  DefinitionScheduleReservation,
  DefinitionScheduleTransition,
  NewDefinitionScheduleRecord,
} from "./definition-schedule-contracts.js";
import {
  deriveScheduleDueAt,
  requireWholeSecondActivation,
} from "./definition-schedule-values.js";
import {
  decodeNonemptyDefinitionMetadata,
  encodeNullablePostgresqlText,
  encodePostgresqlText,
  hasPostgresqlCode,
  metadataSqlValues,
  requireBoolean,
  requireNonemptyByteText,
  requireNonemptyString,
  requireNullableByteText,
  requireNullableString,
  requirePositiveSafeInteger,
  snapshotDefinitionMetadata,
} from "./postgresql-definition-values.js";

/** Shared immutable Schedule intents and compare-and-set lifecycle storage. */
export class PostgresqlDefinitionScheduleRepository
  implements DefinitionScheduleRepository {
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async reserve(
    record: NewDefinitionScheduleRecord,
  ): Promise<DefinitionScheduleReservation> {
    const exact = snapshotNewRecord(record);
    try {
      const result = await this.#runtime.query({
        text: `
          INSERT INTO bpmn_platform.definition_schedules (
            process_id, version, schedule_id, source_kind, source_id,
            source_sha256, source_byte_length, source_declared_encoding,
            source_decoded_as, semantic_profile, start_capabilities_json,
            timer_start_event_id, timer_duration_ms, activation_at, due_at,
            process_instance_id, host_schedule_id, configured_workflow_id_base,
            state, cleanup_complete, cancellation_origin,
            execution_workflow_id, first_run_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18,
            'creating', false, NULL, NULL, NULL
          )
          ON CONFLICT (process_id, version, schedule_id) DO NOTHING
          RETURNING *
        `,
        values: [
          encodePostgresqlText(exact.reference.processId),
          exact.reference.version,
          encodePostgresqlText(exact.reference.scheduleId),
          ...metadataSqlValues(exact.definition),
          encodePostgresqlText(exact.timerStart.startEventId),
          exact.timerStart.durationMs,
          exact.activationAt,
          exact.dueAt,
          encodePostgresqlText(exact.identity.processInstanceId),
          encodePostgresqlText(exact.identity.hostScheduleId),
          encodePostgresqlText(exact.identity.configuredWorkflowIdBase),
        ],
      });
      const inserted = result.rows[0];
      if (inserted !== undefined) {
        return { inserted: true, record: decodeRecord(inserted) };
      }
      const existing = await this.get(exact.reference);
      if (existing === null) {
        throw new DefinitionScheduleIntegrityError(
          "schedule conflict winner disappeared",
        );
      }
      return { inserted: false, record: existing };
    } catch (error: unknown) {
      if (hasPostgresqlCode(error, "23505")) {
        throw new DefinitionScheduleIntegrityError(
          "schedule private identity collides with another durable schedule",
        );
      }
      throw error;
    }
  }

  async get(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionScheduleRecord | null> {
    return await getRecord(this.#runtime, reference);
  }

  async listForDefinition(
    reference: DefinitionReference,
  ): Promise<ReadonlyArray<DefinitionScheduleRecord>> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.definition_schedules
        WHERE process_id = $1 AND version = $2
        ORDER BY schedule_id ASC
      `,
      values: [encodePostgresqlText(reference.processId), reference.version],
    });
    return result.rows.map(decodeRecord);
  }

  async listForReconciliation(): Promise<ReadonlyArray<DefinitionScheduleRecord>> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.definition_schedules
        WHERE state IN ('creating', 'creatingHost', 'scheduled', 'cancelling')
          OR NOT cleanup_complete
        ORDER BY process_id ASC, version ASC, schedule_id ASC
      `,
    });
    return result.rows.map(decodeRecord);
  }

  async compareAndSet(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleState,
    transition: DefinitionScheduleTransition,
  ): Promise<DefinitionScheduleRecord | null> {
    const current = await this.get(reference);
    if (current === null || current.state !== expected) return null;
    const next = applyTransition(current, transition);
    requireLegalTransition(current, next);
    const result = await this.#runtime.query({
      text: `
        UPDATE bpmn_platform.definition_schedules
        SET state = $1, cleanup_complete = $2, cancellation_origin = $3,
          execution_workflow_id = $4, first_run_id = $5
        WHERE process_id = $6 AND version = $7 AND schedule_id = $8
          AND state = $9
        RETURNING *
      `,
      values: [
        next.state,
        next.cleanupComplete,
        next.cancellationOrigin,
        encodeNullablePostgresqlText(next.executionWorkflowId),
        encodeNullablePostgresqlText(next.firstRunId),
        encodePostgresqlText(reference.processId),
        reference.version,
        encodePostgresqlText(reference.scheduleId),
        expected,
      ],
    });
    const row = result.rows[0];
    return row === undefined ? null : decodeRecord(row);
  }

  async requestCancellation(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionScheduleRecord | null> {
    return await this.#runtime.transaction(async (session) => {
      const current = await getRecord(session, reference, true);
      if (current === null) return null;
      const transition = cancellationTransition(current);
      if (transition === null) return current;
      const next = applyTransition(current, transition);
      requireLegalTransition(current, next);
      const result = await session.query({
        text: `
          UPDATE bpmn_platform.definition_schedules
          SET state = $1, cleanup_complete = $2, cancellation_origin = $3
          WHERE process_id = $4 AND version = $5 AND schedule_id = $6
            AND state = $7
          RETURNING *
        `,
        values: [
          next.state,
          next.cleanupComplete,
          next.cancellationOrigin,
          encodePostgresqlText(reference.processId),
          reference.version,
          encodePostgresqlText(reference.scheduleId),
          current.state,
        ],
      });
      const row = result.rows[0];
      if (row === undefined) {
        throw new DefinitionScheduleIntegrityError(
          "locked schedule changed inside its cancellation transaction",
        );
      }
      return decodeRecord(row);
    });
  }

  async markCleanupComplete(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleState,
  ): Promise<DefinitionScheduleRecord | null> {
    const current = await this.get(reference);
    if (current === null || current.state !== expected) return null;
    if (current.cleanupComplete) return current;
    return await this.compareAndSet(reference, expected, {
      state: expected,
      cleanupComplete: true,
    });
  }
}

async function getRecord(
  session: PostgresqlSession,
  reference: DefinitionScheduleReference,
  lock: boolean = false,
): Promise<DefinitionScheduleRecord | null> {
  const result = await session.query({
    text: `
      SELECT * FROM bpmn_platform.definition_schedules
      WHERE process_id = $1 AND version = $2 AND schedule_id = $3
      ${lock ? "FOR UPDATE" : ""}
    `,
    values: [
      encodePostgresqlText(reference.processId),
      reference.version,
      encodePostgresqlText(reference.scheduleId),
    ],
  });
  const row = result.rows[0];
  return row === undefined ? null : decodeRecord(row);
}

function snapshotNewRecord(
  record: NewDefinitionScheduleRecord,
): NewDefinitionScheduleRecord {
  const definition = snapshotDefinitionMetadata(record.definition);
  requireInputString(record.reference.processId, "reference.processId");
  requireInputString(record.reference.scheduleId, "reference.scheduleId");
  if (
    record.reference.version !== definition.version ||
    record.reference.processId !== definition.processId
  ) throw new TypeError("schedule reference must match its definition");
  requireInputString(record.timerStart.startEventId, "timerStart.startEventId");
  if (!Number.isSafeInteger(record.timerStart.durationMs) ||
      record.timerStart.durationMs <= 0) {
    throw new TypeError("timerStart.durationMs must be a positive safe integer");
  }
  const activationAt = requireWholeSecondActivation(record.activationAt);
  const dueAt = requireWholeSecondActivation(record.dueAt);
  if (deriveScheduleDueAt(activationAt, record.timerStart.durationMs) !== dueAt) {
    throw new TypeError("schedule due instant does not match its Timer Start");
  }
  requireInputString(record.identity.processInstanceId, "processInstanceId");
  requireInputString(record.identity.hostScheduleId, "hostScheduleId");
  requireInputString(record.identity.configuredWorkflowIdBase, "configuredWorkflowIdBase");
  return {
    reference: { ...record.reference },
    definition,
    timerStart: { ...record.timerStart },
    activationAt,
    dueAt,
    identity: { ...record.identity },
  };
}

function decodeRecord(row: PostgresqlRow): DefinitionScheduleRecord {
  const definition = decodeNonemptyDefinitionMetadata(row);
  const timerStart = {
    startEventId: requireNonemptyByteText(row, "timer_start_event_id"),
    durationMs: requirePositiveSafeInteger(row, "timer_duration_ms"),
  };
  if (
    definition.startCapabilities.timerStarts.length !== 1 ||
    definition.startCapabilities.timerStarts[0]?.startEventId !== timerStart.startEventId ||
    definition.startCapabilities.timerStarts[0]?.durationMs !== timerStart.durationMs
  ) throw new TypeError("PostgreSQL schedule has divergent Timer Start capability");
  const activationAt = requireWholeSecondActivation(
    requireNonemptyString(row, "activation_at"),
  );
  const dueAt = requireWholeSecondActivation(requireNonemptyString(row, "due_at"));
  if (deriveScheduleDueAt(activationAt, timerStart.durationMs) !== dueAt) {
    throw new TypeError("PostgreSQL schedule has invalid derived due instant");
  }
  const state = decodeState(requireNonemptyString(row, "state"));
  const cancellationOrigin = decodeCancellationOrigin(
    requireNullableString(row, "cancellation_origin"),
  );
  const executionWorkflowId = requireNullableByteText(row, "execution_workflow_id");
  const firstRunId = requireNullableByteText(row, "first_run_id");
  requireStateFields(state, cancellationOrigin, executionWorkflowId, firstRunId);
  const cleanupComplete = requireBoolean(row, "cleanup_complete");
  if (!isTerminal(state) && cleanupComplete) {
    throw new TypeError("PostgreSQL schedule cleaned a nonterminal Schedule");
  }
  return {
    reference: {
      processId: definition.processId,
      version: definition.version,
      scheduleId: requireNonemptyByteText(row, "schedule_id"),
    },
    definition,
    timerStart,
    activationAt,
    dueAt,
    identity: {
      processInstanceId: requireNonemptyByteText(row, "process_instance_id"),
      hostScheduleId: requireNonemptyByteText(row, "host_schedule_id"),
      configuredWorkflowIdBase: requireNonemptyByteText(
        row,
        "configured_workflow_id_base",
      ),
    },
    state,
    cleanupComplete,
    cancellationOrigin,
    executionWorkflowId,
    firstRunId,
  };
}

function cancellationTransition(
  current: DefinitionScheduleRecord,
): DefinitionScheduleTransition | null {
  switch (current.state) {
    case DefinitionScheduleState.Creating:
      return { state: DefinitionScheduleState.Cancelled, cleanupComplete: true };
    case DefinitionScheduleState.CreatingHost:
    case DefinitionScheduleState.Scheduled:
      return {
        state: DefinitionScheduleState.Cancelling,
        cancellationOrigin: current.state,
      };
    case DefinitionScheduleState.Cancelling:
    case DefinitionScheduleState.Started:
    case DefinitionScheduleState.Missed:
    case DefinitionScheduleState.Cancelled:
      return null;
    default:
      return assertNever(current.state);
  }
}

function applyTransition(
  current: DefinitionScheduleRecord,
  transition: DefinitionScheduleTransition,
): DefinitionScheduleRecord {
  return {
    ...current,
    state: transition.state,
    cleanupComplete: transition.cleanupComplete ?? current.cleanupComplete,
    cancellationOrigin: transition.cancellationOrigin === undefined
      ? (transition.state === DefinitionScheduleState.Cancelling
          ? current.cancellationOrigin
          : null)
      : transition.cancellationOrigin,
    executionWorkflowId: transition.executionWorkflowId === undefined
      ? current.executionWorkflowId
      : transition.executionWorkflowId,
    firstRunId: transition.firstRunId === undefined
      ? current.firstRunId
      : transition.firstRunId,
  };
}

function requireLegalTransition(
  current: DefinitionScheduleRecord,
  next: DefinitionScheduleRecord,
): void {
  const legal = current.state === next.state
    ? isTerminal(current.state) && !current.cleanupComplete && next.cleanupComplete
    : legalNextStates(current.state).includes(next.state);
  if (!legal) {
    throw new DefinitionScheduleIntegrityError(
      `illegal schedule transition ${current.state} -> ${next.state}`,
    );
  }
  requireStateFields(
    next.state,
    next.cancellationOrigin,
    next.executionWorkflowId,
    next.firstRunId,
  );
}

function legalNextStates(
  state: DefinitionScheduleState,
): readonly DefinitionScheduleState[] {
  switch (state) {
    case DefinitionScheduleState.Creating:
      return [DefinitionScheduleState.CreatingHost, DefinitionScheduleState.Cancelled];
    case DefinitionScheduleState.CreatingHost:
      return [
        DefinitionScheduleState.Scheduled,
        DefinitionScheduleState.Cancelling,
        DefinitionScheduleState.Started,
        DefinitionScheduleState.Missed,
      ];
    case DefinitionScheduleState.Scheduled:
      return [
        DefinitionScheduleState.Cancelling,
        DefinitionScheduleState.Started,
        DefinitionScheduleState.Missed,
      ];
    case DefinitionScheduleState.Cancelling:
      return [
        DefinitionScheduleState.Cancelled,
        DefinitionScheduleState.Started,
        DefinitionScheduleState.Missed,
      ];
    case DefinitionScheduleState.Started:
    case DefinitionScheduleState.Missed:
    case DefinitionScheduleState.Cancelled:
      return [];
    default:
      return assertNever(state);
  }
}

function requireStateFields(
  state: DefinitionScheduleState,
  origin: DefinitionScheduleCancellationOrigin | null,
  workflowId: string | null,
  runId: string | null,
): void {
  if ((state === DefinitionScheduleState.Cancelling) !== (origin !== null)) {
    throw new TypeError("PostgreSQL schedule has invalid cancellation origin");
  }
  if ((state === DefinitionScheduleState.Started) !==
      (workflowId !== null && runId !== null)) {
    throw new TypeError("PostgreSQL schedule has invalid execution identity");
  }
  if ((workflowId !== null && !isNonemptyWellFormed(workflowId)) ||
      (runId !== null && !isNonemptyWellFormed(runId))) {
    throw new TypeError("PostgreSQL schedule has malformed execution identity");
  }
}

function decodeState(value: string): DefinitionScheduleState {
  if (Object.values(DefinitionScheduleState).includes(value as DefinitionScheduleState)) {
    return value as DefinitionScheduleState;
  }
  throw new TypeError("PostgreSQL schedule has invalid state");
}

function decodeCancellationOrigin(
  value: string | null,
): DefinitionScheduleCancellationOrigin | null {
  if (value === null || value === DefinitionScheduleState.CreatingHost ||
      value === DefinitionScheduleState.Scheduled) return value;
  throw new TypeError("PostgreSQL schedule has invalid cancellation origin");
}

function isTerminal(state: DefinitionScheduleState): boolean {
  return state === DefinitionScheduleState.Started ||
    state === DefinitionScheduleState.Missed ||
    state === DefinitionScheduleState.Cancelled;
}

function requireInputString(value: string, label: string): void {
  if (!isNonemptyWellFormed(value)) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
}

function isNonemptyWellFormed(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.isWellFormed();
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition schedule state: ${String(value)}`);
}
