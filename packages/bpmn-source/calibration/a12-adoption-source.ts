import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { BpmnSourceLimits } from "@bpmn-lean/bpmn-source";

/** Checks optional exact A12 source evidence only after its EUPL checkout is selected explicitly. */
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const externalRoot = process.env["BPMN_EXTERNAL_ROOT"] ?? path.resolve(
  projectRoot,
  "../oss",
);
const workflowsFixtures = path.join(
  externalRoot,
  "a12/a12-workflows/workflows-engine/src/testFixtures/resources/bpmn",
);
const limits: BpmnSourceLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});
const createDocumentSourceSha256 =
  "77d1c5c5f0d5ffb901e5a1cdad463fd6cb7c8c89e8b762540b2f22548711564a";
const boundaryErrorSourceSha256 =
  "e16e86c1fc84ea330f7c94d81854f54dc9170a88e0d627dab0d06539da682dff";
const createDocumentOverlaySha256 =
  "9a5d43f86368d93b18e23234a6b9681b80a48ba6d449873b357d6d90f2b7dd62";

async function readRequiredSource(fileName: string): Promise<Buffer> {
  const sourcePath = path.join(workflowsFixtures, fileName);
  try {
    return await readFile(sourcePath);
  } catch (error: unknown) {
    throw new Error(
      `registered A12 Workflows source is absent at ${sourcePath}; run ./scripts/setup-external-sources.sh adoption`,
      { cause: error },
    );
  }
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

const createDocumentBytes = await readRequiredSource("CreateDocument.bpmn");
const createDocumentOverlayBytes = await readFile(
  path.join(
    projectRoot,
    "adoption/a12/current/create-document.overlay.json",
  ),
);
assert.equal(sha256(createDocumentBytes), createDocumentSourceSha256);
const compilation = await compileBpmnToSemanticProcess({
  bytes: createDocumentBytes,
  sourceId: "a12-workflows-create-document",
  expectedSha256: undefined,
  semanticProfile:
    "cibseven-2.0.0-mapped-success-service-task-draft",
  sourceOverlay: {
    id: "a12-create-document-release-2025.06",
    sha256: createDocumentOverlaySha256,
    bytes: createDocumentOverlayBytes,
  },
  limits,
});
assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
assert.deepEqual(compilation.diagnostics, []);
assert.deepEqual([...compilation.copyExactBytes()], [...createDocumentBytes]);

const boundaryErrorBytes = await readRequiredSource(
  "TestProcessWithRelationshipModeledDocumentModels_DocRef.bpmn",
);
assert.equal(sha256(boundaryErrorBytes), boundaryErrorSourceSha256);
const boundaryErrorSource = boundaryErrorBytes.toString("utf8");
assert.equal(
  countOccurrences(boundaryErrorSource, 'camunda:errorCodeVariable=""'),
  1,
);
assert.equal(
  countOccurrences(
    boundaryErrorSource,
    'camunda:delegateExpression="#{createRelationshipLinkDelegate}"',
  ),
  1,
);

console.log(
  `A12_ADOPTION_SOURCE_OK root=${externalRoot}`,
);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
