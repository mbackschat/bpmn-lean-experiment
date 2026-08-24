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
  DefinitionStartDescriptionResult,
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
  startCapabilities: { messageStarts: [], timerStarts: [] },
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
  const command = {
    initialVariables: [{
      name: "DataObjectReference_InputItems",
      value: { kind: "stringList", value: ["contract", "invoice", "receipt"] },
    }],
  } as const;

  const response = await fixture.routes.handle(startRequest(command));

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
  assert.deepEqual(fixture.initialVariableCalls, [command.initialVariables]);
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

test("rejects query, missing or wrong media type, and malformed claimed length before service entry", async () => {
  const cases = [
    { request: startRequest({ initialVariables: [] }, `${startUrl()}?unexpected=1`), status: 400 },
    { request: new Request(startUrl(), { method: "POST" }), status: 415 },
    new Request(startUrl(), {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: '{"initialVariables":[]}',
    }),
    { request: new Request(startUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "invalid" },
      body: '{"initialVariables":[]}',
    }), status: 400 },
  ];
  for (const candidate of cases) {
    const { request, status } = candidate instanceof Request
      ? { request: candidate, status: 415 }
      : candidate;
    const fixture = createFixture();
    const response = await fixture.routes.handle(request);
    assert.equal(response?.status, status, request.url);
    assert.equal(fixture.repositoryGets, 0, request.url);
    assert.equal(fixture.startCalls, 0, request.url);
  }
});

test("rejects malformed chunked JSON and recursively invalid commands before service entry", async () => {
  const fixture = createFixture();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"initialVariables":['));
      controller.close();
    },
  });
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };

  const response = await fixture.routes.handle(new Request(startUrl(), init));

  assert.equal(response?.status, 400);
  assert.equal(fixture.repositoryGets, 0);
  assert.equal(fixture.startCalls, 0);

  const invalid = await fixture.routes.handle(startRequest({
    initialVariables: [{ name: "input", value: { kind: "integer", value: -1 } }],
  }));
  assert.equal(invalid?.status, 422);
  assert.equal(fixture.repositoryGets, 0);
  assert.equal(fixture.startCalls, 0);
});

test("requires a nonempty start-command body", async () => {
  const fixture = createFixture();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
  const init = {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "0" },
    body: stream,
    duplex: "half",
  } satisfies RequestInit & { duplex: "half" };

  const response = await fixture.routes.handle(new Request(startUrl(), init));

  assert.equal(response?.status, 400);
  assert.equal(fixture.startCalls, 0);
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
    const response = await fixture.routes.handle(startRequest({ initialVariables: [] }, url));
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
  initialVariableCalls: unknown[];
}> {
  let repositoryGets = 0;
  const repository: DefinitionRepository = {
    allocateNext: async (_metadata: NewDefinitionMetadata) => {
      throw new Error("deployment is outside this fixture");
    },
    listLatest: async () => [],
    listVersions: async () => [],
    get: async (reference) => {
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
  const initialVariableCalls: unknown[] = [];
  const starter: DefinitionVersionStarter = {
    prepareDefinitionVersion: async (request) => {
      startCalls += 1;
      initialVariableCalls.push(structuredClone(request.initialVariables));
      const common = {
        source: { ...storedDefinition.source },
        definition: {
          processId: storedDefinition.processId,
          semanticProfile: storedDefinition.semanticProfile,
        },
      } as const;
      switch (behavior) {
        case StartBehavior.Started:
        case StartBehavior.Throw:
          return {
            status: EngineDefinitionStartStatus.Admitted,
            ...common,
            processInstanceId: request.processInstanceId,
            locator: "private-direct-locator",
            intent: {
              protocol: "bpmn-direct-start-v1",
              intentSha256: "b".repeat(64),
            },
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
    startPreparedDefinitionVersion: async (request) => {
      if (behavior === StartBehavior.Throw) {
        throw new Error("private start detail");
      }
      return {
        status: EngineDefinitionStartStatus.Started,
        source: { ...storedDefinition.source },
        definition: {
          processId: storedDefinition.processId,
          semanticProfile: storedDefinition.semanticProfile,
        },
        processInstanceId: request.processInstanceId,
      };
    },
    describeDefinitionVersionStart: async () => ({
      status: "unavailable" as DefinitionStartDescriptionResult["status"],
    }),
    startDefinitionVersion: async () => {
      throw new Error("legacy direct start must not be used");
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
      startCapabilities: { messageStarts: [], timerStarts: [] },
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
    new ConfirmedProcessInstancePublicationService({
      repository: new InMemoryConfirmedProcessInstanceRepository(),
      operate: { recordConfirmedProcessInstance: async () => undefined },
      work: { recordConfirmedProcessInstance: async () => undefined },
    }),
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
    initialVariableCalls,
    get startCalls() {
      return startCalls;
    },
  };
}

function startUrl(): string {
  return "http://platform.test/api/v1/definitions/Process%2FOne/versions/1/start";
}

function startRequest(
  command: unknown = { initialVariables: [] },
  url = startUrl(),
): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(command),
  });
}

async function responseJson(response: Response | null): Promise<unknown> {
  assert.ok(response !== null);
  return await response.json();
}
