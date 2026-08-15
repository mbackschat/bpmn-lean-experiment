import assert from "node:assert/strict";
import test from "node:test";

import {
  serializeOperatorAuditExport,
} from "@bpmn-lean/platform-contracts";
import type {
  OperatorAuditExport,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import {
  OperatorAuditApiClient,
  OperatorAuditProtocolError,
  OperatorAuditUnavailableError,
} from "../src/operator-audit-api.ts";

const instance = {
  processInstanceId: "Instance_%2F",
  definition: {
    processId: "Process_Audit",
    version: 2,
    source: {
      kind: "bpmnSource",
      id: "audit.bpmn",
      sha256: "a".repeat(64),
      byteLength: 512,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "profile-audit",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  },
} as const satisfies PublicProcessInstanceIdentity;

const exportValue = {
  format: "bpmn-lean.operator-audit.v1",
  instance,
  work: {
    headEventId: "work-1",
    events: [{
      eventId: "work-1",
      actorId: "reviewer",
      recordedAt: "2026-08-15T10:05:00.000Z",
      hostingProcessInstanceId: instance.processInstanceId,
      taskId: {
        processInstanceId: instance.processInstanceId,
        elementId: "Task_Review",
        activation: 1,
      },
      action: { kind: "claim", actionId: "claim-1", outcome: "claimed" },
    }],
  },
  incidentActions: { headEventId: null, events: [] },
} as const satisfies OperatorAuditExport;

test("uses one bodyless canonical route request and retains the exact verified bytes", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const bytes = serializeOperatorAuditExport(exportValue, instance);
  const api = new OperatorAuditApiClient("https://platform.test/ignored", async (input, init) => {
    requests.push({ url: String(input), ...(init === undefined ? {} : { init }) });
    return attachment(bytes);
  });

  const result = await api.get(instance);

  assert.deepEqual(requests, [{
    url: "https://platform.test/api/v1/process-instances/Instance_%252F/operator-audit/export",
    init: { headers: { accept: "application/json" } },
  }]);
  assert.deepEqual(result.value, exportValue);
  assert.deepEqual(result.bytes, bytes);
  assert.notEqual(result.bytes.buffer, bytes.buffer);
  assert.equal(result.filename, "operator-audit-Instance__2F.json");
});

test("rejects identity substitution, noncanonical bytes, media type, and filename independently", async () => {
  const bytes = serializeOperatorAuditExport(exportValue, instance);
  const other = structuredClone(exportValue) as any;
  other.instance.processInstanceId = "other";
  other.work.events[0].hostingProcessInstanceId = "other";
  const cases = [
    attachment(serializeOperatorAuditExport(other, other.instance)),
    attachment(new TextEncoder().encode(`${new TextDecoder().decode(bytes)}\n`)),
    new Response(body(bytes), {
      headers: {
        "content-type": "text/plain",
        "content-disposition": 'attachment; filename="operator-audit-Instance__2F.json"',
      },
    }),
    new Response(body(bytes), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="operator-audit-other.json"',
      },
    }),
  ];
  for (const response of cases) {
    const api = new OperatorAuditApiClient("https://platform.test", async () => response.clone());
    await assert.rejects(api.get(instance), OperatorAuditProtocolError);
  }
});

test("maps the exact fail-closed public unavailability without returning either stream", async () => {
  const api = new OperatorAuditApiClient("https://platform.test", async () => new Response(JSON.stringify({
    error: {
      code: "operatorAuditUnavailable",
      message: "The complete operator audit is unavailable.",
    },
  }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8" },
  }));

  await assert.rejects(api.get(instance), OperatorAuditUnavailableError);
});

test("invalidating a request prevents its delayed response from becoming current", async () => {
  const delayed = Promise.withResolvers<Response>();
  const api = new OperatorAuditApiClient("https://platform.test", async () => delayed.promise);
  const abandoned = api.get(instance);
  api.invalidate();
  delayed.resolve(attachment(serializeOperatorAuditExport(exportValue, instance)));

  await assert.rejects(abandoned, OperatorAuditUnavailableError);
});

function attachment(bytes: Uint8Array): Response {
  return new Response(body(bytes), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="operator-audit-Instance__2F.json"',
    },
  });
}

function body(bytes: Uint8Array): ArrayBuffer {
  const owned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(owned).set(bytes);
  return owned;
}
