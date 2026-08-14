import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ArtifactPutStatus,
} from "@bpmn-lean/platform-artifact-store";
import type {
  ArtifactPutRequest,
  ArtifactPutResult,
} from "@bpmn-lean/platform-artifact-store";
import {
  DefinitionStartStatus as EngineDefinitionStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionStartDescriptionResult,
  DefinitionVersionStartRequest,
  DefinitionVersionStarter,
} from "@bpmn-lean/platform-engine-gateway";
import {
  ConfirmedProcessInstancePublicationService,
  DefinitionArtifactIntegrityError,
  DefinitionStartIntegrityError,
  DefinitionStartService,
  DefinitionVersionStartStatus,
  InMemoryConfirmedProcessInstanceRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  ExactArtifactStore,
  NewDefinitionMetadata,
} from "@bpmn-lean/platform-definitions";

const encoder = new TextEncoder();

test("starts the exact requested stored version instead of the latest version", async () => {
  const versionOneBytes = encoder.encode("<process version='one'/>");
  const versionTwoBytes = encoder.encode("<process version='two'/>");
  const versionOne = definition(1, "source-v1", "1".repeat(64), versionOneBytes);
  const versionTwo = definition(2, "source-v2", "2".repeat(64), versionTwoBytes);
  const fixture = createFixture([versionOne, versionTwo], new Map([
    [versionOne.source.sha256, versionOneBytes],
    [versionTwo.source.sha256, versionTwoBytes],
  ]));

  const result = await fixture.service.start({ processId: "Process_A", version: 1 });

  assert.equal(result.status, DefinitionVersionStartStatus.Started);
  assert.deepEqual(fixture.repositoryReferences, [{ processId: "Process_A", version: 1 }]);
  assert.equal(fixture.generatedIds, 1);
  assert.deepEqual(fixture.startCalls, [{
    bytes: versionOneBytes,
    sourceId: "source-v1",
    expectedSha256: "1".repeat(64),
    semanticProfile: "profile-v1",
    expectedProcessId: "Process_A",
    processInstanceId: "instance-1",
  }]);
  assert.deepEqual(result, {
    status: DefinitionVersionStartStatus.Started,
    instance: {
      processInstanceId: "instance-1",
      definition: versionOne,
    },
  });
});

test("returns not found without reading artifacts, generating identity, or starting", async () => {
  const fixture = createFixture([], new Map());

  const result = await fixture.service.start({ processId: "Missing", version: 3 });

  assert.deepEqual(result, {
    status: DefinitionVersionStartStatus.NotFound,
    reference: { processId: "Missing", version: 3 },
  });
  assert.deepEqual(fixture.artifactGets, []);
  assert.equal(fixture.generatedIds, 0);
  assert.deepEqual(fixture.startCalls, []);
});

test("refuses a repository that redirects an exact reference to the latest version", async () => {
  const versionOneBytes = encoder.encode("version-one");
  const versionTwoBytes = encoder.encode("version-two");
  const versionOne = definition(1, "source-v1", "1".repeat(64), versionOneBytes);
  const versionTwo = definition(2, "source-v2", "2".repeat(64), versionTwoBytes);
  const fixture = createFixture(
    [versionOne, versionTwo],
    new Map([[versionTwo.source.sha256, versionTwoBytes]]),
    { redirectExactGetToLatest: true },
  );

  await assert.rejects(
    fixture.service.start({ processId: "Process_A", version: 1 }),
    (error: unknown) => error instanceof DefinitionStartIntegrityError,
  );
  assert.deepEqual(fixture.artifactGets, []);
  assert.equal(fixture.generatedIds, 0);
  assert.deepEqual(fixture.startCalls, []);
});

test("rejects missing and wrong-length artifacts before identity generation or start", async () => {
  const expectedBytes = encoder.encode("exact-source");
  const stored = definition(1, "source-v1", "3".repeat(64), expectedBytes);
  const cases = [
    { name: "missing", artifacts: new Map<string, Uint8Array>() },
    {
      name: "wrong length",
      artifacts: new Map([[stored.source.sha256, encoder.encode("wrong")]]),
    },
  ] as const;

  for (const candidate of cases) {
    const fixture = createFixture([stored], candidate.artifacts);

    await assert.rejects(
      fixture.service.start({ processId: "Process_A", version: 1 }),
      (error: unknown) => {
        assert.ok(error instanceof DefinitionArtifactIntegrityError, candidate.name);
        assert.deepEqual(error.definition, { processId: "Process_A", version: 1 });
        assert.equal(error.sourceSha256, stored.source.sha256);
        return true;
      },
    );
    assert.equal(fixture.generatedIds, 0, candidate.name);
    assert.deepEqual(fixture.startCalls, [], candidate.name);
  }
});

