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
  SemanticProfileId,
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
} from "@bpmn-lean/temporal-testkit";

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
    sourceOverlay: null,
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
    "../../../../scenarios/timer-user-task-composition/process.bpmn",
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
    "../../../../scenarios/intermediate-catch-message/process.bpmn",
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

test("classifies a resumption-bounded Exclusive Merge as passive", async () => {
  const program = await compileFixture(
    "../../../bpmn-source/test/fixtures/cyclic-control-flow.bpmn",
    "cyclic-control-flow-host-admission",
    SemanticProfileId.UserTaskCycle,
  );
  assert.ok(
    program.operations.some(
      ({ kind }) => kind === SemanticOperationKind.MergeExclusive,
    ),
  );
  assert.deepEqual(assessTemporalHostCapability(program), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });

  const start: StartProcessStimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-cyclic-control-flow",
    processId: program.processId,
    instanceId: "CyclicControlFlowInstance_1",
    initialVariables: [],
  };
  assert.deepEqual(assessBpmnProcessAdmission(start, program), {
    kind: BpmnProcessAdmissionResultKind.Admitted,
  });
  assert.equal(
    assessBpmnProcessAdmission(start, {
      ...program,
      identity: { ...program.identity, semanticProfile: "unknown-profile" },
    }).kind,
    BpmnProcessAdmissionResultKind.Rejected,
  );
});

