import assert from "node:assert/strict";
import { test } from "node:test";

import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import {
  IncidentActionAuditOutboxService,
  PostgresqlIncidentActionRepository,
} from "@bpmn-lean/platform-operate";

const item = {
  ordinal: 2,
  event: {
    eventId: "incident-event-2",
    actorId: "operator",
    recordedAt: "2026-08-17T11:00:02.000Z",
    hostingProcessInstanceId: "host",
    incidentId: {
      effectId: { processInstanceId: "host", elementId: "Service", activation: 1 },
      generation: 1 as const,
    },
    actionId: "incident-action-2",
    actionKind: "retryIncident" as const,
    outcome: "reserved" as const,
  },
};

test("passes the exact incident source item and does not acknowledge a gap", async () => {
  let acknowledged = false;
  const service = new IncidentActionAuditOutboxService({
    listUndeliveredAuditEvents: async () => [item],
    acknowledgeAuditEvent: async () => { acknowledged = true; },
  }, {
    record: async (received) => {
      assert.deepEqual(received, item);
      throw new Error("source ordinal gap");
    },
  });
  await assert.rejects(service.reconcileAll(), /source ordinal gap/u);
  assert.equal(acknowledged, false);
});

test("delivers only the requested incident audit prefix", async () => {
  const pending = [1, 2, 3].map((ordinal) => ({
    ordinal,
    event: { ...item.event, eventId: `incident-event-${ordinal}` },
  }));
  const acknowledged: string[] = [];
  const received: number[] = [];
  const service = new IncidentActionAuditOutboxService({
    listUndeliveredAuditEvents: async (limit?: number) => pending
      .filter(({ event }) => !acknowledged.includes(event.eventId))
      .slice(0, limit),
    acknowledgeAuditEvent: async (eventId) => { acknowledged.push(eventId); },
  }, {
    record: async (receivedItem) => {
      received.push(receivedItem.ordinal);
      return receivedItem.ordinal;
    },
  });

  assert.equal(await service.reconcileBatch(2), 2);
  assert.deepEqual(received, [1, 2]);
  assert.deepEqual(acknowledged, ["incident-event-1", "incident-event-2"]);
  assert.equal(await service.reconcileBatch(2), 1);
  assert.deepEqual(received, [1, 2, 3]);
});

test("stops an incident audit batch at its first rejected ordinal", async () => {
  const attempted: number[] = [];
  const acknowledged: string[] = [];
  const pending = [1, 2].map((ordinal) => ({
    ordinal,
    event: { ...item.event, eventId: `incident-event-${ordinal}` },
  }));
  const service = new IncidentActionAuditOutboxService({
    listUndeliveredAuditEvents: async () => pending,
    acknowledgeAuditEvent: async (eventId) => { acknowledged.push(eventId); },
  }, {
    record: async (receivedItem) => {
      attempted.push(receivedItem.ordinal);
      throw new Error("sink unavailable");
    },
  });

  await assert.rejects(service.reconcileBatch(2), /sink unavailable/u);
  assert.deepEqual(attempted, [1]);
  assert.deepEqual(acknowledged, []);
});

test("rejects invalid incident audit batch limits before repository or sink work", async () => {
  let repositoryCalls = 0;
  let sinkCalls = 0;
  const service = new IncidentActionAuditOutboxService({
    listUndeliveredAuditEvents: async () => { repositoryCalls += 1; return []; },
    acknowledgeAuditEvent: async () => undefined,
  }, {
    record: async () => { sinkCalls += 1; return 1; },
  });

  for (const limit of [0, -1, 1.5, 1_001, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.reconcileBatch(limit), RangeError);
  }
  assert.equal(repositoryCalls, 0);
  assert.equal(sinkCalls, 0);
});

test("rejects an oversized PostgreSQL incident audit limit before a query", async () => {
  let queries = 0;
  const runtime = {
    query: async () => { queries += 1; return { rows: [], rowCount: 0 }; },
  } as unknown as PostgresqlRuntime;
  const repository = new PostgresqlIncidentActionRepository(runtime);

  await assert.rejects(repository.listUndeliveredAuditEvents(1_001), RangeError);
  assert.equal(queries, 0);
});
