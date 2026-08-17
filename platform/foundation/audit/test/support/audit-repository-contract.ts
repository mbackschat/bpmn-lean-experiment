import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  IncidentAuditEvent,
  WorkAuditEvent,
} from "@bpmn-lean/platform-contracts";
import type {
  AuditRepository,
  IncidentAuditRepository,
  StoredAuditEvent,
  StoredIncidentAuditEvent,
} from "@bpmn-lean/platform-audit";

export type AuditRepositoryHarness = Readonly<{
  work: AuditRepository;
  incident: IncidentAuditRepository;
  publishWork: (item: StoredAuditEvent) => Promise<void>;
  publishIncident: (item: StoredIncidentAuditEvent) => Promise<void>;
  dispose: () => Promise<void>;
}>;

export function registerAuditRepositoryContract(
  name: string,
  createHarness: () => Promise<AuditRepositoryHarness>,
): void {
  test(`${name} applies exact Work audit source ordinals and rejects divergence`, async () => {
    await withHarness(createHarness, async ({ work, publishWork }) => {
      const first = workItem(1);
      await assert.rejects(work.record(workItem(2)), /conflict|unavailable/u);
      await publishWork(first);
      assert.equal(await work.record(first), 1);
      assert.equal(await work.record(first), 1);
      await assert.rejects(
        work.record(workItem(1, { actorId: "changed" })),
        /conflict/u,
      );
      const collision = workItem(2, {
        eventId: "work-event-collision",
        action: first.event.action,
      });
      await assert.rejects(async () => {
        await publishWork(collision);
        await work.record(collision);
      }, /conflict|duplicate|unique/u);
    });
  });

  test(`${name} applies exact incident audit source ordinals and rejects divergence`, async () => {
    await withHarness(createHarness, async ({ incident, publishIncident }) => {
      const first = incidentItem(1);
      await assert.rejects(incident.record(incidentItem(2)), /conflict|unavailable/u);
      await publishIncident(first);
      assert.equal(await incident.record(first), 1);
      assert.equal(await incident.record(first), 1);
      await assert.rejects(
        incident.record(incidentItem(1, { actorId: "changed" })),
        /conflict/u,
      );
      const collision = incidentItem(2, {
        eventId: "incident-event-collision",
        actionId: first.event.actionId,
        outcome: first.event.outcome,
      });
      await assert.rejects(async () => {
        await publishIncident(collision);
        await incident.record(collision);
      }, /conflict|duplicate|unique/u);
    });
  });

  test(`${name} preserves numeric Work ordering, filters, paging, snapshots, and NUL`, async () => {
    await withHarness(createHarness, async ({ work, publishWork }) => {
      for (let ordinal = 1; ordinal <= 12; ordinal += 1) {
        const item = workItem(ordinal, ordinal === 11 ? {
          actorId: "actor\0eleven",
          hostingProcessInstanceId: "host\0eleven",
          taskId: {
            processInstanceId: "task\0eleven",
            elementId: "Review\0eleven",
            activation: 11,
          },
        } : {});
        await publishWork(item);
        await work.record(item);
      }
      assert.deepEqual(
        (await work.search({ actorId: "actor", limit: 20 })).map(({ ordinal }) => ordinal),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
      );
      assert.deepEqual(
        (await work.search({ actorId: "actor", afterOrdinal: 9, limit: 2 }))
          .map(({ ordinal }) => ordinal),
        [10, 12],
      );
      assert.deepEqual(
        (await work.search({
          actorId: "actor\0eleven",
          taskProcessInstanceId: "task\0eleven",
          hostingProcessInstanceId: "host\0eleven",
          actionKind: "claim",
          limit: 2,
        })).map(({ ordinal }) => ordinal),
        [11],
      );
      const snapshot = await work.snapshotHostingProcessInstance("host", {
        maxEvents: 20,
        maxStoredBytes: 100_000,
      });
      assert.deepEqual(
        snapshot.events.map(({ eventId }) => eventId),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((n) => `work-event-${n}`),
      );
      assert.equal(snapshot.headEventId, "work-event-12");
    });
  });

  test(`${name} preserves numeric incident ordering, filters, paging, snapshots, and NUL`, async () => {
    await withHarness(createHarness, async ({ incident, publishIncident }) => {
      for (let ordinal = 1; ordinal <= 12; ordinal += 1) {
        const item = incidentItem(ordinal, ordinal === 11 ? {
          actorId: "operator\0eleven",
          hostingProcessInstanceId: "host\0eleven",
          incidentId: {
            effectId: {
              processInstanceId: "host\0eleven",
              elementId: "Service\0eleven",
              activation: 11,
            },
            generation: 1,
          },
        } : {});
        await publishIncident(item);
        await incident.record(item);
      }
      assert.deepEqual(
        (await incident.search({ afterOrdinal: 8, limit: 4 })).map(({ ordinal }) => ordinal),
        [9, 10, 11, 12],
      );
      assert.deepEqual(
        (await incident.search({
          actorId: "operator\0eleven",
          hostingProcessInstanceId: "host\0eleven",
          incidentId: {
            effectId: {
              processInstanceId: "host\0eleven",
              elementId: "Service\0eleven",
              activation: 11,
            },
            generation: 1,
          },
          actionKind: "retryIncident",
          limit: 2,
        })).map(({ ordinal }) => ordinal),
        [11],
      );
      const snapshot = await incident.snapshotHostingProcessInstance("host", {
        maxEvents: 20,
        maxStoredBytes: 100_000,
      });
      assert.deepEqual(
        snapshot.events.map(({ eventId }) => eventId),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]
          .map((n) => `incident-event-${n}`),
      );
      assert.equal(snapshot.headEventId, "incident-event-12");
    });
  });
}

export function workItem(
  ordinal: number,
  overrides: Partial<WorkAuditEvent> = {},
): StoredAuditEvent {
  const event: WorkAuditEvent = {
    eventId: `work-event-${ordinal}`,
    actorId: "actor",
    recordedAt: `2026-08-17T10:00:${String(ordinal).padStart(2, "0")}.000Z`,
    hostingProcessInstanceId: "host",
    taskId: {
      processInstanceId: `task-${ordinal}`,
      elementId: "Review",
      activation: ordinal,
    },
    action: {
      kind: "claim",
      actionId: `work-action-${ordinal}`,
      outcome: "claimed",
    },
    ...overrides,
  };
  return { ordinal, event };
}

export function incidentItem(
  ordinal: number,
  overrides: Partial<IncidentAuditEvent> = {},
): StoredIncidentAuditEvent {
  const event: IncidentAuditEvent = {
    eventId: `incident-event-${ordinal}`,
    actorId: "operator",
    recordedAt: `2026-08-17T11:00:${String(ordinal).padStart(2, "0")}.000Z`,
    hostingProcessInstanceId: "host",
    incidentId: {
      effectId: {
        processInstanceId: "host",
        elementId: "Service",
        activation: ordinal,
      },
      generation: 1,
    },
    actionId: `incident-action-${ordinal}`,
    actionKind: "retryIncident",
    outcome: "reserved",
    ...overrides,
  };
  return { ordinal, event };
}

async function withHarness(
  createHarness: () => Promise<AuditRepositoryHarness>,
  run: (harness: AuditRepositoryHarness) => Promise<void>,
): Promise<void> {
  const harness = await createHarness();
  try {
    await run(harness);
  } finally {
    await harness.dispose();
  }
}