test("snapshots the selected metadata and returned artifact before the starter yields", async () => {
  const bytes = encoder.encode("snapshot-source");
  const stored = mutableDefinition(1, "snapshot-source", "4".repeat(64), bytes);
  let releaseStart = (): void => {};
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  const fixture = createFixture([stored], new Map([[stored.source.sha256, bytes]]), {
    startGate,
  });

  const started = fixture.service.start({ processId: "Process_A", version: 1 });
  await fixture.startEntered;
  stored.source.id = "redirected-source";
  stored.semanticProfile = "redirected-profile";
  bytes.fill(0);
  releaseStart();

  const result = await started;
  assert.equal(result.status, DefinitionVersionStartStatus.Started);
  assert.deepEqual(fixture.startCalls[0], {
    bytes: encoder.encode("snapshot-source"),
    sourceId: "snapshot-source",
    expectedSha256: "4".repeat(64),
    semanticProfile: "profile-v1",
    expectedProcessId: "Process_A",
    processInstanceId: "instance-1",
  });
  assert.equal(result.instance.definition.source.id, "snapshot-source");
  assert.equal(result.instance.definition.semanticProfile, "profile-v1");
});

test("returns a cloned rejection bound to the exact stored definition", async () => {
  const bytes = encoder.encode("rejected-source");
  const stored = definition(1, "rejected-source", "5".repeat(64), bytes);
  const failure = { code: "unsupportedHostShape", evidence: "exact evidence" };
  const fixture = createFixture([stored], new Map([[stored.source.sha256, bytes]]), {
    resultStatus: EngineDefinitionStartStatus.Rejected,
    failure,
  });

  const result = await fixture.service.start({ processId: "Process_A", version: 1 });

  assert.deepEqual(result, {
    status: DefinitionVersionStartStatus.Rejected,
    definition: stored,
    failure,
  });
  if (result.status !== DefinitionVersionStartStatus.Rejected) {
    assert.fail("expected rejected start");
  }
  Object.assign(result.definition.source, { id: "mutated-return" });
  Object.assign(result.failure, { evidence: "mutated-return" });
  assert.equal(stored.source.id, "rejected-source");
  assert.equal(failure.evidence, "exact evidence");
});

test("treats every started identity drift and gateway integrity result as an integrity failure", async () => {
  const bytes = encoder.encode("identity-source");
  const stored = definition(1, "identity-source", "6".repeat(64), bytes);
  const driftCases = [
    { processInstanceId: "other-instance" },
    { sourceId: "other-source" },
    { sourceSha256: "7".repeat(64) },
    { sourceByteLength: bytes.byteLength + 1 },
    { processId: "Other_Process" },
    { semanticProfile: "other-profile" },
  ] as const;
  for (const drift of driftCases) {
    const fixture = createFixture([stored], new Map([[stored.source.sha256, bytes]]), {
      startedDrift: drift,
    });
    await assert.rejects(
      fixture.service.start({ processId: "Process_A", version: 1 }),
      (error: unknown) => error instanceof DefinitionStartIntegrityError,
    );
  }
  const returnedDrift = createFixture(
    [stored],
    new Map([[stored.source.sha256, bytes]]),
    { startedDrift: { processInstanceId: "returned-other-instance" }, startOnlyDrift: true },
  );
  await assert.rejects(
    returnedDrift.service.start({ processId: "Process_A", version: 1 }),
    (error: unknown) => error instanceof DefinitionStartIntegrityError,
  );

  const integrityFixture = createFixture(
    [stored],
    new Map([[stored.source.sha256, bytes]]),
    {
      resultStatus: EngineDefinitionStartStatus.IntegrityFailure,
      failure: { code: "sourceIdentityDrift", evidence: "compiler drift" },
    },
  );
  await assert.rejects(
    integrityFixture.service.start({ processId: "Process_A", version: 1 }),
    (error: unknown) => error instanceof DefinitionStartIntegrityError,
  );
});

