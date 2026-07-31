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
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnProcessAdmissionFailureCode,
  BpmnProcessAdmissionResultKind,
  TemporalHostAdmissionFailureCode,
  TemporalHostCapabilityResultKind,
  assessBpmnProcessAdmission,
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-adapter";
import {
  requireScenarioAdmission,
} from "../dist/scenario-admission.js";

const limits = Object.freeze({
  maxBytes: 1024 * 1024,
  parserDeadlineMs: 1_000,
});

async function compileFixture(
  relativePath: string,
  sourceId: string,
  semanticProfile: string,
): Promise<SemanticProcessProgram> {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(relativePath, import.meta.url)),
    sourceId,
    expectedSha256: undefined,
    semanticProfile,
    limits,
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    throw new Error("fixture was not admitted");
  }
  return compilation.semanticProcess;
}

test("admits each reachable wait set of the new linear composition", async () => {
  const program = await compileFixture(
    "../../../scenarios/timer-user-task-composition/process.bpmn",
    "timer-user-task-composition-process",
    "bpmn-2.0.2-timer-user-task-composition-draft",
  );

  assert.deepEqual(assessTemporalHostCapability(program), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });

  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-timer-user-task-composition",
    processId: program.processId,
    instanceId: "CompositionInstance_1",
  };
  assert.deepEqual(assessBpmnProcessAdmission(start, program), {
    kind: BpmnProcessAdmissionResultKind.Admitted,
  });
  assert.deepEqual(
    assessBpmnProcessAdmission(start, {
      ...program,
      identity: {
        ...program.identity,
        semanticProfile: "unknown-profile",
      },
    }),
    {
      kind: BpmnProcessAdmissionResultKind.Rejected,
      failure: {
        code:
          BpmnProcessAdmissionFailureCode.SemanticProcessUnsupported,
        evidence:
          "Workflow start requires one admitted Semantic Process execution.",
      },
    },
  );
  assert.throws(
    () =>
      requireScenarioAdmission(start, {
        ...program,
        identity: {
          ...program.identity,
          semanticProfile: "unknown-profile",
        },
      }),
    /semanticProcessUnsupported/u,
  );
});

test("classifies Message and User Task as passive ingress in either operation order", async () => {
  const program = await compileFixture(
    "../../../scenarios/intermediate-catch-message/process.bpmn",
    "intermediate-catch-message-process",
    "bpmn-2.0.2-intermediate-catch-message-draft",
  );
  const waitKinds = program.operations.flatMap(({ kind }) =>
    kind === SemanticOperationKind.AwaitMessage ||
    kind === SemanticOperationKind.AwaitUserTask
      ? [kind]
      : []
  );
  assert.deepEqual(waitKinds.sort(), [
    SemanticOperationKind.AwaitMessage,
    SemanticOperationKind.AwaitUserTask,
  ].sort());
  assert.deepEqual(assessTemporalHostCapability(program), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });
  assert.deepEqual(
    assessTemporalHostCapability({
      ...program,
      operations: [...program.operations].reverse(),
    }),
    {
      kind: TemporalHostCapabilityResultKind.Admitted,
    },
  );
});

test("keeps passive parallel User Tasks separate from host-driven waits", async () => {
  const parallel = await compileFixture(
    "../../../scenarios/parallel-fork-join/process.bpmn",
    "parallel-two-user-tasks-process",
    "parallel-fork-join-draft",
  );
  assert.deepEqual(assessTemporalHostCapability(parallel), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });

  const task = parallel.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.ok(task?.kind === SemanticOperationKind.AwaitUserTask);
  const concurrentTimer: SemanticProcessProgram = {
    ...parallel,
    operations: parallel.operations.map((operation) =>
      operation === task
        ? {
            id: task.id,
            kind: SemanticOperationKind.AwaitTimer,
            origin: task.origin,
            input: task.input,
            output: task.output,
            timer: {
              elementId: task.task.elementId,
              durationMs: 1000,
            },
          }
        : operation
    ),
  };

  assert.deepEqual(assessTemporalHostCapability(concurrentTimer), {
    kind: TemporalHostCapabilityResultKind.Rejected,
    failure: {
      code:
        TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits,
      evidence:
        "A token split can make a timer or effect wait concurrent with another semantic branch.",
    },
  });
});
