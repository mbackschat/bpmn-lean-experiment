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
  requireDirectEvidencePair,
  sameIntent,
  samePublication,
  sameStartCommandBytes,
  snapshotConfirmedPublication,
  snapshotDirectIntent,
  snapshotStartCommandBytes,
  snapshotRecord,
} from "./confirmed-process-instance-values.js";

/** Focused-test repository with the same closed transitions as the SQLite owner. */
export class InMemoryConfirmedProcessInstanceRepository
  implements ConfirmedProcessInstanceRepository {
  readonly #records = new Map<string, ConfirmedProcessInstanceRecord>();

  async confirm(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<ConfirmedProcessInstanceReservationResult> {
    return this.#insert(
      publication,
      null,
      null,
      ConfirmedProcessInstanceState.Confirmed,
    );
  }

  async reserveDirect(
    reservation: DirectProcessInstanceReservation,
  ): Promise<ConfirmedProcessInstanceReservationResult> {
    return this.#insert(
      reservation,
      snapshotDirectIntent(reservation.intent),
      snapshotStartCommandBytes(reservation.startCommandBytes),
      ConfirmedProcessInstanceState.Reserved,
    );
  }

  async get(
    processInstanceId: string,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
    const record = this.#records.get(processInstanceId);
    return record === undefined ? null : snapshotRecord(record);
  }

  async listForReconciliation(): Promise<ReadonlyArray<ConfirmedProcessInstanceRecord>> {
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

  async listConfirmed(): Promise<ReadonlyArray<ConfirmedProcessInstanceRecord>> {
    return [...this.#records.values()]
      .filter((record) => record.state === ConfirmedProcessInstanceState.Confirmed)
      .sort((left, right) => {
        const leftId = left.instance.processInstanceId;
        const rightId = right.instance.processInstanceId;
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      })
      .map(snapshotRecord);
  }

  async compareAndSetState(
    processInstanceId: string,
    expected: ConfirmedProcessInstanceState,
    next: ConfirmedProcessInstanceState,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
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

  async acknowledge(
    processInstanceId: string,
    subscriber: ConfirmedProcessInstanceSubscriber,
  ): Promise<ConfirmedProcessInstanceRecord | null> {
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
    startCommandBytes: ConfirmedProcessInstanceRecord["startCommandBytes"],
    state: ConfirmedProcessInstanceState,
  ): ConfirmedProcessInstanceReservationResult {
    const exact = snapshotConfirmedPublication(publication);
    requireDirectEvidencePair(intent, startCommandBytes, state);
    const existing = this.#records.get(exact.instance.processInstanceId);
    if (existing !== undefined) {
      if (
        !samePublication(existing, exact) ||
        !sameIntent(existing.intent, intent) ||
        !sameStartCommandBytes(existing.startCommandBytes, startCommandBytes)
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
      startCommandBytes,
      state,
      operatePending: state === ConfirmedProcessInstanceState.Confirmed,
      workPending: state === ConfirmedProcessInstanceState.Confirmed,
    };
    this.#records.set(exact.instance.processInstanceId, record);
    return { inserted: true, record: snapshotRecord(record) };
  }
}
