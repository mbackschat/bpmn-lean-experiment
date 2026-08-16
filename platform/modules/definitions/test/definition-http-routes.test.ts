import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { ArtifactPutStatus } from "@bpmn-lean/platform-artifact-store";
import { PublicApiErrorCode } from "@bpmn-lean/platform-contracts";
import {
  createBpmnEngineGatewayRuntime,
  DefinitionCompilationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCompilationRequest,
  DefinitionCompilationResult,
  DefinitionCompiler,
  DefinitionVersionStarter,
} from "@bpmn-lean/platform-engine-gateway";
import {
  ConfirmedProcessInstancePublicationService,
  DefinitionDeploymentService,
  DefinitionHttpRoutes,
  DefinitionStartService,
  InMemoryConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionMetadata,
  DefinitionRepository,
  ExactArtifactStore,
  NewDefinitionMetadata,
} from "@bpmn-lean/platform-definitions";

const encoder = new TextEncoder();

const CompilerBehavior = {
  Accept: "accept",
  Reject: "reject",
  Throw: "throw",
} as const;

type CompilerBehavior =
  typeof CompilerBehavior[keyof typeof CompilerBehavior];

test("rejects streamed source bytes beyond the ceiling when Content-Length is absent", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 5);
  const request = streamedDeploymentRequest(
    [encoder.encode("abc"), encoder.encode("def")],
  );

  const response = await routes.handle(request);

  assert.equal(response?.status, 413);
  assert.deepEqual(await responseJson(response), {
    error: {
      code: PublicApiErrorCode.PayloadTooLarge,
      message: "The BPMN source exceeds the configured byte limit.",
    },
  });
  assert.equal(fixture.compileCalls.length, 0);
});

test("rejects actual streamed bytes beyond a permitted Content-Length claim", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 5);
  const request = streamedDeploymentRequest(
    [encoder.encode("abc"), encoder.encode("def")],
    { "content-length": "4" },
  );

  const response = await routes.handle(request);

  assert.equal(response?.status, 413);
  assert.equal(fixture.compileCalls.length, 0);
});

test("snapshots each streamed chunk before the producer can mutate it", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 5);
  const firstChunk = Uint8Array.from([1, 2, 3]);
  let pullCount = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      switch (pullCount) {
        case 0:
          pullCount += 1;
          controller.enqueue(firstChunk);
          break;
        case 1:
          pullCount += 1;
          firstChunk.fill(9);
          controller.close();
          break;
        default:
          throw new Error("unexpected stream pull");
      }
    },
  });
  const init = {
    method: "POST",
    headers: { "content-type": "application/xml" },
    body: stream,
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };

  const response = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions?sourceId=upload.bpmn&semanticProfile=test-profile",
    init,
  ));

  assert.equal(response?.status, 201);
  assert.deepEqual(fixture.compileCalls[0]?.bytes, Uint8Array.from([1, 2, 3]));
});

test("rejects a claimed oversize body before deployment", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 5);
  const request = deploymentRequest(encoder.encode("x"), {
    "content-length": "6",
  });

  const response = await routes.handle(request);

  assert.equal(response?.status, 413);
  assert.equal(fixture.compileCalls.length, 0);
});

test("forwards exact bytes and returns only the closed deployed projection", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 128);
  const bytes = Uint8Array.from([0, 60, 120, 109, 108, 62, 255]);
  const response = await routes.handle(deploymentRequest(bytes, {
    "content-type": "application/bpmn+xml; charset=\"utf-8\"",
  }));

  assert.equal(response?.status, 201);
  assert.equal(response?.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(fixture.compileCalls, [{
    bytes,
    sourceId: "upload file.bpmn",
    semanticProfile: "test/profile",
    expectedSha256: undefined,
  }]);
  assert.deepEqual(await responseJson(response), {
    status: "deployed",
    definition: {
      processId: "Process_Upload",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "upload file.bpmn",
        sha256: sha256(bytes),
        byteLength: bytes.byteLength,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "test/profile",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
  });
});

test("maps an engine rejection and opaque diagnostics to 422 without writes", async () => {
  const fixture = createFixture(CompilerBehavior.Reject);
  const routes = routesFor(fixture, 128);
  const bytes = encoder.encode("<unsupported/>");
  const response = await routes.handle(deploymentRequest(bytes));

  assert.equal(response?.status, 422);
  const compilation = fixture.compilationResults[0];
  assert.equal(compilation?.status, DefinitionCompilationStatus.Rejected);
  if (compilation?.status !== DefinitionCompilationStatus.Rejected) {
    assert.fail("expected the engine gateway to reject the fixture");
  }
  assert.deepEqual(await responseJson(response), {
    status: "rejected",
    source: compilation.source,
    semanticProfile: "test/profile",
    diagnostics: compilation.diagnostics,
  });
  assert.ok(compilation.diagnostics.length > 0);
  assert.equal(typeof compilation.diagnostics[0]?.code, "string");
  assert.equal(fixture.artifacts.size, 0);
});

