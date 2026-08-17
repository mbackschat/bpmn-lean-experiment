import assert from "node:assert/strict";
import { test } from "node:test";

import type { PostgresqlRuntime } from "@bpmn-lean/platform-postgresql-runtime";
import {
  PostgresqlWorkRepository,
  WorkAuditOutboxService,
} from "@bpmn-lean/platform-work";

const event = {
  eventId: "event-1",
  actorId: "demo-user",
  recordedAt: "2026-08-12T10:00:00.000Z",
  hostingProcessInstanceId: "host-1",
  taskId: { processInstanceId: "task-1", elementId: "Review", activation: 1 },
  action: { kind: "claim" as const, actionId: "action-1", outcome: "claimed" as const },
};

test("retries an audit insert after a crash before Work acknowledgement", async () => {
  let acknowledged = false;
  let inserts = 0;
  const received: unknown[] = [];
  const repository = {
    listUndeliveredAuditEvents: async () => acknowledged ? [] : [{ ordinal: 1, event }],
    acknowledgeAuditEvent: async () => { acknowledged = true; },
  };
  const sink = {
    record: async (item: unknown) => {
      received.push(structuredClone(item));
      inserts += 1;
      if (inserts === 1) throw new Error("crash after Work commit");
      return 1;
    },
  };
  const service = new WorkAuditOutboxService(repository, sink);

  await assert.rejects(service.reconcileAll(), /crash/u);
  assert.equal(acknowledged, false);
  await service.reconcileAll();
  assert.equal(inserts, 2);
  assert.equal(acknowledged, true);
  assert.deepEqual(received, [{ ordinal: 1, event }, { ordinal: 1, event }]);
});

test("does not acknowledge a rejected source-ordinal gap", async () => {
  let acknowledged = false;
  const item = { ordinal: 2, event };
  const service = new WorkAuditOutboxService({
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

test("delivers only the requested Work audit prefix", async () => {
  const pending = [1, 2, 3].map((ordinal) => ({
    ordinal,
    event: { ...event, eventId: `event-${ordinal}` },
  }));
  const acknowledged: string[] = [];
  const received: number[] = [];
  const service = new WorkAuditOutboxService({
    listUndeliveredAuditEvents: async (limit?: number) => pending
      .filter(({ event: pendingEvent }) => !acknowledged.includes(pendingEvent.eventId))
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
  assert.deepEqual(acknowledged, ["event-1", "event-2"]);
  assert.equal(await service.reconcileBatch(2), 1);
  assert.deepEqual(received, [1, 2, 3]);
});

test("stops a Work audit batch at its first rejected ordinal", async () => {
  const attempted: number[] = [];
  const acknowledged: string[] = [];
  const pending = [1, 2].map((ordinal) => ({
    ordinal,
    event: { ...event, eventId: `event-${ordinal}` },
  }));
  const service = new WorkAuditOutboxService({
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

test("rejects invalid Work audit batch limits before repository or sink work", async () => {
  let repositoryCalls = 0;
  let sinkCalls = 0;
  const service = new WorkAuditOutboxService({
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

test("rejects an oversized PostgreSQL Work audit limit before a query", async () => {
  let queries = 0;
  const runtime = {
    query: async () => { queries += 1; return { rows: [], rowCount: 0 }; },
  } as unknown as PostgresqlRuntime;
  const repository = new PostgresqlWorkRepository(runtime);

  await assert.rejects(repository.listUndeliveredAuditEvents(1_001), RangeError);
  assert.equal(queries, 0);
});
