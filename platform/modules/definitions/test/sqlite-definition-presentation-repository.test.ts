import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import {
  DefinitionPresentationIntegrityError,
  SqliteDefinitionPresentationRepository,
} from "@bpmn-lean/platform-definitions";
import type {
  BpmnDiagramPresentationSidecar,
} from "@bpmn-lean/platform-definitions";

const sourceSha256 = "1".repeat(64);
const effectiveGeneratorSha256 = "2".repeat(64);
const presentationSha256 = "4".repeat(64);

function sidecar(
  diagramInterchangeXml: string = "<bpmndi:BPMNDiagram/>",
): BpmnDiagramPresentationSidecar {
  return {
    schemaEpoch: 1,
    sourceSha256,
    diagramInterchangeSha256: createHash("sha256")
      .update(diagramInterchangeXml, "utf8")
      .digest("hex"),
    presentationSha256,
    provenance: {
      kind: "generated",
      generatorId: "bpmn-auto-layout",
      generatorVersion: "1.3.0",
      effectiveGeneratorSha256,
    },
    diagramInterchangeXml,
  };
}

async function withDatabase(
  run: (databaseFile: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "bpmn-diagram-sidecars-"));
  try {
    await run(join(root, "definitions.sqlite"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("two independent connections insert-or-compare one exact sidecar", async () => {
  await withDatabase(async (databaseFile) => {
    const first = new SqliteDefinitionPresentationRepository(databaseFile);
    const second = new SqliteDefinitionPresentationRepository(databaseFile);
    try {
      assert.deepEqual(await first.insertOrCompare(sidecar()), sidecar());
      assert.deepEqual(await second.insertOrCompare(sidecar()), sidecar());
      assert.deepEqual(await second.get({
        schemaEpoch: 1,
        sourceSha256,
        effectiveGeneratorSha256,
      }), sidecar());
      await assert.rejects(
        second.insertOrCompare(sidecar("<bpmndi:BPMNDiagram id=\"drift\"/>")),
        DefinitionPresentationIntegrityError,
      );
      assert.deepEqual(await first.get({
        schemaEpoch: 1,
        sourceSha256,
        effectiveGeneratorSha256,
      }), sidecar());
    } finally {
      first.close();
      second.close();
    }
  });
});

test("sidecar equivalence is field-based and independent of object insertion order", async () => {
  await withDatabase(async (databaseFile) => {
    const repository = new SqliteDefinitionPresentationRepository(databaseFile);
    try {
      const exact = sidecar();
      await repository.insertOrCompare(exact);
      const reordered = {
        diagramInterchangeXml: exact.diagramInterchangeXml,
        provenance: {
          effectiveGeneratorSha256: exact.provenance.effectiveGeneratorSha256,
          generatorVersion: exact.provenance.generatorVersion,
          generatorId: exact.provenance.generatorId,
          kind: exact.provenance.kind,
        },
        presentationSha256: exact.presentationSha256,
        diagramInterchangeSha256: exact.diagramInterchangeSha256,
        sourceSha256: exact.sourceSha256,
        schemaEpoch: exact.schemaEpoch,
      } satisfies BpmnDiagramPresentationSidecar;

      assert.deepEqual(await repository.insertOrCompare(reordered), exact);
    } finally {
      repository.close();
    }
  });
});

test("a corrupt retained row fails closed without replacement", async () => {
  await withDatabase(async (databaseFile) => {
    const repository = new SqliteDefinitionPresentationRepository(databaseFile);
    await repository.insertOrCompare(sidecar());
    repository.close();
    const database = new DatabaseSync(databaseFile);
    database.prepare(`
      UPDATE definition_diagram_presentations
      SET diagram_interchange_xml = ?
      WHERE source_sha256 = ?
    `).run("<corrupt/>", sourceSha256);
    database.close();

    const reopened = new SqliteDefinitionPresentationRepository(databaseFile);
    try {
      await assert.rejects(
        reopened.get({
          schemaEpoch: 1,
          sourceSha256,
          effectiveGeneratorSha256,
        }),
        DefinitionPresentationIntegrityError,
      );
      await assert.rejects(
        reopened.insertOrCompare(sidecar()),
        DefinitionPresentationIntegrityError,
      );
    } finally {
      reopened.close();
    }
  });
});
