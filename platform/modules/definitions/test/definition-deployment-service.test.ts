import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  ArtifactConflictError,
  ArtifactPutStatus,
} from "@bpmn-lean/platform-artifact-store";
import type {
  ArtifactPutRequest,
  ArtifactPutResult,
} from "@bpmn-lean/platform-artifact-store";
import {
  createBpmnEngineGatewayRuntime,
  DefinitionCompilationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCompilationRequest,
  DefinitionCompilationResult,
  DefinitionCompiler,
} from "@bpmn-lean/platform-engine-gateway";

import {
  DefinitionArtifactIntegrityError,
  DefinitionSchemaResetRequiredError,
  DefinitionDeploymentService,
  DefinitionDeploymentStatus,
  SqliteDefinitionRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  ExactArtifactStore,
} from "@bpmn-lean/platform-definitions";

const encoder = new TextEncoder();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class MemoryArtifactStore implements ExactArtifactStore {
  readonly puts: ArtifactPutRequest[] = [];
  readonly content = new Map<string, Uint8Array>();
  putFailure: Error | null = null;

  async put(request: ArtifactPutRequest): Promise<ArtifactPutResult> {
    this.puts.push({
      sha256: request.sha256,
      bytes: Uint8Array.from(request.bytes),
    });
    if (this.putFailure !== null) {
      throw this.putFailure;
    }
    const alreadyPresent = this.content.has(request.sha256);
    this.content.set(request.sha256, Uint8Array.from(request.bytes));
    return {
      status: alreadyPresent
        ? ArtifactPutStatus.AlreadyPresent
        : ArtifactPutStatus.Stored,
    };
  }

  async get(digest: string): Promise<Uint8Array | null> {
    const bytes = this.content.get(digest);
    return bytes === undefined ? null : Uint8Array.from(bytes);
  }
}

class AcceptedCompiler implements DefinitionCompiler {
  readonly #processId: string;
  readonly #gate: Promise<void>;
  readonly #timerStarts: ReadonlyArray<Readonly<{
    startEventId: string;
    durationMs: number;
  }>>;
  seenExpectedSha256: string | undefined;

  constructor(
    processId: string,
    gate: Promise<void> = Promise.resolve(),
    timerStarts: ReadonlyArray<Readonly<{
      startEventId: string;
      durationMs: number;
    }>> = [{ startEventId: "TimerStart", durationMs: 1_000 }],
  ) {
    this.#processId = processId;
    this.#gate = gate;
    this.#timerStarts = timerStarts;
  }

  async compileDefinition(
    request: DefinitionCompilationRequest,
  ): Promise<DefinitionCompilationResult> {
    await this.#gate;
    this.seenExpectedSha256 = request.expectedSha256;
    const digest = sha256(request.bytes);
    return {
      status: DefinitionCompilationStatus.Accepted,
      source: {
        kind: "bpmnSource",
        id: request.sourceId,
        sha256: digest,
        byteLength: request.bytes.byteLength,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      diagnostics: [],
      definition: {
        processId: this.#processId,
        semanticProfile: request.semanticProfile,
      },
      startCapabilities: {
        messageStarts: [],
        timerStarts: this.#timerStarts.map((capability) => ({ ...capability })),
      },
    };
  }
}

async function withRepository(
  run: (
    fixture: Readonly<{
      databaseFile: string;
      repository: SqliteDefinitionRepository;
    }>,
  ) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-definitions-"));
  const databaseFile = join(root, "definitions.sqlite");
  const repository = new SqliteDefinitionRepository(databaseFile);
  try {
    await run({ databaseFile, repository });
  } finally {
    if (repository.isOpen) {
      repository.close();
    }
    await rm(root, { recursive: true, force: true });
  }
}

test("snapshots bytes and every scalar before the compiler can yield", async () => {
  await withRepository(async ({ repository }) => {
    let releaseCompilation = (): void => {};
    const gate = new Promise<void>((resolve) => {
      releaseCompilation = resolve;
    });
    const compiler = new AcceptedCompiler("Process_Original", gate);
    const artifacts = new MemoryArtifactStore();
    const service = new DefinitionDeploymentService(
      compiler,
      artifacts,
      repository,
    );
    const originalBytes = encoder.encode("<original-exact-bpmn/>");
    const expectedBytes = Uint8Array.from(originalBytes);
    const originalDigest = sha256(originalBytes);
    const request = {
      bytes: originalBytes,
      sourceId: "original-source",
      semanticProfile: "original-profile",
      expectedSha256: originalDigest,
    };

    const deployment = service.deploy(request);
    originalBytes.fill(0);
    request.sourceId = "mutated-source";
    request.semanticProfile = "mutated-profile";
    request.expectedSha256 = "f".repeat(64);
    releaseCompilation();

    const result = await deployment;
    assert.equal(result.status, DefinitionDeploymentStatus.Deployed);
    assert.deepEqual(result.definition, {
      processId: "Process_Original",
      version: 1,
      source: {
        kind: "bpmnSource",
        id: "original-source",
        sha256: originalDigest,
        byteLength: expectedBytes.byteLength,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "original-profile",
      startCapabilities: {
        messageStarts: [],
        timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
      },
    });
    assert.equal(compiler.seenExpectedSha256, originalDigest);
    assert.deepEqual(
      await service.getDefinitionSource({
        processId: "Process_Original",
        version: 1,
      }),
      expectedBytes,
    );
  });
});

test("round-trips exact Timer Start capability through SQLite reopen", async () => {
  await withRepository(async ({ databaseFile, repository }) => {
    const service = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_Timer"),
      new MemoryArtifactStore(),
      repository,
    );
    const deployed = await deployText(service, "timer-capability");
    assert.deepEqual(deployed.definition?.startCapabilities, {
      messageStarts: [],
      timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
    });
    repository.close();

    const reopened = new SqliteDefinitionRepository(databaseFile);
    try {
      assert.deepEqual(
        (await reopened.get({ processId: "Process_Timer", version: 1 }))
          ?.startCapabilities,
        {
          messageStarts: [],
          timerStarts: [{ startEventId: "TimerStart", durationMs: 1_000 }],
        },
      );
    } finally {
      reopened.close();
    }
  });
});

