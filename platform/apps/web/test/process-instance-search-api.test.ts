import assert from "node:assert/strict";
import { test } from "node:test";

import { PublicApiErrorCode } from "@bpmn-lean/platform-contracts";
import type {
  ProcessInstanceSearchPage,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import {
  ProcessInstanceSearchApiClient,
} from "../src/process-instance-search-api.ts";
import {
  DefinitionApiError,
  DefinitionProtocolError,
} from "../src/definitions-api.ts";

const definition = {
  processId: "Process_Order",
  version: 3,
  source: {
    kind: "bpmnSource",
    id: "orders.bpmn",
    sha256: "d".repeat(64),
    byteLength: 4096,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "cib-seven-2.2.0:message-start",
  startCapabilities: {
    messageStarts: [],
    timerStarts: [],
  },
} as const;

const instance = {
  processInstanceId: "process-instance/42",
  definition,
} as const satisfies PublicProcessInstanceIdentity;

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function createClient(fetcher: typeof fetch): ProcessInstanceSearchApiClient {
  return new ProcessInstanceSearchApiClient("https://platform.test/ignored", fetcher);
}

test("rejects a result whose source digest drifts from an exact digest filter", async () => {
  const client = createClient(async () => jsonResponse(200, {
    instances: [{
      ...instance,
      definition: {
        ...definition,
        source: { ...definition.source, sha256: "e".repeat(64) },
      },
    }],
    nextCursor: null,
  }));

  await assert.rejects(
    client.search({
      processId: definition.processId,
      version: definition.version,
      sourceSha256: definition.source.sha256,
    }),
    (error: unknown) => error instanceof DefinitionProtocolError &&
      /sourceSha256 filter/u.test(error.message),
  );
});

test("rejects every exact-filter mismatch", async () => {
  const cases = [
    {
      label: "Process-instance ID",
      request: { processInstanceId: "process-instance/other" },
      message: /processInstanceId filter/u,
    },
    {
      label: "Process ID",
      request: { processId: "Process_Other" },
      message: /processId filter/u,
    },
    {
      label: "version",
      request: { version: 4 },
      message: /version filter/u,
    },
  ] as const;

  for (const item of cases) {
    const client = createClient(async () => jsonResponse(200, {
      instances: [instance],
      nextCursor: null,
    }));
    await assert.rejects(
      client.search(item.request),
      (error: unknown) => error instanceof DefinitionProtocolError &&
        item.message.test(error.message),
      item.label,
    );
  }
});

test("rejects private fields recursively through the public page decoder", async () => {
  const privatePage = {
    instances: [{
      ...instance,
      definition: {
        ...definition,
        source: { ...definition.source, workflowId: "private-workflow" },
      },
    }],
    nextCursor: null,
  };
  const client = createClient(async () => jsonResponse(200, privatePage));

  await assert.rejects(
    client.search({}),
    (error: unknown) => error instanceof DefinitionProtocolError &&
      /violates the public contract/u.test(error.message),
  );
});

test("rejects duplicate Process-instance IDs within and across pages", async () => {
  const withinPage = createClient(async () => jsonResponse(200, {
    instances: [instance, instance],
    nextCursor: null,
  }));
  await assert.rejects(
    withinPage.search({}),
    (error: unknown) => error instanceof DefinitionProtocolError &&
      /duplicate Process-instance ID/u.test(error.message),
  );

  const acrossPages = createClient(async () => jsonResponse(200, {
    instances: [instance],
    nextCursor: null,
  }));
  await assert.rejects(
    acrossPages.loadMore(
      { processId: definition.processId },
      "v1.NDE",
      new Set([instance.processInstanceId]),
    ),
    (error: unknown) => error instanceof DefinitionProtocolError &&
      /already accumulated/u.test(error.message),
  );
});

test("preserves all exact filters and the returned cursor in the next-page URL", async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const client = createClient(async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return jsonResponse(200, { instances: [], nextCursor: null });
  });

  const page = await client.loadMore({
    processInstanceId: instance.processInstanceId,
    processId: definition.processId,
    version: definition.version,
    sourceSha256: definition.source.sha256,
    limit: 25,
  }, "v1.NDE", new Set());

  assert.deepEqual(page, { instances: [], nextCursor: null });
  assert.equal(
    capturedUrl,
    `https://platform.test/api/v1/process-instances?processInstanceId=process-instance%2F42&processId=Process_Order&version=3&sourceSha256=${"d".repeat(64)}&cursor=v1.NDE&limit=25`,
  );
  assert.equal(capturedInit?.method, undefined);
  assert.equal(new Headers(capturedInit?.headers).get("accept"), "application/json");
});

test("snapshots and strictly decodes caller filters before the asynchronous response", async () => {
  const request: { processId: string; version: number } = {
    processId: definition.processId,
    version: definition.version,
  };
  const release = Promise.withResolvers<void>();
  let capturedUrl: string | undefined;
  const client = createClient(async (input) => {
    capturedUrl = String(input);
    await release.promise;
    return jsonResponse(200, { instances: [instance], nextCursor: null });
  });

  const pending = client.search(request);
  request.processId = "Process_Mutated";
  request.version = 99;
  release.resolve();

  assert.deepEqual(await pending, { instances: [instance], nextCursor: null });
  assert.equal(
    capturedUrl,
    "https://platform.test/api/v1/process-instances?processId=Process_Order&version=3",
  );
  await assert.rejects(
    client.search({ processId: definition.processId, version: 0 }),
    /positive safe integer/u,
  );
});

test("accepts only HTTP 200 JSON and canonical public API errors", async () => {
  const validPage = {
    instances: [instance],
    nextCursor: null,
  } as const satisfies ProcessInstanceSearchPage;
  const cases: ReadonlyArray<Readonly<{
    label: string;
    response: Response;
  }>> = [
    {
      label: "unexpected success status",
      response: jsonResponse(201, validPage),
    },
    {
      label: "wrong media type",
      response: new Response(JSON.stringify(validPage), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    },
    {
      label: "malformed JSON",
      response: new Response("{", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    },
    {
      label: "malformed API error",
      response: jsonResponse(500, { message: "private failure" }),
    },
  ];

  for (const item of cases) {
    const client = createClient(async () => item.response.clone());
    await assert.rejects(
      client.search({}),
      DefinitionProtocolError,
      item.label,
    );
  }

  const missing = createClient(async () => jsonResponse(404, {
    error: {
      code: PublicApiErrorCode.NotFound,
      message: "No matching Process instance.",
    },
  }));
  await assert.rejects(
    missing.search({ processInstanceId: "missing" }),
    (error: unknown) => error instanceof DefinitionApiError &&
      error.status === 404 && error.code === PublicApiErrorCode.NotFound,
  );
});