test("requires one synchronous nonempty well-formed generated instance identity", async () => {
  const bytes = encoder.encode("identity-source");
  const stored = definition(1, "identity-source", "8".repeat(64), bytes);
  for (const invalidId of ["", "\ud800"] as const) {
    const fixture = createFixture([stored], new Map([[stored.source.sha256, bytes]]), {
      generatedId: invalidId,
    });
    await assert.rejects(
      fixture.service.start({ processId: "Process_A", version: 1 }),
      /nonempty well-formed Unicode/u,
    );
    assert.equal(fixture.generatedIds, 1);
    assert.deepEqual(fixture.startCalls, []);
  }
});

type MutableDefinition = {
  processId: string;
  version: number;
  source: {
    kind: "bpmnSource";
    id: string;
    sha256: string;
    byteLength: number;
    declaredEncoding: null;
    decodedAs: "UTF-8";
  };
  semanticProfile: string;
  startCapabilities: {
    messageStarts: Array<{
      startEventId: string;
      channel: {
        kind: "operationMessage";
        interfaceId: string;
        interfaceOperationId: string;
        messageId: string;
      };
    }>;
    timerStarts: Array<{ startEventId: string; durationMs: number }>;
  };
};

function definition(
  version: number,
  sourceId: string,
  digest: string,
  bytes: Uint8Array,
): DefinitionMetadata {
  return mutableDefinition(version, sourceId, digest, bytes);
}

function mutableDefinition(
  version: number,
  sourceId: string,
  digest: string,
  bytes: Uint8Array,
): MutableDefinition {
  return {
    processId: "Process_A",
    version,
    source: {
      kind: "bpmnSource",
      id: sourceId,
      sha256: digest,
      byteLength: bytes.byteLength,
      declaredEncoding: null,
      decodedAs: "UTF-8",
    },
    semanticProfile: `profile-v${version}`,
    startCapabilities: { messageStarts: [], timerStarts: [] },
  };
}

type StartFixtureOptions = Readonly<{
  generatedId?: string;
  resultStatus?:
    | typeof EngineDefinitionStartStatus.Started
    | typeof EngineDefinitionStartStatus.Rejected
    | typeof EngineDefinitionStartStatus.IntegrityFailure;
  failure?: Readonly<{ code: string; evidence: string }>;
  startGate?: Promise<void>;
  redirectExactGetToLatest?: boolean;
  startOnlyDrift?: boolean;
  startedDrift?: Readonly<{
    processInstanceId?: string;
    sourceId?: string;
    sourceSha256?: string;
    sourceByteLength?: number;
    processId?: string;
    semanticProfile?: string;
  }>;
}>;

