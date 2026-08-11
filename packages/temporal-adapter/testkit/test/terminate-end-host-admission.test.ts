import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticCheckpointProfileId,
  SemanticOperationKind,
} from "@bpmn-lean/semantic-core";
import {
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-testkit";

test("classifies containing-scope termination as passive internal closure", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(
      new URL(
        "../../../bpmn-source/test/fixtures/terminate-end-event.bpmn",
        import.meta.url,
      ),
    ),
    sourceId: "terminate-end-host-admission",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: SemanticCheckpointProfileId.TerminateEnd,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("Terminate End fixture was not admitted");
  }
  assert.equal(
    compilation.semanticProcess.operations.some(
      ({ kind }) => kind === SemanticOperationKind.TerminateScope,
    ),
    true,
  );
  assert.equal(
    compilation.semanticProcess.operations.some(
      ({ kind }) => kind === SemanticOperationKind.Duplicate,
    ),
    true,
  );

  assert.deepEqual(
    assessTemporalHostCapability(compilation.semanticProcess),
    { kind: TemporalHostCapabilityResultKind.Admitted },
  );
  assert.deepEqual(
    assessTemporalHostCapability({
      ...compilation.semanticProcess,
      operations: [...compilation.semanticProcess.operations].reverse(),
    }),
    { kind: TemporalHostCapabilityResultKind.Admitted },
  );
});
