import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type { PublicEffectIncidentId } from "./incidents.js";

export type IncidentAuditActionKind =
  | "retryIncident"
  | "cancelIncidentProcess";

export type IncidentAuditOutcome =
  | "reserved"
  | "committed"
  | "rejected"
  | "indeterminate";

export type IncidentAuditEvent = DeepReadonly<{
  eventId: string;
  actorId: string;
  recordedAt: string;
  hostingProcessInstanceId: string;
  incidentId: PublicEffectIncidentId;
  actionId: string;
  actionKind: IncidentAuditActionKind;
  outcome: IncidentAuditOutcome;
}>;

export type IncidentAuditRequest = DeepReadonly<{
  actorId?: string;
  hostingProcessInstanceId?: string;
  incidentProcessInstanceId?: string;
  incidentElementId?: string;
  incidentActivation?: number;
  incidentGeneration?: 1;
  actionKind?: IncidentAuditActionKind;
  cursor?: string;
  limit?: number;
}>;

/** One ascending insertion-order page with an exclusive opaque cursor. */
export type IncidentAuditPage = DeepReadonly<{
  events: IncidentAuditEvent[];
  nextCursor: string | null;
}>;