function createFixture(
  definitions: ReadonlyArray<DefinitionMetadata>,
  artifacts: Map<string, Uint8Array>,
  options: StartFixtureOptions = {},
): Readonly<{
  artifactGets: string[];
  generatedIds: number;
  repositoryReferences: DefinitionReference[];
  service: DefinitionStartService;
  startCalls: DefinitionVersionStartRequest[];
  startEntered: Promise<void>;
}> {
  const repositoryReferences: DefinitionReference[] = [];
  const repository: DefinitionRepository = {
    allocateNext: (_metadata: NewDefinitionMetadata) => {
      throw new Error("deployment is outside this fixture");
    },
    listLatest: () => definitions.length === 0
      ? []
      : [definitions[definitions.length - 1]!],
    listVersions: (processId) => definitions.filter(
      (candidate) => candidate.processId === processId,
    ),
    get: (reference) => {
      repositoryReferences.push({ ...reference });
      if (options.redirectExactGetToLatest === true) {
        return definitions[definitions.length - 1] ?? null;
      }
      return definitions.find(
        (candidate) =>
          candidate.processId === reference.processId &&
          candidate.version === reference.version,
      ) ?? null;
    },
  };
  const artifactGets: string[] = [];
  const artifactStore: ExactArtifactStore = {
    put: async (_request: ArtifactPutRequest): Promise<ArtifactPutResult> => ({
      status: ArtifactPutStatus.Stored,
    }),
    get: async (digest) => {
      artifactGets.push(digest);
      return artifacts.get(digest) ?? null;
    },
  };
  const startCalls: DefinitionVersionStartRequest[] = [];
  let markStartEntered = (): void => {};
  const startEntered = new Promise<void>((resolve) => {
    markStartEntered = resolve;
  });
  const starter: DefinitionVersionStarter = {
    prepareDefinitionVersion: async (request) => {
      startCalls.push({ ...request, bytes: Uint8Array.from(request.bytes) });
      const failure = options.failure ?? {
        code: "unsupportedHostShape",
        evidence: "rejected by host admission",
      };
      const common = {
        source: {
          kind: "bpmnSource",
          id: options.startOnlyDrift ? request.sourceId :
            options.startedDrift?.sourceId ?? request.sourceId,
          sha256: options.startOnlyDrift ? request.expectedSha256 :
            options.startedDrift?.sourceSha256 ?? request.expectedSha256,
          byteLength:
            options.startOnlyDrift ? request.bytes.byteLength :
              options.startedDrift?.sourceByteLength ?? request.bytes.byteLength,
          declaredEncoding: null,
          decodedAs: "UTF-8",
        },
        definition: {
          processId: options.startOnlyDrift ? request.expectedProcessId :
            options.startedDrift?.processId ?? request.expectedProcessId,
          semanticProfile:
            options.startOnlyDrift ? request.semanticProfile :
              options.startedDrift?.semanticProfile ?? request.semanticProfile,
        },
      } as const;
      switch (options.resultStatus ?? EngineDefinitionStartStatus.Started) {
        case EngineDefinitionStartStatus.Started:
          return {
            status: EngineDefinitionStartStatus.Admitted,
            ...common,
            processInstanceId:
              options.startOnlyDrift ? request.processInstanceId :
                options.startedDrift?.processInstanceId ?? request.processInstanceId,
            locator: "private-direct-locator",
            intent: {
              protocol: "bpmn-direct-start-v1",
              intentSha256: "a".repeat(64),
            },
          };
        case EngineDefinitionStartStatus.Rejected:
          return {
            status: EngineDefinitionStartStatus.Rejected,
            ...common,
            failure: { ...failure },
          };
        case EngineDefinitionStartStatus.IntegrityFailure:
          return {
            status: EngineDefinitionStartStatus.IntegrityFailure,
            ...common,
            failure: { ...failure },
          };
      }
    },
    startPreparedDefinitionVersion: async (request) => {
      markStartEntered();
      await options.startGate;
      return {
        status: EngineDefinitionStartStatus.Started,
        source: {
          kind: "bpmnSource",
          id: options.startedDrift?.sourceId ?? request.sourceId,
          sha256: options.startedDrift?.sourceSha256 ?? request.expectedSha256,
          byteLength:
            options.startedDrift?.sourceByteLength ?? request.bytes.byteLength,
          declaredEncoding: null,
          decodedAs: "UTF-8",
        },
        definition: {
          processId: options.startedDrift?.processId ?? request.expectedProcessId,
          semanticProfile:
            options.startedDrift?.semanticProfile ?? request.semanticProfile,
        },
        processInstanceId:
          options.startedDrift?.processInstanceId ?? request.processInstanceId,
      };
    },
    describeDefinitionVersionStart: async () => ({
      status: "matching" as DefinitionStartDescriptionResult["status"],
    }),
    startDefinitionVersion: async () => {
      throw new Error("legacy direct start is outside this fixture");
    },
  };
  let generatedIds = 0;
  const service = new DefinitionStartService(
    starter,
    artifactStore,
    repository,
    () => {
      generatedIds += 1;
      return options.generatedId ?? `instance-${generatedIds}`;
    },
    new ConfirmedProcessInstancePublicationService({
      repository: new InMemoryConfirmedProcessInstanceRepository(),
      operate: { recordConfirmedProcessInstance: async () => undefined },
      work: { recordConfirmedProcessInstance: async () => undefined },
    }),
  );
  return {
    artifactGets,
    get generatedIds() {
      return generatedIds;
    },
    repositoryReferences,
    service,
    startCalls,
    startEntered,
  };
}
