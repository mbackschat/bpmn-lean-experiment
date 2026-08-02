import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  EffectOperation,
  EffectProtocol,
  SemanticOperationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
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
  requireScenarioAdmission,
} from "@bpmn-lean/temporal-adapter";

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
    initialVariables: [],
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

test("guards selectMany token-split classification against Timer and effect waits", async () => {
  const inclusive = await compileFixture(
    "../../../scenarios/inclusive-gateway-selected-branches/process.bpmn",
    "inclusive-gateway-test",
    "bpmn-2.0.2-inclusive-gateway-selected-branches-draft",
  );

  for (const hostWaitKind of [
    SemanticOperationKind.AwaitTimer,
    SemanticOperationKind.AwaitEffect,
  ] as const) {
    assert.deepEqual(
      assessTemporalHostCapability(
        replaceTaskWithHostWait(inclusive, hostWaitKind),
      ),
      {
        kind: TemporalHostCapabilityResultKind.Rejected,
        failure: {
          code:
            TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits,
          evidence:
            "A token split can make a timer or effect wait concurrent with another semantic branch.",
        },
      },
    );
  }
});

test("admits one managed Event-Based Gateway race and rejects every extra host-concurrency family", async () => {
  const eventRace = await compileFixture(
    "../../bpmn-source/test/fixtures/event-based-gateway-message-timer.bpmn",
    "event-race-host-admission",
    "bpmn-2.0.2-event-based-gateway-message-timer-draft",
  );
  const race = eventRace.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitEventRace,
  );
  assert.ok(race?.kind === SemanticOperationKind.AwaitEventRace);
  assert.deepEqual(assessTemporalHostCapability(eventRace), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });

  const expectedRejection = {
    kind: TemporalHostCapabilityResultKind.Rejected,
    failure: {
      code: TemporalHostAdmissionFailureCode.ConcurrentHostDrivenWaits,
      evidence:
        "A managed event race cannot coexist with another timer, effect, token split, or race.",
    },
  } as const;
  for (const hostWaitKind of [
    SemanticOperationKind.AwaitTimer,
    SemanticOperationKind.AwaitEffect,
  ] as const) {
    assert.deepEqual(
      assessTemporalHostCapability(
        replaceTaskWithHostWait(eventRace, hostWaitKind),
      ),
      expectedRejection,
    );
  }

  const parallel = await compileFixture(
    "../../../scenarios/parallel-fork-join/process.bpmn",
    "parallel-two-user-tasks-process",
    "parallel-fork-join-draft",
  );
  const duplicate = parallel.operations.find(
    ({ kind }) => kind === SemanticOperationKind.Duplicate,
  );
  assert.ok(duplicate?.kind === SemanticOperationKind.Duplicate);
  assert.deepEqual(
    assessTemporalHostCapability({
      ...eventRace,
      operations: [...eventRace.operations, duplicate],
    }),
    expectedRejection,
  );
  assert.deepEqual(
    assessTemporalHostCapability({
      ...eventRace,
      operations: [...eventRace.operations, { ...race, id: `${race.id}:second` }],
    }),
    expectedRejection,
  );
});

test("admits embedded scope waits independently of semantic operation order", async () => {
  const program = await compileFixture(
    "../../../scenarios/embedded-subprocess-completion/process.bpmn",
    "embedded-subprocess-completion-process",
    "cibseven-2.2.0-embedded-subprocess-completion-draft",
  );

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

test("classifies Sub-Process Error propagation as passive ingress plus internal closure", async () => {
  const program = await compileFixture(
    "../../../scenarios/subprocess-error-propagation/process.bpmn",
    "subprocess-error-propagation-process",
    "cibseven-2.2.0-subprocess-error-propagation-draft",
  );
  assert.equal(
    program.operations.some(
      ({ kind }) => kind === SemanticOperationKind.ThrowError,
    ),
    true,
  );
  assert.deepEqual(assessTemporalHostCapability(program), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });
  assert.deepEqual(
    assessTemporalHostCapability({
      ...program,
      operations: [...program.operations].reverse(),
    }),
    { kind: TemporalHostCapabilityResultKind.Admitted },
  );
});

function replaceTaskWithHostWait(
  program: SemanticProcessProgram,
  hostWaitKind:
    | SemanticOperationKind.AwaitTimer
    | SemanticOperationKind.AwaitEffect,
): SemanticProcessProgram {
  const task = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  assert.ok(task?.kind === SemanticOperationKind.AwaitUserTask);
  const hostWait = hostWaitKind === SemanticOperationKind.AwaitTimer
    ? ({
        id: task.id,
        kind: SemanticOperationKind.AwaitTimer,
        origin: task.origin,
        input: task.input,
        output: task.output,
        timer: {
          elementId: task.task.elementId,
          durationMs: 1000 as const,
        },
      } as const satisfies SemanticOperation)
    : ({
        id: task.id,
        kind: SemanticOperationKind.AwaitEffect,
        origin: task.origin,
        input: task.input,
        output: task.output,
        effect: {
          elementId: task.task.elementId,
          descriptor: {
            protocol: EffectProtocol.Activity,
            operation: EffectOperation.Probe,
          },
          inputMappings: [],
          outputMappings: [],
        },
        bpmnErrorRoute: null,
      } as const satisfies SemanticOperation);

  return {
    ...program,
    operations: program.operations.map((operation) => {
      if (operation === task) {
        return hostWait;
      }
      return operation;
    }),
  };
}
