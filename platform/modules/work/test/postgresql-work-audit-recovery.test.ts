import assert from "node:assert/strict";
import { test } from "node:test";

import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

import { PostgresqlWorkAuditRecoveryStep } from "@bpmn-lean/platform-work";

const first = {
  ordinal: 1,
  event: {
    eventId: "work-event\u00001",
    actorId: "operator",
    recordedAt: "2026-08-17T12:00:01.000Z",
    hostingProcessInstanceId: "host",
    taskId: { processInstanceId: "task-1", elementId: "Review", activation: 1 },
    action: { kind: "claim" as const, actionId: "action-1", outcome: "claimed" as const },
  },
};

test("prepares a detached Work audit prefix with zero sink or acknowledgement writes", async () => {
  const pending = [first, {
    ordinal: 2,
    event: { ...first.event, eventId: "work-event-2", action: { ...first.event.action, actionId: "action-2" } },
  }, {
    ordinal: 3,
    event: { ...first.event, eventId: "work-event-3", action: { ...first.event.action, actionId: "action-3" } },
  }];
  const applied: string[] = [];
  const step = await new PostgresqlWorkAuditRecoveryStep({
    source: {
      listUndeliveredAuditEvents: async (limit) => pending.slice(0, limit),
      applyAuditAcknowledgement: async (_session, item) => {
        applied.push(`ack:${item.event.eventId}`);
      },
    },
    sink: {
      applyAuditRecord: async (_session, item) => {
        applied.push(`sink:${item.event.eventId}`);
        return item.ordinal;
      },
    },
  }).prepare(streamKey, 2);

  assert.deepEqual(applied, []);
  pending[0]!.event.eventId = "mutated-after-prepare";
  await step.apply(unusedSession);
  assert.deepEqual(applied, [
    "sink:work-event\u00001",
    "ack:work-event\u00001",
    "sink:work-event-2",
    "ack:work-event-2",
  ]);
});

test("simulated lease loss leaves the prepared Work audit prefix untouched", async () => {
  let writes = 0;
  await new PostgresqlWorkAuditRecoveryStep({
    source: {
      listUndeliveredAuditEvents: async () => [first],
      applyAuditAcknowledgement: async () => { writes += 1; },
    },
    sink: {
      applyAuditRecord: async (_session, item) => {
        writes += 1;
        return item.ordinal;
      },
    },
  }).prepare(streamKey, 1);

  assert.equal(writes, 0);
});

test("rejects a noncanonical Work audit key before source or sink work", async () => {
  let calls = 0;
  const recovery = new PostgresqlWorkAuditRecoveryStep({
    source: {
      listUndeliveredAuditEvents: async () => {
        calls += 1;
        return [];
      },
      applyAuditAcknowledgement: async () => { calls += 1; },
    },
    sink: {
      applyAuditRecord: async () => {
        calls += 1;
        return 1;
      },
    },
  });
  await assert.rejects(
    recovery.prepare(Uint8Array.of(0xc0, 0xaf), 1),
    /exact UTF-8 stream/u,
  );
  assert.equal(calls, 0);
});

test("does not acknowledge when the Work audit sink returns another ordinal", async () => {
  let acknowledgements = 0;
  const prepared = await new PostgresqlWorkAuditRecoveryStep({
    source: {
      listUndeliveredAuditEvents: async () => [first],
      applyAuditAcknowledgement: async () => { acknowledgements += 1; },
    },
    sink: {
      applyAuditRecord: async (_session, item) => item.ordinal + 1,
    },
  }).prepare(streamKey, 1);

  await assert.rejects(prepared.apply(unusedSession), /different source ordinal/u);
  assert.equal(acknowledgements, 0);
});

const streamKey = new TextEncoder().encode("stream");

const unusedSession = {
  query: async () => assert.fail("the fake recovery ports own their test mutations"),
} as PostgresqlSession;
