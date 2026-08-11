import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  ProcessInstanceStartStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionApiClient,
  DefinitionApiError,
  DefinitionProtocolError,
} from "../src/definitions-api.ts";

const encoder = new TextEncoder();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function deployedResult(bytes: Uint8Array) {
  return {
    status: "deployed",
    definition: {
      processId: "Process_Upload",
      version: 2,
      source: {
        kind: "bpmnSource",
        id: "upload & review.bpmn",
        sha256: sha256(bytes),
        byteLength: bytes.byteLength,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "profile/portable",
      startCapabilities: {
        messageStarts: [],
        timerStarts: [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }],
      },
    },
  } as const;
}

function jsonResponse(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("encodes deployment metadata and snapshots exact bytes before fetch can yield", async () => {
  const original = encoder.encode("<definitions id=\"original\"/>");
  const expectedBytes = original.slice();
  const release = Promise.withResolvers<void>();
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    await release.promise;
    return jsonResponse(201, deployedResult(expectedBytes));
  };
  const client = new DefinitionApiClient("https://platform.test/base/", fetcher);

  const pending = client.deploy({
    bytes: original,
    sourceId: "upload & review.bpmn",
    semanticProfile: "profile/portable",
  });
  original.fill(120);
  release.resolve();

  assert.deepEqual(await pending, deployedResult(expectedBytes));
  assert.equal(
    capturedUrl,
    "https://platform.test/api/v1/definitions?sourceId=upload+%26+review.bpmn&semanticProfile=profile%2Fportable",
  );
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(
    new Uint8Array(await new Response(capturedInit?.body).arrayBuffer()),
    expectedBytes,
  );
  assert.equal(new Headers(capturedInit?.headers).get("content-type"), "application/bpmn+xml");
});

test("retains the browser receiver when using the ambient fetch implementation", async () => {
  const originalFetch = globalThis.fetch;
  const bytes = encoder.encode("<definitions id=\"receiver\"/>");
  const responses = [
    jsonResponse(200, { definitions: [] }),
    jsonResponse(201, deployedResult(bytes)),
  ];
  globalThis.fetch = async function browserFetch(this: typeof globalThis): Promise<Response> {
    assert.equal(this, globalThis);
    const response = responses.shift();
    assert.ok(response);
    return response;
  } as typeof fetch;

  try {
    const client = new DefinitionApiClient("https://platform.test/");
    assert.deepEqual(await client.listDefinitions(), { definitions: [] });
    assert.deepEqual(
      await client.deploy({ bytes, sourceId: "receiver.bpmn", semanticProfile: "profile" }),
      deployedResult(bytes),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses public routes and rejects source bytes that drift from deployed identity", async () => {
  const exactBytes = encoder.encode("<definitions id=\"exact\"/>");
  const deployed = deployedResult(exactBytes).definition;
  const calls: string[] = [];
  const responses = [
    jsonResponse(200, { definitions: [deployed] }),
    jsonResponse(200, { processId: deployed.processId, versions: [deployed] }),
    new Response(exactBytes, {
      status: 200,
      headers: {
        "content-type": "application/xml",
        etag: `"sha256-${deployed.source.sha256}"`,
      },
    }),
  ];
  const fetcher: typeof fetch = async (input) => {
    calls.push(String(input));
    const response = responses.shift();
    assert.ok(response);
    return response;
  };
  const client = new DefinitionApiClient("https://platform.test/", fetcher);

  assert.deepEqual(await client.listDefinitions(), { definitions: [deployed] });
  assert.deepEqual(await client.listVersions(deployed.processId), {
    processId: deployed.processId,
    versions: [deployed],
  });
  assert.deepEqual(await client.getSource(deployed), exactBytes);
  assert.deepEqual(calls, [
    "https://platform.test/api/v1/definitions",
    "https://platform.test/api/v1/definitions/Process_Upload/versions",
    "https://platform.test/api/v1/definitions/Process_Upload/versions/2/source",
  ]);

  const corruptClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => new Response(encoder.encode("different"), {
      status: 200,
      headers: {
        "content-type": "application/xml",
        etag: `"sha256-${deployed.source.sha256}"`,
      },
    }),
  );
  await assert.rejects(
    corruptClient.getSource(deployed),
    (error: unknown) => error instanceof DefinitionProtocolError && /byte length/u.test(error.message),
  );
});

test("starts the selected exact version and rejects response identity drift", async () => {
  const bytes = encoder.encode("<definitions id=\"start\"/>");
  const definition = structuredClone(deployedResult(bytes).definition);
  const expectedDefinition = structuredClone(definition);
  const release = Promise.withResolvers<void>();
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    await release.promise;
    return jsonResponse(201, {
      status: ProcessInstanceStartStatus.Started,
      instance: {
        processInstanceId: "instance/start-001",
        definition: expectedDefinition,
      },
    });
  };
  const client = new DefinitionApiClient("https://platform.test/ignored/", fetcher);

  const pending = client.start(definition);
  Object.assign(definition, { processId: "Process_Mutated", version: 99 });
  Object.assign(definition.source, { sha256: "f".repeat(64) });
  release.resolve();

  assert.deepEqual(await pending, {
    status: ProcessInstanceStartStatus.Started,
    instance: {
      processInstanceId: "instance/start-001",
      definition: expectedDefinition,
    },
  });
  assert.equal(
    capturedUrl,
    "https://platform.test/api/v1/definitions/Process_Upload/versions/2/start",
  );
  assert.equal(capturedInit?.method, "POST");
  assert.equal(new Headers(capturedInit?.headers).get("accept"), "application/json");
  assert.equal(new Headers(capturedInit?.headers).get("content-type"), null);
  assert.equal(capturedInit?.body, undefined);

  const driftedClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse(201, {
      status: ProcessInstanceStartStatus.Started,
      instance: {
        processInstanceId: "instance/start-002",
        definition: { ...expectedDefinition, version: 3 },
      },
    }),
  );
  await assert.rejects(
    driftedClient.start(expectedDefinition),
    (error: unknown) =>
      error instanceof DefinitionProtocolError && /requested definition identity/u.test(error.message),
  );

  const capabilityDriftClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse(201, {
      status: ProcessInstanceStartStatus.Started,
      instance: {
        processInstanceId: "instance/start-003",
        definition: {
          ...expectedDefinition,
          startCapabilities: {
            messageStarts: [],
            timerStarts: [{ startEventId: "TimerStart_Drift", durationMs: 1_000 }],
          },
        },
      },
    }),
  );
  await assert.rejects(
    capabilityDriftClient.start(expectedDefinition),
    (error: unknown) =>
      error instanceof DefinitionProtocolError && /requested definition identity/u.test(error.message),
  );

  const messageDefinition = {
    ...expectedDefinition,
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
      timerStarts: expectedDefinition.startCapabilities.timerStarts,
    },
  } as const;
  const messageOperationDriftClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse(201, {
      status: ProcessInstanceStartStatus.Started,
      instance: {
        processInstanceId: "instance/start-004",
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
    }),
  );
  await assert.rejects(
    messageOperationDriftClient.start(messageDefinition),
    (error: unknown) =>
      error instanceof DefinitionProtocolError && /requested definition identity/u.test(error.message),
  );
});

