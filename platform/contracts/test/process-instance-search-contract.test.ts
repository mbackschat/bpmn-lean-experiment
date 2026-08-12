import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeProcessInstanceSearchPage,
  decodeProcessInstanceSearchRequest,
  matchProcessInstancesPath,
  processInstancesPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ProcessInstanceSearchPage,
  ProcessInstanceSearchRequest,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

const messageStart = {
  startEventId: "MessageStart_1",
  channel: {
    kind: "operationMessage",
    interfaceId: "OrderInterface",
    interfaceOperationId: "submitOrder",
    messageId: "OrderSubmitted",
  },
} as const;

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
    timerStarts: [{ startEventId: "TimerStart_1", durationMs: 1000 }],
  },
} as const satisfies DeployedDefinitionVersion;

const instance = {
  processInstanceId: "process-instance/42",
  definition,
} as const satisfies PublicProcessInstanceIdentity;

test("decodes a closed page while preserving identity multiplicity and order", () => {
  const changedOperation = {
    ...instance,
    processInstanceId: "process-instance/41",
    definition: {
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
    },
  } as const satisfies PublicProcessInstanceIdentity;
  const input = {
    instances: [instance, instance, changedOperation],
    nextCursor: "v1.NDE",
  } as const satisfies ProcessInstanceSearchPage;

  const decoded = decodeProcessInstanceSearchPage(input);

  assert.deepEqual(decoded, input);
  assert.notStrictEqual(decoded, input);
  assert.notStrictEqual(decoded.instances, input.instances);
  assert.notStrictEqual(decoded.instances[0], input.instances[0]);
  assert.equal(decoded.instances.length, 3);
  assert.equal(
    decoded.instances[2]?.definition.startCapabilities.messageStarts[0]?.channel
      .interfaceOperationId,
    "cancelOrder",
  );
});

test("rejects private fields recursively instead of stripping them", () => {
  const privatePages = [
    { instances: [{ ...instance, workflowId: "private-workflow" }], nextCursor: null },
    {
      instances: [{
        ...instance,
        definition: { ...definition, firstExecutionRunId: "private-run" },
      }],
      nextCursor: null,
    },
    {
      instances: [{
        ...instance,
        definition: {
          ...definition,
          startCapabilities: {
            ...definition.startCapabilities,
            messageStarts: [{
              ...messageStart,
              channel: { ...messageStart.channel, taskQueue: "private" },
            }],
          },
        },
      }],
      nextCursor: null,
    },
    { instances: [instance], nextCursor: null, ordinal: 42 },
  ];

  for (const privatePage of privatePages) {
    assert.throws(
      () => decodeProcessInstanceSearchPage(privatePage),
      /must contain exactly its public fields/u,
    );
  }
});

test("rejects missing, malformed, unsafe, and unknown page fields", () => {
  const malformedPages = [
    { value: { nextCursor: null }, message: /search page must contain exactly/u },
    { value: { instances: {}, nextCursor: null }, message: /instances must be an array/u },
    {
      value: { instances: [instance], nextCursor: "ordinal:42" },
      message: /nextCursor must be an opaque versioned cursor/u,
    },
    {
      value: { instances: [instance], nextCursor: "v1.padding=" },
      message: /nextCursor must be an opaque versioned cursor/u,
    },
    {
      value: { instances: new Array<unknown>(1), nextCursor: null },
      message: /instances\[0\] must be an object/u,
    },
  ];

  for (const { value, message } of malformedPages) {
    assert.throws(() => decodeProcessInstanceSearchPage(value), message);
  }
});

test("decodes only the exact optional search filters", () => {
  const request = {
    processInstanceId: "process-instance/42",
    processId: "order/process alpha",
    version: 2,
    sourceSha256: "e".repeat(64),
    cursor: "v1.NDE",
    limit: 100,
  } as const satisfies ProcessInstanceSearchRequest;

  assert.deepEqual(decodeProcessInstanceSearchRequest(request), request);
  assert.deepEqual(decodeProcessInstanceSearchRequest({}), {});
  assert.throws(
    () => decodeProcessInstanceSearchRequest({ ...request, status: "running" }),
    /search request contains an unknown field/u,
  );
  assert.throws(
    () => decodeProcessInstanceSearchRequest({ ...request, processId: "" }),
    /processId must not be empty/u,
  );
  assert.throws(
    () => decodeProcessInstanceSearchRequest({ ...request, version: 0 }),
    /version must be a positive safe integer/u,
  );
  assert.throws(
    () => decodeProcessInstanceSearchRequest({ ...request, sourceSha256: "E".repeat(64) }),
    /sourceSha256 must be a lowercase SHA-256 digest/u,
  );
  assert.throws(
    () => decodeProcessInstanceSearchRequest({ ...request, limit: 101 }),
    /limit must be an integer from 1 through 100/u,
  );
});

test("builds and matches the strict global search route", () => {
  const request = {
    processInstanceId: "process-instance/42",
    processId: "order/process alpha",
    version: 2,
    sourceSha256: "e".repeat(64),
    cursor: "v1.NDE",
    limit: 25,
  } as const satisfies ProcessInstanceSearchRequest;
  const path = processInstancesPath(request);

  assert.equal(
    path,
    `/api/v1/process-instances?processInstanceId=process-instance%2F42&processId=order%2Fprocess%20alpha&version=2&sourceSha256=${"e".repeat(64)}&cursor=v1.NDE&limit=25`,
  );
  assert.deepEqual(matchProcessInstancesPath(path), request);
  assert.equal(processInstancesPath(), "/api/v1/process-instances");
  assert.deepEqual(matchProcessInstancesPath("/api/v1/process-instances"), {
    limit: 50,
  });
  assert.equal(matchProcessInstancesPath("/api/v1/process-instances/"), null);
  assert.equal(matchProcessInstancesPath("/api/v1/definitions"), null);
});

test("rejects duplicate, unknown, malformed, and noncanonical query values", () => {
  const malformed = [
    "/api/v1/process-instances?processId=orders&processId=returns",
    "/api/v1/process-instances?processId=orders&process%49d=returns",
    "/api/v1/process-instances?status=running",
    "/api/v1/process-instances?processId=%E0%A4%A",
    "/api/v1/process-instances?version=02",
    "/api/v1/process-instances?version=9007199254740992",
    "/api/v1/process-instances?sourceSha256=ABC123",
    "/api/v1/process-instances?cursor=v1.padding%3D",
    "/api/v1/process-instances?limit=0",
    "/api/v1/process-instances?limit=101",
    "/api/v1/process-instances?",
  ];

  for (const path of malformed) {
    assert.throws(() => matchProcessInstancesPath(path), TypeError);
  }
});
