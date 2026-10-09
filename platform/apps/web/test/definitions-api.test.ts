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
      sourceOverlay: null,
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

test("captures an explicit overlay triple in native multipart without rewriting its bytes", async () => {
  const bytes = encoder.encode("<definitions id=\"overlay\"/>");
  const overlayBytes = encoder.encode('{ "id": "not-the-selected-id", "spacing": [ 1, 2 ] }\n');
  const expectedOverlayBytes = overlayBytes.slice();
  const overlay = { id: "literal overlay 🚀", sha256: sha256(overlayBytes), bytes: overlayBytes };
  const expectedOverlay = { id: overlay.id, sha256: overlay.sha256 };
  const input = { bytes, sourceId: "explicit.bpmn", semanticProfile: "explicit-profile", sourceOverlay: overlay };
  const release = Promise.withResolvers<void>();
  let captured: RequestInit | undefined;
  const client = new DefinitionApiClient("https://platform.test/", async (_url, init) => {
    captured = init;
    await release.promise;
    return jsonResponse(201, {
      ...deployedResult(bytes),
      definition: { ...deployedResult(bytes).definition, sourceOverlay: expectedOverlay },
    });
  });

  const pending = client.deploy(input);
  overlayBytes.fill(0);
  overlay.id = "changed";
  overlay.sha256 = "f".repeat(64);
  release.resolve();
  await pending;

  assert.ok(captured?.body instanceof FormData);
  assert.equal(new Headers(captured.headers).get("content-type"), null);
  assert.deepEqual([...captured.body.keys()], ["bpmn", "sourceOverlay", "sourceOverlayId", "sourceOverlaySha256"]);
  const id = captured.body.get("sourceOverlayId");
  assert.ok(id instanceof File);
  assert.equal(id.type, "text/plain");
  assert.equal(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await id.arrayBuffer()), expectedOverlay.id);
  assert.equal(captured.body.get("sourceOverlaySha256"), expectedOverlay.sha256);
  const uploaded = captured.body.get("sourceOverlay");
  assert.ok(uploaded instanceof File);
  assert.equal(uploaded.type, "application/json");
  assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), expectedOverlayBytes);
  const bpmn = captured.body.get("bpmn");
  assert.ok(bpmn instanceof File);
  assert.equal(bpmn.type, "application/bpmn+xml");
  assert.deepEqual(new Uint8Array(await bpmn.arrayBuffer()), bytes);
});

for (const [name, id] of [["bare LF", "literal\nID"], ["bare CR", "literal\rID"], ["paired CRLF", "literal\r\nID"]] as const) {
  test(`serialized deployment preserves an overlay ID containing ${name}`, async () => {
    const bytes = encoder.encode("<definitions>literal\r\nID</definitions>");
    const sourceOverlay = { id, sha256: "a".repeat(64), bytes: encoder.encode("{}") };
    let received: FormData | undefined;
    const client = new DefinitionApiClient("https://platform.test/", async (url, init) => {
      received = await new Request(String(url), init).formData();
      return jsonResponse(201, {
        ...deployedResult(bytes),
        definition: { ...deployedResult(bytes).definition, sourceOverlay: { id, sha256: sourceOverlay.sha256 } },
      });
    });
    await client.deploy({ bytes, sourceId: "literal.bpmn", semanticProfile: "profile", sourceOverlay });
    const transmittedId = received?.get("sourceOverlayId");
    assert.ok(transmittedId instanceof File);
    assert.equal(transmittedId.type, "text/plain");
    assert.equal(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await transmittedId.arrayBuffer()), id);
    assert.equal(received?.get("sourceOverlaySha256"), sourceOverlay.sha256);
    const bpmn = received?.get("bpmn");
    const overlay = received?.get("sourceOverlay");
    assert.ok(bpmn instanceof File);
    assert.ok(overlay instanceof File);
    assert.deepEqual(new Uint8Array(await bpmn.arrayBuffer()), bytes);
    assert.deepEqual(new Uint8Array(await overlay.arrayBuffer()), sourceOverlay.bytes);
  });
}

test("refuses invalid explicit overlay selections before sending a deployment", async () => {
  let requests = 0;
  const client = new DefinitionApiClient("https://platform.test/", async () => {
    requests += 1;
    return jsonResponse(201, deployedResult(encoder.encode("<definitions/>")));
  });
  const valid = { id: "literal", sha256: "a".repeat(64), bytes: encoder.encode("{}") };
  for (const sourceOverlay of [
    { ...valid, id: "" },
    { ...valid, id: "\ud800" },
    { ...valid, id: "🚀".repeat(257) },
    { ...valid, sha256: "A".repeat(64) },
    { ...valid, bytes: new Uint8Array() },
    { ...valid, bytes: new Uint8Array(65_537) },
  ]) {
    await assert.rejects(client.deploy({
      bytes: encoder.encode("<definitions/>"), sourceId: "literal.bpmn", semanticProfile: "profile", sourceOverlay,
    }), TypeError);
  }
  assert.equal(requests, 0);
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
  const command = {
    initialVariables: [{
      name: "DataObjectReference_InputItems",
      value: { kind: "stringList" as const, value: ["contract", "invoice", "receipt"] },
    }],
  };

  const pending = client.start(definition, command);
  Object.assign(definition, { processId: "Process_Mutated", version: 99 });
  Object.assign(definition.source, { sha256: "f".repeat(64) });
  command.initialVariables[0]!.value.value[0] = "mutated";
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
  assert.equal(new Headers(capturedInit?.headers).get("content-type"), "application/json");
  assert.equal(
    new TextDecoder().decode(new Uint8Array(capturedInit?.body as ArrayBuffer)),
    '{"initialVariables":[{"name":"DataObjectReference_InputItems","value":{"kind":"stringList","value":["contract","invoice","receipt"]}}]}',
  );

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
    driftedClient.start(expectedDefinition, { initialVariables: [] }),
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
    capabilityDriftClient.start(expectedDefinition, { initialVariables: [] }),
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
    messageOperationDriftClient.start(messageDefinition, { initialVariables: [] }),
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
  assert.deepEqual(
    await rejectedClient.start(definition, { initialVariables: [] }),
    rejection,
  );

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
    await assert.rejects(
      client.start(definition, { initialVariables: [] }),
      DefinitionProtocolError,
    );
  }
});

test("binds Start to the retained overlay digest even when its literal ID agrees", async () => {
  const bytes = encoder.encode("<definitions id=\"overlay-start\"/>");
  const definition = {
    ...deployedResult(bytes).definition,
    sourceOverlay: { id: "literal-policy", sha256: "a".repeat(64) },
  };
  const client = new DefinitionApiClient("https://platform.test/", async () => jsonResponse(201, {
    status: ProcessInstanceStartStatus.Started,
    instance: {
      processInstanceId: "overlay-instance",
      definition: { ...definition, sourceOverlay: { ...definition.sourceOverlay, sha256: "b".repeat(64) } },
    },
  }));
  await assert.rejects(client.start(definition, { initialVariables: [] }), DefinitionProtocolError);
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
