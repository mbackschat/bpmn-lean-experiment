import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type {
  BpmnPresentationAdapter,
  GeneratedDiagramInterchange,
  SourceDiagramResolution,
} from "@bpmn-lean/platform-bpmn-presentation";
import {
  DefinitionPresentationIntegrityError,
  DefinitionPresentationService,
} from "@bpmn-lean/platform-definitions";
import type {
  BpmnDiagramPresentationSidecar,
  DefinitionMetadata,
  DefinitionPresentationKey,
  DefinitionPresentationRepository,
  DefinitionRepository,
  ExactArtifactStore,
} from "@bpmn-lean/platform-definitions";

const sourcePath = new URL(
  "../../../../scenarios/user-task-assignment-form-metadata/process.bpmn",
  import.meta.url,
);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

class MemoryPresentations implements DefinitionPresentationRepository {
  readonly content = new Map<string, BpmnDiagramPresentationSidecar>();
  inserts = 0;

  get(key: DefinitionPresentationKey): BpmnDiagramPresentationSidecar | null {
    return structuredClone(this.content.get(JSON.stringify(key)) ?? null);
  }

  insertOrCompare(sidecar: BpmnDiagramPresentationSidecar) {
    this.inserts += 1;
    const key = JSON.stringify({
      schemaEpoch: sidecar.schemaEpoch,
      sourceSha256: sidecar.sourceSha256,
      effectiveGeneratorSha256: sidecar.provenance.effectiveGeneratorSha256,
    });
    const existing = this.content.get(key);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(sidecar)) {
      throw new DefinitionPresentationIntegrityError("conflict");
    }
    this.content.set(key, structuredClone(sidecar));
    return structuredClone(sidecar);
  }
}

class FakeAdapter implements BpmnPresentationAdapter {
  readonly effectiveGeneratorSha256 = "2".repeat(64);
  resolution: SourceDiagramResolution = { kind: "absent" };
  generations = 0;
  validationCalls = 0;
  corruptsComposedSource = false;

  async resolveSourceDiagram(): Promise<SourceDiagramResolution> {
    return structuredClone(this.resolution);
  }

  async generate(sourceXml: string): Promise<GeneratedDiagramInterchange> {
    this.generations += 1;
    const diagramInterchangeXml = [
      '<bpmndi:BPMNDiagram xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
      ' xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
      ' xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Diagram_1" />',
    ].join("");
    assert.match(sourceXml, /Process_UserTaskMetadata/u);
    return {
      diagramInterchangeXml,
      diagramInterchangeSha256: sha256(diagramInterchangeXml),
      provenance: {
        kind: "generated",
        generatorId: "bpmn-auto-layout",
        generatorVersion: "1.3.0",
        effectiveGeneratorSha256: this.effectiveGeneratorSha256,
      },
    };
  }

  async validateGeneratedComposition(
    sourceXml: string,
    _processId: string,
    diagramInterchangeXml: string,
  ): Promise<string> {
    this.validationCalls += 1;
    const compositionSource = this.corruptsComposedSource
      ? sourceXml.replace("Process_UserTaskMetadata", "Process_Corrupted")
      : sourceXml;
    return compositionSource.replace(
      "</bpmn:definitions>",
      `${diagramInterchangeXml}</bpmn:definitions>`,
    );
  }
}

test("source-owned DI wins without generation or persistence", async () => {
  const sourceXml = "<bpmn:definitions><bpmndi:BPMNDiagram/></bpmn:definitions>";
  const fixture = fixtureFor(sourceXml);
  fixture.adapter.resolution = { kind: "source" };

  const result = await fixture.service.resolve(fixture.reference);

  assert.equal(result?.provenance.kind, "source");
  assert.equal(result?.presentationBpmnXml, sourceXml);
  assert.equal(fixture.adapter.generations, 0);
  assert.equal(fixture.presentations.inserts, 0);
});

test("source-owned DI preserves an admitted UTF-8 BOM in the digest-bound presentation", async () => {
  const sourceXml = "\uFEFF<bpmn:definitions><bpmndi:BPMNDiagram/></bpmn:definitions>";
  const fixture = fixtureFor(sourceXml);
  fixture.adapter.resolution = { kind: "source" };

  const result = await fixture.service.resolve(fixture.reference);

  assert.equal(result?.presentationBpmnXml, sourceXml);
  assert.equal(result?.sourceSha256, sha256(sourceXml));
  assert.equal(result?.presentationSha256, sha256(result.presentationBpmnXml));
});

test("generated DI persists and restart reuses the validated sidecar", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const fixture = fixtureFor(sourceXml);

  const first = await fixture.service.resolve(fixture.reference);
  const second = await fixture.service.resolve(fixture.reference);

  assert.equal(first?.provenance.kind, "generated");
  assert.deepEqual(second, first);
  assert.equal(fixture.adapter.generations, 1);
  assert.equal(fixture.presentations.inserts, 1);
  assert.equal(
    first?.presentationBpmnXml.replace(
      fixture.presentations.content.values().next().value!.diagramInterchangeXml,
      "",
    ),
    sourceXml,
  );
  assert.equal(fixture.adapter.validationCalls, 3);
});

test("a one-byte source change uses a distinct durable sidecar", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const presentations = new MemoryPresentations();
  const adapter = new FakeAdapter();
  const original = fixtureFor(sourceXml, { presentations, adapter });
  const changed = fixtureFor(sourceXml.replace("reviewers", "reviewert"), {
    presentations,
    adapter,
  });

  const first = await original.service.resolve(original.reference);
  const second = await changed.service.resolve(changed.reference);

  assert.notEqual(first?.sourceSha256, second?.sourceSha256);
  assert.equal(adapter.generations, 2);
  assert.equal(presentations.inserts, 2);
  assert.equal(presentations.content.size, 2);
});

