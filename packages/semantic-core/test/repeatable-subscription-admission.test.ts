import assert from "node:assert/strict";
import test from "node:test";
import { InternalSchedulingMode, isWellFormedSemanticProcessProgram, SemanticOperationKind } from "@bpmn-lean/semantic-core";
import { monitoredProgram } from "./monitored-task-fixture.ts";

const profile = "bpmn-2.0.2-repeatable-event-subscriptions-draft";
const recurring = {
  ...monitoredProgram, identity: { ...monitoredProgram.identity, semanticProfile: profile },
  operations: monitoredProgram.operations.map((operation) =>
    operation.kind !== SemanticOperationKind.AwaitMonitoredUserTask ? operation : {
      ...operation, boundaryTimer: { ...operation.boundaryTimer, recurrence: "repeating" },
    }),
};

test("standalone Program admission accepts the selected recurring forest", () => {
  assert.equal(isWellFormedSemanticProcessProgram(recurring), true);
});

test("the subscription profile refuses an unselected scheduled-choice mode", () => {
  assert.equal(isWellFormedSemanticProcessProgram({
    ...recurring, internalSchedulingMode: InternalSchedulingMode.RequireChoiceSchedule,
  }), false);
});

test("standalone admission refuses recurrence on a legacy or interrupting operation", () => {
  assert.equal(isWellFormedSemanticProcessProgram({ ...recurring, identity: monitoredProgram.identity }), false);
  assert.equal(isWellFormedSemanticProcessProgram({ ...recurring,
    operations: recurring.operations.map((operation) =>
      operation.kind === SemanticOperationKind.AwaitMonitoredUserTask
        ? { ...operation, kind: SemanticOperationKind.AwaitBoundedUserTask } : operation),
  }), false);
});

test("standalone admission refuses a Timer reachable from a repeating handler", () => {
  assert.equal(isWellFormedSemanticProcessProgram({ ...recurring,
    operations: recurring.operations.map((operation) =>
      operation.kind === SemanticOperationKind.AwaitUserTask && operation.task.elementId === "HandlerTask"
        ? { id: operation.id, origin: operation.origin, kind: SemanticOperationKind.AwaitTimer,
          input: operation.input, output: operation.output,
          timer: { elementId: operation.task.elementId, durationMs: 1000 } } : operation),
  }), false);
});
