import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ControlStateKind,
  ProcessStatus,
  ScenarioStepKind,
  ScenarioOutcomeKind,
  SemanticOperationKind,
  StimulusKind,
  WaitKind,
  advanceScenario,
  applyInternalOperation,
  applyStimulus,
  deployScenario,
  initialState,
  projectOpenUserTasks,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  ControlPlaceTokens,
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
  SemanticUserTaskWait,
  UserTaskInstanceId,
} from "@bpmn-lean/semantic-core";
import {
  completionStimulus,
  parallelProgram,
  parallelScenario,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";
import { stateObservationAt } from "./canonical-observations.ts";

test("fork duplication closes at exactly two simultaneous task waits", () => {
  const started = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
  );

  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.equal(started.internalStepBoundExceeded, false);
  assert.deepEqual(started.state.control, {
    kind: ControlStateKind.Running,
    instanceId: "Instance_1",
  });
  assert.deepEqual(
    started.state.userTaskWaits.map(({ id }) => id),
    [
      taskId("UserTask_A"),
      taskId("UserTask_B"),
    ],
  );
  assert.deepEqual(started.state.controlTokens, []);
});

test("both task completion orders reach the same final state", () => {
  const started = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
  );

  const afterA = applyStimulus(
    parallelProgram,
    started.state,
    completionStimulus("UserTask_A"),
  );
  assert.deepEqual(
    afterA.state.userTaskWaits.map(({ id }) => id),
    [taskId("UserTask_B")],
  );
  assert.deepEqual(afterA.state.controlTokens, [
    { placeId: "place:Flow_AToJoin", multiplicity: 1 },
  ]);

  const aThenB = applyStimulus(
    parallelProgram,
    afterA.state,
    completionStimulus("UserTask_B"),
  );
  const afterB = applyStimulus(
    parallelProgram,
    started.state,
    completionStimulus("UserTask_B"),
  );
  const bThenA = applyStimulus(
    parallelProgram,
    afterB.state,
    completionStimulus("UserTask_A"),
  );

  assert.deepEqual(aThenB.state, bThenA.state);
  assert.deepEqual(aThenB.state.control, {
    kind: ControlStateKind.Completed,
    instanceId: "Instance_1",
  });
  assert.deepEqual(aThenB.state.controlTokens, []);
  assert.deepEqual(aThenB.state.userTaskWaits, []);
  assert.equal(aThenB.state.endOccurrences, 1);
});

test("both orders expose the approved stable public observations", () => {
  const aThenB = runScenario(parallelScenario, parallelProgram);
  const bThenA = runScenario(
    {
      ...parallelScenario,
      id: "parallel-fork-join-b-then-a",
      stimuli: [
        startStimulus(),
        completionStimulus("UserTask_B"),
        completionStimulus("UserTask_A"),
      ],
    },
    parallelProgram,
  );

  assert.deepEqual(aThenB.outcome, {
    kind: ScenarioOutcomeKind.Semantic,
    outcome: CommandOutcome.Committed,
  });
  const aWaiting = stateObservationAt(aThenB.trace, 2);

  assert.deepEqual(aThenB.trace[2], bThenA.trace[2]);
  assert.equal(aWaiting.status, ProcessStatus.Running);
  assert.deepEqual(aWaiting.activeWaits, [
    {
      elementId: "UserTask_A",
      kind: WaitKind.UserTask,
      multiplicity: 1,
    },
    {
      elementId: "UserTask_B",
      kind: WaitKind.UserTask,
      multiplicity: 1,
    },
  ]);
  assert.deepEqual(
    aWaiting.enabledInteractions.map((interaction) => {
      switch (interaction.kind) {
        case StimulusKind.CompleteUserTaskInstance:
          return interaction;
        case StimulusKind.DeliverMessage:
          throw new Error(
            "parallel User Task state exposed a Message interaction",
          );
        default: {
          const unreachable: never = interaction;
          throw new Error(
            `unsupported enabled interaction ${JSON.stringify(unreachable)}`,
          );
        }
      }
    }),
    [
      {
        kind: StimulusKind.CompleteUserTaskInstance,
        taskId: taskId("UserTask_A"),
      },
      {
        kind: StimulusKind.CompleteUserTaskInstance,
        taskId: taskId("UserTask_B"),
      },
    ],
  );
  assert.deepEqual(
    stateObservationAt(aThenB.trace, 4).openUserTasks.map(({ id }) => id),
    [taskId("UserTask_B")],
  );
  assert.deepEqual(
    stateObservationAt(bThenA.trace, 4).openUserTasks.map(({ id }) => id),
    [taskId("UserTask_A")],
  );
  assert.deepEqual(aThenB.trace[6], bThenA.trace[6]);
  assert.equal(
    stateObservationAt(aThenB.trace, 6).status,
    ProcessStatus.Completed,
  );
});

test("two left tokens cannot satisfy a join missing its right input", () => {
  const join = operation(SemanticOperationKind.Synchronize);
  const duplicateLeftNoRight = runningState([
    { placeId: "place:Flow_AToJoin", multiplicity: 2 },
  ]);

  assert.equal(
    applyInternalOperation(join, duplicateLeftNoRight),
    null,
  );
});

