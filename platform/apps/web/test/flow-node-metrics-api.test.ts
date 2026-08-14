import assert from "node:assert/strict";
import test from "node:test";

import { PublicApiErrorCode } from "@bpmn-lean/platform-contracts";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

import {
  FlowNodeMetricsApiClient,
  FlowNodeMetricsApiError,
  FlowNodeMetricsProtocolError,
  FlowNodeMetricsResponseByteLimit,
} from "../src/flow-node-metrics-api.ts";

const definition = {
  processId: "Metrics/Process",
  version: 7,
  source: {
    kind: "bpmnSource",
    id: "metrics.bpmn",
    sha256: "a".repeat(64),
    byteLength: 512,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "metrics-profile",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

function availableResult() {
  return {
    kind: "available",
    snapshot: {
      definition,
      population: { processInstances: 3, label: "allRetainedEvidence" },
      flowNodes: [{
        elementId: "Task_A",
        frequency: 3,
        running: 1,
        completed: 2,
        cancelled: 0,
        completedDuration: {
          sampleCount: 2,
          minimumMs: 10,
          maximumMs: 21,
          averageMs: 15,
        },
      }],
    },
  } as const;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("performs one exact bodyless GET and strictly decodes its exact definition", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = new FlowNodeMetricsApiClient("https://platform.test/ignored", async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse(200, availableResult());
  });

  assert.deepEqual(await client.get(definition), availableResult());
  assert.equal(
    capturedUrl,
    "https://platform.test/api/v1/definitions/Metrics%2FProcess/versions/7/flow-node-metrics",
  );
  assert.equal(capturedInit?.method, "GET");
  assert.equal(capturedInit?.body, undefined);
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("content-type"), null);
});

test("rejects duplicate decoded keys and nested private fields before returning metrics", async () => {
  const duplicate = new FlowNodeMetricsApiClient("https://platform.test", async () =>
    new Response('{"kind":"unavailable","kind":"unavailable","reason":"flowNodeMetricsUnavailable"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  await assert.rejects(
    duplicate.get(definition),
    (error: unknown) => error instanceof FlowNodeMetricsProtocolError && /malformed JSON/u.test(error.message),
  );

  const privateField = structuredClone(availableResult()) as Record<string, unknown>;
  const snapshot = privateField.snapshot as Record<string, unknown>;
  const metrics = snapshot.flowNodes as Array<Record<string, unknown>>;
  metrics[0]!.privateWorkflowId = "private";
  const privateClient = new FlowNodeMetricsApiClient(
    "https://platform.test",
    async () => jsonResponse(200, privateField),
  );
  await assert.rejects(
    privateClient.get(definition),
    (error: unknown) => error instanceof FlowNodeMetricsProtocolError && /public contract/u.test(error.message),
  );
});

test("rejects identity drift, wrong media and status, and oversized bytes", async () => {
  const drifted = availableResult();
  const driftClient = new FlowNodeMetricsApiClient("https://platform.test", async () => jsonResponse(200, {
    ...drifted,
    snapshot: { ...drifted.snapshot, definition: { ...definition, version: 8 } },
  }));
  await assert.rejects(driftClient.get(definition), FlowNodeMetricsProtocolError);

  const mediaClient = new FlowNodeMetricsApiClient("https://platform.test", async () =>
    new Response(JSON.stringify(availableResult()), {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));
  await assert.rejects(mediaClient.get(definition), /unexpected media type/u);

  const statusClient = new FlowNodeMetricsApiClient(
    "https://platform.test",
    async () => jsonResponse(201, availableResult()),
  );
  await assert.rejects(statusClient.get(definition), /unexpected HTTP status/u);

  const oversizedClient = new FlowNodeMetricsApiClient("https://platform.test", async () =>
    new Response(new Uint8Array(FlowNodeMetricsResponseByteLimit + 1), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  await assert.rejects(oversizedClient.get(definition), /byte limit/u);
});

test("accepts only the approved public error code and status pairs", async () => {
  const notFound = new FlowNodeMetricsApiClient("https://platform.test", async () => jsonResponse(404, {
    error: { code: PublicApiErrorCode.NotFound, message: "No exact definition." },
  }));
  await assert.rejects(
    notFound.get(definition),
    (error: unknown) => error instanceof FlowNodeMetricsApiError &&
      error.status === 404 && error.code === PublicApiErrorCode.NotFound,
  );

  const mismatched = new FlowNodeMetricsApiClient("https://platform.test", async () => jsonResponse(404, {
    error: {
      code: PublicApiErrorCode.FlowNodeMetricsUnavailable,
      message: "Flow-node metrics are unavailable.",
    },
  }));
  await assert.rejects(mismatched.get(definition), FlowNodeMetricsProtocolError);
});
