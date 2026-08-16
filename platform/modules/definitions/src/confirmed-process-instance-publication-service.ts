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
      if (record.state === ConfirmedProcessInstanceState.Confirmed) {
        await this.#deliver(record);
      }
    }
  }

  /** Dispatches a durable reserved row once; already-dispatched rows are describe-only. */
  async reconcileDirect(host: DirectProcessInstanceHost): Promise<void> {
    for (const initial of await this.#repository.listForReconciliation()) {
      if (
        initial.state !== ConfirmedProcessInstanceState.Reserved &&
        initial.state !== ConfirmedProcessInstanceState.Starting &&
        initial.state !== ConfirmedProcessInstanceState.Indeterminate
      ) {
        continue;
      }
      if (initial.intent === null) {
        await this.#transitionToIntegrity(initial);
        throw new ConfirmedProcessInstanceIntegrityError(
          initial.instance.processInstanceId,
        );
      }
      const reservation = {
        instance: structuredClone(initial.instance),
        locator: initial.locator,
        intent: { ...initial.intent },
      };
      if (initial.state === ConfirmedProcessInstanceState.Reserved) {
        await this.startDirect(reservation, host);
        continue;
      }
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
    return (await this.#repository.compareAndSetState(
      record.instance.processInstanceId,
      record.state,
      ConfirmedProcessInstanceState.Confirmed,
    )) ?? await this.#requireRecord(record.instance.processInstanceId);
  }

  async #transitionToIntegrity(
    record: ConfirmedProcessInstanceRecord,
  ): Promise<void> {
    if (record.state === ConfirmedProcessInstanceState.IntegrityFailure) {
      return;
    }
    if (record.state === ConfirmedProcessInstanceState.Confirmed) {
      throw new ConfirmedProcessInstanceIntegrityError(
        record.instance.processInstanceId,
      );
    }
    await this.#repository.compareAndSetState(
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
