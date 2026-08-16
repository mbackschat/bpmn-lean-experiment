import type {
  WorkAuditEvent,
  WorkAuditRequest,
} from "@bpmn-lean/platform-contracts";

import type {
  AuditSnapshotLimits,
  AuditStreamSnapshot,
} from "./bounded-audit-snapshot.js";

export type AuditRepositoryQuery = Readonly<{
  actorId: string;
  taskProcessInstanceId?: string;
  hostingProcessInstanceId?: string;
  actionKind?: "claim" | "release" | "completion";
  afterOrdinal?: number;
  limit: number;
}>;

export type StoredAuditEvent = Readonly<{
  ordinal: number;
  event: WorkAuditEvent;
}>;

export interface AuditRepository {
  record(event: WorkAuditEvent): Promise<number>;
  search(query: AuditRepositoryQuery): Promise<ReadonlyArray<StoredAuditEvent>>;
  snapshotHostingProcessInstance(
    hostingProcessInstanceId: string,
    limits: AuditSnapshotLimits,
  ): Promise<AuditStreamSnapshot<WorkAuditEvent>>;
}

export type AuthorizedAuditSearchRequest = WorkAuditRequest & Readonly<{
  actorId: string;
  limit: number;
}>;

export class AuditEventIntegrityError extends Error {
  constructor(eventId: string) {
    super(`audit event ${eventId} conflicts`);
    this.name = "AuditEventIntegrityError";
  }
}

export class AuditStoredValueError extends Error {
  constructor(cause: unknown) {
    super("stored audit event is invalid", { cause });
    this.name = "AuditStoredValueError";
  }
}

export class AuditSchemaResetRequiredError extends Error {
  constructor() {
    super("audit SQLite schema is not the exact supported epoch");
    this.name = "AuditSchemaResetRequiredError";
  }
}
