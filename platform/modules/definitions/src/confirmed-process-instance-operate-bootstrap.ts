import type {
  ConfirmedProcessInstanceOperateSubscriber,
  ConfirmedProcessInstanceRepository,
} from "./confirmed-process-instance-contracts.js";

export type ConfirmedProcessInstanceOperateBootstrapDependencies = Readonly<{
  repository: ConfirmedProcessInstanceRepository;
  operate: ConfirmedProcessInstanceOperateSubscriber;
}>;

/**
 * Replays every retained confirmed publication to Operate sequentially without
 * repository writes. The first delivery failure rejects; a rerun restarts from
 * the full enumeration and therefore requires an insert-or-compare subscriber.
 */
export class ConfirmedProcessInstanceOperateBootstrap {
  readonly #repository: ConfirmedProcessInstanceRepository;
  readonly #operate: ConfirmedProcessInstanceOperateSubscriber;

  constructor(
    dependencies: ConfirmedProcessInstanceOperateBootstrapDependencies,
  ) {
    this.#repository = dependencies.repository;
    this.#operate = dependencies.operate;
  }

  async bootstrap(): Promise<void> {
    for (const record of this.#repository.listConfirmed()) {
      await this.#operate.recordConfirmedProcessInstance({
        instance: structuredClone(record.instance),
        locator: record.locator,
      });
    }
  }
}
