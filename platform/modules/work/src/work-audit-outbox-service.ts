import type { WorkAuditOutboxItem } from "./work-contracts.js";

export interface WorkAuditOutboxRepository {
  listUndeliveredAuditEvents(): Promise<ReadonlyArray<WorkAuditOutboxItem>>;
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
    for (const item of await this.repository.listUndeliveredAuditEvents()) {
      await this.sink.record(item);
      await this.repository.acknowledgeAuditEvent(item.event.eventId);
    }
  }
}