test("round-trips an exact empty start capability collection", async () => {
  await withRepository(async ({ databaseFile, repository }) => {
    const service = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_Empty", Promise.resolve(), []),
      new MemoryArtifactStore(),
      repository,
    );
    const deployed = await deployText(service, "empty-capability");
    assert.deepEqual(deployed.definition?.startCapabilities, {
      messageStarts: [],
      timerStarts: [],
    });
    repository.close();

    const reopened = new SqliteDefinitionRepository(databaseFile);
    try {
      assert.deepEqual(
        (await reopened.get({ processId: "Process_Empty", version: 1 }))
          ?.startCapabilities,
        { messageStarts: [], timerStarts: [] },
      );
    } finally {
      reopened.close();
    }
  });
});

test("refuses old-shape capability corruption instead of repairing it", async () => {
  await withRepository(async ({ databaseFile, repository }) => {
    const service = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_Corrupt"),
      new MemoryArtifactStore(),
      repository,
    );
    await deployText(service, "corrupt-capability");
    repository.close();
    const database = new DatabaseSync(databaseFile);
    database.prepare(`
      UPDATE definition_versions
      SET start_capabilities_json = ?
      WHERE process_id = ? AND version = ?
    `).run('{"timerStarts": []}', "Process_Corrupt", 1);
    database.close();

    const reopened = new SqliteDefinitionRepository(databaseFile);
    try {
      await assert.rejects(
        reopened.get({ processId: "Process_Corrupt", version: 1 }),
        /only messageStarts and timerStarts/u,
      );
    } finally {
      reopened.close();
    }
  });
});

test("rejects the older definition schema with an actionable reset error", async () => {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-old-definitions-"));
  const databaseFile = join(root, "definitions.sqlite");
  try {
    const database = new DatabaseSync(databaseFile);
    database.exec(`
      CREATE TABLE definition_versions (
        process_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        PRIMARY KEY (process_id, version)
      ) STRICT
    `);
    database.close();

    assert.throws(
      () => new SqliteDefinitionRepository(databaseFile),
      (error: unknown) => {
        assert.ok(error instanceof DefinitionSchemaResetRequiredError);
        assert.match(error.message, /reset the platform database/u);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns exact engine rejection diagnostics and performs zero writes", async () => {
  await withRepository(async ({ repository }) => {
    const runtime = createBpmnEngineGatewayRuntime({
      maxSourceBytes: 1_024,
      parserDeadlineMs: 500,
      temporalAddress: "localhost:7233",
      temporalNamespace: "default",
      temporalTaskQueue: "unused-test-queue",
      temporalConnectTimeoutMs: 100,
    });
    const rejectedCompilation = await runtime.gateway.compileDefinition({
      bytes: encoder.encode("<not-bpmn>"),
      sourceId: "rejected-source",
      semanticProfile: "test-profile",
      expectedSha256: undefined,
    });
    await runtime.close();
    assert.equal(
      rejectedCompilation.status,
      DefinitionCompilationStatus.Rejected,
    );
    const fixedCompiler: DefinitionCompiler = {
      compileDefinition: async () => rejectedCompilation,
    };
    const artifacts = new MemoryArtifactStore();
    const service = new DefinitionDeploymentService(
      fixedCompiler,
      artifacts,
      repository,
    );

    const result = await service.deploy({
      bytes: encoder.encode("ignored by fixed compiler"),
      sourceId: "request-source",
      semanticProfile: "request-profile",
      expectedSha256: undefined,
    });

    assert.equal(result.status, DefinitionDeploymentStatus.Rejected);
    assert.deepEqual(result.source, rejectedCompilation.source);
    assert.deepEqual(result.diagnostics, rejectedCompilation.diagnostics);
    assert.ok(result.diagnostics.length > 0);
    assert.deepEqual(artifacts.puts, []);
    assert.deepEqual(await service.listLatestDefinitions(), []);
  });
});

test("allocates independent positive ordinals within each process", async () => {
  await withRepository(async ({ repository }) => {
    const artifacts = new MemoryArtifactStore();
    const processA = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_A"),
      artifacts,
      repository,
    );
    const processB = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_B"),
      artifacts,
      repository,
    );

    const versions = [
      await deployText(processA, "a-1"),
      await deployText(processB, "b-1"),
      await deployText(processA, "a-2"),
    ].map(({ definition }) => definition?.version);

    assert.deepEqual(versions, [1, 1, 2]);
    assert.deepEqual(
      serviceKeys(await processA.listLatestDefinitions()),
      ["Process_A/2", "Process_B/1"],
    );
    assert.deepEqual(
      serviceKeys(await processA.listDefinitionVersions("Process_A")),
      ["Process_A/1", "Process_A/2"],
    );
  });
});

test("serializes concurrent accepted calls into unique contiguous ordinals", async () => {
  await withRepository(async ({ repository }) => {
    const service = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_Concurrent"),
      new MemoryArtifactStore(),
      repository,
    );

    const results = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        deployText(service, `concurrent-${index}`)),
    );
    const versions = results
      .map(({ definition }) => definition?.version)
      .sort((left, right) => (left ?? 0) - (right ?? 0));

    assert.deepEqual(
      versions,
      Array.from({ length: 16 }, (_, index) => index + 1),
    );
  });
});

