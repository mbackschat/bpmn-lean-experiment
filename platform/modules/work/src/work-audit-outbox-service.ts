import type { WorkAuditOutboxItem } from "./work-contracts.js";
import { requireWorkAuditDeliveryLimit } from "./work-audit-delivery-values.js";

export interface WorkAuditOutboxRepository {
  listUndeliveredAuditEvents(limit?: number): Promise<ReadonlyArray<WorkAuditOutboxItem>>;
  acknowledgeAuditEvent(eventId: string): Promise<void>;
}

export interface WorkAuditSink {
  record(item: WorkAuditOutboxItem): Promise<number>;
}

/** Delivers exact outbox snapshots before acknowledging their Work-owned rows. */
export class WorkAuditOutboxService {
  constructor(
    private readonly repository: WorkAuditOutboxRepository,
    private readonly sink: WorkAuditSink,
  ) {}

  async reconcileAll(): Promise<void> {
    await this.#reconcile(undefined);
  }

  async reconcileBatch(limit: number): Promise<number> {
    return this.#reconcile(requireWorkAuditDeliveryLimit(limit));
  }

  async #reconcile(limit: number | undefined): Promise<number> {
    let delivered = 0;
    for (const item of await this.repository.listUndeliveredAuditEvents(limit)) {
      await this.sink.record(item);
      await this.repository.acknowledgeAuditEvent(item.event.eventId);
      delivered += 1;
    }
    return delivered;
  }
}
