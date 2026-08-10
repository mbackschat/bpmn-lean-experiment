import assert from "node:assert/strict";
import { test } from "node:test";

import { ArtifactPutStatus } from "@bpmn-lean/platform-artifact-store";
import {
  ProcessInstanceStartStatus,
  PublicApiErrorCode,
} from "@bpmn-lean/platform-contracts";
import {
  DefinitionCompilationStatus,
  DefinitionStartStatus as EngineDefinitionStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCompiler,
  DefinitionVersionStarter,
} from "@bpmn-lean/platform-engine-gateway";
import {
  DefinitionDeploymentService,
  DefinitionHttpRoutes,
  DefinitionStartService,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionMetadata,
  DefinitionRepository,
  ExactArtifactStore,
  NewDefinitionMetadata,
} from "@bpmn-lean/platform-definitions";

const bytes = new TextEncoder().encode("<exact-process/>");
const storedDefinition = {
  processId: "Process/One",
  version: 1,
  source: {
    kind: "bpmnSource",
    id: "uploaded.bpmn",
    sha256: "a".repeat(64),
    byteLength: bytes.byteLength,
    declaredEncoding: null,
    decodedAs: "UTF-8",
  },
  semanticProfile: "test/profile",
} as const satisfies DefinitionMetadata;

const StartBehavior = {
  Started: "started",
  Rejected: "rejected",
  IntegrityFailure: "integrityFailure",
  Throw: "throw",
} as const;

type StartBehavior = typeof StartBehavior[keyof typeof StartBehavior];

test("starts an exact definition version and returns only the public instance identity", async () => {
  const fixture = createFixture();

  const response = await fixture.routes.handle(startRequest());

  assert.equal(response?.status, 201);
  assert.equal(response?.headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(await responseJson(response), {
    status: ProcessInstanceStartStatus.Started,
    instance: {
      processInstanceId: "public-instance-1",
      definition: storedDefinition,
    },
  });
  assert.equal(fixture.repositoryGets, 1);
  assert.equal(fixture.startCalls, 1);
});

test("maps pre-start rejection to 422 with the exact definition and opaque failure", async () => {
  const fixture = createFixture(StartBehavior.Rejected);

  const response = await fixture.routes.handle(startRequest());

  assert.equal(response?.status, 422);
  assert.deepEqual(await responseJson(response), {
    status: ProcessInstanceStartStatus.Rejected,
    definition: storedDefinition,
    failure: {
      code: "unsupportedHostShape",
      evidence: "bounded opaque evidence",
    },
  });
});

test("returns 404 for an unknown exact version without entering engine start", async () => {
  const fixture = createFixture(StartBehavior.Started, []);

  const response = await fixture.routes.handle(startRequest());

  assert.equal(response?.status, 404);
  assert.equal(fixture.startCalls, 0);
  assert.equal(
    (await responseJson(response) as { error: { code: string } }).error.code,
    PublicApiErrorCode.NotFound,
  );
});

test("rejects query, media type, and claimed body input before service entry", async () => {
  const cases = [
    new Request(`${startUrl()}?unexpected=1`, { method: "POST" }),
    new Request(startUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
    }),
    new Request(startUrl(), {
      method: "POST",
      headers: { "content-length": "1" },
    }),
    new Request(startUrl(), {
      method: "POST",
      headers: { "content-length": "invalid" },
    }),
  ];
  for (const request of cases) {
    const fixture = createFixture();
    const response = await fixture.routes.handle(request);
    assert.equal(response?.status, 400, request.url);
    assert.equal(fixture.repositoryGets, 0, request.url);
    assert.equal(fixture.startCalls, 0, request.url);
  }
});

test("rejects a chunked nonempty body without Content-Length before service entry", async () => {
  const fixture = createFixture();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hidden input"));
      controller.close();
    },
  });
  const init = {
    method: "POST",
    body: stream,
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };

  const response = await fixture.routes.handle(new Request(startUrl(), init));

  assert.equal(response?.status, 400);
  assert.equal(fixture.repositoryGets, 0);
  assert.equal(fixture.startCalls, 0);
});

test("accepts a transport stream only when it contains no body bytes", async () => {
  const fixture = createFixture();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
  const init = {
    method: "POST",
    headers: { "content-length": "0" },
    body: stream,
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };

  const response = await fixture.routes.handle(new Request(startUrl(), init));

  assert.equal(response?.status, 201);
  assert.equal(fixture.startCalls, 1);
});

test("returns Allow POST for every wrong method on the recognized start path", async () => {
  for (const method of ["GET", "PUT", "DELETE"] as const) {
    const fixture = createFixture();
    const response = await fixture.routes.handle(new Request(startUrl(), { method }));
    assert.equal(response?.status, 405, method);
    assert.equal(response?.headers.get("allow"), "POST", method);
    assert.equal(fixture.repositoryGets, 0, method);
  }
});

