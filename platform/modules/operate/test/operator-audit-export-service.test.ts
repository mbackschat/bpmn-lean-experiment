import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeCanonicalOperatorAuditExport,
  OperatorAuditMaximumEventsPerStream,
  OperatorAuditMaximumStoredJsonBytesPerStream,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentAuditEvent,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import {
  OperatorAuditExportService,
} from "@bpmn-lean/platform-operate";

import {
  operatorAuditIncidentEvent,
  operatorAuditInstance,
  operatorAuditWorkEvent,
} from "./operator-audit-export-fixture.ts";

test("reconciles and snapshots both audit streams in the fixed source-local sequence", () => {
  const calls: string[] = [];
  const service = new OperatorAuditExportService({
    workOutbox: { reconcileAll: () => { calls.push("work-reconcile"); } },
    incidentOutbox: { reconcileAll: () => { calls.push("incident-reconcile"); } },
    workAudit: {
      snapshotHostingProcessInstance: (processInstanceId, limits) => {
        calls.push(`work-snapshot:${processInstanceId}`);
        assert.deepEqual(limits, {
          maxEvents: OperatorAuditMaximumEventsPerStream,
          maxStoredBytes: OperatorAuditMaximumStoredJsonBytesPerStream,
        });
        return { headEventId: "work-1", events: [operatorAuditWorkEvent] };
      },
    },
    incidentAudit: {
      snapshotHostingProcessInstance: (processInstanceId, limits) => {
        calls.push(`incident-snapshot:${processInstanceId}`);
        assert.deepEqual(limits, {
          maxEvents: OperatorAuditMaximumEventsPerStream,
          maxStoredBytes: OperatorAuditMaximumStoredJsonBytesPerStream,
        });
        return { headEventId: "incident-1", events: [operatorAuditIncidentEvent] };
      },
    },
  });

  const bytes = service.create(operatorAuditInstance);
  assert.deepEqual(
    decodeCanonicalOperatorAuditExport(bytes, operatorAuditInstance),
    {
      format: "bpmn-lean.operator-audit.v1",
      instance: operatorAuditInstance,
      work: { headEventId: "work-1", events: [operatorAuditWorkEvent] },
      incidentActions: {
        headEventId: "incident-1",
        events: [operatorAuditIncidentEvent],
      },
    },
  );
  assert.deepEqual(calls, [
    "work-reconcile",
    "incident-reconcile",
    "work-snapshot:Instance/1",
    "incident-snapshot:Instance/1",
  ]);
});

test("stops before later audit work when an earlier completeness step fails", () => {
  const stages = [
    ["work-reconcile"],
    ["work-reconcile", "incident-reconcile"],
    ["work-reconcile", "incident-reconcile", "work-snapshot"],
    [
      "work-reconcile",
      "incident-reconcile",
      "work-snapshot",
      "incident-snapshot",
    ],
  ] as const;
  for (const expectedCalls of stages) {
    const calls: string[] = [];
    const failingStage = expectedCalls.at(-1)!;
    const step = (stage: string) => {
      calls.push(stage);
      if (stage === failingStage) throw new Error(`${stage} unavailable`);
    };
    const service = new OperatorAuditExportService({
      workOutbox: { reconcileAll: () => { step("work-reconcile"); } },
      incidentOutbox: { reconcileAll: () => { step("incident-reconcile"); } },
      workAudit: {
        snapshotHostingProcessInstance: () => {
          step("work-snapshot");
          return { headEventId: null, events: [] };
        },
      },
      incidentAudit: {
        snapshotHostingProcessInstance: () => {
          step("incident-snapshot");
          return { headEventId: null, events: [] };
        },
      },
    });
    assert.throws(() => service.create(operatorAuditInstance), /unavailable/u);
    assert.deepEqual(calls, expectedCalls);
  }
});