test("one join activation consumes per incoming flow and retains excess", () => {
  const join = operation(SemanticOperationKind.Synchronize);
  const excess = runningState([
    { placeId: "place:Flow_BToJoin", multiplicity: 1 },
    { placeId: "place:Flow_AToJoin", multiplicity: 2 },
  ]);

  const synchronized = applyInternalOperation(join, excess);

  assert.ok(synchronized !== null, "the join must be enabled");
  assert.deepEqual(synchronized.controlTokens, [
    { placeId: "place:Flow_AToJoin", multiplicity: 1 },
    { placeId: "place:Flow_JoinToEnd", multiplicity: 1 },
  ]);
});

test("task projection ignores internal wait storage order", () => {
  const state = runningState([], [
    wait("UserTask_B", "B"),
    wait("UserTask_A", "A"),
  ]);

  assert.deepEqual(
    projectOpenUserTasks(state).map(({ id }) => id),
    [taskId("UserTask_A"), taskId("UserTask_B")],
  );
});

test("active wait projection orders by semantic kind before element ID", () => {
  const state: RuntimeState = {
    ...runningState([]),
    userTaskWaits: [
      wait("Z_UserTask", "Z"),
      wait("B_UserTask", "B"),
    ],
    messageWaits: [
      {
        id: taskId("A_Message"),
        channel: {
          interfaceId: "Interface_Projection",
          interfaceOperationId: "Operation_Projection",
          messageId: "Message_Projection",
        },
        output: "place:Flow_MessageToEnd",
      },
    ],
    timerWaits: [
      {
        id: taskId("C_Timer"),
        deadlineMs: 1000,
        output: "place:Flow_TimerToEnd",
      },
    ],
    effectWaits: [
      {
        id: taskId("D_Effect"),
        descriptor: {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:probe-v1",
        },
        arguments: [],
        outputMappings: [],
        bpmnErrorRoute: null,
        output: "place:Flow_EffectToEnd",
      },
    ],
  };
  const step = advanceScenario(parallelProgram, state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "reject-missing-task",
    taskId: taskId("Missing_UserTask"),
  });

  assert.equal(step.kind, ScenarioStepKind.Terminal);
  assert.equal(step.observations[1]?.kind, CanonicalObservationKind.State);
  assert.deepEqual(stateObservationAt(step.observations, 1).activeWaits, [
    {
      elementId: "B_UserTask",
      kind: WaitKind.UserTask,
      multiplicity: 1,
    },
    {
      elementId: "Z_UserTask",
      kind: WaitKind.UserTask,
      multiplicity: 1,
    },
    {
      elementId: "A_Message",
      kind: WaitKind.Message,
      multiplicity: 1,
    },
    {
      elementId: "C_Timer",
      kind: WaitKind.Timer,
      multiplicity: 1,
    },
    {
      elementId: "D_Effect",
      kind: WaitKind.Effect,
      multiplicity: 1,
    },
  ]);
});

test("internal closure ignores operation collection order", () => {
  const canonical = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const permuted = applyStimulus(
    {
      ...parallelProgram,
      operations: [...parallelProgram.operations].reverse(),
    },
    initialState,
    startStimulus(),
  );

  assert.deepEqual(permuted, canonical);
});

test("deployment admits only the bounded connected parallel surface", () => {
  assert.equal(
    deployScenario(parallelScenario, parallelProgram).outcome,
    CommandOutcome.Committed,
  );

  // The join synchronizes the same fork output twice instead of one token per
  // incoming Sequence Flow.
  const malformed: SemanticProcessProgram = {
    ...parallelProgram,
    operations: parallelProgram.operations.map((candidate) =>
      candidate.kind === SemanticOperationKind.Synchronize
        ? { ...candidate, inputs: ["place:Flow_ForkToA", candidate.inputs[1] ?? ""] }
        : candidate
    ),
  };
  assert.equal(
    deployScenario(parallelScenario, malformed).outcome,
    CommandOutcome.Unsupported,
  );
});

function operation<Kind extends SemanticOperationKind>(
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = parallelProgram.operations.find(
    (candidate) => candidate.kind === kind,
  );
  assert.ok(found !== undefined, `the program has no ${kind} operation`);
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

function taskId(elementId: string): UserTaskInstanceId {
  return {
    processInstanceId: "Instance_1",
    elementId,
    activation: 1,
  };
}

function wait(elementId: string, name: string): SemanticUserTaskWait {
  return {
    id: taskId(elementId),
    name,
    output: `place:Flow_${elementId === "UserTask_A" ? "A" : "B"}ToJoin`,
  };
}

function runningState(
  controlTokens: ReadonlyArray<ControlPlaceTokens>,
  userTaskWaits: ReadonlyArray<SemanticUserTaskWait> = [],
): RuntimeState {
  return {
    ...initialState,
    control: {
      kind: ControlStateKind.Running,
      instanceId: "Instance_1",
    },
    controlTokens,
    userTaskWaits,
  };
}
