import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";

import type { WorkAuditOutboxItem } from "./work-contracts.js";

export interface WorkAuditOutboxRepository {
  listUndeliveredAuditEvents(): Promise<ReadonlyArray<WorkAuditOutboxItem>>;
  acknowledgeAuditEvent(eventId: string): Promise<void>;
}

export interface WorkAuditSink {
  record(event: WorkAuditEvent): Promise<number>;
}

/** Delivers exact outbox snapshots before acknowledging their Work-owned rows. */
export class WorkAuditOutboxService {
  constructor(
    private readonly repository: WorkAuditOutboxRepository,
    private readonly sink: WorkAuditSink,
  ) {}

  async reconcileAll(): Promise<void> {
    for (const { event } of await this.repository.listUndeliveredAuditEvents()) {
      await this.sink.record(event);
      await this.repository.acknowledgeAuditEvent(event.eventId);
    }
  }
}
