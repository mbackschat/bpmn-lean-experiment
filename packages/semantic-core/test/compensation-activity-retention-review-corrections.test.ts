import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  CompensationRetentionRefusalKind,
  CompensationRetentionResultKind,
  CompensationRetentionStateDefect,
  ControlStateKind,
  MultiInstanceCompensationCompletionOutcome,
  RuntimeStateDefect,
  SemanticOperationKind,
  applyStimulus,
  compensationRetentionStateDefects,
  initialState,
  retainCompletedCompensableActivity,
  runtimeStateDefects,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  multiInstanceFacts,
  startFixture,
  stateForTarget,
} from "./compensation-activity-retention-fixtures.ts";

function startedRetentionFixture() {
  const { startProgram, stimulus } = startFixture(SemanticOperationKind.Initiate);
  const started = applyStimulus(startProgram, initialState, stimulus);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const retention = started.state.compensationActivityRetentions?.[0];
  if (retention === undefined) throw new TypeError("expected retention register");
  return { startProgram, started: started.state, retention };
}

test("rejects a running compensation register whose root activation is not one", () => {
  const { startProgram, started, retention } = startedRetentionFixture();
  const invalidOwner = { ...retention.owner, activation: 2 };
  const invalid = {
    ...started,
    scopeOccurrences: [{ id: invalidOwner, parent: null }],
    compensationActivityRetentions: [{ ...retention, owner: invalidOwner }],
    scopeActivations: [{ elementId: invalidOwner.definitionScopeId, count: 2 }],
  };

  assert.deepEqual(compensationRetentionStateDefects(startProgram, invalid), [
    CompensationRetentionStateDefect.RegisterOwnerMismatch,
  ]);
  assert.ok(
    runtimeStateDefects(startProgram, invalidOwner.processInstanceId, invalid).includes(
      RuntimeStateDefect.CompensationActivityRetentionInvalid,
    ),
  );
});

test("refuses a duplicate Multi-Instance identity before early or interrupted classification", () => {
  const { startProgram, started } = startedRetentionFixture();
  const declaration = startProgram.compensationActivityRetention;
  if (declaration === undefined) throw new TypeError("expected retention declaration");
  const targetElementId = "Task_Multi";
  const wait = startProgram.operations.find(
    ({ kind }) => kind === SemanticOperationKind.AwaitUserTask,
  );
  if (wait === undefined || !("task" in wait)) throw new TypeError("expected task wait");
  const program = {
    ...startProgram,
    operations: startProgram.operations.map((operation) =>
      operation === wait
        ? {
          ...wait,
          kind: SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
          origin: { ...wait.origin, elementId: targetElementId },
          task: { ...wait.task, elementId: targetElementId },
        }
        : operation
    ),
    compensationActivityRetention: {
      ...declaration,
      targets: [{
        activityElementId: targetElementId,
        boundaryEventElementId: "Boundary_Task_Multi",
        compensationActivityElementId: "Undo_Task_Multi",
      }],
    },
  } as unknown as SemanticProcessProgram;
  const state = stateForTarget(started, targetElementId);
  if (state.control.kind !== ControlStateKind.Running) {
    throw new TypeError("expected running retention state");
  }
  const activity = {
    processInstanceId: state.control.instanceId,
    activityElementId: targetElementId,
    activation: 1,
  };
  const first = retainCompletedCompensableActivity(
    program,
    state,
    multiInstanceFacts(activity, 3, 3),
  );
  assert.equal(first.kind, CompensationRetentionResultKind.Retained);
  if (first.kind !== CompensationRetentionResultKind.Retained) return;

  for (const outcome of [
    MultiInstanceCompensationCompletionOutcome.EarlyCompletion,
    MultiInstanceCompensationCompletionOutcome.Interrupted,
  ]) {
    const duplicate = retainCompletedCompensableActivity(
      program,
      first.state,
      multiInstanceFacts(activity, 3, 1, outcome),
    );
    assert.equal(duplicate.kind, CompensationRetentionResultKind.Refused);
    assert.equal(duplicate.state, first.state);
    if (duplicate.kind === CompensationRetentionResultKind.Refused) {
      assert.equal(duplicate.refusal.kind, CompensationRetentionRefusalKind.DuplicateActivity);
    }
  }
});
