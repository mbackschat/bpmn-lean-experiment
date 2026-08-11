import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MessageStartPublicationStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  MessageStartPublication,
  PublicMessageStartCapability,
} from "@bpmn-lean/platform-contracts";

import {
  MessageStartPublicationApiClient,
} from "../src/message-start-publication-api.ts";
import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "../src/definitions-api.ts";

const definition = {
  processId: "Process_Message",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "message.bpmn",
    sha256: "d".repeat(64),
    byteLength: 2048,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "message-start-event-draft",
  startCapabilities: {
    messageStarts: [{
      startEventId: "MessageStart_OrderReceived",
      channel: {
        kind: "operationMessage",
        interfaceId: "Orders",
        interfaceOperationId: "receiveOrder",
        messageId: "OrderReceived",
      },
    }],
    timerStarts: [],
  },
} as const satisfies DeployedDefinitionVersion;

const publicationId = "720338d5-bb4f-4c9a-ae13-58789a21bc3b";
const accepted = {
  publicationId,
  definition,
  messageStart: definition.startCapabilities.messageStarts[0],
  status: MessageStartPublicationStatus.Accepted,
  instance: {
    processInstanceId: "instance/message-001",
    definition,
  },
} as const satisfies MessageStartPublication;

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("rejects a successful publication response whose Interface Operation drifted", async () => {
  const drifted = {
    ...accepted,
    definition: {
      ...definition,
      startCapabilities: {
        ...definition.startCapabilities,
        messageStarts: [{
          ...definition.startCapabilities.messageStarts[0],
          channel: {
            ...definition.startCapabilities.messageStarts[0].channel,
            interfaceOperationId: "receiveChangedOrder",
          },
        }],
      },
    },
    messageStart: {
      ...accepted.messageStart,
      channel: {
        ...accepted.messageStart.channel,
        interfaceOperationId: "receiveChangedOrder",
      },
    },
    instance: {
      ...accepted.instance,
      definition: {
        ...definition,
        startCapabilities: {
          ...definition.startCapabilities,
          messageStarts: [{
            ...definition.startCapabilities.messageStarts[0],
            channel: {
              ...definition.startCapabilities.messageStarts[0].channel,
              interfaceOperationId: "receiveChangedOrder",
            },
          }],
        },
      },
    },
  };
  const client = new MessageStartPublicationApiClient(
    "https://platform.test/",
    async () => jsonResponse(200, drifted),
  );

  await assert.rejects(
    client.publish(
      publicationId,
      definition,
      definition.startCapabilities.messageStarts[0],
    ),
    (error: unknown) => error instanceof DefinitionProtocolError &&
      /requested identity/u.test(error.message),
  );
});

test("binds every repeated publication and exact-target identity fact", async () => {
  const otherCapability = {
    ...accepted.messageStart,
    channel: { ...accepted.messageStart.channel },
  };
  const cases: ReadonlyArray<Readonly<{ label: string; response: unknown }>> = [
    {
      label: "publication ID",
      response: { ...accepted, publicationId: "different-publication" },
    },
    {
      label: "source digest",
      response: retargetAccepted(accepted.messageStart, {
        ...definition,
        source: { ...definition.source, sha256: "e".repeat(64) },
      }),
    },
    {
      label: "Start Event",
      response: retargetAccepted({ ...otherCapability, startEventId: "MessageStart_Changed" }),
    },
    {
      label: "Interface",
      response: retargetAccepted({
        ...otherCapability,
        channel: { ...otherCapability.channel, interfaceId: "ChangedOrders" },
      }),
    },
    {
      label: "Interface Operation",
      response: retargetAccepted({
        ...otherCapability,
        channel: { ...otherCapability.channel, interfaceOperationId: "changedOperation" },
      }),
    },
    {
      label: "Message",
      response: retargetAccepted({
        ...otherCapability,
        channel: { ...otherCapability.channel, messageId: "ChangedMessage" },
      }),
    },
  ];

  for (const item of cases) {
    const client = new MessageStartPublicationApiClient(
      "https://platform.test/",
      async () => jsonResponse(200, item.response),
    );
    await assert.rejects(
      client.publish(
        publicationId,
        definition,
        definition.startCapabilities.messageStarts[0],
      ),
      (error: unknown) => error instanceof DefinitionProtocolError &&
        /requested identity/u.test(error.message),
      item.label,
    );
  }
});

