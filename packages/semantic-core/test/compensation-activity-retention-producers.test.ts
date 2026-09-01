import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  SemanticOperationKind,
  StimulusKind,
  applyInternalOperation,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  runtimeStateDefects,
  type RuntimeState,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { startFixture } from "./compensation-activity-retention-fixtures.ts";
import {
  completeIteration,
  fireOuterTimer,
  reviewProgram,
  startEmpty,
  startedState,
  startWithCollection,
} from "./sequential-multi-instance-fixture.ts";
import {
  parallelProgram,
  startWithParallelItems,
} from "./parallel-multi-instance-fixture.ts";
import {
  completeReview,
  dataInputProgram,
  startWithReviewContext,
} from "./activity-data-input-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const targetElementId = "Review";

function withRetention(
  source: SemanticProcessProgram,
  maxRecords = 4,
): SemanticProcessProgram {
  const root = source.definitionScopes.find(({ parentScopeId }) => parentScopeId === null);
  assert.ok(root !== undefined);
  return {
    ...source,
    compensationActivityRetention: {
      definitionScopeId: root.id,
      targets: [{
        activityElementId: targetElementId,
        boundaryEventElementId: "Boundary_Compensation_Review",
        compensationActivityElementId: "Undo_Review",
      }],
      limits: { maxRecords, maxCanonicalBytes: 65_536 },
    },
  };
}

function withoutEndEvents(source: SemanticProcessProgram): SemanticProcessProgram {
  const removed = new Set(source.operations.filter(
    ({ kind }) => kind === SemanticOperationKind.ReachNoneEnd,
  ).map(({ id }) => id));
  return {
    ...source,
    operations: source.operations.filter(({ id }) => !removed.has(id)),
    operationScopes: source.operationScopes.filter(({ operationId }) =>
      !removed.has(operationId)
    ),
  };
}

function records(state: RuntimeState) {
  return state.compensationActivityRetentions?.[0]?.records ?? [];
}

function withFullRetention(
  program: SemanticProcessProgram,
  state: RuntimeState,
  activityElementId: string,
): RuntimeState {
  const retention = state.compensationActivityRetentions?.[0];
  assert.ok(retention !== undefined);
  const activation = 99;
  const full = {
    ...state,
    activityActivations: [
      ...state.activityActivations.filter(({ elementId }) =>
        elementId !== activityElementId
      ),
      { elementId: activityElementId, count: activation },
    ],
    compensationActivityRetentions: [{
      ...retention,
      nextCompletionOrdinal: 2,
      records: [{
        id: {
          processInstanceId: retention.owner.processInstanceId,
          activityElementId,
          activation,
        },
        completionOrdinal: 1,
      }],
    }],
  } satisfies RuntimeState;
  assert.deepEqual(
    runtimeStateDefects(program, retention.owner.processInstanceId, full),
    [],
    "the seeded capacity state must be aggregate-valid",
  );
  return full;
}

test("an ordinary eligible completion preserves the exact state when retention is full", () => {
  const { startProgram, stimulus } = startFixture(SemanticOperationKind.Initiate);
  const program = {
    ...startProgram,
    compensationActivityRetention: {
      ...startProgram.compensationActivityRetention!,
      limits: { maxRecords: 1, maxCanonicalBytes: 65_536 },
    },
  };
  const started = applyStimulus(program, initialState, stimulus);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const wait = started.state.userTaskWaits[0];
  const retention = started.state.compensationActivityRetentions?.[0];
  assert.ok(wait !== undefined && retention !== undefined);
  void retention;
  const before = withFullRetention(program, started.state, wait.id.elementId);

  const completed = applyStimulus(program, before, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-full-retention-task",
    taskId: wait.id,
    submittedValues: [],
  });

  assert.equal(completed.outcome, CommandOutcome.Rejected);
  assert.equal(completed.state, before);
});

test("ordinary target completion retains once while handler-free completion stays byte-compatible", () => {
  const { startProgram, stimulus } = startFixture(SemanticOperationKind.Initiate);
  const program = withoutEndEvents(startProgram);
  const started = applyStimulus(program, initialState, stimulus);
  const wait = started.state.userTaskWaits[0];
  assert.ok(wait !== undefined);
  const completed = applyStimulus(program, started.state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-retained-ordinary",
    taskId: wait.id,
    submittedValues: [],
  });
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(completed.state), [{
    id: {
      processInstanceId: wait.id.processInstanceId,
      activityElementId: wait.id.elementId,
      activation: wait.id.activation,
    },
    completionOrdinal: 1,
  }]);

  const { compensationActivityRetention: _declaration, ...legacySource } = program;
  const legacyProgram = legacySource as SemanticProcessProgram;
  const legacyStarted = applyStimulus(legacyProgram, initialState, stimulus);
  const legacyWait = legacyStarted.state.userTaskWaits[0];
  assert.ok(legacyWait !== undefined);
  const legacyCompleted = applyStimulus(legacyProgram, legacyStarted.state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-handler-free-ordinary",
    taskId: legacyWait.id,
    submittedValues: [],
  });
  assert.equal(legacyCompleted.outcome, CommandOutcome.Committed);
  assert.equal(Object.hasOwn(legacyCompleted.state, "compensationActivityRetentions"), false);
  assert.deepEqual(legacyCompleted.state.activityActivations, []);
});

