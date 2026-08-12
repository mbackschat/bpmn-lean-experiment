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
    const { record } = this.#repository.confirm(snapshotPublication(publication));
    return this.#deliver(record);
  }

  /** Dispatches only from a freshly won reserved-to-starting transition. */
  async startDirect(
    reservation: DirectProcessInstanceReservation,
    host: DirectProcessInstanceHost,
  ): Promise<ConfirmedProcessInstanceRecord> {
    const snapshot = snapshotDirectReservation(reservation);
    let record = this.#repository.reserveDirect(snapshot).record;
    let ownsDispatch = false;
    if (record.state === ConfirmedProcessInstanceState.Reserved) {
      const starting = this.#repository.compareAndSetState(
        record.instance.processInstanceId,
        ConfirmedProcessInstanceState.Reserved,
        ConfirmedProcessInstanceState.Starting,
      );
      if (starting !== null) {
        record = starting;
        ownsDispatch = true;
      } else {
        record = this.#requireRecord(record.instance.processInstanceId);
      }
    }

    if (ownsDispatch) {
      try {
        const result = await host.start(snapshot);
        switch (result.status) {
          case "started":
            record = this.#transitionToConfirmed(record);
            break;
          case "rejected":
          case "integrityFailure":
            this.#transitionToIntegrity(record);
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
        return this.#requireRecord(record.instance.processInstanceId);
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
    for (const record of this.#repository.listForReconciliation()) {
      if (record.state === ConfirmedProcessInstanceState.Confirmed) {
        await this.#deliver(record);
      }
    }
  }

  /** Reconciles only already-dispatched direct rows. It never invokes host.start. */
  async reconcileDirect(host: DirectProcessInstanceHost): Promise<void> {
    for (const initial of this.#repository.listForReconciliation()) {
      if (
        initial.state !== ConfirmedProcessInstanceState.Starting &&
        initial.state !== ConfirmedProcessInstanceState.Indeterminate
      ) {
        continue;
      }
      if (initial.intent === null) {
        this.#transitionToIntegrity(initial);
        throw new ConfirmedProcessInstanceIntegrityError(
          initial.instance.processInstanceId,
        );
      }
      const reservation = {
        instance: structuredClone(initial.instance),
        locator: initial.locator,
        intent: { ...initial.intent },
      };
      const reconciled = await this.#describeOnly(
        initial,
        reservation,
        host,
      );
      if (reconciled.state === ConfirmedProcessInstanceState.Confirmed) {
        await this.#deliver(reconciled);
      }
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
        return this.#transitionToConfirmed(record);
      case "missing":
      case "unavailable":
        if (record.state === ConfirmedProcessInstanceState.Starting) {
          return this.#repository.compareAndSetState(
            record.instance.processInstanceId,
            ConfirmedProcessInstanceState.Starting,
            ConfirmedProcessInstanceState.Indeterminate,
          ) ?? this.#requireRecord(record.instance.processInstanceId);
        }
        return record;
      case "divergent":
        this.#transitionToIntegrity(record);
        throw new ConfirmedProcessInstanceIntegrityError(
          record.instance.processInstanceId,
        );
      default:
        return assertNever(description.status);
    }
  }

  #transitionToConfirmed(
    record: ConfirmedProcessInstanceRecord,
  ): ConfirmedProcessInstanceRecord {
    if (record.state === ConfirmedProcessInstanceState.Confirmed) {
      return record;
    }
    if (
      record.state !== ConfirmedProcessInstanceState.Starting &&
      record.state !== ConfirmedProcessInstanceState.Indeterminate
    ) {
      throw new ConfirmedProcessInstanceIntegrityError(
        record.instance.processInstanceId,
      );
    }
    return this.#repository.compareAndSetState(
      record.instance.processInstanceId,
      record.state,
      ConfirmedProcessInstanceState.Confirmed,
    ) ?? this.#requireRecord(record.instance.processInstanceId);
  }

  #transitionToIntegrity(record: ConfirmedProcessInstanceRecord): void {
    if (record.state === ConfirmedProcessInstanceState.IntegrityFailure) {
      return;
    }
    if (record.state === ConfirmedProcessInstanceState.Confirmed) {
      throw new ConfirmedProcessInstanceIntegrityError(
        record.instance.processInstanceId,
      );
    }
    this.#repository.compareAndSetState(
      record.instance.processInstanceId,
      record.state,
      ConfirmedProcessInstanceState.IntegrityFailure,
    );
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
      await this.#operate.recordProcessInstance(structuredClone(record.instance));
      record = this.#repository.acknowledge(
        record.instance.processInstanceId,
        "operate",
      ) ?? this.#requireRecord(record.instance.processInstanceId);
    }
    if (record.workPending) {
      await this.#work.recordConfirmedProcessInstance({
        instance: structuredClone(record.instance),
        locator: record.locator,
      });
      this.#repository.acknowledge(record.instance.processInstanceId, "work");
    }
    return structuredClone(record.instance);
  }

  #requireRecord(processInstanceId: string): ConfirmedProcessInstanceRecord {
    const record = this.#repository.get(processInstanceId);
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
