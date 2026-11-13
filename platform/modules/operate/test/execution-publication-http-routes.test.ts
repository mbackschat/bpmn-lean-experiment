import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionPublicationHttpRoutes,
  ExecutionPublicationReconciliationKind,
} from "@bpmn-lean/platform-operate";
import {
  ExecutionPublicationUnavailableMessage,
  executionPublicationExportFormat,
  serializeExecutionPublicationExport,
} from "@bpmn-lean/platform-contracts";
import type {
  ExecutionPublicationExport,
  InternalFailureReporter,
} from "@bpmn-lean/platform-contracts";
import {
  OperationsAuthorizationDecision,
  OperationsAuthorizationSurface,
} from "@bpmn-lean/platform-identity-policy";

import { firstPage } from "./execution-publication-fixture.ts";
import {
  recordingInternalFailures,
  unexpectedInternalFailure,
} from "@bpmn-lean/platform-contracts/testing";
import { PostgresqlProjectionReadKind } from "@bpmn-lean/platform-operate";

test("serves the exact projected page and canonical export bytes", async () => {
  const calls = counters();
  const routes = createRoutes({ calls });
  const pageResponse = await routes.handle(request(
    "/api/v1/process-instances/Instance_1/execution?afterRevision=0&limit=1",
  ));
  assert.equal(pageResponse?.status, 200);
  assert.equal(pageResponse?.headers.get("Bpmn-Projection-Observed-After-Epoch-Ms"), null);
  assert.deepEqual(await pageResponse?.json(), firstPage());

  const exportResponse = await routes.handle(request(
    "/api/v1/process-instances/Instance_1/execution/export",
  ));
  assert.equal(exportResponse?.status, 200);
  assert.equal(exportResponse?.headers.get("Bpmn-Projection-Observed-After-Epoch-Ms"), null);
  assert.equal(
    exportResponse?.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  assert.equal(
    exportResponse?.headers.get("content-disposition"),
    'attachment; filename="execution-Instance_1.json"',
  );
  assert.deepEqual(
    new Uint8Array(await exportResponse!.arrayBuffer()),
    serializeExecutionPublicationExport(publicationExport(), {
      definition: firstPage().definition,
      processInstanceId: "Instance_1",
    }),
  );
  assert.deepEqual(calls.surfaces, [
    OperationsAuthorizationSurface.ExecutionHistory,
    OperationsAuthorizationSurface.ExecutionDiagram,
    OperationsAuthorizationSurface.ExecutionExport,
  ]);
  assert.deepEqual(calls.reconciliations, ["Instance_1", "Instance_1"]);
});

test("shared projected reads add freshness only to successful page and export responses", async () => {
  let projectedCalls = 0;
  const freshness = { observedAfterEpochMs: 8_388_001, maxAgeMs: 5_000 };
  const routes = new ExecutionPublicationHttpRoutes({
    actors: { resolveActor: () => ({ id: "operator-1", groups: ["operators"] }) },
    authorization: { decide: () => OperationsAuthorizationDecision.Permitted },
    projectedReads: {
      page: async () => {
        projectedCalls += 1;
        return {
          kind: PostgresqlProjectionReadKind.Available,
          read: { value: firstPage(), freshness },
        };
      },
      export: async () => {
        projectedCalls += 1;
        return {
          kind: PostgresqlProjectionReadKind.Available,
          read: { value: publicationExport(), freshness },
        };
      },
    },
    reportInternalFailure: unexpectedInternalFailure,
  });
  for (const path of [
    "/api/v1/process-instances/Instance_1/execution?afterRevision=0&limit=1",
    "/api/v1/process-instances/Instance_1/execution/export",
  ]) {
    const response = await routes.handle(request(path));
    assert.equal(response?.status, 200);
    assert.equal(response?.headers.get("Bpmn-Projection-Observed-After-Epoch-Ms"), "8388001");
    assert.equal(response?.headers.get("Bpmn-Projection-Max-Age-Ms"), "5000");
  }
  assert.equal(projectedCalls, 2);

  const unavailable = new ExecutionPublicationHttpRoutes({
    actors: { resolveActor: () => ({ id: "operator-1", groups: ["operators"] }) },
    authorization: { decide: () => OperationsAuthorizationDecision.Permitted },
    projectedReads: {
      page: async () => ({ kind: PostgresqlProjectionReadKind.Unavailable }),
      export: async () => ({ kind: PostgresqlProjectionReadKind.NotFound }),
    },
    reportInternalFailure: unexpectedInternalFailure,
  });
  const unavailableResponse = await unavailable.handle(request(
    "/api/v1/process-instances/Instance_1/execution?afterRevision=0",
  ));
  const missingResponse = await unavailable.handle(request(
    "/api/v1/process-instances/Instance_1/execution/export",
  ));
  assert.equal(unavailableResponse?.status, 503);
  assert.equal(missingResponse?.status, 404);
  for (const response of [unavailableResponse, missingResponse]) {
    assert.equal(response?.headers.get("Bpmn-Projection-Observed-After-Epoch-Ms"), null);
    assert.equal(response?.headers.get("Bpmn-Projection-Max-Age-Ms"), null);
  }
});

test("reports the caught error, route, method and pathname without the query for each unexpected failure", async () => {
  const failure = new Error("private store failure");
  const page = "/api/v1/process-instances/Instance_1/execution";
  const cases = [
    { path: `${page}?afterRevision=0&limit=1`, expected: page, options: { reconciliationFailure: failure } },
    { path: `${page}/export`, expected: `${page}/export`, options: { reconciliationFailure: failure } },
    { path: `${page}?afterRevision=0`, expected: page, options: { actorFailure: failure } },
  ] as const;

  for (const { path, expected, options } of cases) {
    const recorded = recordingInternalFailures();
    const routes = createRoutes({
      calls: counters(),
      reportInternalFailure: recorded.reporter,
      ...options,
    });

    const response = await routes.handle(request(path));

    assert.equal(response?.status, 500);
    await assertError(
      response,
      "internalFailure",
      "The execution publication request could not be completed.",
    );
    assert.deepEqual(recorded.reports, [{
      route: "ExecutionPublicationHttpRoutes",
      method: "GET",
      path: expected,
      error: failure,
    }]);
  }
});

test("answers a page range refusal as an invalid request without reporting an internal failure", async () => {
  const routes = createRoutes({
    calls: counters(),
    reconciliationFailure: new RangeError("afterRevision beyond head"),
  });

  const response = await routes.handle(request(
    "/api/v1/process-instances/Instance_1/execution?afterRevision=9",
  ));

  assert.equal(response?.status, 400);
});

test("authorizes before reconciliation or any projected repository read", async () => {
  const calls = counters();
  const routes = createRoutes({ calls, permitted: false });
  for (const path of [
    "/api/v1/process-instances/Instance_1/execution?afterRevision=0",
    "/api/v1/process-instances/Instance_1/execution/export",
  ]) {
    const response = await routes.handle(request(path));
    assert.equal(response?.status, 403);
    await assertError(
      response,
      "forbidden",
      "The requested execution publication is forbidden.",
    );
  }
  assert.deepEqual(calls.reconciliations, []);
  assert.equal(calls.pages, 0);
  assert.equal(calls.exports, 0);
});

test("returns one private 503 body for unavailable and gap", async () => {
  for (const kind of [
    ExecutionPublicationReconciliationKind.Unavailable,
    ExecutionPublicationReconciliationKind.Gap,
  ] as const) {
    const calls = counters();
    const routes = createRoutes({ calls, reconciliationKind: kind });
    const response = await routes.handle(request(
      "/api/v1/process-instances/Instance_1/execution?afterRevision=2",
    ));
    assert.equal(response?.status, 503);
    const body: unknown = await response?.json();
    assert.deepEqual(body, {
      error: {
        code: "executionPublicationUnavailable",
        message: ExecutionPublicationUnavailableMessage,
      },
    });
    assert.equal(calls.pages, 0);
    assert.equal(JSON.stringify(body).includes("revision"), false);
    assert.equal(JSON.stringify(body).includes("locator"), false);
  }
});

test("distinguishes an unknown confirmed instance only after authorization", async () => {
  const calls = counters();
  const routes = createRoutes({
    calls,
    reconciliationKind: ExecutionPublicationReconciliationKind.NotFound,
  });
  const response = await routes.handle(request(
    "/api/v1/process-instances/unknown/execution?afterRevision=0",
  ));
  assert.equal(response?.status, 404);
  await assertError(response, "notFound", "The Process instance was not found.");
  assert.deepEqual(calls.reconciliations, ["unknown"]);
});

test("rejects malformed transport and methods before protected access", async () => {
  const calls = counters();
  const routes = createRoutes({ calls });
  const malformed = await routes.handle(request(
    "/api/v1/process-instances/Instance_1/execution?limit=1&afterRevision=0",
  ));
  assert.equal(malformed?.status, 400);

  const method = await routes.handle(request(
    "/api/v1/process-instances/Instance_1/execution?afterRevision=0",
    { method: "POST" },
  ));
  assert.equal(method?.status, 405);
  assert.equal(method?.headers.get("allow"), "GET");

  const body = await routes.handle(request(
    "/api/v1/process-instances/Instance_1/execution?afterRevision=0",
    {
      method: "GET",
      headers: { "content-type": "application/json" },
    },
  ));
  assert.equal(body?.status, 400);
  const transferEncoded = await routes.handle(request(
    "/api/v1/process-instances/Instance_1/execution?afterRevision=0",
    { headers: { "transfer-encoding": "chunked" } },
  ));
  assert.equal(transferEncoded?.status, 400);
  assert.deepEqual(calls.reconciliations, []);
});

function createRoutes(options: Readonly<{
  calls: ReturnType<typeof counters>;
  permitted?: boolean;
  reconciliationKind?: Exclude<
    ExecutionPublicationReconciliationKind,
    typeof ExecutionPublicationReconciliationKind.Available
  >;
  reconciliationFailure?: Error;
  actorFailure?: Error;
  reportInternalFailure?: InternalFailureReporter;
}>) {
  return new ExecutionPublicationHttpRoutes({
    actors: {
      resolveActor: () => {
        if (options.actorFailure !== undefined) throw options.actorFailure;
        return { id: "operator-1", groups: ["operators"] };
      },
    },
    authorization: {
      decide: (_actor, surface) => {
        options.calls.surfaces.push(surface);
        return options.permitted === false
          ? OperationsAuthorizationDecision.Forbidden
          : OperationsAuthorizationDecision.Permitted;
      },
    },
    reconciliation: {
      reconcile: async (processInstanceId) => {
        options.calls.reconciliations.push(processInstanceId);
        if (options.reconciliationFailure !== undefined) throw options.reconciliationFailure;
        return options.reconciliationKind === undefined
          ? {
              kind: ExecutionPublicationReconciliationKind.Available,
              projection: {},
            } as never
          : { kind: options.reconciliationKind };
      },
    },
    publications: {
      page: async () => {
        options.calls.pages += 1;
        return firstPage();
      },
      export: async () => {
        options.calls.exports += 1;
        return publicationExport();
      },
    },
    reportInternalFailure: options.reportInternalFailure ?? unexpectedInternalFailure,
  });
}

function publicationExport(): ExecutionPublicationExport {
  const page = firstPage();
  const batch = page.batches[0]!;
  return {
    format: executionPublicationExportFormat,
    definition: page.definition,
    processInstanceId: page.processInstanceId,
    headRevision: page.headRevision,
    batches: [batch],
    current: page.current!,
  };
}

function counters() {
  return {
    surfaces: [] as OperationsAuthorizationSurface[],
    reconciliations: [] as string[],
    pages: 0,
    exports: 0,
  };
}

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://platform.test${path}`, init);
}

async function assertError(
  response: Response | null | undefined,
  code: string,
  message: string,
): Promise<void> {
  assert.deepEqual(await response?.json(), { error: { code, message } });
}
