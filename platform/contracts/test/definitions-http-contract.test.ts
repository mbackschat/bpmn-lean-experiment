import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeDefinitionDeployResult,
  decodeDefinitionListResponse,
  decodeDefinitionVersionListResponse,
  decodePublicApiErrorResponse,
  definitionVersionSourcePath,
  definitionVersionStartPath,
  definitionVersionsPath,
  definitionsCollectionPath,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ExactPublicSourceIdentity,
} from "@bpmn-lean/platform-contracts";

const source = {
  kind: "bpmnSource",
  id: "customer-order.bpmn",
  sha256: "c".repeat(64),
  byteLength: 3072,
  declaredEncoding: "UTF-8",
  decodedAs: "UTF-8",
} as const satisfies ExactPublicSourceIdentity;

const legacyErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.UnsupportedMediaType,
  PublicApiErrorCode.PayloadTooLarge,
  PublicApiErrorCode.NotFound,
  PublicApiErrorCode.InternalFailure,
  PublicApiErrorCode.Conflict,
] as const;

const deployedDefinition = {
  processId: "order/process alpha",
  version: 2,
  source,
  semanticProfile: "cib-seven-2.2.0:sequential-user-task",
  startCapabilities: {
    messageStarts: [],
    timerStarts: [{ startEventId: "TimerStart_1", durationMs: 1000 }],
  },
} as const satisfies DeployedDefinitionVersion;

test("decodes an exact deployed-definition result", () => {
  const input = {
    status: "deployed",
    definition: deployedDefinition,
  };

  assert.deepEqual(decodeDefinitionDeployResult(input), input);
});

test("rejects a naive-cast deployed result with private engine state and a string version", () => {
  const unsafeWireValue = {
    status: "deployed",
    definition: {
      ...deployedDefinition,
      version: "2",
      semanticProcess: { nodes: [] },
    },
  };

  assert.throws(
    () => decodeDefinitionDeployResult(unsafeWireValue),
    /definition must contain exactly its public fields/u,
  );
});

test("rejects a malformed digest nested inside a deployed definition", () => {
  assert.throws(
    () => decodeDefinitionDeployResult({
      status: "deployed",
      definition: {
        ...deployedDefinition,
        source: { ...source, sha256: "ABC123" },
      },
    }),
    /source\.sha256 must be a lowercase SHA-256 digest/u,
  );
});

test("decodes located rejection diagnostics without interpreting engine codes", () => {
  const input = {
    status: "rejected",
    source,
    semanticProfile: "cib-seven-2.2.0:sequential-user-task",
    diagnostics: [{
      code: "futureEngineDiagnostic",
      evidence: "ScriptTask_1 requires a future capability.",
      element: {
        id: "ScriptTask_1",
        type: "bpmn:ScriptTask",
        containmentPath: "definitions/rootElements[0]/flowElements[3]",
        subject: null,
        requiredCapability: "executeElementType",
      },
    }],
  };

  assert.deepEqual(decodeDefinitionDeployResult(input), input);
});

test("requires every rejection diagnostic to state its nullable element field", () => {
  assert.throws(
    () => decodeDefinitionDeployResult({
      status: "rejected",
      source,
      semanticProfile: "profile",
      diagnostics: [{ code: "parserFailure", evidence: "Malformed XML." }],
    }),
    /diagnostic must contain exactly its public fields/u,
  );
});

test("decodes closed definition and per-process version lists", () => {
  const definitions = { definitions: [deployedDefinition] };
  const versions = {
    processId: deployedDefinition.processId,
    versions: [deployedDefinition],
  };

  assert.deepEqual(decodeDefinitionListResponse(definitions), definitions);
  assert.deepEqual(decodeDefinitionVersionListResponse(versions), versions);
  assert.throws(
    () => decodeDefinitionListResponse({ ...definitions, cursor: "private" }),
    /definition list must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeDefinitionVersionListResponse({
      processId: "another-process",
      versions: [deployedDefinition],
    }),
    /versions\[0\]\.processId must equal processId/u,
  );
});