test("rejects private host identity fields through the strict publication decoder", async () => {
  for (const response of [
    { ...accepted, workflowId: "private-workflow" },
    { ...accepted, runId: "private-run" },
    {
      ...accepted,
      instance: { ...accepted.instance, workflowId: "private-workflow" },
    },
  ]) {
    const client = new MessageStartPublicationApiClient(
      "https://platform.test/",
      async () => jsonResponse(200, response),
    );
    await assert.rejects(
      client.get(
        publicationId,
        definition,
        definition.startCapabilities.messageStarts[0],
      ),
      (error: unknown) => error instanceof DefinitionProtocolError,
    );
  }
});

test("snapshots the exact request and accepts only status-consistent PUT results", async () => {
  const mutableDefinition = structuredClone(definition);
  const mutableMessageStart = mutableDefinition.startCapabilities.messageStarts[0];
  const release = Promise.withResolvers<void>();
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const client = new MessageStartPublicationApiClient(
    "https://platform.test/ignored/",
    async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      await release.promise;
      return jsonResponse(201, accepted);
    },
  );

  const pending = client.publish(
    publicationId,
    mutableDefinition,
    mutableMessageStart,
  );
  Object.assign(mutableDefinition, { processId: "Process_Mutated", version: 99 });
  Object.assign(mutableMessageStart.channel, {
    interfaceOperationId: "mutatedOperation",
  });
  release.resolve();

  assert.deepEqual(await pending, accepted);
  assert.equal(
    capturedUrl,
    `https://platform.test/api/v1/message-start-publications/${publicationId}`,
  );
  assert.equal(capturedInit?.method, "PUT");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    definition: { processId: definition.processId, version: definition.version },
    messageStart: definition.startCapabilities.messageStarts[0],
  });

  const pendingPublication = {
    ...accepted,
    status: MessageStartPublicationStatus.Pending,
    instance: null,
  } as const;
  for (const [status, body] of [
    [200, pendingPublication],
    [201, pendingPublication],
    [202, accepted],
  ] as const) {
    const inconsistent = new MessageStartPublicationApiClient(
      "https://platform.test/",
      async () => jsonResponse(status, body),
    );
    await assert.rejects(
      inconsistent.publish(
        publicationId,
        definition,
        definition.startCapabilities.messageStarts[0],
      ),
      (error: unknown) => error instanceof DefinitionProtocolError &&
        /HTTP status/u.test(error.message),
    );
  }
});

test("gets one exact publication and reuses canonical public API failures", async () => {
  const calls: Array<Readonly<{ url: string; method: string }>> = [];
  const client = new MessageStartPublicationApiClient(
    "https://platform.test/",
    async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      return jsonResponse(200, accepted);
    },
  );

  assert.deepEqual(
    await client.get(
      publicationId,
      definition,
      definition.startCapabilities.messageStarts[0],
    ),
    accepted,
  );
  assert.deepEqual(calls, [{
    url: `https://platform.test/api/v1/message-start-publications/${publicationId}`,
    method: "GET",
  }]);

  const missing = new MessageStartPublicationApiClient(
    "https://platform.test/",
    async () => jsonResponse(404, {
      error: { code: PublicApiErrorCode.NotFound, message: "Missing publication." },
    }),
  );
  await assert.rejects(
    missing.get(
      publicationId,
      definition,
      definition.startCapabilities.messageStarts[0],
    ),
    (error: unknown) => error instanceof DefinitionApiError &&
      error.status === 404 && error.code === PublicApiErrorCode.NotFound,
  );
});

test("accepts the documented public lifecycle and HTTP status combinations", async () => {
  const publications = [
    [200, accepted],
    [201, accepted],
    [202, {
      ...accepted,
      status: MessageStartPublicationStatus.Pending,
      instance: null,
    }],
    [202, {
      ...accepted,
      status: MessageStartPublicationStatus.Indeterminate,
      instance: null,
    }],
  ] as const;

  for (const [status, publication] of publications) {
    const client = new MessageStartPublicationApiClient(
      "https://platform.test/",
      async () => jsonResponse(status, publication),
    );
    assert.deepEqual(
      await client.publish(
        publicationId,
        definition,
        definition.startCapabilities.messageStarts[0],
      ),
      publication,
    );
  }
});

function retargetAccepted(
  messageStart: PublicMessageStartCapability,
  baseDefinition?: DeployedDefinitionVersion,
): unknown {
  const targetDefinition = baseDefinition ?? {
    ...definition,
    startCapabilities: {
      ...definition.startCapabilities,
      messageStarts: [messageStart],
    },
  };
  return {
    ...accepted,
    definition: targetDefinition,
    messageStart,
    instance: {
      ...accepted.instance,
      definition: targetDefinition,
    },
  };
}