test("rejects malformed references and leaves unknown paths unclaimed", async () => {
  const invalidUrls = [
    "http://platform.test/api/v1/definitions//versions/1/start",
    "http://platform.test/api/v1/definitions/%FF/versions/1/start",
    "http://platform.test/api/v1/definitions/Process/versions/0/start",
    "http://platform.test/api/v1/definitions/Process/versions/1.5/start",
    "http://platform.test/api/v1/definitions/Process/versions/9007199254740992/start",
  ];
  for (const url of invalidUrls) {
    const fixture = createFixture();
    const response = await fixture.routes.handle(new Request(url, { method: "POST" }));
    assert.equal(response?.status, 400, url);
    assert.equal(fixture.repositoryGets, 0, url);
  }
  const fixture = createFixture();
  assert.equal(
    await fixture.routes.handle(new Request(
      "http://platform.test/api/v1/definitions/Process/versions/1/run",
      { method: "POST" },
    )),
    null,
  );
});

test("maps engine and start-integrity failures to the same generic 500", async () => {
  for (const behavior of [StartBehavior.Throw, StartBehavior.IntegrityFailure]) {
    const fixture = createFixture(behavior);
    const response = await fixture.routes.handle(startRequest());
    assert.equal(response?.status, 500, behavior);
    assert.doesNotMatch(
      await response!.text(),
      /private start detail|bounded opaque evidence|sha256/u,
      behavior,
    );
  }
});

function createFixture(
  behavior: StartBehavior = StartBehavior.Started,
  definitions: ReadonlyArray<DefinitionMetadata> = [storedDefinition],
): Readonly<{
  repositoryGets: number;
  routes: DefinitionHttpRoutes;
  startCalls: number;
}> {
  let repositoryGets = 0;
  const repository: DefinitionRepository = {
    allocateNext: (_metadata: NewDefinitionMetadata) => {
      throw new Error("deployment is outside this fixture");
    },
    listLatest: () => [],
    listVersions: () => [],
    get: (reference) => {
      repositoryGets += 1;
      return definitions.find(
        (candidate) =>
          candidate.processId === reference.processId &&
          candidate.version === reference.version,
      ) ?? null;
    },
  };
  const artifacts: ExactArtifactStore = {
    put: async () => ({ status: ArtifactPutStatus.Stored }),
    get: async () => Uint8Array.from(bytes),
  };
  let startCalls = 0;
  const starter: DefinitionVersionStarter = {
    startDefinitionVersion: async (request) => {
      startCalls += 1;
      if (behavior === StartBehavior.Throw) {
        throw new Error("private start detail");
      }
      const common = {
        source: { ...storedDefinition.source },
        definition: {
          processId: storedDefinition.processId,
          semanticProfile: storedDefinition.semanticProfile,
        },
      } as const;
      switch (behavior) {
        case StartBehavior.Started:
          return {
            status: EngineDefinitionStartStatus.Started,
            ...common,
            processInstanceId: request.processInstanceId,
          };
        case StartBehavior.Rejected:
          return {
            status: EngineDefinitionStartStatus.Rejected,
            ...common,
            failure: {
              code: "unsupportedHostShape",
              evidence: "bounded opaque evidence",
            },
          };
        case StartBehavior.IntegrityFailure:
          return {
            status: EngineDefinitionStartStatus.IntegrityFailure,
            ...common,
            failure: {
              code: "sourceIdentityDrift",
              evidence: "bounded opaque evidence",
            },
          };
        default:
          throw new Error("unreachable throw behavior");
      }
    },
  };
  const compiler: DefinitionCompiler = {
    compileDefinition: async () => ({
      status: DefinitionCompilationStatus.Accepted,
      source: { ...storedDefinition.source },
      diagnostics: [],
      definition: {
        processId: storedDefinition.processId,
        semanticProfile: storedDefinition.semanticProfile,
      },
    }),
  };
  const deployment = new DefinitionDeploymentService(
    compiler,
    artifacts,
    repository,
  );
  const start = new DefinitionStartService(
    starter,
    artifacts,
    repository,
    () => "public-instance-1",
  );
  const routes = new DefinitionHttpRoutes(
    deployment,
    start,
    { maxSourceBytes: 128 },
  );
  return {
    get repositoryGets() {
      return repositoryGets;
    },
    routes,
    get startCalls() {
      return startCalls;
    },
  };
}

function startUrl(): string {
  return "http://platform.test/api/v1/definitions/Process%2FOne/versions/1/start";
}

function startRequest(): Request {
  return new Request(startUrl(), { method: "POST" });
}

async function responseJson(response: Response | null): Promise<unknown> {
  assert.ok(response !== null);
  return await response.json();
}