test("accepts only the selected XML media types with syntactic parameters", async () => {
  const accepted = [
    "application/xml",
    "text/xml; charset=utf-8",
    "application/bpmn+xml; profile=portable; charset=\"utf-8\"",
  ];
  for (const mediaType of accepted) {
    const fixture = createFixture();
    const routes = routesFor(fixture, 128);
    const response = await routes.handle(deploymentRequest(
      encoder.encode("<xml/>"),
      { "content-type": mediaType },
    ));
    assert.equal(response?.status, 201, mediaType);
  }

  const rejected = [null, "application/json", "application/xml;"];
  for (const mediaType of rejected) {
    const fixture = createFixture();
    const routes = routesFor(fixture, 128);
    const response = await routes.handle(mediaType === null
      ? new Request(
          "http://platform.test/api/v1/definitions?sourceId=upload.bpmn&semanticProfile=profile",
          { method: "POST", body: encoder.encode("<xml/>") },
        )
      : deploymentRequest(
          encoder.encode("<xml/>"),
          { "content-type": mediaType },
        ));
    assert.equal(response?.status, 415, String(mediaType));
    assert.equal(fixture.compileCalls.length, 0);
  }
});

test("rejects malformed lengths and missing or empty bodies before deployment", async () => {
  const malformedLengths = ["-1", "1.5", "1, 2", "9007199254740992"];
  for (const value of malformedLengths) {
    const fixture = createFixture();
    const routes = routesFor(fixture, 128);
    const response = await routes.handle(deploymentRequest(
      encoder.encode("x"),
      { "content-length": value },
    ));
    assert.equal(response?.status, 400, value);
    assert.equal(fixture.compileCalls.length, 0);
  }

  for (const body of [null, new Uint8Array()] as const) {
    const fixture = createFixture();
    const routes = routesFor(fixture, 128);
    const response = await routes.handle(deploymentRequest(body));
    assert.equal(response?.status, 400);
    assert.equal(fixture.compileCalls.length, 0);
  }
});

test("rejects incomplete, duplicate, extra, empty, and malformed deployment queries", async () => {
  const queries = [
    "sourceId=upload.bpmn",
    "sourceId=one&sourceId=two&semanticProfile=profile",
    "sourceId=one&semanticProfile=profile&extra=value",
    "sourceId=&semanticProfile=profile",
    "sourceId=%FF&semanticProfile=profile",
  ];
  for (const query of queries) {
    const fixture = createFixture();
    const routes = routesFor(fixture, 128);
    const response = await routes.handle(deploymentRequest(
      encoder.encode("<xml/>"),
      {},
      query,
    ));
    assert.equal(response?.status, 400, query);
    assert.equal(fixture.compileCalls.length, 0);
  }
});

test("lists latest definitions and ascending versions through JSON routes", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 128);
  await routes.handle(deploymentRequest(encoder.encode("<one/>")));
  await routes.handle(deploymentRequest(encoder.encode("<two/>")));

  const latest = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions",
  ));
  const versions = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions/Process_Upload/versions",
  ));
  const empty = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions/Unknown/versions",
  ));

  assert.equal(latest?.status, 200);
  assert.deepEqual(
    (await responseJson(latest) as { definitions: DefinitionMetadata[] }).definitions
      .map(({ version }) => version),
    [2],
  );
  assert.deepEqual(
    (await responseJson(versions) as { versions: DefinitionMetadata[] }).versions
      .map(({ version }) => version),
    [1, 2],
  );
  assert.deepEqual(await responseJson(empty), {
    processId: "Unknown",
    versions: [],
  });
});

test("decodes an encoded process segment exactly once", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 128);

  const response = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions/Process%252FStillEncoded/versions",
  ));

  assert.equal(response?.status, 200);
  assert.deepEqual(fixture.versionListProcessIds, ["Process%2FStillEncoded"]);
});

