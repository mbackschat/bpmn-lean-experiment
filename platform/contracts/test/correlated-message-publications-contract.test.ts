import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeDefinitionCorrelatedMessageCapabilities,
  decodeDefinitionCorrelatedMessagePublication,
  decodePutDefinitionCorrelatedMessagePublicationRequest,
  definitionCorrelatedMessagePublicationPath,
  definitionCorrelatedMessagesPath,
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
  matchDefinitionCorrelatedMessagePublicationPath,
  matchDefinitionCorrelatedMessagesPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessagePublication,
  DeployedDefinitionVersion,
  PublicCorrelatedMessageCapability,
  PutDefinitionCorrelatedMessagePublicationRequest,
} from "@bpmn-lean/platform-contracts";

const definition = {
  processId: "correlated settlement/process",
  version: 3,
  source: {
    kind: "bpmnSource",
    id: "correlated-settlement.bpmn",
    sha256: "a".repeat(64),
    byteLength: 4096,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "bpmn-2.0.2-bpmn-lean-message-key-correlation-v1",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

const correlatedMessage = {
  catchEventId: "Catch_Settlement",
  channel: {
    kind: "operationMessage",
    interfaceId: "SettlementInterface",
    interfaceOperationId: "receiveSettlement",
    messageId: "SettlementReceived",
  },
  correlationKeyId: "SettlementCorrelationKey",
} as const satisfies PublicCorrelatedMessageCapability;

const capabilities = {
  definition,
  messages: [correlatedMessage],
} as const satisfies DefinitionCorrelatedMessageCapabilities;

const request = {
  payload: { kind: "string", value: "invoice-42" },
} as const satisfies PutDefinitionCorrelatedMessagePublicationRequest;

function semanticPublication(
  outcome: Extract<
    DefinitionCorrelatedMessagePublication["resolution"],
    { kind: "semantic" }
  >["outcome"],
): DefinitionCorrelatedMessagePublication {
  return {
    definition,
    correlatedMessage,
    resolution: {
      kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
      commandId: "command/42",
      ingressOrdinal: 7,
      outcome,
    },
  };
}

test("decodes definition-scoped correlated Message capabilities without a target", () => {
  const decoded = decodeDefinitionCorrelatedMessageCapabilities(capabilities);

  assert.deepEqual(decoded, capabilities);
  assert.notStrictEqual(decoded, capabilities);
  assert.notStrictEqual(decoded.definition, capabilities.definition);
  assert.notStrictEqual(decoded.messages, capabilities.messages);
  assert.notStrictEqual(decoded.messages[0], capabilities.messages[0]);
  assert.equal("processInstanceId" in decoded.messages[0]!, false);
  assert.equal("subscriptionId" in decoded.messages[0]!, false);
});

test("rejects malformed, duplicate, and private correlated Message capabilities", () => {
  const malformed = [
    {
      value: {
        ...capabilities,
        messages: [{ ...correlatedMessage, processInstanceId: "private" }],
      },
      message: /correlated Message capability must contain exactly its public fields/u,
    },
    {
      value: {
        ...capabilities,
        messages: [{ ...correlatedMessage, subscriptionId: "private" }],
      },
      message: /correlated Message capability must contain exactly its public fields/u,
    },
    {
      value: { ...capabilities, messages: [correlatedMessage, correlatedMessage] },
      message: /messages must not repeat catchEventId/u,
    },
    {
      value: {
        ...capabilities,
        messages: [{ ...correlatedMessage, correlationKeyId: "" }],
      },
      message: /correlationKeyId must not be empty/u,
    },
    {
      value: { ...capabilities, workflowId: "private" },
      message: /correlated Message capabilities must contain exactly its public fields/u,
    },
  ];

  for (const { value, message } of malformed) {
    assert.throws(
      () => decodeDefinitionCorrelatedMessageCapabilities(value),
      message,
    );
  }
});

test("decodes only one non-empty string payload without a caller target", () => {
  const decoded = decodePutDefinitionCorrelatedMessagePublicationRequest(request);

  assert.deepEqual(decoded, request);
  assert.notStrictEqual(decoded, request);
  assert.notStrictEqual(decoded.payload, request.payload);
  assert.throws(
    () => decodePutDefinitionCorrelatedMessagePublicationRequest({
      ...request,
      processInstanceId: "caller-selected-target",
    }),
    /correlated Message publication request must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodePutDefinitionCorrelatedMessagePublicationRequest({
      payload: { kind: "string", value: "" },
    }),
    /payload.value must not be empty/u,
  );
  assert.throws(
    () => decodePutDefinitionCorrelatedMessagePublicationRequest({
      payload: { kind: "integer", value: 42 },
    }),
    /payload.kind must be string/u,
  );
  assert.throws(
    () => decodePutDefinitionCorrelatedMessagePublicationRequest({
      payload: { kind: "string", value: "invoice-42", correlationKey: "private" },
    }),
    /payload must contain exactly its public fields/u,
  );
});

test("decodes committed, no-match, and ambiguous semantic resolutions", () => {
  const publications = [
    semanticPublication({
      kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
      target: { processInstanceId: "process-instance-42" },
    }),
    semanticPublication({
      kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch,
    }),
    semanticPublication({
      kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous,
    }),
  ];

  for (const publication of publications) {
    assert.deepEqual(
      decodeDefinitionCorrelatedMessagePublication(publication),
      publication,
    );
  }
});

test("decodes capacity and infrastructure resolutions without host identity", () => {
  const publications = [
    {
      definition,
      correlatedMessage,
      resolution: {
        kind: DefinitionCorrelatedMessageResolutionKind.Capacity,
        commandId: "command/42",
        ingressOrdinal: null,
        failure: {
          kind: "publicationQueue",
          measure: "count",
          configuredBound: 32,
          observedValue: 33,
        },
      },
    },
    {
      definition,
      correlatedMessage,
      resolution: {
        kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
        commandId: "command/42",
        ingressOrdinal: null,
        phase: "candidateFanout",
        target: null,
        failure: { kind: "unconfirmed" },
      },
    },
    {
      definition,
      correlatedMessage,
      resolution: {
        kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
        commandId: "command/42",
        ingressOrdinal: 7,
        phase: "resultRecovery",
        target: null,
        failure: {
          kind: "capacity",
          boundary: "queryResponse",
          configuredBound: 65_536,
          observedValue: 65_537,
        },
      },
    },
    {
      definition,
      correlatedMessage,
      resolution: {
        kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
        commandId: "command/42",
        ingressOrdinal: 7,
        phase: "targetDelivery",
        target: { processInstanceId: "process-instance-42" },
        failure: { kind: "targetInconsistent" },
      },
    },
  ] as const satisfies readonly DefinitionCorrelatedMessagePublication[];

  for (const publication of publications) {
    const decoded = decodeDefinitionCorrelatedMessagePublication(publication);
    assert.deepEqual(decoded, publication);
    assert.equal("workflowId" in decoded.resolution, false);
  }
});

test("rejects private targets and impossible resolution combinations", () => {
  const committed = semanticPublication({
    kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
    target: { processInstanceId: "process-instance-42" },
  });
  const malformed = [
    {
      value: {
        ...committed,
        resolution: { ...committed.resolution, workflowId: "private" },
      },
      message: /semantic resolution must contain exactly its public fields/u,
    },
    {
      value: {
        ...committed,
        resolution: {
          ...committed.resolution,
          outcome: {
            kind: "committed",
            target: {
              processInstanceId: "process-instance-42",
              subscriptionId: "private-subscription",
            },
          },
        },
      },
      message: /committed target must contain exactly its public fields/u,
    },
    {
      value: {
        ...committed,
        resolution: {
          kind: "infrastructureIndeterminate",
          commandId: "command/42",
          ingressOrdinal: 7,
          phase: "candidateFanout",
          target: { processInstanceId: "process-instance-42" },
          failure: { kind: "targetInconsistent" },
        },
      },
      message: /targetInconsistent requires targetDelivery/u,
    },
    {
      value: {
        ...committed,
        resolution: {
          kind: "capacity",
          commandId: "command/42",
          ingressOrdinal: 1,
          failure: {
            kind: "publicationLedger",
            measure: "canonicalBytes",
            configuredBound: 32,
            observedValue: 33,
          },
        },
      },
      message: /capacity resolution.ingressOrdinal must be null/u,
    },
  ];

  for (const { value, message } of malformed) {
    assert.throws(
      () => decodeDefinitionCorrelatedMessagePublication(value),
      message,
    );
  }
});

test("builds and matches exact definition-scoped correlated Message routes", () => {
  const collectionPath = definitionCorrelatedMessagesPath(
    "correlated settlement/process",
    3,
  );
  const publicationPath = definitionCorrelatedMessagePublicationPath(
    "correlated settlement/process",
    3,
    "Catch/Settlement β",
    "command/42 β",
  );

  assert.equal(
    collectionPath,
    "/api/v1/definitions/correlated%20settlement%2Fprocess/versions/3/correlated-messages",
  );
  assert.equal(
    publicationPath,
    `${collectionPath}/Catch%2FSettlement%20%CE%B2/publications/command%2F42%20%CE%B2`,
  );
  assert.deepEqual(matchDefinitionCorrelatedMessagesPath(collectionPath), {
    processId: "correlated settlement/process",
    version: 3,
  });
  assert.deepEqual(
    matchDefinitionCorrelatedMessagePublicationPath(publicationPath),
    {
      processId: "correlated settlement/process",
      version: 3,
      catchEventId: "Catch/Settlement β",
      commandId: "command/42 β",
    },
  );
  assert.equal(matchDefinitionCorrelatedMessagesPath(`${collectionPath}/`), null);
  assert.equal(
    matchDefinitionCorrelatedMessagePublicationPath(`${publicationPath}/`),
    null,
  );
});

test("rejects malformed or noncanonical correlated Message route identities", () => {
  assert.throws(
    () => definitionCorrelatedMessagesPath("process", 0),
    /version must be a positive safe integer/u,
  );
  assert.throws(
    () => definitionCorrelatedMessagePublicationPath("process", 1, "", "command"),
    /catchEventId must not be empty/u,
  );
  assert.throws(
    () => definitionCorrelatedMessagePublicationPath("process", 1, "catch", "\uD800"),
    /commandId must contain well-formed Unicode/u,
  );
  assert.throws(
    () => matchDefinitionCorrelatedMessagesPath(
      "/api/v1/definitions/process/versions/01/correlated-messages",
    ),
    /version segment must be a canonical positive safe integer/u,
  );
  assert.throws(
    () => matchDefinitionCorrelatedMessagePublicationPath(
      "/api/v1/definitions/process/versions/1/correlated-messages/%E0%A4%A/publications/command",
    ),
    /catchEventId segment must be valid URI encoding/u,
  );
});
