import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