test("returns exact source bytes with length and a digest-bound ETag", async () => {
  const fixture = createFixture("accept", "Process/Encoded");
  const routes = routesFor(fixture, 128);
  const bytes = Uint8Array.from([60, 120, 109, 108, 62, 0, 255]);
  await routes.handle(deploymentRequest(bytes));

  const response = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions/Process%2FEncoded/versions/1/source",
  ));

  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("content-type"), "application/xml");
  assert.equal(response?.headers.get("content-length"), String(bytes.byteLength));
  assert.equal(response?.headers.get("etag"), `"sha256-${sha256(bytes)}"`);
  assert.deepEqual(new Uint8Array(await response!.arrayBuffer()), bytes);
});

test("rejects invalid GET inputs and returns 404 for unknown metadata", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 128);
  const invalidUrls = [
    "http://platform.test/api/v1/definitions?unexpected=1",
    "http://platform.test/api/v1/definitions/Process/versions?unexpected=1",
    "http://platform.test/api/v1/definitions//versions",
    "http://platform.test/api/v1/definitions/%FF/versions",
    "http://platform.test/api/v1/definitions/Process/versions/0/source",
    "http://platform.test/api/v1/definitions/Process/versions/1.5/source",
    "http://platform.test/api/v1/definitions/Process/versions/9007199254740992/source",
  ];
  for (const url of invalidUrls) {
    const response = await routes.handle(new Request(url));
    assert.equal(response?.status, 400, url);
  }

  const missing = await routes.handle(new Request(
    "http://platform.test/api/v1/definitions/Process/versions/1/source",
  ));
  assert.equal(missing?.status, 404);
});

test("returns 405 for wrong methods on recognized paths and null for unknown paths", async () => {
  const fixture = createFixture();
  const routes = routesFor(fixture, 128);
  const recognized = [
    new Request("http://platform.test/api/v1/definitions", { method: "PUT" }),
    new Request("http://platform.test/api/v1/definitions/Process/versions", { method: "POST" }),
    new Request("http://platform.test/api/v1/definitions/Process/versions/1/source", { method: "DELETE" }),
  ];
  for (const request of recognized) {
    const response = await routes.handle(request);
    assert.equal(response?.status, 405);
    assert.equal(
      (await responseJson(response) as { error: { code: string } }).error.code,
      PublicApiErrorCode.MethodNotAllowed,
    );
  }
  assert.equal(
    await routes.handle(new Request("http://platform.test/api/v1/other")),
    null,
  );
});

test("maps unexpected service and artifact-integrity failures to a generic 500", async () => {
  const failing = createFixture(CompilerBehavior.Throw);
  const failingRoutes = routesFor(failing, 128);
  const failedDeploy = await failingRoutes.handle(deploymentRequest(encoder.encode("<xml/>")));
  assert.equal(failedDeploy?.status, 500);
  assert.doesNotMatch(await failedDeploy!.text(), /private compiler detail/u);

  const missing = createFixture();
  const missingRoutes = routesFor(missing, 128);
  await missingRoutes.handle(deploymentRequest(encoder.encode("<xml/>")));
  missing.artifacts.clear();
  const failedRead = await missingRoutes.handle(new Request(
    "http://platform.test/api/v1/definitions/Process_Upload/versions/1/source",
  ));
  assert.equal(failedRead?.status, 500);
  assert.doesNotMatch(await failedRead!.text(), /missing artifact|sha256-/u);
});

test("requires a positive safe source-byte ceiling", () => {
  const fixture = createFixture();
  for (const maxSourceBytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => new DefinitionHttpRoutes(
        fixture.service,
        fixture.startService,
        { maxSourceBytes },
      ),
      /positive safe integer/u,
    );
  }
});

function deploymentRequest(
  body: Uint8Array | null,
  headers: Readonly<Record<string, string>> = {},
  query = "sourceId=upload+file.bpmn&semanticProfile=test%2Fprofile",
): Request {
  return new Request(`http://platform.test/api/v1/definitions?${query}`, {
    method: "POST",
    headers: { "content-type": "application/xml", ...headers },
    body,
  });
}

function streamedDeploymentRequest(
  chunks: ReadonlyArray<Uint8Array>,
  headers: Readonly<Record<string, string>> = {},
): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  const init = {
    method: "POST",
    headers: { "content-type": "application/xml", ...headers },
    body: stream,
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };
  return new Request(
    "http://platform.test/api/v1/definitions?sourceId=upload.bpmn&semanticProfile=test-profile",
    init,
  );
}

function routesFor(
  fixture: Readonly<{
    service: DefinitionDeploymentService;
    startService: DefinitionStartService;
  }>,
  maxSourceBytes: number,
): DefinitionHttpRoutes {
  return new DefinitionHttpRoutes(
    fixture.service,
    fixture.startService,
    { maxSourceBytes },
  );
}

