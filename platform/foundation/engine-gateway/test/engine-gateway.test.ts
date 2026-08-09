/** Product 2 reaches BPMN compilation only through this narrowed gateway. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnEngineGateway,
  DefinitionCompilationStatus,
} from "@bpmn-lean/platform-engine-gateway";

const admittedSource = new URL(
  "../../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const semanticProfile = "bpmn-2.0.2-user-task-preserved-notation-draft";

test("compiles exact third-party bytes through the only product-2 engine boundary", async () => {
  const gateway = new BpmnEngineGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
  });
  const result = await gateway.compileDefinition({
    bytes: await readFile(admittedSource),
    sourceId: "uploaded-review-process",
    semanticProfile,
    expectedSha256: undefined,
  });

  assert.equal(result.status, DefinitionCompilationStatus.Accepted);
  assert.equal(result.source.id, "uploaded-review-process");
  assert.equal(result.definition.processId, "Process_SequentialUserTask");
  assert.equal(result.definition.semanticProfile, semanticProfile);
});
