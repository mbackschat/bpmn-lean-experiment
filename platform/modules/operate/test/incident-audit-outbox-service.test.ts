import assert from "node:assert/strict";
import { test } from "node:test";

import { IncidentActionAuditOutboxService } from "@bpmn-lean/platform-operate";

const item = {
  ordinal: 2,
  event: {
    eventId: "incident-event-2",
    actorId: "operator",
    recordedAt: "2026-08-17T11:00:02.000Z",
    hostingProcessInstanceId: "host",
    incidentId: {
      effectId: { processInstanceId: "host", elementId: "Service", activation: 1 },
      generation: 1,
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
