import assert from "node:assert/strict";
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
const compilation = await compileBpmnToSemanticProcess({
  bytes: createDocumentBytes,
  sourceId: "a12-workflows-create-document",
  expectedSha256: undefined,
  semanticProfile: "cibseven-2.0.0-a12-create-document-draft",
  limits,
});
assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
assert.deepEqual(compilation.diagnostics, []);
assert.deepEqual([...compilation.copyExactBytes()], [...createDocumentBytes]);

const boundaryErrorSource = (
  await readRequiredSource(
    "TestProcessWithRelationshipModeledDocumentModels_DocRef.bpmn",
  )
).toString("utf8");
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
