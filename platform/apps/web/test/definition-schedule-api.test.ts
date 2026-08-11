import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DefinitionScheduleStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionSchedule,
  DeployedDefinitionVersion,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionScheduleApiClient,
} from "../src/definition-schedule-api.ts";
import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "../src/definitions-api.ts";

const definition = {
  processId: "Process_Timer",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "timer.bpmn",
    sha256: "d".repeat(64),
    byteLength: 2048,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "timer-start-event-draft",
  startCapabilities: {
    messageStarts: [],
    timerStarts: [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }],
  },
} as const satisfies DeployedDefinitionVersion;

const messageDefinition = {
  ...definition,
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
    timerStarts: definition.startCapabilities.timerStarts,
  },
} as const satisfies DeployedDefinitionVersion;

const scheduled = {
  scheduleId: "f7d7b521-a8b8-4fcf-86f9-bd3957c74d12",
  definition,
  timerStart: definition.startCapabilities.timerStarts[0],
  activationAt: "2026-08-11T12:00:00.000Z",
  dueAt: "2026-08-11T12:00:01.000Z",
  status: DefinitionScheduleStatus.Scheduled,
  instance: null,
} as const satisfies DefinitionSchedule;

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function createClient(
  fetcher: typeof fetch,
  baseUrl = "https://platform.test/",
): DefinitionScheduleApiClient {
  return new DefinitionScheduleApiClient(baseUrl, fetcher);
}

test("creates one exact-version schedule from snapshotted public input", async () => {
  const mutableDefinition = structuredClone(definition);
  const request: { activationAt: string } = { activationAt: scheduled.activationAt };
  const release = Promise.withResolvers<void>();
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const client = createClient(
    async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      await release.promise;
      return jsonResponse(201, scheduled);
    },
    "https://platform.test/ignored/",
  );

  const pending = client.create(mutableDefinition, scheduled.scheduleId, request);
  Object.assign(mutableDefinition, {
    processId: "Process_Mutated",
    version: 99,
  });
  request.activationAt = "2030-01-01T00:00:00.000Z";
  release.resolve();

  assert.deepEqual(await pending, scheduled);
  assert.equal(
    capturedUrl,
    `https://platform.test/api/v1/definitions/Process_Timer/versions/2/schedules/${scheduled.scheduleId}`,
  );
  assert.equal(capturedInit?.method, "PUT");
  assert.equal(new Headers(capturedInit?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    activationAt: scheduled.activationAt,
  });
});

test("rejects item and list responses whose exact public identities drift", async () => {
  const cases: ReadonlyArray<Readonly<{
    label: string;
    invoke(client: DefinitionScheduleApiClient): Promise<unknown>;
    response: unknown;
  }>> = [
    {
      label: "schedule ID",
      invoke: (client) => client.get(definition, scheduled.scheduleId),
      response: { ...scheduled, scheduleId: "another-schedule" },
    },
    {
      label: "Process ID",
      invoke: (client) => client.get(definition, scheduled.scheduleId),
      response: {
        ...scheduled,
        definition: { ...definition, processId: "Process_Other" },
      },
    },
    {
      label: "version",
      invoke: (client) => client.get(definition, scheduled.scheduleId),
      response: {
        ...scheduled,
        definition: { ...definition, version: 3 },
      },
    },
    {
      label: "list definition",
      invoke: (client) => client.list(definition),
      response: {
        definition: { ...definition, version: 3 },
        schedules: [],
      },
    },
    {
      label: "Message Start operation",
      invoke: (client) => client.get(messageDefinition, scheduled.scheduleId),
      response: {
        ...scheduled,
        definition: {
          ...messageDefinition,
          startCapabilities: {
            ...messageDefinition.startCapabilities,
            messageStarts: [{
              ...messageDefinition.startCapabilities.messageStarts[0],
              channel: {
                ...messageDefinition.startCapabilities.messageStarts[0].channel,
                interfaceOperationId: "receiveChangedOrder",
              },
            }],
          },
        },
      },
    },
    {
      label: "repeated definition",
      invoke: (client) => client.list(definition),
      response: {
        definition,
        schedules: [{
          ...scheduled,
          definition: { ...definition, source: { ...definition.source, sha256: "e".repeat(64) } },
        }],
      },
    },
  ];

  for (const item of cases) {
    const client = createClient(async () => jsonResponse(200, item.response));
    await assert.rejects(
      item.invoke(client),
      (error: unknown) => error instanceof DefinitionProtocolError,
      item.label,
    );
  }
});

test("rejects private host identities through the strict schedule decoder", async () => {
  for (const response of [
    { ...scheduled, workflowId: "private-workflow" },
    {
      ...scheduled,
      status: DefinitionScheduleStatus.Started,
      instance: {
        processInstanceId: "instance-1",
        definition,
        firstExecutionRunId: "private-run",
      },
    },
  ]) {
    const client = createClient(async () => jsonResponse(200, response));
    await assert.rejects(
      client.get(definition, scheduled.scheduleId),
      (error: unknown) => error instanceof DefinitionProtocolError,
    );
  }
});

test("uses exact list, get, and cancellation routes and statuses", async () => {
  const cancelled = {
    ...scheduled,
    status: DefinitionScheduleStatus.Cancelled,
  } as const;
  const calls: Array<Readonly<{ url: string; method: string }>> = [];
  const responses = [
    jsonResponse(200, { definition, schedules: [scheduled] }),
    jsonResponse(200, scheduled),
    jsonResponse(200, cancelled),
  ];
  const client = createClient(
    async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      const response = responses.shift();
      assert.ok(response);
      return response;
    },
  );

  assert.deepEqual(await client.list(definition), {
    definition,
    schedules: [scheduled],
  });
  assert.deepEqual(await client.get(definition, scheduled.scheduleId), scheduled);
  assert.deepEqual(await client.cancel(definition, scheduled.scheduleId), cancelled);
  assert.deepEqual(calls, [
    {
      url: "https://platform.test/api/v1/definitions/Process_Timer/versions/2/schedules",
      method: "GET",
    },
    {
      url: `https://platform.test/api/v1/definitions/Process_Timer/versions/2/schedules/${scheduled.scheduleId}`,
      method: "GET",
    },
    {
      url: `https://platform.test/api/v1/definitions/Process_Timer/versions/2/schedules/${scheduled.scheduleId}`,
      method: "DELETE",
    },
  ]);
});

test("accepts only documented success statuses and reuses public API failures", async () => {
  const unexpected = createClient(async () => jsonResponse(202, scheduled));
  await assert.rejects(
    unexpected.get(definition, scheduled.scheduleId),
    (error: unknown) => error instanceof DefinitionProtocolError,
  );

  const missing = createClient(
    async () => jsonResponse(404, {
      error: { code: PublicApiErrorCode.NotFound, message: "Missing schedule." },
    }),
  );
  await assert.rejects(
    missing.get(definition, scheduled.scheduleId),
    (error: unknown) => error instanceof DefinitionApiError &&
      error.status === 404 && error.code === PublicApiErrorCode.NotFound,
  );

  const invalidDelete = createClient(async () => jsonResponse(200, scheduled));
  await assert.rejects(
    invalidDelete.cancel(definition, scheduled.scheduleId),
    (error: unknown) => error instanceof DefinitionProtocolError &&
      /cancelled/u.test(error.message),
  );
});
