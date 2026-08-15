import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type { IncidentAuditEvent } from "./incident-audit.js";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";
import type { WorkAuditEvent } from "./work-tasks.js";

export const operatorAuditExportFormat = "bpmn-lean.operator-audit.v1" as const;

export const OperatorAuditMaximumEventsPerStream = 10_000;
export const OperatorAuditMaximumStoredJsonBytesPerStream = 8_000_000;
export const OperatorAuditMaximumCanonicalResponseBytes = 16_777_216;

export type OperatorAuditStream<Event> = DeepReadonly<{
  headEventId: string | null;
  events: Event[];
}>;

/** Exact independently captured Work and incident-action audit streams for one confirmed instance. */
export type OperatorAuditExport = DeepReadonly<{
  format: typeof operatorAuditExportFormat;
  instance: PublicProcessInstanceIdentity;
  work: OperatorAuditStream<WorkAuditEvent>;
  incidentActions: OperatorAuditStream<IncidentAuditEvent>;
}>;