test("sequential completion retains only a successful outer occurrence", () => {
  const program = withRetention(withoutEndEvents(reviewProgram));
  const started = applyStimulus(
    program,
    initialState,
    startWithCollection("start-sequential-retention", ["alpha", "beta"]),
  );
  assert.equal(started.outcome, CommandOutcome.Committed);

  const first = applyStimulus(program, started.state, completeIteration(0, "one"));
  assert.equal(first.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(first.state), []);

  const completed = applyStimulus(program, first.state, completeIteration(1, "two"));
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(completed.state), [{
    id: {
      processInstanceId: "ReviewInstance_1",
      activityElementId: targetElementId,
      activation: 1,
    },
    completionOrdinal: 1,
  }]);

  const interruptedStart = applyStimulus(
    program,
    initialState,
    startWithCollection("start-sequential-interruption", ["alpha", "beta"]),
  );
  const interrupted = applyStimulus(program, interruptedStart.state, fireOuterTimer);
  assert.equal(interrupted.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(interrupted.state), []);
  const escalation = interrupted.state.userTaskWaits.find(({ id }) =>
    id.elementId === "EscalationTask"
  );
  assert.ok(escalation !== undefined);
  const nonTarget = applyStimulus(program, interrupted.state, {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "complete-non-target-escalation",
    taskId: escalation.id,
    submittedValues: [],
  });
  assert.equal(nonTarget.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(nonTarget.state), []);
});

test("sequential zero-item entry retains a minted outer identity without an inner occurrence", () => {
  const program = withRetention(withoutEndEvents(reviewProgram));
  const completed = applyStimulus(program, initialState, {
    ...startEmpty,
    commandId: "start-sequential-zero-retention",
  });
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(completed.state), [{
    id: {
      processInstanceId: "ReviewInstance_1",
      activityElementId: targetElementId,
      activation: 1,
    },
    completionOrdinal: 1,
  }]);
  assert.deepEqual(completed.state.activityOccurrences, []);
  assert.deepEqual(completed.state.activityActivations, [
    { elementId: targetElementId, count: 1 },
  ]);
});

test("parallel completion applies all-filled priority and excludes early and interrupted outcomes", () => {
  const program = withRetention(withoutEndEvents(parallelProgram));
  const one = applyStimulus(
    program,
    initialState,
    startWithParallelItems("start-parallel-one-first", ["alpha"], "first"),
  );
  const oneCompleted = applyStimulus(program, one.state, completeIteration(0, "one"));
  assert.equal(oneCompleted.outcome, CommandOutcome.Committed);
  assert.equal(records(oneCompleted.state).length, 1);

  const earlyStart = applyStimulus(
    program,
    initialState,
    startWithParallelItems("start-parallel-early", ["alpha", "beta"], "first"),
  );
  const early = applyStimulus(program, earlyStart.state, completeIteration(0, "one"));
  assert.equal(early.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(early.state), []);

  const allStart = applyStimulus(
    program,
    initialState,
    startWithParallelItems("start-parallel-all", ["alpha", "beta"], "all"),
  );
  const first = applyStimulus(program, allStart.state, completeIteration(0, "one"));
  assert.deepEqual(records(first.state), []);
  const all = applyStimulus(program, first.state, completeIteration(1, "two"));
  assert.equal(all.outcome, CommandOutcome.Committed);
  assert.equal(records(all.state).length, 1);

  const interruptedStart = applyStimulus(
    program,
    initialState,
    startWithParallelItems("start-parallel-interrupted", ["alpha", "beta"], "all"),
  );
  const interrupted = applyStimulus(program, interruptedStart.state, fireOuterTimer);
  assert.equal(interrupted.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(interrupted.state), []);
});

test("parallel zero-item entry retains one minted outer identity", () => {
  const program = withRetention(withoutEndEvents(parallelProgram));
  const completed = applyStimulus(
    program,
    initialState,
    startWithParallelItems("start-parallel-zero-retention", [], "all"),
  );
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(completed.state), [{
    id: {
      processInstanceId: "ReviewInstance_1",
      activityElementId: targetElementId,
      activation: 1,
    },
    completionOrdinal: 1,
  }]);
  assert.deepEqual(completed.state.activityOccurrences, []);
});

