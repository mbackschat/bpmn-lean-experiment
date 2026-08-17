import assert from "node:assert/strict";
import test from "node:test";

import {
  IncidentSnapshotUnavailableError,
  IncidentHttpRoutes,
} from "@bpmn-lean/platform-operate";
import type {
  IncidentMutationResult,
} from "@bpmn-lean/platform-operate";
import type {
  IncidentActionRequest,
  IncidentAuditPage,
  NormalizedIncidentAuditRequest,
  PublicIncidentSnapshot,
} from "@bpmn-lean/platform-contracts";
import {
  OperationsAuthorizationDecision,
} from "@bpmn-lean/platform-identity-policy";

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
const cancel = {
  kind: "cancelIncidentProcess",
  processInstanceId: "process-1",
  incidentId,
} as const;
const incident = {
  hostingInstance: {
    processInstanceId: "process-1",
    definition: {
      processId: "IncidentProcess",
      version: 1,
      source,
      semanticProfile: "cib-seven-2.2.0:service-task-incident-cancellation",
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
  availableInteractions: [retry, cancel],
} as const;

test("serves strict list, exact detail, and normalized audit filters after outbox reconciliation", async () => {
  const calls = counters();
  const routes = createRoutes({ calls });

  const list = await routes.handle(request("/api/v1/incidents"));
  assert.equal(list?.status, 200);
  assert.deepEqual(await list?.json(), { incidents: [incident] });

  const detail = await routes.handle(request(
    "/api/v1/incidents/process-1/ServiceTask_Fail/1/generations/1",
  ));
  assert.equal(detail?.status, 200);
  assert.deepEqual(await detail?.json(), incident);

  const missing = await routes.handle(request(
    "/api/v1/incidents/process-1/OtherTask/1/generations/1",
  ));
  assert.equal(missing?.status, 404);
  await assertError(missing, "notFound", "The current incident was not found.");

  const audit = await routes.handle(request(
    "/api/v1/incident-audit?actorId=operator-1&incidentProcessInstanceId=process-1&incidentElementId=ServiceTask_Fail&incidentActivation=1&incidentGeneration=1&limit=25",
  ));
  assert.equal(audit?.status, 200);
  assert.deepEqual(await audit?.json(), { events: [], nextCursor: null });
  assert.deepEqual(calls.auditRequests, [{
    actorId: "operator-1",
    incidentProcessInstanceId: "process-1",
    incidentElementId: "ServiceTask_Fail",
    incidentActivation: 1,
    incidentGeneration: 1,
    limit: 25,
  }]);
  assert.equal(calls.outbox, 4);
});

test("adds shared freshness only to successful projected list and detail responses", async () => {
  const routes = createRoutes({
    calls: counters(),
    freshness: { observedAfterEpochMs: 8388001, maxAgeMs: 5_000 },
  });
  const list = await routes.handle(request("/api/v1/incidents"));
  const detail = await routes.handle(request(
    "/api/v1/incidents/process-1/ServiceTask_Fail/1/generations/1",
  ));
  for (const response of [list, detail]) {
    assert.equal(response?.headers.get("Bpmn-Projection-Observed-After-Epoch-Ms"), "8388001");
    assert.equal(response?.headers.get("Bpmn-Projection-Max-Age-Ms"), "5000");
  }

  const missing = await routes.handle(request(
    "/api/v1/incidents/process-1/Missing/1/generations/1",
  ));
  assert.equal(missing?.status, 404);
  assert.equal(missing?.headers.get("Bpmn-Projection-Observed-After-Epoch-Ms"), null);

  const unavailable = await createRoutes({
    calls: counters(),
    aggregateFailure: new IncidentSnapshotUnavailableError(),
    freshness: { observedAfterEpochMs: 8388001, maxAgeMs: 5_000 },
  }).handle(request("/api/v1/incidents"));
  assert.equal(unavailable?.status, 503);
  assert.equal(unavailable?.headers.get("Bpmn-Projection-Observed-After-Epoch-Ms"), null);
});

test("maps committed, rejected, and indeterminate action results without changing content", async () => {
  const cases = [
    {
      result: {
        kind: "result",
        result: { state: "committed", actionId: "action-1", interaction: retry },
      },
      status: 200,
    },
    {
      result: {
        kind: "result",
        result: {
          state: "rejected",
          actionId: "action-1",
          interaction: retry,
          engineResult: { kind: "semantic", outcome: "rolledBack" },
        },
      },
      status: 200,
    },
    {
      result: {
        kind: "result",
        result: { state: "indeterminate", actionId: "action-1", interaction: retry },
      },
      status: 202,
    },
  ] as const;

  for (const { result, status } of cases) {
    const calls = counters();
    const routes = createRoutes({ calls, mutationResult: result });
    const response = await routes.handle(actionRequest("action-1", retry));
    assert.equal(response?.status, status);
    assert.deepEqual(await response?.json(), result.result);
    assert.deepEqual(calls.mutations, [{
      actor: { actorId: "operator-1" },
      actionId: "action-1",
      interaction: retry,
    }]);
    assert.equal(calls.outbox, 1);
  }
});

test("denies every surface before a known foreign action or any protected access", async () => {
  const calls = counters();
  const routes = createRoutes({ calls, permitted: false });
  const requests = [
    request("/api/v1/incidents"),
    request("/api/v1/incidents/process-1/ServiceTask_Fail/1/generations/1"),
    actionRequest("known-foreign-action", retry),
    request("/api/v1/incident-audit"),
  ];

  for (const denied of requests) {
    const response = await routes.handle(denied);
    assert.equal(response?.status, 403);
    await assertError(
      response,
      "forbidden",
      "The requested incident operation is forbidden.",
    );
  }
  assert.equal(calls.outbox, 0);
  assert.equal(calls.aggregations, 0);
  assert.equal(calls.mutations.length, 0);
  assert.equal(calls.auditRequests.length, 0);
});

test("suppresses list and audit access when pending audit reconciliation fails", async () => {
  const calls = counters();
  const routes = createRoutes({ calls, outboxFailure: new Error("sink unavailable") });

  for (const path of ["/api/v1/incidents", "/api/v1/incident-audit"]) {
    const response = await routes.handle(request(path));
    assert.equal(response?.status, 500);
    await assertError(
      response,
      "internalFailure",
      "The incident request could not be completed.",
    );
  }
  assert.equal(calls.outbox, 2);
  assert.equal(calls.aggregations, 0);
  assert.equal(calls.auditRequests.length, 0);
});

test("maps incomplete fresh snapshots to 503 while complete absence conflicts without reservation", async () => {
  for (const incomplete of [true, false]) {
    const calls = counters();
    let reservations = 0;
    const routes = createRoutes({
      calls,
      submit: async () => {
        if (incomplete) throw new IncidentSnapshotUnavailableError();
        const current = await Promise.resolve({ incidents: [] });
        if (current.incidents.length === 0) return { kind: "conflict" };
        reservations += 1;
        return { kind: "conflict" };
      },
    });
    const response = await routes.handle(actionRequest("unseen-action", retry));
    assert.equal(response?.status, incomplete ? 503 : 409);
    await assertError(
      response,
      incomplete ? "incidentSnapshotUnavailable" : "conflict",
      incomplete
        ? "The current incident snapshot is unavailable."
        : "The incident action conflicts with current state.",
    );
    assert.equal(reservations, 0);
  }
});

test("maps incomplete list and detail aggregates to only the canonical 503 error", async () => {
  const calls = counters();
  const routes = createRoutes({
    calls,
    aggregateFailure: new IncidentSnapshotUnavailableError(),
  });
  for (const path of [
    "/api/v1/incidents",
    "/api/v1/incidents/process-1/ServiceTask_Fail/1/generations/1",
  ]) {
    const response = await routes.handle(request(path));
    assert.equal(response?.status, 503);
    await assertError(
      response,
      "incidentSnapshotUnavailable",
      "The current incident snapshot is unavailable.",
    );
  }
});

test("rejects methods, malformed paths and queries before protected access", async () => {
  const calls = counters();
  const routes = createRoutes({ calls });

  const listMethod = await routes.handle(request("/api/v1/incidents", { method: "POST" }));
  assert.equal(listMethod?.status, 405);
  assert.equal(listMethod?.headers.get("allow"), "GET");
  const actionMethod = await routes.handle(request(
    "/api/v1/incident-actions/action-1",
    { method: "GET" },
  ));
  assert.equal(actionMethod?.status, 405);
  assert.equal(actionMethod?.headers.get("allow"), "PUT");

  for (const path of [
    "/api/v1/incidents/process-1/ServiceTask_Fail/1/generations/2",
    "/api/v1/incident-audit?actorId=one&actorId=two",
    "/api/v1/incident-audit?incidentElementId=ServiceTask_Fail",
  ]) {
    const response = await routes.handle(request(path));
    assert.equal(response?.status, 400);
    await assertError(response, "invalidRequest", "The incident request is invalid.");
  }
  assert.equal(await routes.handle(request("/api/v1/not-incidents")), null);
  assert.equal(calls.outbox, 0);
  assert.equal(calls.aggregations, 0);
  assert.equal(calls.mutations.length, 0);
  assert.equal(calls.auditRequests.length, 0);
});

test("strictly rejects GET bodies and invalid action transports before outbox or mutation", async () => {
  const calls = counters();
  const routes = createRoutes({ calls });
  const getWithType = await routes.handle(request("/api/v1/incidents", {
    headers: { "content-type": "application/json" },
  }));
  assert.equal(getWithType?.status, 400);

  const getWithBody = new Request("http://platform.test/api/v1/incident-audit", {
    method: "POST",
    body: "x",
  });
  Object.defineProperty(getWithBody, "method", { value: "GET" });
  assert.equal((await routes.handle(getWithBody))?.status, 400);

  const invalidActions = [
    actionRequest("a", retry, { "content-type": "text/plain" }),
    actionRequest("a", { ...retry, extra: true }),
    request("/api/v1/incident-actions/a", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
    request("/api/v1/incident-actions/a", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "content-length": "4097",
      },
      body: "{}",
    }),
  ];
  const statuses = [415, 400, 400, 413];
  for (const [index, invalid] of invalidActions.entries()) {
    assert.equal((await routes.handle(invalid))?.status, statuses[index]);
  }
  assert.equal(calls.outbox, 0);
  assert.equal(calls.mutations.length, 0);
  assert.equal(calls.aggregations, 0);
  assert.equal(calls.auditRequests.length, 0);
});

test("rejects duplicate nested incident-action keys before outbox or mutation", async () => {
  const calls = counters();
  const routes = createRoutes({ calls });
  const body = JSON.stringify(retry).replace(
    '"elementId":"ServiceTask_Fail"',
    '"elementId":"Other","\\u0065lementId":"ServiceTask_Fail"',
  );

  const response = await routes.handle(request("/api/v1/incident-actions/action-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  }));

  assert.equal(response?.status, 400);
  await assertError(response, "invalidRequest", "The incident request is invalid.");
  assert.equal(calls.outbox, 0);
  assert.equal(calls.mutations.length, 0);
});

type Calls = ReturnType<typeof counters>;

function counters() {
  return {
    outbox: 0,
    aggregations: 0,
    mutations: [] as unknown[],
    auditRequests: [] as NormalizedIncidentAuditRequest[],
  };
}

function createRoutes(options: Readonly<{
  calls: Calls;
  permitted?: boolean;
  outboxFailure?: Error;
  aggregateFailure?: Error;
  freshness?: Readonly<{ observedAfterEpochMs: number; maxAgeMs: number }>;
  mutationResult?: IncidentMutationResult;
  submit?: (
    actor: Readonly<{ actorId: string }>,
    actionId: string,
    interaction: IncidentActionRequest,
  ) => Promise<IncidentMutationResult>;
}>): IncidentHttpRoutes {
  const snapshot: PublicIncidentSnapshot = { incidents: [incident] };
  return new IncidentHttpRoutes({
    actors: {
      resolveActor: () => ({ id: "operator-1", groups: ["operators"] }),
    },
    authorization: {
      decide: () => options.permitted === false
        ? OperationsAuthorizationDecision.Forbidden
        : OperationsAuthorizationDecision.Permitted,
    },
    aggregation: {
      currentSnapshot: async () => {
        options.calls.aggregations += 1;
        if (options.aggregateFailure !== undefined) throw options.aggregateFailure;
        return {
          value: structuredClone(snapshot),
          freshness: options.freshness === undefined
            ? null
            : { ...options.freshness },
        };
      },
    },
    mutations: {
      submitAuthorized: async (actor, actionId, interaction) => {
        options.calls.mutations.push(structuredClone({ actor, actionId, interaction }));
        if (options.submit !== undefined) {
          return options.submit(actor, actionId, interaction);
        }
        return options.mutationResult ?? { kind: "conflict" };
      },
    },
    audit: {
      search: async (auditRequest): Promise<IncidentAuditPage> => {
        options.calls.auditRequests.push(structuredClone(auditRequest));
        return { events: [], nextCursor: null };
      },
    },
    outbox: {
      reconcileAll: async () => {
        options.calls.outbox += 1;
        if (options.outboxFailure !== undefined) throw options.outboxFailure;
      },
    },
  });
}

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://platform.test${path}`, init);
}

function actionRequest(
  actionId: string,
  interaction: unknown,
  headers: Readonly<Record<string, string>> = {
    "content-type": "application/json",
  },
): Request {
  return request(`/api/v1/incident-actions/${actionId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(interaction),
  });
}

async function assertError(
  response: Response | null,
  code: string,
  message: string,
): Promise<void> {
  assert.deepEqual(await response?.json(), { error: { code, message } });
}
