import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstanceOperateSubscriber,
  ConfirmedProcessInstancePublication,
  ConfirmedProcessInstanceRecord,
  ConfirmedProcessInstanceRepository,
  ConfirmedProcessInstanceWorkSubscriber,
  DirectProcessInstanceHost,
  DirectProcessInstanceReservation,
} from "./confirmed-process-instance-contracts.js";

export type ConfirmedProcessInstancePublicationDependencies = Readonly<{
  repository: ConfirmedProcessInstanceRepository;
  operate: ConfirmedProcessInstanceOperateSubscriber;
  work: ConfirmedProcessInstanceWorkSubscriber;
}>;

/** Owns durable confirmation and independent delivery to Operate and Work. */
export class ConfirmedProcessInstancePublicationService {
  readonly #repository: ConfirmedProcessInstanceRepository;
  readonly #operate: ConfirmedProcessInstanceOperateSubscriber;
  readonly #work: ConfirmedProcessInstanceWorkSubscriber;

  constructor(dependencies: ConfirmedProcessInstancePublicationDependencies) {
    this.#repository = dependencies.repository;
    this.#operate = dependencies.operate;
    this.#work = dependencies.work;
  }

  async publishConfirmed(
    publication: ConfirmedProcessInstancePublication,
  ): Promise<PublicProcessInstanceIdentity> {
    const { record } = await this.#repository.confirm(
      snapshotPublication(publication),
    );
    return await this.#deliver(record);
  }

  /** Dispatches only from a freshly won reserved-to-starting transition. */
  async startDirect(
    reservation: DirectProcessInstanceReservation,
    host: DirectProcessInstanceHost,
  ): Promise<ConfirmedProcessInstanceRecord> {
    const snapshot = snapshotDirectReservation(reservation);
    let record = (await this.#repository.reserveDirect(snapshot)).record;
    let ownsDispatch = false;
    if (record.state === ConfirmedProcessInstanceState.Reserved) {
      const starting = await this.#repository.compareAndSetState(
        record.instance.processInstanceId,
        ConfirmedProcessInstanceState.Reserved,
        ConfirmedProcessInstanceState.Starting,
      );
      if (starting !== null) {
        record = starting;
        ownsDispatch = true;
      } else {
        record = await this.#requireRecord(record.instance.processInstanceId);
      }
    }

    if (ownsDispatch) {
      try {
        const result = await host.start(snapshot);
        switch (result.status) {
          case "started":
            record = await this.#transitionToConfirmed(record);
            break;
          case "rejected":
          case "integrityFailure":
            await this.#transitionToIntegrity(record);
            throw new ConfirmedProcessInstanceIntegrityError(
              record.instance.processInstanceId,
            );
          default:
            return assertNever(result);
        }
      } catch (error: unknown) {
        if (error instanceof ConfirmedProcessInstanceIntegrityError) {
          throw error;
        }
        record = await this.#describeOnly(record, snapshot, host);
      }
    } else if (
      record.state === ConfirmedProcessInstanceState.Starting ||
      record.state === ConfirmedProcessInstanceState.Indeterminate
    ) {
      record = await this.#describeOnly(record, snapshot, host);
    }

    switch (record.state) {
      case ConfirmedProcessInstanceState.Confirmed:
        await this.#deliver(record);
        return await this.#requireRecord(record.instance.processInstanceId);
      case ConfirmedProcessInstanceState.IntegrityFailure:
        throw new ConfirmedProcessInstanceIntegrityError(
          record.instance.processInstanceId,
        );
      case ConfirmedProcessInstanceState.Reserved:
      case ConfirmedProcessInstanceState.Starting:
      case ConfirmedProcessInstanceState.Indeterminate:
        return record;
      default:
        return assertNever(record.state);
    }
  }

  async reconcileDeliveries(): Promise<void> {
    for (const record of await this.#repository.listForReconciliation()) {
      await this.reconcileDelivery(record.instance.processInstanceId);
    }
  }

  /** Re-reads and delivers one exact confirmed registration when still pending. */
  async reconcileDelivery(processInstanceId: string): Promise<void> {
    const current = await this.#repository.get(processInstanceId);
    if (
      current?.state === ConfirmedProcessInstanceState.Confirmed &&
      (current.operatePending || current.workPending)
    ) {
      await this.#deliver(current);
    }
  }

  /** Reports only an exact durable confirmation, never host-derived evidence. */
  async isConfirmed(processInstanceId: string): Promise<boolean> {
    return (await this.#repository.get(processInstanceId))?.state ===
      ConfirmedProcessInstanceState.Confirmed;
  }

  /** Dispatches a durable reserved row once; already-dispatched rows are describe-only. */
  async reconcileDirect(host: DirectProcessInstanceHost): Promise<void> {
    for (const initial of await this.#repository.listForReconciliation()) {
      await this.reconcileDirectProcessInstance(
        initial.instance.processInstanceId,
        host,
      );
    }
  }

  /** Re-reads one durable direct start before dispatch or describe-only recovery. */
  async reconcileDirectProcessInstance(
    processInstanceId: string,
    host: DirectProcessInstanceHost,
  ): Promise<void> {
    const initial = await this.#repository.get(processInstanceId);
    if (
      initial === null ||
      (
        initial.state !== ConfirmedProcessInstanceState.Reserved &&
        initial.state !== ConfirmedProcessInstanceState.Starting &&
        initial.state !== ConfirmedProcessInstanceState.Indeterminate
      )
    ) {
      return;
    }
    if (initial.intent === null) {
      await this.#transitionToIntegrity(initial);
      throw new ConfirmedProcessInstanceIntegrityError(processInstanceId);
    }
    const reservation = {
      instance: structuredClone(initial.instance),
      locator: initial.locator,
      intent: { ...initial.intent },
    };
    if (initial.state === ConfirmedProcessInstanceState.Reserved) {
      await this.startDirect(reservation, host);
      return;
    }
    const reconciled = await this.#describeOnly(initial, reservation, host);
    if (reconciled.state === ConfirmedProcessInstanceState.Confirmed) {
      await this.#deliver(reconciled);
    }
  }

  async #describeOnly(
    record: ConfirmedProcessInstanceRecord,
    reservation: DirectProcessInstanceReservation,
    host: DirectProcessInstanceHost,
  ): Promise<ConfirmedProcessInstanceRecord> {
    let description;
    try {
      description = await host.describe(reservation);
    } catch {
      description = { status: "unavailable" as const };
    }
    switch (description.status) {
      case "matching":
        return await this.#transitionToConfirmed(record);
      case "missing":
      case "unavailable":
        if (record.state === ConfirmedProcessInstanceState.Starting) {
          return (await this.#repository.compareAndSetState(
            record.instance.processInstanceId,
            ConfirmedProcessInstanceState.Starting,
            ConfirmedProcessInstanceState.Indeterminate,
          )) ?? await this.#requireRecord(record.instance.processInstanceId);
        }
        return record;
      case "divergent":
        await this.#transitionToIntegrity(record);
        throw new ConfirmedProcessInstanceIntegrityError(
          record.instance.processInstanceId,
        );
      default:
        return assertNever(description.status);
    }
  }

  async #transitionToConfirmed(
    record: ConfirmedProcessInstanceRecord,
  ): Promise<ConfirmedProcessInstanceRecord> {
    return await this.#convergeDefinitiveState(
      record,
      ConfirmedProcessInstanceState.Confirmed,
    );
  }

  async #transitionToIntegrity(
    record: ConfirmedProcessInstanceRecord,
  ): Promise<void> {
    await this.#convergeDefinitiveState(
      record,
      ConfirmedProcessInstanceState.IntegrityFailure,
    );
  }

  /**
   * Preserves a definitive exact host result when recovery changes `starting` to
   * `indeterminate` while the original host call is still in flight. The only
   * permitted retry is across those transient states; an opposite definitive
   * state remains an integrity conflict and is never overwritten.
   */
  async #convergeDefinitiveState(
    initial: ConfirmedProcessInstanceRecord,
    target:
      | typeof ConfirmedProcessInstanceState.Confirmed
      | typeof ConfirmedProcessInstanceState.IntegrityFailure,
  ): Promise<ConfirmedProcessInstanceRecord> {
    let current = initial;
    for (;;) {
      if (current.state === target) return current;
      switch (current.state) {
        case ConfirmedProcessInstanceState.Starting:
        case ConfirmedProcessInstanceState.Indeterminate: {
          const updated = await this.#repository.compareAndSetState(
            current.instance.processInstanceId,
            current.state,
            target,
          );
          current = updated ?? await this.#requireRecord(
            current.instance.processInstanceId,
          );
          break;
        }
        case ConfirmedProcessInstanceState.Reserved:
        case ConfirmedProcessInstanceState.Confirmed:
        case ConfirmedProcessInstanceState.IntegrityFailure:
          throw new ConfirmedProcessInstanceIntegrityError(
            current.instance.processInstanceId,
          );
        default:
          return assertNever(current.state);
      }
    }
  }

  async #deliver(
    initial: ConfirmedProcessInstanceRecord,
  ): Promise<PublicProcessInstanceIdentity> {
    let record = initial;
    if (record.state !== ConfirmedProcessInstanceState.Confirmed) {
      throw new ConfirmedProcessInstanceIntegrityError(
        record.instance.processInstanceId,
      );
    }
    if (record.operatePending) {
      await this.#operate.recordConfirmedProcessInstance({
        instance: structuredClone(record.instance),
        locator: record.locator,
      });
      record = (await this.#repository.acknowledge(
        record.instance.processInstanceId,
        "operate",
      )) ?? await this.#requireRecord(record.instance.processInstanceId);
    }
    if (record.workPending) {
      await this.#work.recordConfirmedProcessInstance({
        instance: structuredClone(record.instance),
        locator: record.locator,
      });
      await this.#repository.acknowledge(
        record.instance.processInstanceId,
        "work",
      );
    }
    return structuredClone(record.instance);
  }

  async #requireRecord(
    processInstanceId: string,
  ): Promise<ConfirmedProcessInstanceRecord> {
    const record = await this.#repository.get(processInstanceId);
    if (record === null) {
      throw new ConfirmedProcessInstanceIntegrityError(processInstanceId);
    }
    return record;
  }
}

function snapshotPublication(
  publication: ConfirmedProcessInstancePublication,
): ConfirmedProcessInstancePublication {
  return structuredClone(publication);
}

function snapshotDirectReservation(
  reservation: DirectProcessInstanceReservation,
): DirectProcessInstanceReservation {
  return structuredClone(reservation);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported confirmed publication variant: ${String(value)}`);
}
