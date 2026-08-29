import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import type { WorkflowClient } from "@temporalio/client";
import {
  BpmnProcessStartResultKind,
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessTemporalHostCapability,
  startBpmnProcess,
} from "@bpmn-lean/temporal-testkit";

/** Admission boundary for the reviewed sequential Multi-Instance managed deadline class. */
const limits = Object.freeze({ maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 });

test("admits one isolated sequential Multi-Instance lifetime deadline", async () => {
  const program = await compileProgram();

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
          "The Temporal host admits only one isolated sequential Multi-Instance User Task with one exact PT5S outer-lifetime boundary Timer.",
      },
    },
  );
});

test("rejects invalid sequential Multi-Instance start data before SDK creation", async () => {
  const program = await compileProgram();
  const operation = requireSequentialOperation(program);
  const exact = startWithBindings(program, "exact", [{
    name: operation.data.input.dataObjectReferenceId,
    value: { kind: VariableValueKind.StringList, value: ["contract"] },
  }]);
  const binding = exact.initialVariables[0];
  assert.ok(binding !== undefined);
  const invalid = [
    startWithBindings(program, "empty", []),
    startWithBindings(program, "wrong-name", [{
      ...binding,
      name: "Wrong_Input",
    }]),
    startWithBindings(program, "wrong-cardinality", [binding, binding]),
    startWithBindings(program, "too-many-items", [{
      ...binding,
      value: {
        kind: VariableValueKind.StringList,
        value: Array.from(
          { length: operation.limits.maximumItems + 1 },
          (_, index) => `item-${index}`,
        ),
      },
    }]),
    startWithBindings(program, "oversized-item", [{
      ...binding,
      value: {
        kind: VariableValueKind.StringList,
        value: ["x".repeat(operation.limits.maximumItemUtf8Bytes + 1)],
      },
    }]),
  ];

  for (const candidate of invalid) {
    const temporal = recordingClient();
    const result = await startBpmnProcess(
      temporal.client,
      candidate,
      program,
      { taskQueue: "sequential-multi-instance-task-queue" },
    );
    assert.equal(result.kind, BpmnProcessStartResultKind.Rejected, candidate.commandId);
    assert.equal(temporal.starts.length, 0, candidate.commandId);
  }
});

async function compileProgram(): Promise<SemanticProcessProgram> {
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
  return compilation.semanticProcess;
}

function requireSequentialOperation(
  program: SemanticProcessProgram,
): AwaitSequentialMultiInstanceUserTaskOperation {
  const operation = program.operations.find(({ kind }) =>
    kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
  );
  assert.equal(operation?.kind, SemanticOperationKind.AwaitSequentialMultiInstanceUserTask);
  if (operation?.kind !== SemanticOperationKind.AwaitSequentialMultiInstanceUserTask) {
    throw new TypeError("sequential Multi-Instance compilation lost its operation");
  }
  return operation;
}

function startWithBindings(
  program: SemanticProcessProgram,
  suffix: string,
  initialVariables: StartProcessStimulus["initialVariables"],
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId: `start-${suffix}`,
    processId: program.processId,
    instanceId: `SequentialMultiInstance_${suffix}`,
    initialVariables,
  };
}

function recordingClient(): Readonly<{
  client: WorkflowClient;
  starts: unknown[];
}> {
  const starts: unknown[] = [];
  return {
    client: {
      start: async (...arguments_: unknown[]) => {
        starts.push(arguments_);
        return Object.freeze({ workflowId: "recorded-workflow" });
      },
    } as unknown as WorkflowClient,
    starts,
  };
}