test("keeps the two snapshots independent when incident audit advances after Work capture", () => {
  const laterIncident = {
    ...operatorAuditIncidentEvent,
    eventId: "incident-2",
    actionId: "incident-action-2",
    recordedAt: "2026-08-15T11:59:59.000Z",
  } as const;
  let incidentEvents: readonly IncidentAuditEvent[] = [operatorAuditIncidentEvent];
  const service = new OperatorAuditExportService({
    workOutbox: { reconcileAll() {} },
    incidentOutbox: { reconcileAll() {} },
    workAudit: {
      snapshotHostingProcessInstance: () => {
        incidentEvents = [operatorAuditIncidentEvent, laterIncident];
        return { headEventId: "work-1", events: [operatorAuditWorkEvent] };
      },
    },
    incidentAudit: {
      snapshotHostingProcessInstance: () => ({
        headEventId: incidentEvents.at(-1)!.eventId,
        events: incidentEvents,
      }),
    },
  });

  const value = decodeCanonicalOperatorAuditExport(
    service.create(operatorAuditInstance),
    operatorAuditInstance,
  );
  assert.deepEqual(value.work.events, [operatorAuditWorkEvent]);
  assert.equal(value.work.headEventId, "work-1");
  assert.deepEqual(value.incidentActions.events, [
    operatorAuditIncidentEvent,
    laterIncident,
  ]);
  assert.equal(value.incidentActions.headEventId, "incident-2");
});

test("assembles Work-only and incident-only selected populations from foreign-host repositories", () => {
  const foreignWork = {
    ...operatorAuditWorkEvent,
    eventId: "foreign-work",
    hostingProcessInstanceId: "Foreign/1",
  } as const;
  const foreignIncident = {
    ...operatorAuditIncidentEvent,
    eventId: "foreign-incident",
    actionId: "foreign-action",
    hostingProcessInstanceId: "Foreign/1",
  } as const;
  const cases = [{
    label: "Work-only",
    work: [operatorAuditWorkEvent, foreignWork],
    incidents: [foreignIncident],
    expectedWork: [operatorAuditWorkEvent],
    expectedIncidents: [],
  }, {
    label: "incident-only",
    work: [foreignWork],
    incidents: [operatorAuditIncidentEvent, foreignIncident],
    expectedWork: [],
    expectedIncidents: [operatorAuditIncidentEvent],
  }] as const;

  for (const fixture of cases) {
    const service = filteredService(fixture.work, fixture.incidents);
    const value = decodeCanonicalOperatorAuditExport(
      service.create(operatorAuditInstance),
      operatorAuditInstance,
    );
    assert.deepEqual(value.work.events, fixture.expectedWork, fixture.label);
    assert.deepEqual(value.incidentActions.events, fixture.expectedIncidents, fixture.label);
  }
});

test("refuses every private host-field class supplied by a snapshot", () => {
  const privateFields = [
    "locator",
    "workflowId",
    "runId",
    "taskQueue",
    "eventHistory",
    "workflowTask",
    "activityAttempt",
    "temporalRetry",
    "transportPayload",
    "privateOrdinal",
    "databasePath",
    "cursor",
  ] as const;

  for (const privateField of privateFields) {
    const polluted = {
      ...operatorAuditWorkEvent,
      nestedPrivateHostFact: { [privateField]: `private-${privateField}` },
    } as unknown as WorkAuditEvent;
    const service = filteredService([polluted], []);
    assert.throws(() => service.create(operatorAuditInstance), TypeError, privateField);
  }
});

function filteredService(
  workRows: readonly WorkAuditEvent[],
  incidentRows: readonly IncidentAuditEvent[],
): OperatorAuditExportService {
  return new OperatorAuditExportService({
    workOutbox: { reconcileAll() {} },
    incidentOutbox: { reconcileAll() {} },
    workAudit: {
      snapshotHostingProcessInstance: (hostingProcessInstanceId) => {
        const events = workRows.filter((event) =>
          event.hostingProcessInstanceId === hostingProcessInstanceId
        );
        return { headEventId: events.at(-1)?.eventId ?? null, events };
      },
    },
    incidentAudit: {
      snapshotHostingProcessInstance: (hostingProcessInstanceId) => {
        const events = incidentRows.filter((event) =>
          event.hostingProcessInstanceId === hostingProcessInstanceId
        );
        return { headEventId: events.at(-1)?.eventId ?? null, events };
      },
    },
  });
}
