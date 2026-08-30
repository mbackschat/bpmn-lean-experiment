/**
 * The direct Activity data-output transition family.
 *
 * Contract: `ADOUTPUT-ENTRY-01` through `ADOUTPUT-REQUIRE-01` of the Activity data-output capsule.
 * The oracle is the runtime state and the canonical observation the pure core itself produces, so
 * every case here is settled without a host, a compiler, or a retained answer file.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  LocalDataOwnerKind,
  ProcessStatus,
  RuntimeStateDefect,
  RuntimeStateRegression,
  VariableValueKind,
  applyStimulus,
  initialState,
  observeStableState,
  runtimeStateDefects,
  runtimeStateRegressions,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";

import {
  activityId,
  dataOutputProgram,
  decideApproved,
  decideNull,
  decideUnderTargetName,
  decideWithExtraOutput,
  decideWithoutOutput,
  instanceId,
  sourceDataOutputId,
  startUnderwriting,
  targetPropertyId,
  taskId,
} from "./activity-data-output-fixture.ts";

function committed(
  state: RuntimeState,
  stimulus: Parameters<typeof applyStimulus>[2],
): RuntimeState {
  const result = applyStimulus(dataOutputProgram, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

function started(): RuntimeState {
  return committed(initialState, startUnderwriting);
}

test("a declared OutputSet never delays entry: the token alone activates the task", () => {
  const state = started();

  assert.deepEqual(state.variables.process.bindings, []);
  assert.deepEqual(state.userTaskWaits.map(({ id }) => id), [taskId]);
  assert.deepEqual(state.activityOccurrences.map(({ id }) => id), [activityId]);
  assert.deepEqual(state.controlTokens, []);

  const observation = observeStableState(dataOutputProgram, state);
  assert.equal(observation?.status, ProcessStatus.Running);
  assert.deepEqual(observation?.openUserTasks.map(({ id }) => id), [taskId]);
});

test("entry arms an empty Activity-owned scope and publishes no input collection", () => {
  const state = started();

  assert.deepEqual(state.variables.activities, [
    {
      owner: { kind: LocalDataOwnerKind.ActivityOccurrence, id: activityId },
      bindings: [],
    },
  ]);
  assert.deepEqual(
    observeStableState(dataOutputProgram, state)?.openUserTasks.map(
      ({ inputs }) => inputs,
    ),
    [undefined],
  );
});

test("completion routes the declared output into the associated Property", () => {
  const completed = committed(started(), decideApproved);

  assert.deepEqual(completed.variables.process.bindings, [
    {
      name: targetPropertyId,
      value: { kind: VariableValueKind.String, value: "approved" },
    },
  ]);
  assert.equal(
    completed.variables.process.bindings.some(
      ({ name }) => name === sourceDataOutputId,
    ),
    false,
    "the submitted DataOutput id is a local name and never reaches Process scope",
  );
});

test("fill, association, disposal, and token production commit as one transition", () => {
  const completed = committed(started(), decideApproved);

  assert.deepEqual(completed.userTaskWaits, []);
  assert.deepEqual(completed.activityOccurrences, []);
  assert.deepEqual(completed.variables.activities, []);

  const observation = observeStableState(dataOutputProgram, completed);
  assert.equal(observation?.status, ProcessStatus.Completed);
  assert.deepEqual(observation?.variables, [
    {
      name: targetPropertyId,
      value: { kind: VariableValueKind.String, value: "approved" },
    },
  ]);
});

test("a supplied explicit null is written rather than treated as an omission", () => {
  const completed = committed(started(), decideNull);

  assert.deepEqual(completed.variables.process.bindings, [
    { name: targetPropertyId, value: { kind: VariableValueKind.Null } },
  ]);
  assert.equal(
    observeStableState(dataOutputProgram, completed)?.status,
    ProcessStatus.Completed,
  );
});

test("a submission under the association's target name is refused", () => {
  const state = started();

  const result = applyStimulus(dataOutputProgram, state, decideUnderTargetName);

  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, state);
});

test("a completion that makes the required output unavailable is refused", () => {
  const state = started();

  for (const stimulus of [decideWithoutOutput, decideWithExtraOutput]) {
    const result = applyStimulus(dataOutputProgram, state, stimulus);

    assert.equal(result.outcome, CommandOutcome.Rejected, stimulus.commandId);
    assert.deepEqual(result.state, state, stimulus.commandId);
  }
});

test("a stale completion after disposal preserves the committed state", () => {
  const completed = committed(started(), decideApproved);

  const stale = applyStimulus(dataOutputProgram, completed, {
    ...decideApproved,
    commandId: "decide-approved-again",
  });

  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, completed);
});

test("a wrong task activation is refused rather than resolved by element id", () => {
  const state = started();

  const result = applyStimulus(dataOutputProgram, state, {
    ...decideApproved,
    commandId: "decide-wrong-activation",
    taskId: { ...taskId, activation: taskId.activation + 1 },
  });

  assert.equal(result.outcome, CommandOutcome.Rejected);
  assert.deepEqual(result.state, state);
});

test("entry and completion preserve the runtime-state invariants they touch", () => {
  const state = started();
  const completed = committed(state, decideApproved);

  assert.equal(
    runtimeStateDefects(dataOutputProgram, instanceId, state).includes(
      RuntimeStateDefect.DuplicateActivityBodyClaim,
    ),
    false,
    "data-output arming inserts a disjoint Activity body claim",
  );
  assert.equal(
    runtimeStateRegressions(initialState, state).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
    "the data-output evaluator issues above the predecessor Activity mark",
  );
  assert.deepEqual(completed.activityActivations, [
    { elementId: "UserTask_Decide", count: 1 },
  ]);
  assert.equal(
    runtimeStateRegressions(state, completed).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
  );
  assert.deepEqual(
    runtimeStateDefects(dataOutputProgram, instanceId, completed),
    [],
  );
});

// An equal-coordinate effect scope is the nearest alias to the Activity's own owner. It must neither
// be consumed by the completion nor make the join ambiguous.
test("an equal-coordinate effect scope is neither read nor removed by the completion", () => {
  const state = started();
  const foreign = {
    owner: {
      kind: LocalDataOwnerKind.EffectOccurrence,
      id: {
        processInstanceId: instanceId,
        elementId: activityId.activityElementId,
        activation: activityId.activation,
      },
    },
    bindings: [
      {
        name: sourceDataOutputId,
        value: { kind: VariableValueKind.String, value: "foreign" },
      },
    ],
  } as const;
  const contaminated: RuntimeState = {
    ...state,
    variables: { ...state.variables, activities: [foreign, ...state.variables.activities] },
  };

  const completed = applyStimulus(
    dataOutputProgram,
    contaminated,
    decideApproved,
  );

  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.variables.activities, [foreign]);
  assert.deepEqual(completed.state.variables.process.bindings, [
    {
      name: targetPropertyId,
      value: { kind: VariableValueKind.String, value: "approved" },
    },
  ]);
});