test("continues a process ordinal after reopening the SQLite file", async () => {
  await withRepository(async ({ databaseFile, repository }) => {
    const artifacts = new MemoryArtifactStore();
    const firstService = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_Durable"),
      artifacts,
      repository,
    );
    assert.equal(
      (await deployText(firstService, "before-close")).definition?.version,
      1,
    );
    repository.close();

    const reopened = new SqliteDefinitionRepository(databaseFile);
    try {
      const reopenedService = new DefinitionDeploymentService(
        new AcceptedCompiler("Process_Durable"),
        artifacts,
        reopened,
      );
      assert.equal(
        (await deployText(reopenedService, "after-reopen")).definition?.version,
        2,
      );
    } finally {
      reopened.close();
    }
  });
});

test("aborts metadata insertion when artifact publication conflicts", async () => {
  await withRepository(async ({ repository }) => {
    const bytes = encoder.encode("conflicting-artifact");
    const artifacts = new MemoryArtifactStore();
    artifacts.putFailure = new ArtifactConflictError(sha256(bytes));
    const service = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_Conflict"),
      artifacts,
      repository,
    );

    await assert.rejects(
      service.deploy({
        bytes,
        sourceId: "conflict-source",
        semanticProfile: "test-profile",
        expectedSha256: undefined,
      }),
      (error: unknown) => error instanceof ArtifactConflictError,
    );
    assert.deepEqual(await service.listLatestDefinitions(), []);
  });
});

test("reports a typed integrity failure when indexed source bytes are missing", async () => {
  await withRepository(async ({ repository }) => {
    const artifacts = new MemoryArtifactStore();
    const service = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_Missing"),
      artifacts,
      repository,
    );
    const deployed = await deployText(service, "will-go-missing");
    assert.ok(deployed.definition !== undefined);
    artifacts.content.delete(deployed.definition.source.sha256);

    await assert.rejects(
      service.getDefinitionSource({
        processId: "Process_Missing",
        version: 1,
      }),
      (error: unknown) => {
        assert.ok(error instanceof DefinitionArtifactIntegrityError);
        assert.deepEqual(error.definition, {
          processId: "Process_Missing",
          version: 1,
        });
        assert.equal(error.sourceSha256, deployed.definition?.source.sha256);
        return true;
      },
    );
  });
});

test("returns fresh metadata and source values from the read boundary", async () => {
  await withRepository(async ({ repository }) => {
    const artifacts = new MemoryArtifactStore();
    const service = new DefinitionDeploymentService(
      new AcceptedCompiler("Process_Defensive"),
      artifacts,
      repository,
    );
    const expectedBytes = encoder.encode("defensive-source");
    const deployed = await deployText(service, "defensive-source");
    assert.ok(deployed.definition !== undefined);

    const firstList = await service.listLatestDefinitions();
    assert.ok(firstList[0] !== undefined);
    Object.assign(firstList[0].source, { id: "mutated-return" });
    assert.equal(
      (await service.listLatestDefinitions())[0]?.source.id,
      "defensive-source",
    );

    const firstSource = await service.getDefinitionSource({
      processId: "Process_Defensive",
      version: 1,
    });
    assert.ok(firstSource !== null);
    firstSource.fill(0);
    assert.deepEqual(
      await service.getDefinitionSource({
        processId: "Process_Defensive",
        version: 1,
      }),
      expectedBytes,
    );
  });
});

async function deployText(
  service: DefinitionDeploymentService,
  text: string,
) {
  return await service.deploy({
    bytes: encoder.encode(text),
    sourceId: text,
    semanticProfile: "test-profile",
    expectedSha256: undefined,
  });
}

function serviceKeys(
  definitions: Awaited<
    ReturnType<DefinitionDeploymentService["listLatestDefinitions"]>
  >,
): string[] {
  return definitions
    .map(({ processId, version }) => `${processId}/${version}`);
}
