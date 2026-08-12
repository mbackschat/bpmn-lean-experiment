import assert from "node:assert/strict";
import { test } from "node:test";

import { AuditEventFactory } from "@bpmn-lean/platform-audit";

test("mints one canonical wall-clock audit event from a defensive snapshot", () => {
  let ordinal = 0;
  const factory = new AuditEventFactory({
    generateId: () => `event-${++ordinal}`,
    now: () => new Date("2026-08-12T10:00:00.000Z"),
  });
  const taskId = {
    processInstanceId: "process-1",
    elementId: "Review",
    activation: 1,
  };
  const event = factory.create({
    actorId: "demo-user",
    hostingProcessInstanceId: "host-1",
    taskId,
    action: { kind: "claim", actionId: "claim-1", outcome: "claimed" },
  });

  taskId.elementId = "changed";
  assert.deepEqual(event, {
    eventId: "event-1",
    actorId: "demo-user",
    recordedAt: "2026-08-12T10:00:00.000Z",
    hostingProcessInstanceId: "host-1",
    taskId: {
      processInstanceId: "process-1",
      elementId: "Review",
      activation: 1,
    },
    action: { kind: "claim", actionId: "claim-1", outcome: "claimed" },
  });
});
