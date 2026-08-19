import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import { SemanticOperationKind } from "@bpmn-lean/semantic-core";
import {
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-testkit";

/**
 * Host refusal of an operation the contract admits before its runtime exists.
 *
 * The oracle is the reserved sequential Multi-Instance profile, which is deliberately not
 * execution-registered: its source and IL lanes compile, and no evaluator commits it. The host must
 * refuse it as unrunnable rather than classify it as passive, because the admission tail admits every
 * program that claims no managed scheduler, so a passive classification would silently admit it.
 */
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });

test("refuses a program carrying an operation with no reviewed runtime transition", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(
      new URL(
        "../../../bpmn-source/test/fixtures/sequential-multi-instance-user-task.bpmn",
        import.meta.url,
      ),
    ),
    sourceId: "sequential-multi-instance-user-task-process",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    limits,
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("reserved Multi-Instance source was not admitted");
  }
  const program = compilation.semanticProcess;

  // Without this the test could pass for the wrong reason: a compilation that produced no reserved
  // operation would leave nothing for the refusal to be about.
  const reserved = program.operations.filter(
    ({ kind }) =>
      kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  assert.equal(reserved.length, 1);

  assert.deepEqual(assessTemporalHostCapability(program), {
    kind: TemporalHostCapabilityResultKind.Rejected,
    failure: {
      code: TemporalHostAdmissionFailureCode.UnsupportedOperationSemantics,
      evidence:
        `Operation ${reserved[0]?.id} of kind awaitSequentialMultiInstanceUserTask has no reviewed runtime transition, so no Temporal host can run it.`,
    },
  });
});
