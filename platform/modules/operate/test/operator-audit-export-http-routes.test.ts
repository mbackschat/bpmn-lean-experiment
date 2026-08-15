import assert from "node:assert/strict";
import test from "node:test";

import {
  OperatorAuditUnavailableMessage,
  operatorAuditExportFilename,
  operatorAuditExportPath,
  serializeOperatorAuditExport,
} from "@bpmn-lean/platform-contracts";
import {
  OperatorAuditExportHttpRoutes,
} from "@bpmn-lean/platform-operate";
import {
  OperationsAuthorizationDecision,
  OperationsAuthorizationSurface,
} from "@bpmn-lean/platform-identity-policy";

import {
  operatorAuditExport,
  operatorAuditInstance,
} from "./operator-audit-export-fixture.ts";

test("serves exact canonical attachment bytes after authorization and confirmed lookup", async () => {
  const calls = counters();
  const routes = createRoutes(calls);
  const response = await routes.handle(request(
    operatorAuditExportPath(operatorAuditInstance.processInstanceId),
  ));
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(
    response?.headers.get("content-disposition"),
    `attachment; filename="${operatorAuditExportFilename(operatorAuditInstance.processInstanceId)}"`,
  );
  assert.deepEqual(
    new Uint8Array(await response!.arrayBuffer()),
    serializeOperatorAuditExport(operatorAuditExport(), operatorAuditInstance),
  );
  assert.deepEqual(calls.surfaces, [OperationsAuthorizationSurface.OperatorAudit]);
  assert.deepEqual(calls.registrations, [operatorAuditInstance.processInstanceId]);
  assert.deepEqual(calls.exports, [operatorAuditInstance.processInstanceId]);
});

test("denies before confirmed lookup or audit work", async () => {
  const calls = counters();
  const routes = createRoutes(calls, { permitted: false });
  const response = await routes.handle(request(operatorAuditExportPath("secret")));
  assert.equal(response?.status, 403);
  await assertError(response, "forbidden", "The requested operator audit is forbidden.");
  assert.deepEqual(calls.registrations, []);
  assert.deepEqual(calls.exports, []);
});

test("distinguishes unknown confirmed identity, audit unavailability, and internal failures", async () => {
  const missingCalls = counters();
  const missing = await createRoutes(missingCalls, { registration: null }).handle(
    request(operatorAuditExportPath("missing")),
  );
  assert.equal(missing?.status, 404);
  await assertError(missing, "notFound", "The Process instance was not found.");
  assert.deepEqual(missingCalls.exports, []);

  const unavailableCalls = counters();
  const unavailable = await createRoutes(unavailableCalls, {
    exportFailure: new Error("snapshot failed"),
  }).handle(request(operatorAuditExportPath(operatorAuditInstance.processInstanceId)));
  assert.equal(unavailable?.status, 503);
  await assertError(
    unavailable,
    "operatorAuditUnavailable",
    OperatorAuditUnavailableMessage,
  );

  for (const failure of ["actor", "authorization", "registration"] as const) {
    const calls = counters();
    const response = await createRoutes(calls, { internalFailure: failure }).handle(
      request(operatorAuditExportPath(operatorAuditInstance.processInstanceId)),
    );
    assert.equal(response?.status, 500);
    await assertError(
      response,
      "internalFailure",
      "The operator audit request could not be completed.",
    );
    assert.deepEqual(calls.exports, []);
  }
});

test("rejects noncanonical transport and wrong methods before protected access", async () => {
  const calls = counters();
  const routes = createRoutes(calls);
  const malformed = await routes.handle(request(
    "/api/v1/process-instances/Instance%2f1/operator-audit/export",
  ));
  assert.equal(malformed?.status, 400);
  const method = await routes.handle(request(
    operatorAuditExportPath(operatorAuditInstance.processInstanceId),
    { method: "POST" },
  ));
  assert.equal(method?.status, 405);
  assert.equal(method?.headers.get("allow"), "GET");
  const contentType = await routes.handle(request(
    operatorAuditExportPath(operatorAuditInstance.processInstanceId),
    { headers: { "content-type": "application/json" } },
  ));
  assert.equal(contentType?.status, 400);
  const transferEncoded = await routes.handle(request(
    operatorAuditExportPath(operatorAuditInstance.processInstanceId),
    { headers: { "transfer-encoding": "chunked" } },
  ));
  assert.equal(transferEncoded?.status, 400);
  assert.deepEqual(calls.registrations, []);
  assert.deepEqual(calls.exports, []);
  assert.equal(await routes.handle(request("/api/v1/not-operator-audit")), null);
});

test("refuses private host-field bytes returned across the HTTP service boundary", async () => {
  const privateFields = [
    "locator",
    "workflowId",
    "runId",
    "taskQueue",
    "eventHistory",
    "workflowTask",
    "activityAttempt",
    "temporalRetry",
    "transportPayload",
    "privateOrdinal",
    "databasePath",
    "cursor",
  ] as const;

  for (const privateField of privateFields) {
    const calls = counters();
    const exportBytes = new TextEncoder().encode(JSON.stringify({
      ...operatorAuditExport(),
      nestedPrivateHostFact: { [privateField]: `private-${privateField}` },
    }));
    const response = await createRoutes(calls, { exportBytes }).handle(request(
      operatorAuditExportPath(operatorAuditInstance.processInstanceId),
    ));
    assert.equal(response?.status, 503, privateField);
    await assertError(response, "operatorAuditUnavailable", OperatorAuditUnavailableMessage);
  }
});

function createRoutes(
  calls: ReturnType<typeof counters>,
  options: Readonly<{
    permitted?: boolean;
    registration?: typeof operatorAuditInstance | null;
    exportFailure?: Error;
    exportBytes?: Uint8Array;
    internalFailure?: "actor" | "authorization" | "registration";
  }> = {},
) {
  return new OperatorAuditExportHttpRoutes({
    actors: {
      resolveActor: () => {
        if (options.internalFailure === "actor") throw new Error("actor failure");
        return { id: "operator-1", groups: ["operators"] };
      },
    },
    authorization: {
      decide: (_actor, surface) => {
        calls.surfaces.push(surface);
        if (options.internalFailure === "authorization") {
          throw new Error("authorization failure");
        }
        return options.permitted === false
          ? OperationsAuthorizationDecision.Forbidden
          : OperationsAuthorizationDecision.Permitted;
      },
    },
    registrations: {
      getConfirmed: (processInstanceId) => {
        calls.registrations.push(processInstanceId);
        if (options.internalFailure === "registration") {
          throw new Error("registration failure");
        }
        return options.registration === undefined
          ? operatorAuditInstance
          : options.registration;
      },
    },
    exports: {
      create: (instance) => {
        calls.exports.push(instance.processInstanceId);
        if (options.exportFailure !== undefined) throw options.exportFailure;
        if (options.exportBytes !== undefined) return options.exportBytes;
        return serializeOperatorAuditExport(operatorAuditExport(), instance);
      },
    },
  });
}

function counters() {
  return {
    surfaces: [] as OperationsAuthorizationSurface[],
    registrations: [] as string[],
    exports: [] as string[],
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
