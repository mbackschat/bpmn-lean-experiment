import {
  operatorAuditExportFormat,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentAuditEvent,
  OperatorAuditExport,
  PublicProcessInstanceIdentity,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";

export const operatorAuditInstance = {
  processInstanceId: "Instance/1",
  definition: {
    processId: "OrderProcess",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: "order.bpmn",
      sha256: "a".repeat(64),
      byteLength: 512,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "profile/operator-audit",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  },
} as const satisfies PublicProcessInstanceIdentity;

export const operatorAuditWorkEvent = {
  eventId: "work-1",
  actorId: "worker-1",
  recordedAt: "2026-08-15T12:00:02.000Z",
  hostingProcessInstanceId: operatorAuditInstance.processInstanceId,
  taskId: {
    processInstanceId: "semantic-instance",
    elementId: "ReviewOrder",
    activation: 1,
  },
  action: { kind: "completion", actionId: "complete-1", outcome: "committed" },
} as const satisfies WorkAuditEvent;

export const operatorAuditIncidentEvent = {
  eventId: "incident-1",
  actorId: "operator-1",
  recordedAt: "2026-08-15T12:00:01.000Z",
  hostingProcessInstanceId: operatorAuditInstance.processInstanceId,
  incidentId: {
    effectId: {
      processInstanceId: operatorAuditInstance.processInstanceId,
      elementId: "ChargeCard",
      activation: 1,
    },
    generation: 1,
  },
  actionId: "retry-1",
  actionKind: "retryIncident",
  outcome: "committed",
} as const satisfies IncidentAuditEvent;

export function operatorAuditExport(): OperatorAuditExport {
  return {
    format: operatorAuditExportFormat,
    instance: operatorAuditInstance,
    work: {
      headEventId: operatorAuditWorkEvent.eventId,
      events: [operatorAuditWorkEvent],
    },
    incidentActions: {
      headEventId: operatorAuditIncidentEvent.eventId,
      events: [operatorAuditIncidentEvent],
    },
  };
}
