import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeOperatorAuditExport,
  operatorAuditExportFormat,
  OperatorAuditMaximumCanonicalResponseBytes,
  OperatorAuditMaximumEventsPerStream,
  OperatorAuditMaximumStoredJsonBytesPerStream,
  serializeOperatorAuditExport,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  OperatorAuditExport,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

const definition = {
  processId: "OrderProcess",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "order.bpmn",
    sha256: "a".repeat(64),
    byteLength: 1024,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "cib-seven-2.2.0:parallel-user-task-metadata-composition",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

const instance = {
  processInstanceId: "hosting-instance/1",
  definition,
} as const satisfies PublicProcessInstanceIdentity;

const workEvent = {
  eventId: "work-event-1",
  actorId: "worker-1",
  recordedAt: "2026-08-15T12:00:02.000Z",
  hostingProcessInstanceId: instance.processInstanceId,
  taskId: {
    processInstanceId: "semantic-subprocess-1",
    elementId: "ReviewOrder",
    activation: 1,
  },
  action: { kind: "completion", actionId: "complete-1", outcome: "committed" },
} as const;

const incidentEvent = {
  eventId: "incident-event-1",
  actorId: "operator-1",
  recordedAt: "2026-08-15T12:00:01.000Z",
  hostingProcessInstanceId: instance.processInstanceId,
  incidentId: {
    effectId: {
      processInstanceId: instance.processInstanceId,
      elementId: "ChargeCard",
      activation: 1,
    },
    generation: 1,
  },
  actionId: "retry-1",
  actionKind: "retryIncident",
  outcome: "committed",
} as const;

function exportValue(): OperatorAuditExport {
  return {
    format: operatorAuditExportFormat,
    instance,
    work: { headEventId: workEvent.eventId, events: [workEvent] },
    incidentActions: {
      headEventId: incidentEvent.eventId,
      events: [incidentEvent],
    },
  };
}

test("decodes independently ordered Work and incident-action streams", () => {
  const value = exportValue();
  assert.deepEqual(decodeOperatorAuditExport(value, instance), value);
  assert.equal(value.work.events[0]?.recordedAt, "2026-08-15T12:00:02.000Z");
  assert.equal(value.incidentActions.events[0]?.recordedAt, "2026-08-15T12:00:01.000Z");
});

test("preserves each source array and never canonicalizes a cross-stream chronology", () => {
  const laterWork = {
    ...workEvent,
    eventId: "work-event-2",
    recordedAt: "2026-08-15T11:59:59.000Z",
    action: { ...workEvent.action, actionId: "complete-2" },
  } as const;
  const laterIncident = {
    ...incidentEvent,
    eventId: "incident-event-2",
    recordedAt: workEvent.recordedAt,
    actionId: "retry-2",
  } as const;
  const ordered = {
    ...exportValue(),
    work: {
      headEventId: laterWork.eventId,
      events: [workEvent, laterWork],
    },
    incidentActions: {
      headEventId: laterIncident.eventId,
      events: [incidentEvent, laterIncident],
    },
  } as const;
  const bytes = serializeOperatorAuditExport(ordered, instance);
  const independentlyReversed = [{
    ...ordered,
    work: {
      headEventId: workEvent.eventId,
      events: [laterWork, workEvent],
    },
  }, {
    ...ordered,
    incidentActions: {
      headEventId: incidentEvent.eventId,
      events: [laterIncident, incidentEvent],
    },
  }] as const;
  for (const mutation of independentlyReversed) {
    assert.notDeepEqual(serializeOperatorAuditExport(mutation, instance), bytes);
  }
});

test("rejects identity, event, head, and closed-shape corruption", () => {
  const value = exportValue();
  const corruptions = [
    { ...value, instance: { ...instance, processInstanceId: "other-instance" } },
    {
      ...value,
      work: {
        ...value.work,
        events: [{ ...workEvent, hostingProcessInstanceId: "other-instance" }],
      },
    },
    {
      ...value,
      incidentActions: {
        headEventId: workEvent.eventId,
        events: [{ ...incidentEvent, eventId: workEvent.eventId }],
      },
    },
    {
      ...value,
      work: {
        headEventId: workEvent.eventId,
        events: [workEvent, { ...workEvent, eventId: "work-event-2" }],
      },
    },
    {
      ...value,
      work: {
        ...value.work,
        events: [{ ...workEvent, workflowId: "private-workflow" }],
      },
    },
    { ...value, privateOrdinal: 42 },
  ];
  for (const corruption of corruptions) {
    assert.throws(() => decodeOperatorAuditExport(corruption, instance));
  }
  assert.throws(() => decodeOperatorAuditExport({
    ...value,
    work: { headEventId: null, events: [workEvent] },
  }, instance));
  assert.throws(() => decodeOperatorAuditExport({
    ...value,
    work: { headEventId: workEvent.eventId, events: [] },
  }, instance));
  assert.throws(() => decodeOperatorAuditExport({
    ...value,
    work: {
      headEventId: null,
      events: Array.from(
        { length: OperatorAuditMaximumEventsPerStream + 1 },
        (_, index) => ({ ...workEvent, eventId: `work-event-${index}` }),
      ),
    },
  }, instance), /event ceiling/u);
});

test("publishes the exact v1 resource ceilings", () => {
  assert.equal(OperatorAuditMaximumEventsPerStream, 10_000);
  assert.equal(OperatorAuditMaximumStoredJsonBytesPerStream, 8_000_000);
  assert.equal(OperatorAuditMaximumCanonicalResponseBytes, 16_777_216);
});
