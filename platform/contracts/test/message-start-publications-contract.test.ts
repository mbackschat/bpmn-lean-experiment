import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeMessageStartPublication,
  decodePublicDefinitionStartCapabilities,
  decodePublicMessageStartCapability,
  decodePublicOperationMessageChannel,
  decodePutMessageStartPublicationRequest,
  matchMessageStartPublicationPath,
  messageStartPublicationPath,
  MessageStartPublicationStatus,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  MessageStartPublication,
  PublicMessageStartCapability,
  PutMessageStartPublicationRequest,
} from "@bpmn-lean/platform-contracts";

const messageStart = {
  startEventId: "MessageStart_1",
  channel: {
    kind: "operationMessage",
    interfaceId: "OrderInterface",
    interfaceOperationId: "submitOrder",
    messageId: "OrderSubmitted",
  },
} as const satisfies PublicMessageStartCapability;

const definition = {
  processId: "order/process alpha",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "message-start.bpmn",
    sha256: "e".repeat(64),
    byteLength: 2048,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "cib-seven-2.2.0:message-start",
  startCapabilities: {
    messageStarts: [messageStart],
    timerStarts: [],
  },
} as const satisfies DeployedDefinitionVersion;

const request = {
  definition: {
    processId: definition.processId,
    version: definition.version,
  },
  messageStart,
} as const satisfies PutMessageStartPublicationRequest;

const pending = {
  publicationId: "publication/alpha",
  definition,
  messageStart,
  status: MessageStartPublicationStatus.Pending,
  instance: null,
} as const satisfies MessageStartPublication;

test("decodes the complete operation-addressed Message Start capability", () => {
  assert.deepEqual(
    decodePublicOperationMessageChannel(messageStart.channel),
    messageStart.channel,
  );
  assert.deepEqual(decodePublicMessageStartCapability(messageStart), messageStart);
  assert.deepEqual(
    decodePublicDefinitionStartCapabilities(definition.startCapabilities),
    definition.startCapabilities,
  );

  assert.throws(
    () => decodePublicOperationMessageChannel({
      ...messageStart.channel,
      workflowId: "private",
    }),
    /operation Message channel must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodePublicOperationMessageChannel({
      ...messageStart.channel,
      kind: "message",
    }),
    /kind must be operationMessage/u,
  );
  assert.throws(
    () => decodePublicMessageStartCapability({
      ...messageStart,
      channel: { ...messageStart.channel, interfaceOperationId: "" },
    }),
    /interfaceOperationId must not be empty/u,
  );
  assert.throws(
    () => decodePublicDefinitionStartCapabilities({
      messageStarts: [messageStart],
      timerStarts: [],
      taskQueue: "private",
    }),
    /start capabilities must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodePublicDefinitionStartCapabilities({ timerStarts: [] }),
    /start capabilities must contain exactly its public fields/u,
  );
});

test("decodes a closed request and preserves Interface Operation identity", () => {
  const changedOperation = {
    ...request,
    messageStart: {
      ...messageStart,
      channel: {
        ...messageStart.channel,
        interfaceOperationId: "cancelOrder",
      },
    },
  };

  const decoded = decodePutMessageStartPublicationRequest(request);
  const changed = decodePutMessageStartPublicationRequest(changedOperation);

  assert.deepEqual(decoded, request);
  assert.notStrictEqual(decoded, request);
  assert.notStrictEqual(decoded.definition, request.definition);
  assert.notStrictEqual(decoded.messageStart, request.messageStart);
  assert.equal(changed.messageStart.channel.messageId, decoded.messageStart.channel.messageId);
  assert.equal(changed.messageStart.channel.interfaceId, decoded.messageStart.channel.interfaceId);
  assert.notDeepEqual(changed, decoded);
  assert.equal(changed.messageStart.channel.interfaceOperationId, "cancelOrder");
});

test("rejects malformed, incomplete, and private request fields", () => {
  const malformed = [
    {
      value: { ...request, payload: { orderId: 42 } },
      message: /message-start publication request must contain exactly its public fields/u,
    },
    {
      value: { ...request, definition: { ...request.definition, version: 0 } },
      message: /definition\.version must be a positive safe integer/u,
    },
    {
      value: { ...request, definition: { processId: "", version: 2 } },
      message: /definition\.processId must not be empty/u,
    },
    {
      value: { definition: request.definition },
      message: /message-start publication request must contain exactly its public fields/u,
    },
    {
      value: {
        ...request,
        messageStart: { ...messageStart, semanticProcess: { operations: [] } },
      },
      message: /Message Start capability must contain exactly its public fields/u,
    },
  ];

  for (const { value, message } of malformed) {
    assert.throws(() => decodePutMessageStartPublicationRequest(value), message);
  }
});

