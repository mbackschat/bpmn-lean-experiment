import assert from "node:assert/strict";
import test from "node:test";

import {
  IncidentOperationsApiClient,
  IncidentOperationsProtocolError,
} from "../src/incident-operations-api.ts";

const source = {
  kind: "bpmnSource",
  id: "incident.bpmn",
  sha256: "a".repeat(64),
  byteLength: 512,
  declaredEncoding: "UTF-8",
  decodedAs: "UTF-8",
} as const;
const occurrence = {
  processInstanceId: "process-1",
  elementId: "ServiceTask_Fail",
  activation: 1,
} as const;
const incidentId = { effectId: occurrence, generation: 1 } as const;
const retry = { kind: "retryIncident", incidentId } as const;
const incident = {
  hostingInstance: {
    processInstanceId: "process-1",
    definition: {
      processId: "IncidentProcess",
      version: 1,
      source,
      semanticProfile: "cib-seven-2.2.0:service-task-incident-cancellation",
      sourceOverlay: null,
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  },
  incident: {
    kind: "effectExecutionFailed",
    id: incidentId,
    effect: {
      id: occurrence,
      descriptor: { protocol: "cibDelegate", operation: "fail" },
      arguments: [],
    },
  },
  availableInteractions: [retry],
} as const;

test("uses exact public routes and accepts only route-specific success statuses", async () => {
  const requests: Array<Readonly<{ method: string; path: string; body: string | null }>> = [];
  const bodies = [
    { incidents: [incident] },
    incident,
    { state: "indeterminate", actionId: "action-1", interaction: retry },
    { events: [], nextCursor: null },
  ];
  const statuses = [200, 200, 202, 200];
  const client = new IncidentOperationsApiClient("https://platform.example", async (input, init) => {
    const url = new URL(String(input));
    requests.push({
      method: init?.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return json(bodies.shift(), statuses.shift());
  });

  await client.listIncidents();
  await client.getIncident(incidentId);
  await client.submitAction("action-1", retry);
  await client.readAudit({ actorId: "operator-1", limit: 25 });

  assert.deepEqual(requests, [{
    method: "GET",
    path: "/api/v1/incidents",
    body: null,
  }, {
    method: "GET",
    path: "/api/v1/incidents/process-1/ServiceTask_Fail/1/generations/1",
    body: null,
  }, {
    method: "PUT",
    path: "/api/v1/incident-actions/action-1",
    body: JSON.stringify(retry),
  }, {
    method: "GET",
    path: "/api/v1/incident-audit?actorId=operator-1&limit=25",
    body: null,
  }]);
});

test("rejects private and nested identity drift", async () => {
  const client = clientReturning(200, {
    incidents: [{ ...incident, locator: { kind: "private" } }],
  });
  await assert.rejects(client.listIncidents(), IncidentOperationsProtocolError);

  const drifted = {
    ...incident,
    incident: {
      ...incident.incident,
      effect: {
        ...incident.incident.effect,
        id: { ...occurrence, elementId: "Other" },
      },
    },
  };
  await assert.rejects(clientReturning(200, drifted).getIncident(incidentId),
    IncidentOperationsProtocolError);
});

test("rejects escaped-equivalent duplicate keys in a nested public response", async () => {
  const body = JSON.stringify({ incidents: [incident] }).replace(
    '"elementId":"ServiceTask_Fail"',
    '"elementId":"Other","\\u0065lementId":"ServiceTask_Fail"',
  );
  const client = new IncidentOperationsApiClient(
    "https://platform.example",
    async () => new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  await assert.rejects(client.listIncidents(), IncidentOperationsProtocolError);
});

test("rejects wrong route-specific error codes and status/result disagreements", async () => {
  await assert.rejects(
    clientReturning(503, {
      error: { code: "forbidden", message: "Forbidden." },
    }).listIncidents(),
    IncidentOperationsProtocolError,
  );
  await assert.rejects(
    clientReturning(404, {
      error: { code: "notFound", message: "Not found." },
    }).readAudit(),
    IncidentOperationsProtocolError,
  );
  await assert.rejects(
    clientReturning(202, {
      state: "committed",
      actionId: "action-1",
      interaction: retry,
    }).submitAction("action-1", retry),
    IncidentOperationsProtocolError,
  );
});

test("reads an incident of a later failure generation by its exact route", async () => {
  const laterId = { effectId: occurrence, generation: 3 } as const;
  const laterRetry = { kind: "retryIncident", incidentId: laterId } as const;
  const later = {
    ...incident,
    incident: { ...incident.incident, id: laterId },
    availableInteractions: [laterRetry],
  } as const;
  const paths: string[] = [];
  const client = new IncidentOperationsApiClient("https://platform.example", async (input) => {
    paths.push(new URL(String(input)).pathname);
    return json(later);
  });

  assert.deepEqual(await client.getIncident(laterId), later);
  assert.deepEqual(paths, ["/api/v1/incidents/process-1/ServiceTask_Fail/1/generations/3"]);
});

function clientReturning(status: number, body: unknown): IncidentOperationsApiClient {
  return new IncidentOperationsApiClient("https://platform.example", async () =>
    json(body, status));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