test("keeps passive parallel User Tasks separate from host-driven waits", async () => {
  const parallel = await compileFixture(
    "../../../../scenarios/parallel-fork-join/process.bpmn",
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
    "../../../../scenarios/inclusive-gateway-selected-branches/process.bpmn",
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

test("admits only the exact managed Event-Based Gateway race", async () => {
  const eventRace = await compileFixture(
    "../../../../scenarios/event-based-gateway-message-timer/process.bpmn",
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
      code: TemporalHostAdmissionFailureCode.EventRaceSchedulerUnavailable,
      evidence:
        "The Temporal host admits only one isolated operation-addressed Message/PT1S managed race.",
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
    "../../../../scenarios/parallel-fork-join/process.bpmn",
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

/**
 * The cross-class barrier, which the two same-class cases above do not reach.
 *
 * Both existing managed cases pair an operation with another of its own class, so a classifier that
 * counted each class independently would still pass them. This one pairs a bounded scope with a
 * managed race: each is admissible alone, and together they need two schedulers the adapter does not
 * run concurrently. The refusal identity is the race's, because that class is present and is reported
 * first, so an operator is told about a class the program actually contains.
 */
test("rejects a bounded Sub-Process scope beside a managed race", async () => {
  const boundedScope = await compileFixture(
    "../../../../scenarios/subprocess-boundary-timer/process.bpmn",
    "subprocess-boundary-timer-host-admission",
    "bpmn-2.0.2-subprocess-boundary-timer-draft",
  );
  const eventRace = await compileFixture(
    "../../../../scenarios/event-based-gateway-message-timer/process.bpmn",
    "event-race-beside-bounded-scope",
    "bpmn-2.0.2-event-based-gateway-message-timer-draft",
  );
  const scope = boundedScope.operations.find(
    ({ kind }) => kind === SemanticOperationKind.EnterBoundedScope,
  );
  const race = eventRace.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitEventRace,
  );
  assert.ok(scope?.kind === SemanticOperationKind.EnterBoundedScope);
  assert.ok(race?.kind === SemanticOperationKind.AwaitEventRace);

  assert.deepEqual(assessTemporalHostCapability(boundedScope), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });
  assert.deepEqual(
    assessTemporalHostCapability({
      ...boundedScope,
      operations: [...boundedScope.operations, race],
    }),
    {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code: TemporalHostAdmissionFailureCode.EventRaceSchedulerUnavailable,
        evidence:
          "The Temporal host admits only one isolated operation-addressed Message/PT1S managed race.",
      },
    },
  );
  // A second bounded scope reports this capsule's own identity, which is what makes the new code
  // falsifiable rather than only reachable through the race's.
  assert.deepEqual(
    assessTemporalHostCapability({
      ...boundedScope,
      operations: [
        ...boundedScope.operations,
        { ...scope, id: `${scope.id}:second` },
      ],
    }),
    {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code: TemporalHostAdmissionFailureCode.BoundedScopeSchedulerUnavailable,
        evidence:
          "The Temporal host admits only one isolated bounded Sub-Process scope with an exact PT1S boundary Timer.",
      },
    },
  );
});

test("admits embedded scope waits independently of semantic operation order", async () => {
  const program = await compileFixture(
    "../../../../scenarios/embedded-subprocess-completion/process.bpmn",
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
    "../../../../scenarios/subprocess-error-propagation/process.bpmn",
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

test("classifies Call Activity invocation and return as internal closure", async () => {
  const program = await compileFixture(
    "../../../bpmn-source/test/fixtures/call-activity-called-process.bpmn",
    "called-process-call-activity-host-admission",
    "bpmn-2.0.2-called-process-call-activity-draft",
  );
  assert.deepEqual(
    program.operations
      .filter(
        ({ kind }) =>
          kind === SemanticOperationKind.InvokeProcess ||
          kind === SemanticOperationKind.ReturnProcess,
      )
      .map(({ kind }) => kind)
      .sort(),
    [
      SemanticOperationKind.InvokeProcess,
      SemanticOperationKind.ReturnProcess,
    ].sort(),
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

/**
 * The fourth managed class must refuse under its own identity, not only be admitted.
 *
 * Positive admission alone would be satisfied by a classifier that never reached this class at all,
 * because an unclassified operation is passive and passive programs are admitted. The two refusals
 * below are what make the class falsifiable: a second monitored wait reports this family's own code
 * rather than a sibling's, and pairing it with a managed race crosses the single-scheduler barrier
 * that each class's own count cannot see.
 */
test("rejects a second monitored User Task and a monitored wait beside a race", async () => {
  const monitored = await compileFixture(
    "../../../../scenarios/non-interrupting-boundary-timer/process.bpmn",
    "non-interrupting-boundary-timer-host-admission",
    "bpmn-2.0.2-non-interrupting-boundary-timer-draft",
  );
  const eventRace = await compileFixture(
    "../../../../scenarios/event-based-gateway-message-timer/process.bpmn",
    "event-race-beside-monitored-task",
    "bpmn-2.0.2-event-based-gateway-message-timer-draft",
  );
  const wait = monitored.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitMonitoredUserTask,
  );
  const race = eventRace.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitEventRace,
  );
  assert.ok(wait?.kind === SemanticOperationKind.AwaitMonitoredUserTask);
  assert.ok(race?.kind === SemanticOperationKind.AwaitEventRace);

  assert.deepEqual(assessTemporalHostCapability(monitored), {
    kind: TemporalHostCapabilityResultKind.Admitted,
  });
  assert.deepEqual(
    assessTemporalHostCapability({
      ...monitored,
      operations: [
        ...monitored.operations,
        { ...wait, id: `${wait.id}:second` },
      ],
    }),
    {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code: TemporalHostAdmissionFailureCode
          .MonitoredActivitySchedulerUnavailable,
        evidence:
          "The Temporal host admits only one isolated monitored User Task with an exact PT1S non-interrupting boundary Timer.",
      },
    },
  );
  // The race is declared first, so it owns the refusal identity when both classes are present. That
  // is the documented ordering rule rather than an accident of this fixture pair.
  assert.deepEqual(
    assessTemporalHostCapability({
      ...monitored,
      operations: [...monitored.operations, race],
    }),
    {
      kind: TemporalHostCapabilityResultKind.Rejected,
      failure: {
        code: TemporalHostAdmissionFailureCode.EventRaceSchedulerUnavailable,
        evidence:
          "The Temporal host admits only one isolated operation-addressed Message/PT1S managed race.",
      },
    },
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
