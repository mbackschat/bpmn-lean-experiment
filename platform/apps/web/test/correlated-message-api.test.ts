import assert from "node:assert/strict";
import test from "node:test";

import {
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessagePublication,
  PutDefinitionCorrelatedMessagePublicationRequest,
} from "@bpmn-lean/platform-contracts";

import {
  CorrelatedMessageApiClient,
} from "../src/correlated-message-api.ts";
import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "../src/definitions-api.ts";

const definition = {
  processId: "Correlated/Settlement",
  version: 2,
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
} as const;
const correlatedMessage = {
  catchEventId: "Catch/Settlement",
  channel: {
    kind: "operationMessage",
    interfaceId: "SettlementInterface",
    interfaceOperationId: "receiveSettlement",
    messageId: "SettlementReceived",
  },
  correlationKeyId: "SettlementCorrelationKey",
} as const;
const capabilities = {
  definition,
  messages: [correlatedMessage],
} as const satisfies DefinitionCorrelatedMessageCapabilities;
const request = {
  payload: { kind: "string", value: "invoice-42" },
} as const satisfies PutDefinitionCorrelatedMessagePublicationRequest;
const commandId = "command/42";
const publication = {
  definition,
  correlatedMessage,
  resolution: {
    kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
    commandId,
    ingressOrdinal: 7,
    outcome: {
      kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
      target: { processInstanceId: "semantic-instance-42" },
    },
  },
} as const satisfies DefinitionCorrelatedMessagePublication;

test("loads exact definition-scoped capabilities with a bodyless GET", async () => {
  const calls: Array<Readonly<{ url: string; init: RequestInit | undefined }>> = [];
  const client = new CorrelatedMessageApiClient(
    "https://platform.test/ignored",
    async (input, init) => {
      calls.push({ url: String(input), init });
      return jsonResponse(200, capabilities);
    },
  );

  assert.deepEqual(await client.getCapabilities(definition), capabilities);
  assert.equal(
    calls[0]?.url,
    "https://platform.test/api/v1/definitions/Correlated%2FSettlement/versions/2/correlated-messages",
  );
  assert.deepEqual(calls[0]?.init, {
    method: "GET",
    headers: { accept: "application/json" },
  });
});

test("snapshots a target-free publication and accepts one exact response", async () => {
  const mutableCapabilities = structuredClone(capabilities);
  const mutableCapability = mutableCapabilities.messages[0]!;
  const mutableRequest = structuredClone(request);
  const release = Promise.withResolvers<void>();
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = new CorrelatedMessageApiClient(
    "https://platform.test/",
    async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      await release.promise;
      return jsonResponse(200, publication);
    },
  );

  const pending = client.publish(
    commandId,
    mutableCapabilities,
    mutableCapability,
    mutableRequest,
  );
  Object.assign(mutableCapabilities.definition, { processId: "Mutated" });
  Object.assign(mutableCapability, { catchEventId: "MutatedCatch" });
  Object.assign(mutableRequest.payload, { value: "mutated-value" });
  release.resolve();

  assert.deepEqual(await pending, publication);
  assert.equal(
    capturedUrl,
    "https://platform.test/api/v1/definitions/Correlated%2FSettlement/versions/2/correlated-messages/Catch%2FSettlement/publications/command%2F42",
  );
  assert.equal(capturedInit?.method, "PUT");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), request);
  assert.equal("processInstanceId" in JSON.parse(String(capturedInit?.body)), false);
});

test("rejects every repeated response identity drift", async () => {
  const cases = [
    {
      ...publication,
      definition: { ...definition, version: 3 },
    },
    {
      ...publication,
      correlatedMessage: { ...correlatedMessage, catchEventId: "OtherCatch" },
    },
    {
      ...publication,
      resolution: { ...publication.resolution, commandId: "other-command" },
    },
  ];
  for (const response of cases) {
    const client = new CorrelatedMessageApiClient(
      "https://platform.test/",
      async () => jsonResponse(200, response),
    );
    await assert.rejects(
      client.publish(commandId, capabilities, correlatedMessage, request),
      (error: unknown) => error instanceof DefinitionProtocolError &&
        /requested identity/u.test(error.message),
    );
  }
});

test("rejects private target and host identities recursively", async () => {
  for (const response of [
    { ...publication, workflowId: "private-workflow" },
    {
      ...publication,
      resolution: { ...publication.resolution, runId: "private-run" },
    },
    {
      ...publication,
      resolution: {
        ...publication.resolution,
        outcome: {
          ...publication.resolution.outcome,
          target: {
            processInstanceId: "semantic-instance-42",
            subscriptionId: "private-subscription",
          },
        },
      },
    },
  ]) {
    const client = new CorrelatedMessageApiClient(
      "https://platform.test/",
      async () => jsonResponse(200, response),
    );
    await assert.rejects(
      client.publish(commandId, capabilities, correlatedMessage, request),
      DefinitionProtocolError,
    );
  }
});

test("requires the selected capability and rejects duplicate discovered identities", async () => {
  const client = new CorrelatedMessageApiClient(
    "https://platform.test/",
    async () => jsonResponse(200, publication),
  );

  await assert.rejects(
    client.publish(commandId, { ...capabilities, messages: [] }, correlatedMessage, request),
    /exactly once/u,
  );
  await assert.rejects(
    client.publish(
      commandId,
      { ...capabilities, messages: [correlatedMessage, correlatedMessage] },
      correlatedMessage,
      request,
    ),
    /must not repeat catchEventId/u,
  );
});

test("rejects malformed successful responses and unexpected statuses", async () => {
  for (const response of [
    new Response("{}", { status: 200, headers: { "content-type": "text/plain" } }),
    new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
    jsonResponse(201, publication),
  ]) {
    const client = new CorrelatedMessageApiClient(
      "https://platform.test/",
      async () => response,
    );
    await assert.rejects(
      client.publish(commandId, capabilities, correlatedMessage, request),
      DefinitionProtocolError,
    );
  }
});

test("decodes route-owned API errors without collapsing conflict into transport failure", async () => {
  for (const [status, code] of [
    [404, PublicApiErrorCode.NotFound],
    [409, PublicApiErrorCode.Conflict],
    [500, PublicApiErrorCode.InternalFailure],
  ] as const) {
    const client = new CorrelatedMessageApiClient(
      "https://platform.test/",
      async () => jsonResponse(status, {
        error: { code, message: `public ${code}` },
      }),
    );
    await assert.rejects(
      client.publish(commandId, capabilities, correlatedMessage, request),
      (error: unknown) => error instanceof DefinitionApiError &&
        error.status === status && error.code === code,
    );
  }
});

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
