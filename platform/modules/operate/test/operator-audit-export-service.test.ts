import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeCanonicalOperatorAuditExport,
  OperatorAuditMaximumEventsPerStream,
  OperatorAuditMaximumStoredJsonBytesPerStream,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentAuditEvent,
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
