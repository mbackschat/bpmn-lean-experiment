import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyStimulus,
  enabledInternalOperationCount,
  initialState,
  isStableStateResumable,
  isWellFormedSemanticProcessProgram,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";
import { parallelProgram } from "./parallel-multi-instance-fixture.ts";
import { reviewProgram } from "./sequential-multi-instance-fixture.ts";

const compositionProfile =
  "bpmn-2.0.2-timer-user-task-composition-draft";

const program = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: compositionProfile,
    sourceId: "timer-user-task-composition-process",
    sourceOverlay: null,
    sourceSha256:
      "8d608a6dd0a7b40824c7ff43cb71ac92518f8171abf164110c07bfc3061521b2",
  },
  processId: "Process_TimerUserTaskComposition",
  controlPlaces: [
    controlPlace("Flow_StartToTimer"),
    controlPlace("Flow_TaskToEnd"),
    controlPlace("Flow_TimerToTask"),
  ],
  operations: [
    {
      ...operationBase("EndEvent_1"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_TaskToEnd",
    },
    {
      ...operationBase("StartEvent_1"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToTimer",
    },
    {
      ...operationBase("TimerCatch_PT1S"),
      kind: SemanticOperationKind.AwaitTimer,
      input: "place:Flow_StartToTimer",
      output: "place:Flow_TimerToTask",
      timer: {
        elementId: "TimerCatch_PT1S",
        durationMs: 1000,
      },
    },
    {
      ...operationBase("UserTask_Approve"),
      kind: SemanticOperationKind.AwaitUserTask,
      input: "place:Flow_TimerToTask",
      output: "place:Flow_TaskToEnd",
      task: {
        elementId: "UserTask_Approve",
        name: "Approve",
      },
    },
  ],
});

const reverseProgram = rootScopedProgram({
  ...program,
  controlPlaces: [
    controlPlace("Flow_StartToTask"),
    controlPlace("Flow_TaskToTimer"),
    controlPlace("Flow_TimerToEnd"),
  ],
  operations: program.operations.map((operation) => {
    switch (operation.kind) {
      case SemanticOperationKind.Initiate:
        return { ...operation, output: "place:Flow_StartToTask" };
      case SemanticOperationKind.AwaitUserTask:
        return {
          ...operation,
          input: "place:Flow_StartToTask",
          output: "place:Flow_TaskToTimer",
        };
      case SemanticOperationKind.AwaitTimer:
        return {
          ...operation,
          input: "place:Flow_TaskToTimer",
          output: "place:Flow_TimerToEnd",
        };
      case SemanticOperationKind.ReachNoneEnd:
        return { ...operation, input: "place:Flow_TimerToEnd" };
      case SemanticOperationKind.CompleteScope:
        return operation;
      default:
        throw new Error(
          `unexpected composition operation ${operation.kind}`,
        );
    }
  }),
});

const start = {
  kind: StimulusKind.StartProcess,
  commandId: "start-timer-user-task-composition",
  processId: program.processId,
  instanceId: "CompositionInstance_1",
  initialVariables: [],
} as const;

const fireTimer = {
  kind: StimulusKind.FireTimer,
  commandId:
    "fire-timer-sha256:c6c6b5904c8ae7a91ee52294ba85c07d8e76d31c531a67f9bf3b3172e34fb1cd",
  timerId: {
    processInstanceId: "CompositionInstance_1",
    elementId: "TimerCatch_PT1S",
    activation: 1,
  },
  logicalTimeMs: 1000,
} as const;

const completeTask = {
  kind: StimulusKind.CompleteUserTaskInstance,
  commandId: "complete-composed-user-task",
  taskId: {
    processInstanceId: "CompositionInstance_1",
    elementId: "UserTask_Approve",
    activation: 1,
  },
  submittedValues: [],
} as const;

test("admits one profile-selected timer and User Task composition through graph facts", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.equal(supportsSemanticProcessExecution(start, program), true);

  assert.equal(
    supportsSemanticProcessExecution(start, {
      ...program,
      identity: {
        ...program.identity,
        semanticProfile:
          "cibseven-2.2.0-intermediate-catch-timer-draft",
      },
    }),
    false,
  );
  assert.equal(
    supportsSemanticProcessExecution(start, {
      ...program,
      identity: {
        ...program.identity,
        semanticProfile: "unknown-profile",
      },
    }),
    false,
  );
});

test("rejects a dangling control place independently of profile capability", () => {
  const timer = program.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitTimer,
  );
  assert.ok(timer?.kind === SemanticOperationKind.AwaitTimer);
  const malformed: SemanticProcessProgram = {
    ...program,
    operations: program.operations.map((operation) =>
      operation === timer
        ? { ...timer, output: "place:Flow_TaskToEnd" }
        : operation
    ),
  };

  assert.equal(isWellFormedSemanticProcessProgram(malformed), false);
  assert.equal(supportsSemanticProcessExecution(start, malformed), false);
});

