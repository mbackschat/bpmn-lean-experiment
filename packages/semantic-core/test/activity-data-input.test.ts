/**
 * The direct Activity data-input transition family.
 *
 * Contract: `ADINPUT-READY-01` through `ADINPUT-OBSERVE-01` of the Activity data-input capsule. The
 * oracle is the runtime state and the canonical observation the pure core itself produces, so every
 * case here is settled without a host, a compiler, or a retained answer file.
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
  applyStimulusWithTrace,
  initialState,
  observeStableState,
  runtimeStateDefects,
  runtimeStateRegressions,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState } from "@bpmn-lean/semantic-core";

import {
  activityId,
  completeReview,
  dataInputProgram,
  instanceId,
  owner,
  sourcePropertyId,
  startWithNullReviewContext,
  startWithReviewContext,
  startWithoutReviewContext,
  targetDataInputId,
  taskId,
} from "./activity-data-input-fixture.ts";

function committed(
  state: RuntimeState,
  stimulus: Parameters<typeof applyStimulus>[2],
): RuntimeState {
  const result = applyStimulus(dataInputProgram, state, stimulus);
  assert.equal(result.outcome, CommandOutcome.Committed);
  return result.state;
}

test("an unavailable required source leaves the Activity ready at its incoming place", () => {
  const started = committed(initialState, startWithoutReviewContext);

  assert.deepEqual(started.userTaskWaits, []);
  assert.deepEqual(started.activityOccurrences, []);
  assert.deepEqual(started.variables.activities, []);
  assert.deepEqual(started.variables.process.bindings, []);
  assert.deepEqual(
    started.controlTokens.map(({ placeId, multiplicity }) => ({
      placeId,
      multiplicity,
    })),
    [{ placeId: "place:Flow_Start_Review", multiplicity: 1 }],
  );

  const observation = observeStableState(dataInputProgram, started);
  assert.equal(observation?.status, ProcessStatus.Running);
  assert.deepEqual(observation?.openUserTasks, []);
  assert.deepEqual(observation?.enabledInteractions, []);
});

// The unproductive Running state is the capsule's own liveness limitation, so publication must not
// depend on a remaining ingress: absence would otherwise be unobservable rather than merely stuck.
test("the unavailable-source commit still publishes its committed transition", () => {
  const traced = applyStimulusWithTrace(
    dataInputProgram,
    initialState,
    startWithoutReviewContext,
  );

  assert.equal(traced.result.outcome, CommandOutcome.Committed);
  // The external start plus the Start Event's internal step; the task arms no third transition.
  assert.equal(traced.committedTransitions.length, 2);
  assert.notEqual(traced.currentPositions, null);
});

test("a present string source activates the task and copies the value once", () => {
  const started = committed(initialState, startWithReviewContext);

  assert.deepEqual(started.userTaskWaits.map(({ id }) => id), [taskId]);
  assert.deepEqual(started.activityOccurrences.map(({ id }) => id), [
    activityId,
  ]);
  assert.deepEqual(started.controlTokens, []);
  assert.deepEqual(started.variables.process.bindings, [
    {
      name: sourcePropertyId,
      value: { kind: VariableValueKind.String, value: "invoice-4711" },
    },
  ]);
  assert.deepEqual(started.variables.activities, [
    {
      owner: {
        kind: LocalDataOwnerKind.ActivityOccurrence,
        id: activityId,
      },
      bindings: [
        {
          name: targetDataInputId,
          value: { kind: VariableValueKind.String, value: "invoice-4711" },
        },
      ],
    },
  ]);
});

test("explicit null is an available source and is not an alias of absence", () => {
  const withNull = committed(initialState, startWithNullReviewContext);
  const withoutBinding = committed(initialState, startWithoutReviewContext);

  assert.deepEqual(withNull.variables.activities, [
    {
      owner: {
        kind: LocalDataOwnerKind.ActivityOccurrence,
        id: activityId,
      },
      bindings: [
        { name: targetDataInputId, value: { kind: VariableValueKind.Null } },
      ],
    },
  ]);
  assert.equal(withNull.userTaskWaits.length, 1);
  assert.equal(withoutBinding.userTaskWaits.length, 0);
  assert.notDeepEqual(
    observeStableState(dataInputProgram, withNull),
    observeStableState(dataInputProgram, withoutBinding),
  );
});

test("the active task publishes exactly its one selected input", () => {
  const started = committed(initialState, startWithReviewContext);
  const observation = observeStableState(dataInputProgram, started);

  assert.deepEqual(observation?.openUserTasks, [
    {
      id: taskId,
      name: "Review invoice",
      state: "active",
      inputs: [
        {
          name: targetDataInputId,
          value: { kind: VariableValueKind.String, value: "invoice-4711" },
        },
      ],
    },
  ]);
  assert.deepEqual(observation?.variables, [
    {
      name: sourcePropertyId,
      value: { kind: VariableValueKind.String, value: "invoice-4711" },
    },
  ]);
});

test("empty completion disposes the task, its Activity record, and its local scope", () => {
  const started = committed(initialState, startWithReviewContext);
  const completed = committed(started, completeReview);

  assert.deepEqual(completed.userTaskWaits, []);
  assert.deepEqual(completed.activityOccurrences, []);
  assert.deepEqual(completed.variables.activities, []);
  assert.deepEqual(completed.variables.process.bindings, [
    {
      name: sourcePropertyId,
      value: { kind: VariableValueKind.String, value: "invoice-4711" },
    },
  ]);

  const observation = observeStableState(dataInputProgram, completed);
  assert.equal(observation?.status, ProcessStatus.Completed);
  assert.deepEqual(observation?.openUserTasks, []);
});

test("a stale completion and a non-empty submission both preserve the committed state", () => {
  const started = committed(initialState, startWithReviewContext);
  const completed = committed(started, completeReview);

  const stale = applyStimulus(dataInputProgram, completed, completeReview);
  assert.equal(stale.outcome, CommandOutcome.Rejected);
  assert.deepEqual(stale.state, completed);

  const submitted = applyStimulus(dataInputProgram, started, {
    ...completeReview,
    commandId: "complete-review-with-values",
    submittedValues: [
      {
        name: sourcePropertyId,
        value: { kind: VariableValueKind.String, value: "reviewed" },
      },
    ],
  });
  assert.equal(submitted.outcome, CommandOutcome.Rejected);
  assert.deepEqual(submitted.state, started);
});

test("an equal-coordinate effect scope neither satisfies nor is removed by the Activity", () => {
  const started = committed(initialState, startWithReviewContext);
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
        name: targetDataInputId,
        value: { kind: VariableValueKind.String, value: "foreign" },
      },
    ],
  } as const;
  const contaminated: RuntimeState = {
    ...started,
    variables: {
      ...started.variables,
      activities: [foreign, ...started.variables.activities],
    },
  };

  const completed = applyStimulus(
    dataInputProgram,
    contaminated,
    completeReview,
  );
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.variables.activities, [foreign]);
});

test("the copied value belongs to the Activity occurrence rather than to Process scope", () => {
  const started = committed(initialState, startWithReviewContext);
  const scope = started.variables.activities[0];

  assert.ok(scope !== undefined);
  assert.equal(scope.owner.kind, LocalDataOwnerKind.ActivityOccurrence);
  assert.deepEqual(scope.owner.id, activityId);
  assert.equal(owner.processInstanceId, instanceId);
  assert.ok(
    !started.variables.process.bindings.some(
      ({ name }) => name === targetDataInputId,
    ),
  );
});

test("activation issues a disjoint Activity body claim above the predecessor mark", () => {
  const started = committed(initialState, startWithReviewContext);

  assert.equal(
    runtimeStateDefects(dataInputProgram, instanceId, started).includes(
      RuntimeStateDefect.DuplicateActivityBodyClaim,
    ),
    false,
    "data-input arming inserts a disjoint Activity body claim",
  );
  assert.equal(
    runtimeStateRegressions(initialState, started).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
    "the data-input evaluator issues above the predecessor Activity mark",
  );
});

test("completion removes the Activity without regressing its retained mark", () => {
  const started = committed(initialState, startWithReviewContext);
  const completed = committed(started, completeReview);

  assert.deepEqual(completed.activityActivations, [
    { elementId: "UserTask_Review", count: 1 },
  ]);
  assert.equal(
    runtimeStateRegressions(started, completed).includes(
      RuntimeStateRegression.ActivityOccurrenceIssue,
    ),
    false,
  );
  assert.deepEqual(
    runtimeStateDefects(dataInputProgram, instanceId, completed),
    [],
  );
});

test("an Activity owning an empty scope publishes no input collection", () => {
  const started = committed(initialState, startWithReviewContext);
  const scope = started.variables.activities[0];
  assert.ok(scope !== undefined);
  const emptied: RuntimeState = {
    ...started,
    variables: {
      ...started.variables,
      activities: [{ ...scope, bindings: [] }],
    },
  };

  const observation = observeStableState(dataInputProgram, emptied);

  assert.deepEqual(observation?.openUserTasks.map(({ inputs }) => inputs), [
    undefined,
  ]);
});

// The refusal is the account's boundary, not a defensive default: one required scalar DataInput is
// the whole admitted InputSet, so publishing the first of two would present partial data as complete.
test("a second locally owned binding is refused rather than truncated", () => {
  const started = committed(initialState, startWithReviewContext);
  const scope = started.variables.activities[0];
  assert.ok(scope !== undefined);
  const widened: RuntimeState = {
    ...started,
    variables: {
      ...started.variables,
      activities: [{
        ...scope,
        bindings: [
          ...scope.bindings,
          {
            name: "DataInput_Unadmitted",
            value: { kind: VariableValueKind.String, value: "second" },
          },
        ],
      }],
    },
  };

  assert.throws(
    () => observeStableState(dataInputProgram, widened),
    /more than one binding/u,
  );
});
