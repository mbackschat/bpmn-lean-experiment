/**
 * Locks the Temporal host boundary for the private parallel User Task metadata checkpoint.
 * Semantic admission owns the exact composed profile; the host admits its passive waits while still
 * rejecting a token split that can make a host-driven wait concurrent with another branch.
 */
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
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionResultKind,
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessBpmnProcessAdmission,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-testkit";

const checkpointProfile =
  SemanticCheckpointProfileId.ParallelUserTaskAssignmentFormMetadata;

async function compileCheckpointProgram(): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../bpmn-source/test/fixtures/parallel-user-task-metadata-composition.bpmn",
      import.meta.url,
    )),
    sourceId: "parallel-user-task-metadata-composition-checkpoint",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: checkpointProfile,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("checkpoint fixture was not admitted");
  }
  return compilation.semanticProcess;
}

test("admits the exact passive metadata pair before Workflow start", async () => {
  const program = await compileCheckpointProgram();
  assert.deepEqual(assessTemporalHostCapability(program), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });

  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-parallel-review",
    processId: program.processId,
    instanceId: "ParallelReview_1",
    initialVariables: [],
  };
  assert.deepEqual(assessBpmnProcessAdmission(start, program), {
    kind: BpmnProcessAdmissionResultKind.Admitted,
  });
});

test("retains the concurrent host-driven wait refusal", async () => {
  const program = await compileCheckpointProgram();
  const task = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.ok(task?.kind === SemanticOperationKind.AwaitUserTask);

  const concurrentTimer: SemanticProcessProgram = {
    ...program,
    operations: program.operations.map((operation) =>
      operation === task
        ? {
            id: task.id,
            kind: SemanticOperationKind.AwaitTimer,
            origin: task.origin,
            input: task.input,
            output: task.output,
            timer: { elementId: task.task.elementId, durationMs: 1_000 },
          }
        : operation
    ),
  };

  assert.deepEqual(assessTemporalHostCapability(concurrentTimer), {
    kind: TemporalHostCapabilityResultKind.Rejected,
    failure: {
      code: TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits,
      evidence:
        "A token split can make a timer or effect wait concurrent with another semantic branch.",
    },
  });
});