test("rejects same-family wait declarer collisions without forbidding cross-family identifiers", () => {
  const admittedParallelProgram: SemanticProcessProgram = {
    ...parallelProgram,
    operationScopes: [...parallelProgram.operationScopes].sort((left, right) =>
      left.operationId < right.operationId ? -1 : left.operationId > right.operationId ? 1 : 0
    ),
    operations: [...parallelProgram.operations].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    ),
  };
  const withReusedMiTaskId = (
    candidate: SemanticProcessProgram,
  ): SemanticProcessProgram => ({
    ...candidate,
    operations: candidate.operations.map((operation) =>
      operation.kind === SemanticOperationKind.AwaitUserTask
        ? {
          ...operation,
          origin: { ...operation.origin, elementId: "Review" },
          task: { ...operation.task, elementId: "Review" },
        }
        : operation
    ),
  });
  const withCrossFamilyReuse: SemanticProcessProgram = {
    ...program,
    operations: program.operations.map((operation) => {
      switch (operation.kind) {
        case SemanticOperationKind.AwaitUserTask:
          return {
            ...operation,
            origin: { ...operation.origin, elementId: "Shared_Wait_Id" },
            task: { ...operation.task, elementId: "Shared_Wait_Id" },
          };
        case SemanticOperationKind.AwaitTimer:
          return {
            ...operation,
            origin: { ...operation.origin, elementId: "Shared_Wait_Id" },
            timer: { ...operation.timer, elementId: "Shared_Wait_Id" },
          };
        default:
          return operation;
      }
    }),
  };

  assert.equal(isWellFormedSemanticProcessProgram(reviewProgram), true);
  assert.equal(isWellFormedSemanticProcessProgram(admittedParallelProgram), true);
  assert.equal(
    isWellFormedSemanticProcessProgram(withReusedMiTaskId(reviewProgram)),
    false,
  );
  assert.equal(
    isWellFormedSemanticProcessProgram(withReusedMiTaskId(admittedParallelProgram)),
    false,
  );
  assert.equal(isWellFormedSemanticProcessProgram(withCrossFamilyReuse), true);
});

test("keeps closure bounded, single-enabled, and resumable at every new stable state", () => {
  const admittedStart = applyStimulus(program, initialState, start, 0);
  assert.equal(admittedStart.internalStepBoundExceeded, true);
  assert.equal(enabledInternalOperationCount(program, admittedStart.state), 1);

  const afterInitiate = applyStimulus(program, initialState, start, 1);
  assert.equal(afterInitiate.internalStepBoundExceeded, true);
  assert.equal(enabledInternalOperationCount(program, afterInitiate.state), 1);

  const timerWait = applyStimulus(program, initialState, start);
  assert.equal(timerWait.internalStepBoundExceeded, false);
  assert.equal(enabledInternalOperationCount(program, timerWait.state), 0);
  assert.equal(isStableStateResumable(timerWait.state), true);

  const beforeTask = applyStimulus(program, timerWait.state, fireTimer, 0);
  assert.equal(beforeTask.internalStepBoundExceeded, true);
  assert.equal(enabledInternalOperationCount(program, beforeTask.state), 1);

  const taskWait = applyStimulus(program, timerWait.state, fireTimer);
  assert.equal(taskWait.internalStepBoundExceeded, false);
  assert.equal(enabledInternalOperationCount(program, taskWait.state), 0);
  assert.equal(isStableStateResumable(taskWait.state), true);

  const beforeEnd = applyStimulus(program, taskWait.state, completeTask, 0);
  assert.equal(beforeEnd.internalStepBoundExceeded, true);
  assert.equal(enabledInternalOperationCount(program, beforeEnd.state), 1);

  const completed = applyStimulus(program, taskWait.state, completeTask);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.internalStepBoundExceeded, false);
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId: "CompositionInstance_1",
  });
  assert.equal(enabledInternalOperationCount(program, completed.state), 0);
  assert.equal(isStableStateResumable(completed.state), true);

  const strandedState = {
    ...taskWait.state,
    controlTokens: [
      {
        placeId: "place:stranded",
        owner: rootScopeOccurrence(
          program.processId,
          "CompositionInstance_1",
        ),
        multiplicity: 1,
      },
    ],
    userTaskWaits: [],
  };
  assert.equal(enabledInternalOperationCount(program, strandedState), 0);
  assert.equal(isStableStateResumable(strandedState), false);
});

test("preserves the same targeted bounds for the reverse linear ordering", () => {
  assert.equal(isWellFormedSemanticProcessProgram(reverseProgram), true);
  assert.equal(supportsSemanticProcessExecution(start, reverseProgram), true);

  const taskWait = applyStimulus(reverseProgram, initialState, start);
  assert.equal(taskWait.internalStepBoundExceeded, false);
  assert.equal(enabledInternalOperationCount(reverseProgram, taskWait.state), 0);
  assert.equal(isStableStateResumable(taskWait.state), true);

  const timerWait = applyStimulus(
    reverseProgram,
    taskWait.state,
    completeTask,
  );
  assert.equal(timerWait.internalStepBoundExceeded, false);
  assert.equal(
    enabledInternalOperationCount(reverseProgram, timerWait.state),
    0,
  );
  assert.equal(isStableStateResumable(timerWait.state), true);

  const completed = applyStimulus(
    reverseProgram,
    timerWait.state,
    fireTimer,
  );
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.equal(completed.internalStepBoundExceeded, false);
  assert.equal(enabledInternalOperationCount(reverseProgram, completed.state), 0);
  assert.equal(isStableStateResumable(completed.state), true);
});
