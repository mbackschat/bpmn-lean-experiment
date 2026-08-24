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

/** Admission boundary for the reviewed sequential Multi-Instance managed deadline class. */
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });

test("admits one isolated sequential Multi-Instance lifetime deadline", async () => {
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
    kind: TemporalHostCapabilityResultKind.Admitted,
  });

  const operation = reserved[0];
  assert.ok(operation !== undefined);
  assert.deepEqual(
    assessTemporalHostCapability({
      ...program,
      operations: [
        ...program.operations,
        { ...operation, id: `${operation.id}:second` },
      ],
    }),
    {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code: TemporalHostAdmissionFailureCode
          .SequentialMultiInstanceSchedulerUnavailable,
        evidence:
          "The Temporal host admits only one isolated sequential Multi-Instance User Task with one exact PT1S outer-lifetime boundary Timer.",
      },
    },
  );
});
