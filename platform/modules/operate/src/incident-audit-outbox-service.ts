import type { IncidentAuditOutboxItem } from "./incident-contracts.js";

export interface IncidentAuditOutboxRepository {
  listUndeliveredAuditEvents(): Promise<ReadonlyArray<IncidentAuditOutboxItem>>;
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
    for (const item of await this.repository.listUndeliveredAuditEvents()) {
      await this.sink.record(item);
      await this.repository.acknowledgeAuditEvent(item.event.eventId);
    }
  }
}
