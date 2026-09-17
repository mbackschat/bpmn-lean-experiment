import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  StimulusKind,
  applyInternalOperation,
  applyStimulus,
  initialState,
  isWellFormedSemanticProcessProgram,
  isStableStateResumable,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  UserTaskInstanceId,
} from "@bpmn-lean/semantic-core";

import {
  program, rootScopeId, childScopeId, instanceId, startStimulus,
} from "./embedded-subprocess-fixture.ts";

test("admits scope ownership through generic graph facts", () => {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
});

test("one child End Event cannot complete the scope", () => {
  const waiting = applyStimulus(program, initialState, startStimulus());
  assert.equal(waiting.outcome, CommandOutcome.Committed);
  assert.deepEqual(openTaskIds(waiting.state), ["UserTask_ChildA", "UserTask_ChildB"]);
  assert.equal(waiting.state.scopeOccurrences.length, 2);

  const afterA = applyStimulus(program, waiting.state, completion("UserTask_ChildA"));
  assert.deepEqual(openTaskIds(afterA.state), ["UserTask_ChildB"]);
  assert.equal(afterA.state.scopeOccurrences.length, 2);
  assert.equal(afterA.state.endOccurrences, 1);
  assert.equal(isStableStateResumable(afterA.state), true);

  const stale = applyStimulus(program, afterA.state, {
    ...completion("UserTask_ChildA"),
    commandId: "stale-child-a",
  });
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, afterA.state);
});

test("both child completion orders resume the same parent wait", () => {
  const waiting = applyStimulus(program, initialState, startStimulus());
  const afterA = applyStimulus(program, waiting.state, completion("UserTask_ChildA"));
  const aThenB = applyStimulus(program, afterA.state, completion("UserTask_ChildB"));
  const afterB = applyStimulus(program, waiting.state, completion("UserTask_ChildB"));
  const bThenA = applyStimulus(program, afterB.state, completion("UserTask_ChildA"));

  assert.deepEqual(aThenB.state, bThenA.state);
  assert.deepEqual(openTaskIds(aThenB.state), ["UserTask_AfterScope"]);
  assert.deepEqual(
    aThenB.state.scopeOccurrences.map(({ id }) => id.definitionScopeId),
    [rootScopeId],
  );
  assert.equal(aThenB.state.endOccurrences, 2);

  const completed = applyStimulus(
    program,
    aThenB.state,
    completion("UserTask_AfterScope"),
  );
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId,
  });
  assert.deepEqual(completed.state.scopeOccurrences, []);
  assert.equal(completed.state.endOccurrences, 3);
});

test("every selected completion prefix is terminal or exposes an interaction", () => {
  for (const order of [
    ["UserTask_ChildA", "UserTask_ChildB"],
    ["UserTask_ChildB", "UserTask_ChildA"],
  ] as const) {
    let state = applyStimulus(
      program,
      initialState,
      startStimulus(),
    ).state;
    for (const elementId of [...order, "UserTask_AfterScope"]) {
      if (state.control.kind === ControlStateKind.Running) {
        assert.equal(isStableStateResumable(state), true);
        assert.notEqual(projectOpenUserTasks(state).length, 0);
      }
      const result = applyStimulus(
        program,
        state,
        completion(elementId),
      );
      assert.equal(result.outcome, CommandOutcome.Committed);
      state = result.state;
    }
    assert.equal(state.control.kind, ControlStateKind.Completed);
  }
});

test("a stranded child token is quiescent to the host but not completable", () => {
  const waiting = applyStimulus(program, initialState, startStimulus());
  const child = waiting.state.scopeOccurrences.find(
    ({ id }) => id.definitionScopeId === childScopeId,
  );
  assert.ok(child !== undefined);
  const stranded = {
    ...waiting.state,
    userTaskWaits: [],
    controlTokens: [{
      placeId: "place:stranded-child",
      owner: child.id,
      multiplicity: 1,
    }],
  };
  const completionOperation = program.operations.find(
    (operation) =>
      operation.kind === SemanticOperationKind.CompleteScope &&
      operation.scopeId === childScopeId,
  );
  assert.ok(completionOperation !== undefined);
  assert.equal(applyInternalOperation(program, completionOperation, stranded), null);
  assert.equal(isStableStateResumable(stranded), false);
});

function completion(elementId: string): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: `complete-${elementId}`,
    taskId: taskId(elementId),
    submittedValues: [],
  };
}

function taskId(elementId: string): UserTaskInstanceId {
  return { processInstanceId: instanceId, elementId, activation: 1 };
}

function openTaskIds(state: Parameters<typeof projectOpenUserTasks>[0]): string[] {
  return projectOpenUserTasks(state).map(({ id }) => id.elementId);
}
