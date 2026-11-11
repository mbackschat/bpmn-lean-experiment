import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ArtifactPutStatus } from "@bpmn-lean/platform-artifact-store";
import {
  DefinitionCompilationStatus,
  DefinitionRegistrationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCompilationRequest,
  DefinitionCompilationResult,
  DefinitionCompiler,
  DefinitionVersionRegistrar,
  DefinitionVersionRegistrationRequest,
  DefinitionVersionRegistrationResult,
} from "@bpmn-lean/platform-engine-gateway";

import {
  DefinitionDeploymentService,
  DefinitionEngineRegistrationError,
  SqliteDefinitionRepository,
} from "@bpmn-lean/platform-definitions";
import type { ExactArtifactStore } from "@bpmn-lean/platform-definitions";

const encoder = new TextEncoder();

/** What the scripted engine does with the next registration of `processId/version`. */
type Answer = "register" | "refuse" | "unavailable";

/** A compiler that admits every source as the process its text names before `:`, and a scripted engine registrar. */
class ScriptedEngine implements DefinitionCompiler, DefinitionVersionRegistrar {
  /** Every registration the engine was asked for, as `processId/version`, including the unavailable ones. */
  readonly requests: string[] = [];
  readonly #answers = new Map<string, Answer[]>();

  answer(key: string, ...answers: Answer[]): void {
    this.#answers.set(key, answers);
  }

  async compileDefinition(request: DefinitionCompilationRequest): Promise<DefinitionCompilationResult> {
    return {
      status: DefinitionCompilationStatus.Accepted,
      source: {
        kind: "bpmnSource",
        id: request.sourceId,
        sha256: createHash("sha256").update(request.bytes).digest("hex"),
        byteLength: request.bytes.byteLength,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      diagnostics: [],
      definition: { sourceOverlay: null, processId: request.sourceId.split(":")[0]!, semanticProfile: request.semanticProfile },
      startCapabilities: { messageStarts: [], timerStarts: [] },
    };
  }

  async registerDefinitionVersion(request: DefinitionVersionRegistrationRequest): Promise<DefinitionVersionRegistrationResult> {
    const key = `${request.expectedProcessId}/${request.version}`;
    this.requests.push(key);
    assert.equal(new TextDecoder().decode(request.bytes), request.sourceId, "registers the version's retained bytes");
    switch (this.#answers.get(key)?.shift() ?? "register") {
      case "register":
        return { status: DefinitionRegistrationStatus.Registered };
      case "refuse":
        return { status: DefinitionRegistrationStatus.Refused, failure: { code: "deployment.messageStartName", evidence: "refused" } };
      case "unavailable":
        throw new Error("engine unavailable");
    }
  }
}

class MemoryArtifacts implements ExactArtifactStore {
  readonly #content = new Map<string, Uint8Array>();

  async put(request: Readonly<{ sha256: string; bytes: Uint8Array }>) {
    this.#content.set(request.sha256, Uint8Array.from(request.bytes));
    return { status: ArtifactPutStatus.Stored };
  }

  async get(sha256: string): Promise<Uint8Array | null> {
    return this.#content.get(sha256) ?? null;
  }
}

async function withService(run: (service: DefinitionDeploymentService, engine: ScriptedEngine) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-registration-"));
  const repository = new SqliteDefinitionRepository(join(root, "definitions.sqlite"));
  const engine = new ScriptedEngine();
  try {
    await run(new DefinitionDeploymentService(engine, new MemoryArtifacts(), repository), engine);
  } finally {
    repository.close();
    await rm(root, { recursive: true, force: true });
  }
}

/** Deploys the source `<processId>:<label>`. */
async function deploy(service: DefinitionDeploymentService, processId: string, label: string) {
  const text = `${processId}:${label}`;
  return await service.deploy({ bytes: encoder.encode(text), sourceId: text, semanticProfile: "test-profile", expectedSha256: undefined });
}

async function listedVersions(service: DefinitionDeploymentService, processId: string): Promise<number[]> {
  return (await service.listDefinitionVersions(processId)).map(({ version }) => version);
}

test("a deploy first registers its process's earlier pending versions, in version order", async () => {
  await withService(async (service, engine) => {
    engine.answer("P/1", "unavailable");
    await assert.rejects(deploy(service, "P", "1"), /engine unavailable/u);
    // Allocated but pending: listed, and registered by the next deploy of the process before its own version.
    assert.deepEqual(await listedVersions(service, "P"), [1]);
    await deploy(service, "P", "2");
    assert.deepEqual(engine.requests, ["P/1", "P/1", "P/2"]);
    await service.reconcileAll();
    assert.deepEqual(engine.requests, ["P/1", "P/1", "P/2"]);
  });
});

test("an earlier version the engine cannot reach leaves the deployed version pending and unsent", async () => {
  await withService(async (service, engine) => {
    engine.answer("P/1", "unavailable", "unavailable");
    await assert.rejects(deploy(service, "P", "1"), /engine unavailable/u);
    await assert.rejects(deploy(service, "P", "2"), /engine unavailable/u);
    assert.deepEqual(engine.requests, ["P/1", "P/1"]);
    assert.deepEqual(await listedVersions(service, "P"), [1, 2]);
  });
});

test("a version the engine refuses is recorded, no longer listed, and never registered again", async () => {
  await withService(async (service, engine) => {
    engine.answer("P/1", "refuse");
    await assert.rejects(deploy(service, "P", "1"), (error: unknown) =>
      error instanceof DefinitionEngineRegistrationError && error.code === "deployment.messageStartName" &&
      error.definition.version === 1);
    assert.deepEqual(await listedVersions(service, "P"), []);
    assert.deepEqual(await service.listLatestDefinitions(), []);
    assert.equal((await service.getDefinitionMetadata({ processId: "P", version: 1 }))?.version, 1);
    await deploy(service, "P", "2");
    await service.reconcileAll();
    assert.deepEqual(engine.requests, ["P/1", "P/2"]);
    assert.deepEqual((await service.listLatestDefinitions()).map(({ version }) => version), [2]);
  });
});

test("recovery registers every pending version, each process's in version order", async () => {
  await withService(async (service, engine) => {
    engine.answer("A/1", "unavailable", "unavailable");
    engine.answer("B/1", "unavailable");
    await assert.rejects(deploy(service, "A", "1"), /engine unavailable/u);
    await assert.rejects(deploy(service, "A", "2"), /engine unavailable/u);
    await assert.rejects(deploy(service, "B", "1"), /engine unavailable/u);
    engine.requests.length = 0;
    await service.reconcileAll();
    assert.deepEqual(engine.requests, ["A/1", "A/2", "B/1"]);
    await service.reconcileAll();
    assert.deepEqual(engine.requests, ["A/1", "A/2", "B/1"]);
  });
});

test("recovery stops at a version the engine cannot reach, so no later version registers before it", async () => {
  await withService(async (service, engine) => {
    engine.answer("P/1", "unavailable", "unavailable", "unavailable");
    await assert.rejects(deploy(service, "P", "1"), /engine unavailable/u);
    await assert.rejects(deploy(service, "P", "2"), /engine unavailable/u);
    engine.requests.length = 0;
    await assert.rejects(service.reconcileAll(), /engine unavailable/u);
    assert.deepEqual(engine.requests, ["P/1"]);
    await service.reconcileAll();
    assert.deepEqual(engine.requests, ["P/1", "P/1", "P/2"]);
  });
});
