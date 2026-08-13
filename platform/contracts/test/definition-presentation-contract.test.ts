import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DefinitionPresentationProvenanceKind,
  decodeResolvedBpmnDiagramPresentation,
  definitionVersionPresentationPath,
} from "@bpmn-lean/platform-contracts";
import type {
  DeployedDefinitionVersion,
  ResolvedBpmnDiagramPresentation,
} from "@bpmn-lean/platform-contracts";

const definition = {
  processId: "order/process alpha",
  version: 2,
  source: {
    kind: "bpmnSource",
    id: "customer-order.bpmn",
    sha256: "a".repeat(64),
    byteLength: 3072,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "profile/portable",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const satisfies DeployedDefinitionVersion;

const generatedPresentation = {
  schemaEpoch: 1,
  definition,
  sourceSha256: definition.source.sha256,
  presentationSha256: "b".repeat(64),
  provenance: {
    kind: DefinitionPresentationProvenanceKind.Generated,
    generatorId: "bpmn-auto-layout",
    generatorVersion: "1.3.0",
    effectiveGeneratorSha256: "c".repeat(64),
  },
  presentationBpmnXml: "<definitions id=\"presented\"/>",
} as const satisfies ResolvedBpmnDiagramPresentation;

test("decodes source-owned and fixed-generator resolved presentations", () => {
  assert.deepEqual(
    decodeResolvedBpmnDiagramPresentation(generatedPresentation),
    generatedPresentation,
  );

  const sourcePresentation = {
    ...generatedPresentation,
    provenance: { kind: DefinitionPresentationProvenanceKind.Source },
  } as const;
  assert.deepEqual(
    decodeResolvedBpmnDiagramPresentation(sourcePresentation),
    sourcePresentation,
  );
});

test("rejects recursive private fields and unfixed generator provenance", () => {
  assert.throws(
    () => decodeResolvedBpmnDiagramPresentation({
      ...generatedPresentation,
      provenance: {
        ...generatedPresentation.provenance,
        workflowId: "private-workflow",
      },
    }),
    /provenance must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeResolvedBpmnDiagramPresentation({
      ...generatedPresentation,
      definition: {
        ...definition,
        source: { ...definition.source, workflowId: "nested-private-workflow" },
      },
    }),
    /definition\.source must contain exactly its public fields/u,
  );
  assert.throws(
    () => decodeResolvedBpmnDiagramPresentation({
      ...generatedPresentation,
      provenance: {
        ...generatedPresentation.provenance,
        generatorVersion: "1.4.0",
      },
    }),
    /generatorVersion must be 1\.3\.0/u,
  );
});

test("constructs the exact version presentation route", () => {
  assert.equal(
    definitionVersionPresentationPath("order/process alpha", 2),
    "/api/v1/definitions/order%2Fprocess%20alpha/versions/2/presentation",
  );
  assert.throws(
    () => definitionVersionPresentationPath("process", 0),
    /positive safe integer/u,
  );
});
