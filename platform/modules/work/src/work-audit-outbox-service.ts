import type { WorkAuditEvent } from "@bpmn-lean/platform-contracts";

import type { WorkAuditOutboxItem } from "./work-contracts.js";

export interface WorkAuditOutboxRepository {
  listUndeliveredAuditEvents(): ReadonlyArray<WorkAuditOutboxItem>;
  acknowledgeAuditEvent(eventId: string): void;
}

export interface WorkAuditSink {
  record(event: WorkAuditEvent): number;
}

/** Delivers exact outbox snapshots before acknowledging their Work-owned rows. */
export class WorkAuditOutboxService {
  constructor(
    private readonly repository: WorkAuditOutboxRepository,
    private readonly sink: WorkAuditSink,
  ) {}

  reconcileAll(): void {
    for (const { event } of this.repository.listUndeliveredAuditEvents()) {
      this.sink.record(event);
      this.repository.acknowledgeAuditEvent(event.eventId);
    }
  }
}