test("generated DI preserves an admitted UTF-8 BOM and every other source byte", async () => {
  const sourceXml = `\uFEFF${await readFile(sourcePath, "utf8")}`;
  const fixture = fixtureFor(sourceXml);

  const result = await fixture.service.resolve(fixture.reference);
  const retained = fixture.presentations.content.values().next().value!;

  assert.equal(
    result?.presentationBpmnXml.replace(retained.diagramInterchangeXml, ""),
    sourceXml,
  );
  assert.equal(result?.sourceSha256, sha256(sourceXml));
  assert.equal(result?.presentationSha256, sha256(result.presentationBpmnXml));
});

test("generated DI rejects a composition that changes an admitted source byte", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const fixture = fixtureFor(sourceXml);
  fixture.adapter.corruptsComposedSource = true;

  await assert.rejects(
    fixture.service.resolve(fixture.reference),
    /preserve the exact admitted source/u,
  );
  assert.equal(fixture.presentations.inserts, 0);
});

test("unusable source DI and digest-invalid retained sidecars fail closed", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const unusable = fixtureFor(sourceXml);
  unusable.adapter.resolution = { kind: "unusable", evidence: "missing edge" };
  await assert.rejects(
    unusable.service.resolve(unusable.reference),
    /source BPMN DI is unusable: missing edge/u,
  );
  assert.equal(unusable.adapter.generations, 0);

  const corrupt = fixtureFor(sourceXml);
  await corrupt.service.resolve(corrupt.reference);
  const stored = corrupt.presentations.content.values().next().value!;
  corrupt.presentations.content.set(
    corrupt.presentations.content.keys().next().value!,
    { ...stored, presentationSha256: "f".repeat(64) },
  );
  await assert.rejects(
    corrupt.service.resolve(corrupt.reference),
    DefinitionPresentationIntegrityError,
  );
  assert.equal(corrupt.adapter.generations, 1);
});

test("each retained sidecar binding field and byte surface fails closed independently", async () => {
  const sourceXml = await readFile(sourcePath, "utf8");
  const mutations: ReadonlyArray<Readonly<{
    name: string;
    mutate: (sidecar: BpmnDiagramPresentationSidecar) => BpmnDiagramPresentationSidecar;
  }>> = [
    {
      name: "source digest",
      mutate: (sidecar) => ({ ...sidecar, sourceSha256: "a".repeat(64) }),
    },
    {
      name: "DI digest",
      mutate: (sidecar) => ({ ...sidecar, diagramInterchangeSha256: "b".repeat(64) }),
    },
    {
      name: "presentation digest",
      mutate: (sidecar) => ({ ...sidecar, presentationSha256: "c".repeat(64) }),
    },
    {
      name: "provenance",
      mutate: (sidecar) => ({
        ...sidecar,
        provenance: { ...sidecar.provenance, generatorVersion: "1.3.1" },
      }) as unknown as BpmnDiagramPresentationSidecar,
    },
    {
      name: "effective generator identity",
      mutate: (sidecar) => ({
        ...sidecar,
        provenance: {
          ...sidecar.provenance,
          effectiveGeneratorSha256: "d".repeat(64),
        },
      }),
    },
    {
      name: "DI XML",
      mutate: (sidecar) => ({
        ...sidecar,
        diagramInterchangeXml: sidecar.diagramInterchangeXml.replace("Diagram_1", "Diagram_2"),
      }),
    },
  ];

  for (const mutation of mutations) {
    const fixture = fixtureFor(sourceXml);
    await fixture.service.resolve(fixture.reference);
    const key = fixture.presentations.content.keys().next().value!;
    const retained = fixture.presentations.content.get(key)!;
    fixture.presentations.content.set(key, mutation.mutate(retained));

    await assert.rejects(
      fixture.service.resolve(fixture.reference),
      DefinitionPresentationIntegrityError,
      mutation.name,
    );
  }
});

function fixtureFor(
  sourceXml: string,
  overrides: Readonly<{
    presentations?: MemoryPresentations;
    adapter?: FakeAdapter;
  }> = {},
) {
  const bytes = new TextEncoder().encode(sourceXml);
  const metadata: DefinitionMetadata = {
    processId: "Process_UserTaskMetadata",
    version: 1,
    source: {
      kind: "bpmnSource",
      id: "process.bpmn",
      sha256: sha256(sourceXml),
      byteLength: bytes.byteLength,
      declaredEncoding: "UTF-8",
      decodedAs: "UTF-8",
    },
    semanticProfile: "metadata-profile",
    startCapabilities: { messageStarts: [], timerStarts: [] },
  };
  const definitions: DefinitionRepository = {
    allocateNext: () => metadata,
    listLatest: () => [metadata],
    listVersions: () => [metadata],
    get: (reference) => reference.processId === metadata.processId &&
      reference.version === metadata.version ? structuredClone(metadata) : null,
  };
  const artifacts: ExactArtifactStore = {
    put: async () => ({ status: "stored" }),
    get: async (digest) => digest === metadata.source.sha256 ? bytes.slice() : null,
  };
  const presentations = overrides.presentations ?? new MemoryPresentations();
  const adapter = overrides.adapter ?? new FakeAdapter();
  return {
    adapter,
    presentations,
    reference: { processId: metadata.processId, version: metadata.version },
    service: new DefinitionPresentationService({
      definitions,
      artifacts,
      presentations,
      adapter,
      maxSourceBytes: 1024 * 1024,
      generationDeadlineMs: 1_000,
    }),
  };
}