test("constructs versioned public definition routes and encodes process identifiers", () => {
  assert.equal(definitionsCollectionPath(), "/api/v1/definitions");
  assert.equal(
    definitionVersionsPath("order/process alpha"),
    "/api/v1/definitions/order%2Fprocess%20alpha/versions",
  );
  assert.equal(
    definitionVersionSourcePath("order/process alpha", 2),
    "/api/v1/definitions/order%2Fprocess%20alpha/versions/2/source",
  );
  assert.equal(
    definitionVersionStartPath("order/process alpha", 2),
    "/api/v1/definitions/order%2Fprocess%20alpha/versions/2/start",
  );
});

test("rejects empty process identifiers and unsafe definition versions", () => {
  assert.throws(() => definitionVersionsPath(""), /processId must not be empty/u);
  assert.throws(
    () => definitionVersionsPath("\uD800"),
    /processId must contain well-formed Unicode/u,
  );
  assert.throws(() => definitionVersionSourcePath("process", 0), /positive safe integer/u);
  assert.throws(() => definitionVersionStartPath("process", 1.5), /positive safe integer/u);
  assert.throws(
    () => definitionVersionStartPath("process", Number.MAX_SAFE_INTEGER + 1),
    /positive safe integer/u,
  );
});

test("preserves legacy public API error order and appends route-specific codes", () => {
  assert.equal(PublicApiErrorCode.MethodNotAllowed, "methodNotAllowed");
  assert.deepEqual(Object.values(PublicApiErrorCode), [
    "invalidRequest",
    "methodNotAllowed",
    "unsupportedMediaType",
    "payloadTooLarge",
    "notFound",
    "internalFailure",
    "conflict",
    "forbidden",
    "formValueIncompatible",
    "workSnapshotUnavailable",
    "incidentSnapshotUnavailable",
    "executionPublicationUnavailable",
    "flowNodeMetricsUnavailable",
  ]);
});

test("decodes every code in one exact route-owned public API error set", () => {
  for (const code of legacyErrorCodes) {
    const input = { error: { code, message: `${code} response` } };
    assert.deepEqual(decodePublicApiErrorResponse(input, legacyErrorCodes), input);
  }
});

test("legacy Definition, Schedule, Message, and Search sets reject every later route code", () => {
  const legacyRoutes = ["Definition", "Schedule", "Message", "Search"];
  const laterRouteCodes = [
    PublicApiErrorCode.Forbidden,
    PublicApiErrorCode.FormValueIncompatible,
    PublicApiErrorCode.WorkSnapshotUnavailable,
    PublicApiErrorCode.IncidentSnapshotUnavailable,
    PublicApiErrorCode.ExecutionPublicationUnavailable,
    PublicApiErrorCode.FlowNodeMetricsUnavailable,
  ];
  for (const route of legacyRoutes) {
    for (const code of laterRouteCodes) {
      assert.throws(
        () => decodePublicApiErrorResponse(
          { error: { code, message: `${route} must reject this code` } },
          legacyErrorCodes,
        ),
        /not allowed by this route/u,
      );
    }
  }
});

test("rejects unknown, empty, and private API error fields", () => {
  assert.throws(
    () => decodePublicApiErrorResponse(
      { error: { code: "privateError", message: "not public" } },
      legacyErrorCodes,
    ),
    /not allowed by this route/u,
  );
  assert.throws(
    () => decodePublicApiErrorResponse(
      { error: { code: PublicApiErrorCode.InvalidRequest, message: "" } },
      legacyErrorCodes,
    ),
    /message must not be empty/u,
  );
  assert.throws(
    () => decodePublicApiErrorResponse(
      {
        error: {
          code: PublicApiErrorCode.InternalFailure,
          message: "generic",
          privateStack: "must not cross",
        },
      },
      legacyErrorCodes,
    ),
    /API error must contain exactly its public fields/u,
  );
});
