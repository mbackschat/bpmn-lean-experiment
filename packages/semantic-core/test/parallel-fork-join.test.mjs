import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  ProcessStatus,
  ScenarioOutcomeKind,
  SemanticOperationKind,
  StimulusKind,
  WaitKind,
  applyInternalOperation,
  applyStimulus,
  deployScenario,
  initialState,
  projectOpenUserTasks,
  runScenario,
} from "../dist/index.js";
import {
  completionStimulus,
  parallelProgram,
  parallelScenario,
  startStimulus,
} from "./parallel-fork-join-fixture.mjs";

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
  assert.deepEqual(aThenB.trace[2], bThenA.trace[2]);
  assert.equal(aThenB.trace[2].status, ProcessStatus.Running);
  assert.deepEqual(aThenB.trace[2].activeWaits, [
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
    aThenB.trace[2].enabledInteractions.map(({ kind, taskId }) => ({
      kind,
      taskId,
    })),
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
    aThenB.trace[4].openUserTasks.map(({ id }) => id),
    [taskId("UserTask_B")],
  );
  assert.deepEqual(
    bThenA.trace[4].openUserTasks.map(({ id }) => id),
    [taskId("UserTask_A")],
  );
  assert.deepEqual(aThenB.trace[6], bThenA.trace[6]);
  assert.equal(aThenB.trace[6].status, ProcessStatus.Completed);
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

  const malformed = structuredClone(parallelProgram);
  operation(
    SemanticOperationKind.Synchronize,
    malformed,
  ).inputs[0] = "place:Flow_ForkToA";
  assert.equal(
    deployScenario(parallelScenario, malformed).outcome,
    CommandOutcome.Unsupported,
  );
});

function operation(kind, program = parallelProgram) {
  const found = program.operations.find(
    (candidate) => candidate.kind === kind,
  );
  assert.notEqual(found, undefined);
  return found;
}

function taskId(elementId) {
  return {
    processInstanceId: "Instance_1",
    elementId,
    activation: 1,
  };
}

function wait(elementId, name) {
  return {
    id: taskId(elementId),
    name,
    output: `place:Flow_${elementId === "UserTask_A" ? "A" : "B"}ToJoin`,
  };
}

function runningState(controlTokens, userTaskWaits = []) {
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