test("decodes pending, accepted, and indeterminate publications", () => {
  const publications = [
    pending,
    {
      ...pending,
      status: MessageStartPublicationStatus.Accepted,
      instance: {
        processInstanceId: "process-instance-42",
        definition,
      },
    },
    {
      ...pending,
      status: MessageStartPublicationStatus.Indeterminate,
    },
  ] as const satisfies readonly MessageStartPublication[];

  for (const publication of publications) {
    const decoded = decodeMessageStartPublication(publication);
    assert.deepEqual(decoded, publication);
    assert.notStrictEqual(decoded, publication);
    assert.notStrictEqual(decoded.definition, publication.definition);
    assert.notStrictEqual(decoded.messageStart, publication.messageStart);
  }
});

test("rejects private host identity at every publication level", () => {
  assert.throws(
    () => decodeMessageStartPublication({ ...pending, workflowId: "private-workflow" }),
    /message-start publication must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeMessageStartPublication({ ...pending, firstExecutionRunId: "private-run" }),
    /message-start publication must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeMessageStartPublication({
      ...pending,
      status: MessageStartPublicationStatus.Accepted,
      instance: {
        processInstanceId: "process-instance-42",
        definition,
        firstExecutionRunId: "private-run",
      },
    }),
    /instance must contain exactly its public fields/u,
  );
});

test("enforces exact status-to-instance mappings", () => {
  const malformed = [
    {
      value: { ...pending, status: MessageStartPublicationStatus.Accepted },
      message: /accepted publication.instance must be a public Process-instance identity/u,
    },
    {
      value: {
        ...pending,
        instance: { processInstanceId: "process-instance-42", definition },
      },
      message: /pending publication.instance must be null/u,
    },
    {
      value: {
        ...pending,
        status: MessageStartPublicationStatus.Indeterminate,
        instance: { processInstanceId: "process-instance-42", definition },
      },
      message: /indeterminate publication.instance must be null/u,
    },
    {
      value: { ...pending, status: "integrityFailure" },
      message: /status is not a public publication status/u,
    },
  ];

  for (const { value, message } of malformed) {
    assert.throws(() => decodeMessageStartPublication(value), message);
  }
});

test("requires the selected complete capability exactly once", () => {
  const changedOperation = {
    ...messageStart,
    channel: {
      ...messageStart.channel,
      interfaceOperationId: "cancelOrder",
    },
  };

  assert.throws(
    () => decodeMessageStartPublication({ ...pending, messageStart: changedOperation }),
    /messageStart must be published exactly once by definition.startCapabilities/u,
  );
  assert.throws(
    () => decodeMessageStartPublication({
      ...pending,
      definition: {
        ...definition,
        startCapabilities: {
          ...definition.startCapabilities,
          messageStarts: [messageStart, messageStart],
        },
      },
    }),
    /messageStart must be published exactly once by definition.startCapabilities/u,
  );
});

test("requires an accepted instance to repeat the exact deployed definition", () => {
  const changedDefinition = {
    ...definition,
    startCapabilities: {
      ...definition.startCapabilities,
      messageStarts: [{
        ...messageStart,
        channel: {
          ...messageStart.channel,
          interfaceOperationId: "cancelOrder",
        },
      }],
    },
  };

  assert.throws(
    () => decodeMessageStartPublication({
      ...pending,
      status: MessageStartPublicationStatus.Accepted,
      instance: {
        processInstanceId: "process-instance-42",
        definition: changedDefinition,
      },
    }),
    /instance.definition must equal definition/u,
  );
});

test("builds and matches the global publication item route", () => {
  const path = messageStartPublicationPath("publication/alpha β");

  assert.equal(
    path,
    "/api/v1/message-start-publications/publication%2Falpha%20%CE%B2",
  );
  assert.deepEqual(matchMessageStartPublicationPath(path), {
    publicationId: "publication/alpha β",
  });
  assert.equal(matchMessageStartPublicationPath(`${path}/`), null);
  assert.equal(matchMessageStartPublicationPath("/api/v1/message-start-publications"), null);
  assert.equal(matchMessageStartPublicationPath("/api/v1/definitions/publication"), null);
});

test("rejects empty, malformed, and non-segment route identities", () => {
  assert.throws(
    () => messageStartPublicationPath(""),
    /publicationId must not be empty/u,
  );
  assert.throws(
    () => messageStartPublicationPath("\uD800"),
    /publicationId must contain well-formed Unicode/u,
  );
  assert.throws(
    () => matchMessageStartPublicationPath(
      "/api/v1/message-start-publications/%E0%A4%A",
    ),
    /publicationId segment must be valid URI encoding/u,
  );
  assert.equal(
    matchMessageStartPublicationPath(
      "/api/v1/message-start-publications/publication/alpha",
    ),
    null,
  );
});