test("handler-free zero-item entry creates neither retention nor an Activity counter", () => {
  for (const [label, program, stimulus] of [
    ["sequential", withoutEndEvents(reviewProgram), startEmpty],
    [
      "parallel",
      withoutEndEvents(parallelProgram),
      startWithParallelItems("start-handler-free-parallel-zero", [], "all"),
    ],
  ] as const) {
    const completed = applyStimulus(program, initialState, stimulus);
    assert.equal(completed.outcome, CommandOutcome.Committed, label);
    assert.equal(
      Object.hasOwn(completed.state, "compensationActivityRetentions"),
      false,
      label,
    );
    assert.deepEqual(completed.state.activityActivations, [], label);
  }
});

test("sequential and parallel terminal capacity refusal preserves the exact pre-state", () => {
  for (const [label, source, start] of [
    [
      "sequential",
      reviewProgram,
      startWithCollection("start-sequential-capacity", ["alpha"]),
    ],
    [
      "parallel",
      parallelProgram,
      startWithParallelItems("start-parallel-capacity", ["alpha"], "all"),
    ],
  ] as const) {
    const program = withRetention(withoutEndEvents(source), 1);
    const entered = applyStimulus(program, initialState, start);
    assert.equal(entered.outcome, CommandOutcome.Committed, label);
    const before = withFullRetention(program, entered.state, targetElementId);
    const completed = applyStimulus(program, before, completeIteration(0, "one"));
    assert.equal(completed.outcome, CommandOutcome.Rejected, label);
    assert.equal(completed.state, before, label);
  }
});

test("sequential and parallel zero-item capacity refusal performs no entry mutation", () => {
  for (const [label, source, start] of [
    ["sequential", reviewProgram, startEmpty],
    [
      "parallel",
      parallelProgram,
      startWithParallelItems("start-parallel-zero-capacity", [], "all"),
    ],
  ] as const) {
    const program = withRetention(withoutEndEvents(source), 1);
    const startState = {
      ...startedState(start),
      ...(label === "sequential"
        ? { sequentialMultiInstanceControllers: [] }
        : { parallelMultiInstanceControllers: [] }),
      compensationActivityRetentions: [{
        owner: startedState(start).scopeOccurrences[0]!.id,
        nextCompletionOrdinal: 1,
        records: [],
      }],
    } satisfies RuntimeState;
    const initiation = program.operations.find(
      ({ kind }) => kind === SemanticOperationKind.Initiate,
    );
    const entry = program.operations.find(({ kind }) =>
      kind === (label === "sequential"
        ? SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
        : SemanticOperationKind.AwaitParallelMultiInstanceUserTask)
    );
    assert.ok(initiation !== undefined && entry !== undefined);
    const initiated = applyInternalOperation(program, initiation, startState);
    assert.ok(initiated !== null);
    const before = withFullRetention(program, initiated, targetElementId);
    const snapshot = structuredClone(before);
    assert.equal(applyInternalOperation(program, entry, before), null, label);
    assert.deepEqual(before, snapshot, label);
  }
});

test("a declaring Program leaves an excluded data-input completion outside retention", () => {
  const source = withoutEndEvents(dataInputProgram);
  const root = source.definitionScopes.find(({ parentScopeId }) => parentScopeId === null);
  assert.ok(root !== undefined);
  const dormantPlace = controlPlace("Flow_Dormant_Eligible");
  const eligible = {
    ...operationBase("Eligible_Ordinary"),
    kind: SemanticOperationKind.AwaitUserTask,
    input: dormantPlace.id,
    output: dormantPlace.id,
    task: { elementId: "Eligible_Ordinary", name: null },
  } as const;
  const program = {
    ...source,
    controlPlaces: [...source.controlPlaces, dormantPlace].sort((left, right) =>
      compareCanonicalStrings(left.id, right.id)
    ),
    controlPlaceScopes: [
      ...source.controlPlaceScopes,
      { controlPlaceId: dormantPlace.id, scopeId: root.id },
    ].sort((left, right) => compareCanonicalStrings(left.controlPlaceId, right.controlPlaceId)),
    operations: [...source.operations, eligible].sort((left, right) =>
      compareCanonicalStrings(left.id, right.id)
    ),
    operationScopes: [
      ...source.operationScopes,
      { operationId: eligible.id, scopeId: root.id },
    ].sort((left, right) => compareCanonicalStrings(left.operationId, right.operationId)),
    compensationActivityRetention: {
      definitionScopeId: root.id,
      targets: [{
        activityElementId: eligible.task.elementId,
        boundaryEventElementId: "Boundary_Eligible_Ordinary",
        compensationActivityElementId: "Undo_Eligible_Ordinary",
      }],
      limits: { maxRecords: 4, maxCanonicalBytes: 65_536 },
    },
  } satisfies SemanticProcessProgram;

  const started = applyStimulus(program, initialState, startWithReviewContext);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const completed = applyStimulus(program, started.state, completeReview);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(records(completed.state), []);
  assert.equal(
    completed.state.activityActivations.some(({ elementId }) =>
      elementId === eligible.task.elementId
    ),
    false,
  );
});
