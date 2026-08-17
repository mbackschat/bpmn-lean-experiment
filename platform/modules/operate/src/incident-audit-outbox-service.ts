import type { IncidentAuditOutboxItem } from "./incident-contracts.js";
import { requireIncidentAuditDeliveryLimit } from "./incident-contracts.js";

export interface IncidentAuditOutboxRepository {
  listUndeliveredAuditEvents(limit?: number): Promise<ReadonlyArray<IncidentAuditOutboxItem>>;
  acknowledgeAuditEvent(eventId: string): Promise<void>;
}

export interface IncidentAuditSink {
  record(item: IncidentAuditOutboxItem): Promise<number>;
}

/** Delivers exact snapshots before acknowledging their Operate-owned outbox rows. */
export class IncidentActionAuditOutboxService {
  constructor(
    private readonly repository: IncidentAuditOutboxRepository,
    private readonly sink: IncidentAuditSink,
  ) {}

  async reconcileAll(): Promise<void> {
    await this.#reconcile(undefined);
  }

  async reconcileBatch(limit: number): Promise<number> {
    return this.#reconcile(requireIncidentAuditDeliveryLimit(limit));
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
