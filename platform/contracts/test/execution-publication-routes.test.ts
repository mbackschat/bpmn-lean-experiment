import assert from "node:assert/strict";
import test from "node:test";

import {
  executionPublicationExportPath,
  executionPublicationPath,
  ExecutionPublicationApiErrorCodes,
  ExecutionPublicationUnavailableMessage,
  matchExecutionPublicationExportPath,
  matchExecutionPublicationPath,
  requireExecutionPublicationRequestBodyLength,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";

test("builds and matches only the exact execution publication routes", () => {
  assert.equal(
    executionPublicationPath({
      processInstanceId: "instance/one",
      afterRevision: 0,
      limit: 100,
    }),
    "/api/v1/process-instances/instance%2Fone/execution?afterRevision=0&limit=100",
  );
  assert.deepEqual(
    matchExecutionPublicationPath(
      "/api/v1/process-instances/instance%2Fone/execution?afterRevision=0&limit=100",
    ),
    { processInstanceId: "instance/one", afterRevision: 0, limit: 100 },
  );
  assert.equal(
    executionPublicationExportPath("instance/one"),
    "/api/v1/process-instances/instance%2Fone/execution/export",
  );
  assert.equal(
    matchExecutionPublicationExportPath(
      "/api/v1/process-instances/instance%2Fone/execution/export",
    ),
    "instance/one",
  );
});

test("rejects noncanonical, duplicate, unknown, and out-of-range query fields", () => {
  const invalid = [
    "/api/v1/process-instances/i/execution?afterRevision=00",
    "/api/v1/process-instances/i/execution?afterRevision=-1",
    "/api/v1/process-instances/i/execution?afterRevision=0&afterRevision=1",
    "/api/v1/process-instances/i/execution?limit=1&afterRevision=0",
    "/api/v1/process-instances/i/execution?afterRevision=0&limit=101",
    "/api/v1/process-instances/i/execution?afterRevision=0&cursor=x",
    "/api/v1/process-instances/%69/execution?afterRevision=0",
  ];
  for (const route of invalid) {
    assert.throws(() => matchExecutionPublicationPath(route));
  }
  assert.throws(
    () => matchExecutionPublicationExportPath(
      "/api/v1/process-instances/i/execution/export?afterRevision=0",
    ),
    /query/u,
  );
});

test("requires bodyless GET requests", () => {
  assert.doesNotThrow(() => requireExecutionPublicationRequestBodyLength("GET", 0));
  assert.throws(() => requireExecutionPublicationRequestBodyLength("GET", 1), /body/u);
  assert.throws(() => requireExecutionPublicationRequestBodyLength("POST", 0), /GET/u);
});

test("publishes only the selected route errors and canonical unavailable message", () => {
  assert.deepEqual(ExecutionPublicationApiErrorCodes, [
    PublicApiErrorCode.InvalidRequest,
    PublicApiErrorCode.MethodNotAllowed,
    PublicApiErrorCode.NotFound,
    PublicApiErrorCode.Forbidden,
    PublicApiErrorCode.ExecutionPublicationUnavailable,
    PublicApiErrorCode.InternalFailure,
  ]);
  assert.equal(
    ExecutionPublicationUnavailableMessage,
    "The committed execution publication is unavailable.",
  );
});
