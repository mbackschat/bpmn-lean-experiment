import assert from "node:assert/strict";
import test from "node:test";

import {
  matchOperatorAuditExportPath,
  operatorAuditExportFilename,
  operatorAuditExportPath,
  OperatorAuditApiErrorCodes,
  OperatorAuditUnavailableMessage,
  PublicApiErrorCode,
  requireOperatorAuditExportRequestBodyLength,
} from "@bpmn-lean/platform-contracts";

test("builds and matches only the canonical operator-audit export route", () => {
  assert.equal(
    operatorAuditExportPath("instance/one"),
    "/api/v1/process-instances/instance%2Fone/operator-audit/export",
  );
  assert.equal(
    matchOperatorAuditExportPath(
      "/api/v1/process-instances/instance%2Fone/operator-audit/export",
    ),
    "instance/one",
  );
  assert.equal(operatorAuditExportPath("%2F"),
    "/api/v1/process-instances/%252F/operator-audit/export");
  assert.equal(matchOperatorAuditExportPath(
    "/api/v1/process-instances/%252F/operator-audit/export",
  ), "%2F");
});

test("rejects alternate, escaped-unreserved, malformed, query, and fragment routes", () => {
  const invalid = [
    "/api/v1/process-instances/instance%2fone/operator-audit/export",
    "/api/v1/process-instances/%69/operator-audit/export",
    "/api/v1/process-instances/%/operator-audit/export",
    "/api/v1/process-instances/i/operator-audit/export?limit=1",
    "/api/v1/process-instances/i/operator-audit/export#fragment",
  ];
  for (const route of invalid) {
    assert.throws(() => matchOperatorAuditExportPath(route));
  }
  assert.equal(matchOperatorAuditExportPath(
    "/api/v1/process-instances/i/execution/export",
  ), null);
});

test("requires bodyless GET and exposes the exact filename algorithm", () => {
  assert.doesNotThrow(() => requireOperatorAuditExportRequestBodyLength("GET", 0));
  assert.throws(() => requireOperatorAuditExportRequestBodyLength("GET", 1), /body/u);
  assert.throws(() => requireOperatorAuditExportRequestBodyLength("POST", 0), /GET/u);
  assert.equal(
    operatorAuditExportFilename(" __A//B__ "),
    "operator-audit-___A_B___.json",
  );
  assert.equal(operatorAuditExportFilename("🚀"), "operator-audit-_.json");
  assert.equal(operatorAuditExportFilename(""), "operator-audit-process-instance.json");
  assert.equal(
    operatorAuditExportFilename("a".repeat(81)),
    `operator-audit-${"a".repeat(80)}.json`,
  );
});

test("publishes only the selected route errors and unavailable message", () => {
  assert.deepEqual(OperatorAuditApiErrorCodes, [
    PublicApiErrorCode.InvalidRequest,
    PublicApiErrorCode.MethodNotAllowed,
    PublicApiErrorCode.NotFound,
    PublicApiErrorCode.Forbidden,
    PublicApiErrorCode.OperatorAuditUnavailable,
    PublicApiErrorCode.InternalFailure,
  ]);
  assert.equal(
    OperatorAuditUnavailableMessage,
    "The complete operator audit is unavailable.",
  );
});
