import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { HumanTaskCatalogV1 } from "@bpmn-lean/platform-contracts";
import {
  ArtifactPutStatus,
} from "@bpmn-lean/platform-artifact-store";
import type {
  ArtifactPutRequest,
  ArtifactPutResult,
} from "@bpmn-lean/platform-artifact-store";
import {
  DefinitionCompilationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCompilationRequest,
  DefinitionCompiler,
} from "@bpmn-lean/platform-engine-gateway";
import {
  DefinitionDeploymentService,
  DefinitionDeploymentStatus,
  SqliteDefinitionRepository,
} from "@bpmn-lean/platform-definitions";
import type { ExactArtifactStore } from "@bpmn-lean/platform-definitions";

const profile = "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";
const source = new TextEncoder().encode("<exact-source/>");
const sourceSha256 = createHash("sha256").update(source).digest("hex");

const catalog: HumanTaskCatalogV1 = {
  schemaVersion: "bpmn-lean-human-task-catalog/v1",
  processId: "expense-exception-review",
  semanticProfile: profile,
  sourceSha256,
  tasks: [{
    elementId: "ReviewException",
    description: "Review the expense exception.",
    worklistPriority: 80,
    form: {
      schemaVersion: "bpmn-lean-structured-form/v1",
      fields: [{
        kind: "boolean",
        key: "confirmed",
        label: "Confirm review",
        helpText: null,
        defaultValue: null,
        visibleForActions: "all",
        requiredForActions: ["approve", "abort"],
      }],
      actions: [{
        id: "approve",
        label: "Approve",
        intent: "primary",
        resolutionValue: "approved",
      }, {
        id: "abort",
        label: "Abort",
        intent: "destructive",
        resolutionValue: "aborted",
      }],
      resolutionVariable: "resolution",
    },
  }],
};

test("persists the exact accepted catalog atomically with its definition version", async () => {
  await withRepository(async ({ databaseFile, repository }) => {
    const artifacts = new MemoryArtifactStore();
    const service = new DefinitionDeploymentService(
      acceptedCompiler(),
      artifacts,
      repository,
      {
        project: () => ({
          kind: "catalog",
          catalog,
          provenance: {
            kind: "exactBpmnSource",
            processId: catalog.processId,
            semanticProfile: catalog.semanticProfile,
            sourceSha256: catalog.sourceSha256,
          },
        }),
      },
    );

    const result = await service.deploy({
      bytes: source,
      sourceId: "expense-exception-review.bpmn",
      semanticProfile: profile,
      expectedSha256: sourceSha256,
    });

    assert.equal(result.status, DefinitionDeploymentStatus.Deployed);
    assert.equal(artifacts.puts.length, 1);
    assert.deepEqual(
      await repository.getHumanTaskCatalog({
        processId: catalog.processId,
        version: 1,
      }),
      catalog,
    );

    repository.close();
    const reopened = new SqliteDefinitionRepository(databaseFile);
    try {
      assert.deepEqual(
        await reopened.getHumanTaskCatalog({
          processId: catalog.processId,
          version: 1,
        }),
        catalog,
      );
    } finally {
      reopened.close();
    }
  });
});

test("refuses an absent or invalid required catalog before artifact or metadata writes", async () => {
  for (const projection of [
    { kind: "absent" as const },
    { kind: "invalid" as const, evidence: "catalogContract" as const },
  ]) {
    await withRepository(async ({ repository }) => {
      const artifacts = new MemoryArtifactStore();
      const service = new DefinitionDeploymentService(
        acceptedCompiler(),
        artifacts,
        repository,
        { project: () => projection },
      );

      const result = await service.deploy({
        bytes: source,
        sourceId: "expense-exception-review.bpmn",
        semanticProfile: profile,
        expectedSha256: sourceSha256,
      });

      assert.equal(result.status, DefinitionDeploymentStatus.Rejected);
      assert.match(result.diagnostics[0]?.evidence ?? "", /Human Task catalog/u);
      assert.deepEqual(artifacts.puts, []);
      assert.deepEqual(await service.listLatestDefinitions(), []);
      assert.equal(
        await repository.getHumanTaskCatalog({
          processId: catalog.processId,
          version: 1,
        }),
        null,
      );
    });
  }
});

function acceptedCompiler(): DefinitionCompiler {
  return {
    async compileDefinition(request: DefinitionCompilationRequest) {
      assert.deepEqual(request.bytes, source);
      return {
        status: DefinitionCompilationStatus.Accepted,
        source: {
          kind: "bpmnSource",
          id: request.sourceId,
          sha256: sourceSha256,
          byteLength: source.byteLength,
          declaredEncoding: null,
          decodedAs: "UTF-8",
        },
        diagnostics: [],
        definition: {
          processId: catalog.processId,
          semanticProfile: request.semanticProfile,
        },
        startCapabilities: { messageStarts: [], timerStarts: [] },
      };
    },
  };
}

class MemoryArtifactStore implements ExactArtifactStore {
  readonly puts: ArtifactPutRequest[] = [];
  readonly #content = new Map<string, Uint8Array>();

  async put(request: ArtifactPutRequest): Promise<ArtifactPutResult> {
    this.puts.push({
      sha256: request.sha256,
      bytes: Uint8Array.from(request.bytes),
    });
    this.#content.set(request.sha256, Uint8Array.from(request.bytes));
    return { status: ArtifactPutStatus.Stored };
  }

  async get(digest: string): Promise<Uint8Array | null> {
    const bytes = this.#content.get(digest);
    return bytes === undefined ? null : Uint8Array.from(bytes);
  }
}

async function withRepository(
  run: (fixture: Readonly<{
    databaseFile: string;
    repository: SqliteDefinitionRepository;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-lean-catalog-"));
  const databaseFile = join(root, "definitions.sqlite");
  const repository = new SqliteDefinitionRepository(databaseFile);
  try {
    await run({ databaseFile, repository });
  } finally {
    if (repository.isOpen) repository.close();
    await rm(root, { recursive: true, force: true });
  }
}
