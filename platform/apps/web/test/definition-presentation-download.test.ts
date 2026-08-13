import assert from "node:assert/strict";
import { test } from "node:test";

import { DefinitionPresentationProvenanceKind } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionPresentationProvenance,
  ResolvedBpmnDiagramPresentation,
} from "@bpmn-lean/platform-contracts";

import {
  downloadDefinitionPresentation,
} from "../src/definition-presentation-download.ts";
import type {
  DefinitionPresentationDownloadPort,
} from "../src/definition-presentation-download.ts";

const rawDiagramInterchange = "<bpmndi:BPMNDiagram id=\"Diagram_1\"/>";
const completePresentationXml = [
  "<bpmn:definitions xmlns:bpmn=\"urn:bpmn\" xmlns:bpmndi=\"urn:bpmndi\">",
  "<bpmn:process id=\"Process_Portable\"/>",
  rawDiagramInterchange,
  "</bpmn:definitions>",
].join("");

test("source and generated arms download the merged complete BPMN XML", async () => {
  for (const provenance of [
    { kind: DefinitionPresentationProvenanceKind.Source },
    {
      kind: DefinitionPresentationProvenanceKind.Generated,
      generatorId: "bpmn-auto-layout",
      generatorVersion: "1.3.0",
      effectiveGeneratorSha256: "c".repeat(64),
    },
  ] as const satisfies readonly DefinitionPresentationProvenance[]) {
    const captured: Blob[] = [];
    const actions: string[] = [];
    const port: DefinitionPresentationDownloadPort = {
      createObjectUrl(blob) {
        captured.push(blob);
        return "blob:diagrammed-bpmn";
      },
      click(objectUrl, fileName) {
        actions.push(`${objectUrl}:${fileName}`);
      },
      revokeObjectUrl(objectUrl) {
        actions.push(`revoke:${objectUrl}`);
      },
    };

    downloadDefinitionPresentation(presentation(provenance), port);

    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.type, "application/bpmn+xml");
    assert.equal(await captured[0]?.text(), completePresentationXml);
    assert.notEqual(await captured[0]?.text(), rawDiagramInterchange);
    assert.deepEqual(actions, [
      "blob:diagrammed-bpmn:Order-Review-v7-diagrammed.bpmn",
      "revoke:blob:diagrammed-bpmn",
    ]);
  }
});

test("portable filenames cannot retain path separators or control characters", () => {
  const actions: string[] = [];
  downloadDefinitionPresentation(
    presentation({ kind: DefinitionPresentationProvenanceKind.Source }, "../../\n"),
    {
      createObjectUrl: () => "blob:safe-name",
      click: (_objectUrl, fileName) => actions.push(fileName),
      revokeObjectUrl: () => undefined,
    },
  );
  assert.deepEqual(actions, ["process-v7-diagrammed.bpmn"]);
});

function presentation(
  provenance: DefinitionPresentationProvenance,
  processId = "Order/Review",
): ResolvedBpmnDiagramPresentation {
  return {
    schemaEpoch: 1,
    definition: {
      processId,
      version: 7,
      source: {
        kind: "bpmnSource",
        id: "portable.bpmn",
        sha256: "a".repeat(64),
        byteLength: 42,
        declaredEncoding: null,
        decodedAs: "UTF-8",
      },
      semanticProfile: "profile/portable",
      startCapabilities: { messageStarts: [], timerStarts: [] },
    },
    sourceSha256: "a".repeat(64),
    presentationSha256: "b".repeat(64),
    provenance,
    presentationBpmnXml: completePresentationXml,
  };
}
