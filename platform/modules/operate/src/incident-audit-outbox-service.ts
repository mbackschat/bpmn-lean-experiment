import type { IncidentAuditEvent, IncidentAuditOutboxItem } from "./incident-contracts.js";

export interface IncidentAuditOutboxRepository {
  listUndeliveredAuditEvents(): ReadonlyArray<IncidentAuditOutboxItem>;
  acknowledgeAuditEvent(eventId: string): void;
}

export interface IncidentAuditSink {
  record(event: IncidentAuditEvent): number;
}

/** Delivers exact snapshots before acknowledging their Operate-owned outbox rows. */
export class IncidentActionAuditOutboxService {
  constructor(
    private readonly repository: IncidentAuditOutboxRepository,
    private readonly sink: IncidentAuditSink,
  ) {}

  reconcileAll(): void {
    for (const { event } of this.repository.listUndeliveredAuditEvents()) {
      this.sink.record(event);
      this.repository.acknowledgeAuditEvent(event.eventId);
    }
  }
}
