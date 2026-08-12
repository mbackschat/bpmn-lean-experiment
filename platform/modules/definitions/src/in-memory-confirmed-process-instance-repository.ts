import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
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
  requireAllowedTransition,
  sameIntent,
  samePublication,
  snapshotConfirmedPublication,
  snapshotDirectIntent,
  snapshotRecord,
} from "./confirmed-process-instance-values.js";

/** Focused-test repository with the same closed transitions as the SQLite owner. */
export class InMemoryConfirmedProcessInstanceRepository
  implements ConfirmedProcessInstanceRepository {
  readonly #records = new Map<string, ConfirmedProcessInstanceRecord>();

  confirm(
    publication: ConfirmedProcessInstancePublication,
  ): ConfirmedProcessInstanceReservationResult {
    return this.#insert(publication, null, ConfirmedProcessInstanceState.Confirmed);
  }

  reserveDirect(
    reservation: DirectProcessInstanceReservation,
  ): ConfirmedProcessInstanceReservationResult {
    return this.#insert(
      reservation,
      snapshotDirectIntent(reservation.intent),
      ConfirmedProcessInstanceState.Reserved,
    );
  }

  get(processInstanceId: string): ConfirmedProcessInstanceRecord | null {
    const record = this.#records.get(processInstanceId);
    return record === undefined ? null : snapshotRecord(record);
  }

  listForReconciliation(): ReadonlyArray<ConfirmedProcessInstanceRecord> {
    return [...this.#records.values()]
      .filter((record) =>
        record.state === ConfirmedProcessInstanceState.Reserved ||
        record.state === ConfirmedProcessInstanceState.Starting ||
        record.state === ConfirmedProcessInstanceState.Indeterminate ||
        (record.state === ConfirmedProcessInstanceState.Confirmed &&
          (record.operatePending || record.workPending))
      )
      .sort((left, right) => {
        const leftId = left.instance.processInstanceId;
        const rightId = right.instance.processInstanceId;
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      })
      .map(snapshotRecord);
  }

  compareAndSetState(
    processInstanceId: string,
    expected: ConfirmedProcessInstanceState,
    next: ConfirmedProcessInstanceState,
  ): ConfirmedProcessInstanceRecord | null {
    requireAllowedTransition(expected, next);
    const existing = this.#records.get(processInstanceId);
    if (existing === undefined || existing.state !== expected) {
      return null;
    }
    const updated = {
      ...existing,
      state: next,
      ...(next === ConfirmedProcessInstanceState.Confirmed
        ? { operatePending: true, workPending: true }
        : {}),
    };
    this.#records.set(processInstanceId, updated);
    return snapshotRecord(updated);
  }

  acknowledge(
    processInstanceId: string,
    subscriber: ConfirmedProcessInstanceSubscriber,
  ): ConfirmedProcessInstanceRecord | null {
    const existing = this.#records.get(processInstanceId);
    if (
      existing === undefined ||
      existing.state !== ConfirmedProcessInstanceState.Confirmed
    ) {
      return null;
    }
    const updated = {
      ...existing,
      ...(subscriber === "operate"
        ? { operatePending: false }
        : { workPending: false }),
    };
    this.#records.set(processInstanceId, updated);
    return snapshotRecord(updated);
  }

  #insert(
    publication: ConfirmedProcessInstancePublication,
    intent: ConfirmedProcessInstanceRecord["intent"],
    state: ConfirmedProcessInstanceState,
  ): ConfirmedProcessInstanceReservationResult {
    const exact = snapshotConfirmedPublication(publication);
    const existing = this.#records.get(exact.instance.processInstanceId);
    if (existing !== undefined) {
      if (
        !samePublication(existing, exact) ||
        !sameIntent(existing.intent, intent)
      ) {
        throw new ConfirmedProcessInstanceIntegrityError(
          exact.instance.processInstanceId,
        );
      }
      return { inserted: false, record: snapshotRecord(existing) };
    }
    const record = {
      ...exact,
      intent,
      state,
      operatePending: state === ConfirmedProcessInstanceState.Confirmed,
      workPending: state === ConfirmedProcessInstanceState.Confirmed,
    };
    this.#records.set(exact.instance.processInstanceId, record);
    return { inserted: true, record: snapshotRecord(record) };
  }
}