function createFixture(
  behavior: CompilerBehavior = CompilerBehavior.Accept,
  processId = "Process_Upload",
): Readonly<{
  artifacts: Map<string, Uint8Array>;
  compileCalls: DefinitionCompilationRequest[];
  compilationResults: DefinitionCompilationResult[];
  service: DefinitionDeploymentService;
  startService: DefinitionStartService;
  versionListProcessIds: string[];
}> {
  const compileCalls: DefinitionCompilationRequest[] = [];
  const compilationResults: DefinitionCompilationResult[] = [];
  const compiler: DefinitionCompiler = {
    compileDefinition: async (request) => {
      compileCalls.push({
        ...request,
        bytes: Uint8Array.from(request.bytes),
      });
      if (behavior === CompilerBehavior.Throw) {
        throw new Error("private compiler detail");
      }
      if (behavior === CompilerBehavior.Reject) {
        const runtime = createBpmnEngineGatewayRuntime({
          maxSourceBytes: 1_024,
          parserDeadlineMs: 500,
          temporalAddress: "localhost:7233",
          temporalNamespace: "default",
          temporalTaskQueue: "unused-test-queue",
          temporalConnectTimeoutMs: 100,
        });
        try {
          const result = await runtime.gateway.compileDefinition(request);
          compilationResults.push(result);
          return result;
        } finally {
          await runtime.close();
        }
      }
      const source = {
        kind: "bpmnSource",
        id: request.sourceId,
        sha256: sha256(request.bytes),
        byteLength: request.bytes.byteLength,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      } as const;
      const result = {
        status: DefinitionCompilationStatus.Accepted,
        source,
        diagnostics: [],
        definition: { processId, semanticProfile: request.semanticProfile },
        startCapabilities: { messageStarts: [], timerStarts: [] },
      } as const satisfies DefinitionCompilationResult;
      compilationResults.push(result);
      return result;
    },
  };
  const artifacts = new Map<string, Uint8Array>();
  const artifactStore: ExactArtifactStore = {
    put: async ({ sha256: digest, bytes }) => {
      artifacts.set(digest, Uint8Array.from(bytes));
      return { status: ArtifactPutStatus.Stored };
    },
    get: async (digest) => {
      const bytes = artifacts.get(digest);
      return bytes === undefined ? null : Uint8Array.from(bytes);
    },
  };
  const definitions: DefinitionMetadata[] = [];
  const versionListProcessIds: string[] = [];
  const repository: DefinitionRepository = {
    allocateNext: async (metadata: NewDefinitionMetadata) => {
      const version = definitions.filter(
        (candidate) => candidate.processId === metadata.processId,
      ).length + 1;
      const definition = {
        ...metadata,
        source: { ...metadata.source },
        version,
      };
      definitions.push(definition);
      return definition;
    },
    listLatest: async () => {
      const latest = new Map<string, DefinitionMetadata>();
      definitions.forEach((definition) => latest.set(definition.processId, definition));
      return [...latest.values()];
    },
    listVersions: async (requestedProcessId) => {
      versionListProcessIds.push(requestedProcessId);
      return definitions.filter(
        (definition) => definition.processId === requestedProcessId,
      );
    },
    get: async (reference) => definitions.find(
      (definition) =>
        definition.processId === reference.processId &&
        definition.version === reference.version,
    ) ?? null,
  };
  const unusedStarter: DefinitionVersionStarter = {
    prepareDefinitionVersion: async () => {
      throw new Error("start is outside this fixture");
    },
    startPreparedDefinitionVersion: async () => {
      throw new Error("start is outside this fixture");
    },
    describeDefinitionVersionStart: async () => {
      throw new Error("start is outside this fixture");
    },
    startDefinitionVersion: async () => {
      throw new Error("start is outside this fixture");
    },
  };
  const startService = new DefinitionStartService(
    unusedStarter,
    artifactStore,
    repository,
    () => "unused-instance",
    new ConfirmedProcessInstancePublicationService({
      repository: new InMemoryConfirmedProcessInstanceRepository(),
      operate: { recordConfirmedProcessInstance: async () => undefined },
      work: { recordConfirmedProcessInstance: async () => undefined },
    }),
  );
  return {
    artifacts,
    compileCalls,
    compilationResults,
    service: new DefinitionDeploymentService(compiler, artifactStore, repository),
    startService,
    versionListProcessIds,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function responseJson(response: Response | null): Promise<unknown> {
  assert.ok(response !== null);
  return await response.json();
}
