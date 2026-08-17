import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import type { PostgresqlRow } from "@bpmn-lean/platform-postgresql-runtime";

import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
  ConfirmedProcessInstanceStoredValueError,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstancePublication,
  ConfirmedProcessInstanceRecord,
  ConfirmedProcessInstanceRepository,
  ConfirmedProcessInstanceReservationResult,
  ConfirmedProcessInstanceSubscriber,
  DirectProcessInstanceReservation,
} from "./confirmed-process-instance-contracts.js";
import {
  decodeDirectIntent,
  decodePublicInstance,
  encodeDirectIntent,
  encodePublicInstance,
  requireAllowedTransition,
  requireState,
  sameIntent,
  samePublication,
  snapshotConfirmedPublication,
  snapshotDirectIntent,
} from "./confirmed-process-instance-values.js";
import {
  encodePostgresqlText,
  requireBoolean,
  requireNonemptyByteText,
  requireNonemptyString,
  requireNullableString,
} from "./postgresql-definition-values.js";

/** Shared durable confirmation, direct-start recovery, and subscriber markers. */
export class PostgresqlConfirmedProcessInstanceRepository
  implements ConfirmedProcessInstanceRepository {
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async confirm(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<ConfirmedProcessInstanceReservationResult> {
    return await this.#insert(
      publication,
      null,
      ConfirmedProcessInstanceState.Confirmed,
    );
  }

  async reserveDirect(
    reservation: DirectProcessInstanceReservation,
  ): Promise<ConfirmedProcessInstanceReservationResult> {
    return await this.#insert(
      reservation,
      encodeDirectIntent(snapshotDirectIntent(reservation.intent)),
      ConfirmedProcessInstanceState.Reserved,
    );
  }

  async get(
    processInstanceId: string,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.confirmed_process_instances
        WHERE process_instance_id = $1
      `,
      values: [encodePostgresqlText(processInstanceId)],
    });
    return decodeOptionalRow(result.rows[0]);
  }

  async listForReconciliation(): Promise<ReadonlyArray<ConfirmedProcessInstanceRecord>> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.confirmed_process_instances
        WHERE state IN ('reserved', 'starting', 'indeterminate')
          OR (state = 'confirmed' AND (operate_pending OR work_pending))
        ORDER BY process_instance_id ASC
      `,
    });
    return result.rows.map(decodeRow);
  }

  async listConfirmed(): Promise<ReadonlyArray<ConfirmedProcessInstanceRecord>> {
    const result = await this.#runtime.query({
      text: `
        SELECT * FROM bpmn_platform.confirmed_process_instances
        WHERE state = 'confirmed'
        ORDER BY process_instance_id ASC
      `,
    });
    return result.rows.map(decodeRow);
  }

  async compareAndSetState(
    processInstanceId: string,
    expected: ConfirmedProcessInstanceState,
    next: ConfirmedProcessInstanceState,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
    requireAllowedTransition(expected, next);
    const result = await this.#runtime.query({
      text: `
        UPDATE bpmn_platform.confirmed_process_instances
        SET state = $1,
          operate_pending = ($1 = 'confirmed'),
          work_pending = ($1 = 'confirmed')
        WHERE process_instance_id = $2 AND state = $3
        RETURNING *
      `,
      values: [next, encodePostgresqlText(processInstanceId), expected],
    });
    return decodeOptionalRow(result.rows[0]);
  }

  async acknowledge(
    processInstanceId: string,
    subscriber: ConfirmedProcessInstanceSubscriber,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
    const column = subscriber === "operate" ? "operate_pending" : "work_pending";
    const result = await this.#runtime.query({
      text: `
        WITH updated AS (
          UPDATE bpmn_platform.confirmed_process_instances
          SET ${column} = false
          WHERE process_instance_id = $1 AND state = 'confirmed'
          RETURNING *
        )
        SELECT * FROM updated
        UNION ALL
        SELECT * FROM bpmn_platform.confirmed_process_instances
        WHERE process_instance_id = $1 AND NOT EXISTS (SELECT 1 FROM updated)
        LIMIT 1
      `,
      values: [encodePostgresqlText(processInstanceId)],
    });
    return decodeOptionalRow(result.rows[0]);
  }

  async #insert(
    publication: ConfirmedProcessInstancePublication,
    intentJson: string | null,
    state: ConfirmedProcessInstanceState,
  ): Promise<ConfirmedProcessInstanceReservationResult> {
    const exact = snapshotConfirmedPublication(publication);
    return await this.#runtime.transaction(async (session) => {
      const inserted = await session.query({
        text: `
          INSERT INTO bpmn_platform.confirmed_process_instances (
            process_instance_id, public_instance_json, work_locator,
            direct_intent_json, state, operate_pending, work_pending
          ) VALUES ($1, $2, $3, $4, $5, $6, $6)
          ON CONFLICT (process_instance_id) DO NOTHING
          RETURNING *
        `,
        values: [
          encodePostgresqlText(exact.instance.processInstanceId),
          encodePublicInstance(exact.instance),
          encodePostgresqlText(exact.locator),
          intentJson,
          state,
          state === ConfirmedProcessInstanceState.Confirmed,
        ],
      });
      const insertedRow = inserted.rows[0];
      if (insertedRow !== undefined) {
        return { inserted: true, record: decodeRow(insertedRow) };
      }
      const existingResult = await session.query({
        text: `
          SELECT * FROM bpmn_platform.confirmed_process_instances
          WHERE process_instance_id = $1
        `,
        values: [encodePostgresqlText(exact.instance.processInstanceId)],
      });
      const existingRow = existingResult.rows[0];
      if (existingRow === undefined) {
        throw new ConfirmedProcessInstanceIntegrityError(
          exact.instance.processInstanceId,
        );
      }
      const existing = decodeRow(existingRow);
      if (
        !samePublication(existing, exact) ||
        !sameIntent(existing.intent, decodeDirectIntent(intentJson))
      ) {
        throw new ConfirmedProcessInstanceIntegrityError(
          exact.instance.processInstanceId,
        );
      }
      return { inserted: false, record: existing };
    });
  }
}

function decodeOptionalRow(
  row: PostgresqlRow | undefined,
): ConfirmedProcessInstanceRecord | null {
  return row === undefined ? null : decodeRow(row);
}

export function decodePostgresqlConfirmedProcessInstanceRecord(
  row: PostgresqlRow,
): ConfirmedProcessInstanceRecord {
  try {
    const processInstanceId = requireNonemptyByteText(row, "process_instance_id");
    const instance = decodePublicInstance(requireNonemptyString(row, "public_instance_json"));
    if (instance.processInstanceId !== processInstanceId) {
      throw new TypeError("stored public identity disagrees with its primary key");
    }
    return {
      instance,
      locator: requireNonemptyByteText(row, "work_locator"),
      intent: decodeDirectIntent(requireNullableString(row, "direct_intent_json")),
      state: requireState(requireNonemptyString(row, "state")),
      operatePending: requireBoolean(row, "operate_pending"),
      workPending: requireBoolean(row, "work_pending"),
    };
  } catch (error: unknown) {
    throw new ConfirmedProcessInstanceStoredValueError(error);
  }
}

const decodeRow = decodePostgresqlConfirmedProcessInstanceRecord;