test("accepts closed start rejection and rejects private or status-inconsistent results", async () => {
  const bytes = encoder.encode("<definitions id=\"rejected-start\"/>");
  const definition = deployedResult(bytes).definition;
  const rejection = {
    status: ProcessInstanceStartStatus.Rejected,
    definition,
    failure: {
      code: "unsupportedStart",
      evidence: "The exact stored definition cannot be started.",
    },
  } as const;
  const rejectedClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse(422, rejection),
  );
  assert.deepEqual(await rejectedClient.start(definition), rejection);

  for (const [status, value] of [
    [201, rejection],
    [422, {
      status: ProcessInstanceStartStatus.Started,
      instance: { processInstanceId: "instance/status-drift", definition },
    }],
    [201, {
      status: ProcessInstanceStartStatus.Started,
      instance: {
        processInstanceId: "instance/private-field",
        definition,
        workflowHandle: { workflowId: "private" },
      },
    }],
  ] as const) {
    const client = new DefinitionApiClient(
      "https://platform.test/",
      async () => jsonResponse(status, value),
    );
    await assert.rejects(client.start(definition), DefinitionProtocolError);
  }
});

test("rejects private response fields and preserves closed public API errors", async () => {
  const bytes = encoder.encode("<definitions/>");
  const leaked = {
    ...deployedResult(bytes),
    definition: {
      ...deployedResult(bytes).definition,
      semanticProcess: { operations: [] },
    },
  };
  const malformedClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse(201, leaked),
  );
  await assert.rejects(
    malformedClient.deploy({ bytes, sourceId: "source", semanticProfile: "profile" }),
    DefinitionProtocolError,
  );

  const missingClient = new DefinitionApiClient(
    "https://platform.test/",
    async () => jsonResponse(404, {
      error: {
        code: PublicApiErrorCode.NotFound,
        message: "The definition version was not found.",
      },
    }),
  );
  await assert.rejects(
    missingClient.getSource(deployedResult(bytes).definition),
    (error: unknown) =>
      error instanceof DefinitionApiError &&
      error.code === PublicApiErrorCode.NotFound &&
      error.status === 404,
  );
});
