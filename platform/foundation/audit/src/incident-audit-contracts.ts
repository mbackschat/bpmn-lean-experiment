import type {
  IncidentAuditActionKind,
  IncidentAuditEvent,
  IncidentAuditRequest,
  PublicEffectIncidentId,
} from "@bpmn-lean/platform-contracts";

export type IncidentAuditRepositoryQuery = Readonly<{
  actorId?: string;
  hostingProcessInstanceId?: string;
  incidentId?: PublicEffectIncidentId;
  actionKind?: IncidentAuditActionKind;
  afterOrdinal?: number;
  limit: number;
}>;

export type StoredIncidentAuditEvent = Readonly<{
  ordinal: number;
  event: IncidentAuditEvent;
}>;

export interface IncidentAuditRepository {
  record(event: IncidentAuditEvent): number;
  search(
    query: IncidentAuditRepositoryQuery,
  ): ReadonlyArray<StoredIncidentAuditEvent>;
}

export type NormalizedIncidentAuditSearchRequest = IncidentAuditRequest &
  Readonly<{ limit: number }>;

export class IncidentAuditEventIntegrityError extends Error {
  constructor(eventId: string) {
    super(`incident audit event ${eventId} conflicts`);
    this.name = "IncidentAuditEventIntegrityError";
  }
}

export class IncidentAuditStoredValueError extends Error {
  constructor(cause: unknown) {
    super("stored incident audit event is invalid", { cause });
    this.name = "IncidentAuditStoredValueError";
  }
}

export class IncidentAuditSchemaResetRequiredError extends Error {
  constructor() {
    super("incident audit SQLite schema is not the exact supported epoch");
    this.name = "IncidentAuditSchemaResetRequiredError";
  }
}
