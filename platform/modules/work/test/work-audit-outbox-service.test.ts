import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WorkAuditOutboxService,
} from "../dist/work-audit-outbox-service.js";

const event = {
  eventId: "event-1",
  actorId: "demo-user",
  recordedAt: "2026-08-12T10:00:00.000Z",
  hostingProcessInstanceId: "host-1",
  taskId: { processInstanceId: "task-1", elementId: "Review", activation: 1 },
  action: { kind: "claim" as const, actionId: "action-1", outcome: "claimed" as const },
};

test("retries an audit insert after a crash before Work acknowledgement", () => {
  let acknowledged = false;
  let inserts = 0;
  const repository = {
    listUndeliveredAuditEvents: () => acknowledged ? [] : [{ ordinal: 1, event }],
    acknowledgeAuditEvent: () => { acknowledged = true; },
  };
  const sink = {
    record: () => {
      inserts += 1;
      if (inserts === 1) throw new Error("crash after Work commit");
      return 1;
    },
  };
  const service = new WorkAuditOutboxService(repository, sink);

  assert.throws(() => service.reconcileAll(), /crash/u);
  assert.equal(acknowledged, false);
  service.reconcileAll();
  assert.equal(inserts, 2);
  assert.equal(acknowledged, true);
});
