import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ScenarioStepKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticTransitionKind,
  advanceScenario,
  applyStimulus,
  applyStimulusWithTrace,
  compareCanonicalStrings,
  evaluateStimulusWithSelectedSteps,
  initialState,
  replayCommittedTransitions,
} from "@bpmn-lean/semantic-core";
import type {
  SemanticOperation,
  SemanticProcessProgram,
  UnnumberedCommittedTransitionRecord,
} from "@bpmn-lean/semantic-core";

import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";
import { operationBase } from "./semantic-program-parts.ts";

test("one admitted start publishes its external stimulus and every selected closure operation", () => {
  const traced = applyStimulusWithTrace(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const existing = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
  );

  assert.deepEqual(traced.result, existing);
  assert.equal(traced.result.outcome, CommandOutcome.Committed);
  assert.equal(traced.result.ambiguousInternalChoice, false);
  assert.deepEqual(
    traced.committedTransitions.map(({ transition }) => transition.kind),
    [
      SemanticTransitionKind.ExternalStimulus,
      SemanticTransitionKind.InternalOperation,
      SemanticTransitionKind.InternalOperation,
      SemanticTransitionKind.InternalOperation,
      SemanticTransitionKind.InternalOperation,
    ],
  );
  assert.deepEqual(
    traced.committedTransitions.slice(1).map(({ transition }) =>
      transition.kind === SemanticTransitionKind.InternalOperation
        ? transition.operationId
        : "unexpected-external"
    ),
    [
      "operation:StartEvent_1",
      "operation:Gateway_Fork",
      "operation:UserTask_A",
      "operation:UserTask_B",
    ],
  );
  assert.deepEqual(
    replayCommittedTransitions(
      parallelProgram,
      initialState,
      traced.committedTransitions,
    ),
    traced.result.state,
  );
});

test("replay rejects missing, reordered, duplicated, or independently substituted operation facts", () => {
  const traced = applyStimulusWithTrace(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const records = traced.committedTransitions;
  const firstInternal = requireInternal(records, 1);
  const secondInternal = requireInternal(records, 2);

  const mutations: ReadonlyArray<ReadonlyArray<UnnumberedCommittedTransitionRecord>> = [
    records.filter((_, index) => index !== 2),
    [records[0]!, records[2]!, records[1]!, ...records.slice(3)],
    [records[0]!, records[1]!, records[1]!, ...records.slice(2)],
    replaceInternal(records, 1, {
      ...firstInternal,
      operationId: secondInternal.operationId,
    }),
    replaceInternal(records, 1, {
      ...firstInternal,
      operationKind: SemanticOperationKind.Duplicate,
    }),
    replaceInternal(records, 1, {
      ...firstInternal,
      origin: {
        kind: SemanticOriginKind.BpmnElement,
        elementId: "StartEvent_Substituted",
      },
    }),
    replaceInternal(records, 1, {
      ...firstInternal,
      owner: { ...firstInternal.owner, activation: 2 },
    }),
  ];

  for (const mutation of mutations) {
    const replayed = replayCommittedTransitions(
      parallelProgram,
      initialState,
      mutation,
    );
    assert.ok(
      replayed === null || !sameJson(replayed, traced.result.state),
      "a changed complete transition record must not replay to the committed result",
    );
  }
});

test("transition facts carry exact logical time, position deltas, and an independently projected head", () => {
  const traced = applyStimulusWithTrace(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  assert.deepEqual(
    traced.committedTransitions.map(({ logicalTimeMs }) => logicalTimeMs),
    [0, 0, 0, 0, 0],
  );
  assert.deepEqual(traced.committedTransitions[0]?.positionDelta.enteredScopes, [{
    id: {
      processInstanceId: "Instance_1",
      definitionScopeId: "scope:Process_ParallelForkJoin",
      activation: 1,
    },
    parent: null,
    bpmnElementId: "Process_ParallelForkJoin",
  }]);
  assert.deepEqual(traced.committedTransitions[1]?.positionDelta.producedTokens, [{
    sequenceFlowId: "Flow_StartToFork",
    owner: {
      processInstanceId: "Instance_1",
      definitionScopeId: "scope:Process_ParallelForkJoin",
      activation: 1,
    },
    multiplicity: 1,
  }]);

  const step = advanceScenario(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) {
    return;
  }
  assert.ok(step.publication !== null);
  assert.deepEqual(step.publication.transitions, traced.committedTransitions);
  assert.equal(step.publication.current.state.instanceId, "Instance_1");
  assert.deepEqual(step.publication.current.controlTokens, []);
  assert.deepEqual(step.publication.current.scopes, traced.currentPositions?.scopes);
});

test("rejected and closure-bound evaluations publish no committed facts", () => {
  const started = applyStimulusWithTrace(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const rejected = applyStimulusWithTrace(
    parallelProgram,
    started.result.state,
    startStimulus(),
  );
  const bounded = applyStimulusWithTrace(
    parallelProgram,
    initialState,
    startStimulus(),
    1,
  );

  assert.equal(rejected.result.outcome, CommandOutcome.Rejected);
  assert.equal(rejected.result.ambiguousInternalChoice, false);
  assert.deepEqual(rejected.committedTransitions, []);
  assert.equal(rejected.currentPositions, null);
  assert.equal(bounded.result.internalStepBoundExceeded, true);
  assert.equal(bounded.result.ambiguousInternalChoice, false);
  assert.deepEqual(bounded.committedTransitions, []);
  assert.equal(bounded.currentPositions, null);
});

test("two enabled End operations stop at the exact pre-choice boundary without publication", () => {
  const program = withAdditionalOperation({
    ...operationBase("EndEvent_Alternate"),
    kind: SemanticOperationKind.ReachNoneEnd,
    input: "place:Flow_JoinToEnd",
  });
  const started = applyStimulus(program, initialState, startStimulus());
  const afterA = applyStimulus(
    program,
    started.state,
    completionStimulus("UserTask_A"),
  );
  const beforeEndChoice = applyStimulus(
    program,
    afterA.state,
    completionStimulus("UserTask_B"),
    1,
  );
  const evaluated = evaluateStimulusWithSelectedSteps(
    program,
    afterA.state,
    completionStimulus("UserTask_B"),
  );
  const traced = applyStimulusWithTrace(
    program,
    afterA.state,
    completionStimulus("UserTask_B"),
  );
  const resultOnly = applyStimulus(
    program,
    afterA.state,
    completionStimulus("UserTask_B"),
  );

  assert.equal(beforeEndChoice.internalStepBoundExceeded, true);
  assert.equal(beforeEndChoice.ambiguousInternalChoice, false);
  assert.deepEqual(evaluated.result.state, beforeEndChoice.state);
  assert.deepEqual(
    evaluated.selectedInternalSteps.map(({ operation }) => operation.id),
    ["operation:Gateway_Join"],
  );
  assert.equal(evaluated.result.outcome, CommandOutcome.Committed);
  assert.equal(evaluated.result.ambiguousInternalChoice, true);
  assert.equal(evaluated.result.internalStepBoundExceeded, false);
  assert.deepEqual(traced.result, resultOnly);
  assert.deepEqual(evaluated.result, resultOnly);
  assert.deepEqual(traced.committedTransitions, []);
  assert.equal(traced.currentPositions, null);
});

test("two enabled Duplicate operations stop before either selector can fire", () => {
  const program = withAdditionalOperation({
    ...operationBase("Gateway_Fork_Alternate"),
    kind: SemanticOperationKind.Duplicate,
    input: "place:Flow_StartToFork",
    outputs: ["place:Flow_ForkToA", "place:Flow_ForkToB"],
  });
  const beforeForkChoice = applyStimulus(
    program,
    initialState,
    startStimulus(),
    1,
  );
  const evaluated = evaluateStimulusWithSelectedSteps(
    program,
    initialState,
    startStimulus(),
  );
  const traced = applyStimulusWithTrace(
    program,
    initialState,
    startStimulus(),
  );
  const resultOnly = applyStimulus(program, initialState, startStimulus());

  assert.equal(beforeForkChoice.internalStepBoundExceeded, true);
  assert.equal(beforeForkChoice.ambiguousInternalChoice, false);
  assert.deepEqual(evaluated.result.state, beforeForkChoice.state);
  assert.deepEqual(evaluated.result.state.controlTokens, [{
    placeId: "place:Flow_StartToFork",
    owner: {
      processInstanceId: "Instance_1",
      definitionScopeId: "scope:Process_ParallelForkJoin",
      activation: 1,
    },
    multiplicity: 1,
  }]);
  assert.deepEqual(
    evaluated.selectedInternalSteps.map(({ operation }) => operation.id),
    ["operation:StartEvent_1"],
  );
  assert.equal(evaluated.result.outcome, CommandOutcome.Committed);
  assert.equal(evaluated.result.ambiguousInternalChoice, true);
  assert.equal(evaluated.result.internalStepBoundExceeded, false);
  assert.deepEqual(traced.result, resultOnly);
  assert.deepEqual(evaluated.result, resultOnly);
  assert.deepEqual(traced.committedTransitions, []);
  assert.equal(traced.currentPositions, null);
});

function withAdditionalOperation(
  operation: SemanticOperation,
): SemanticProcessProgram {
  const operations = [...parallelProgram.operations, operation].sort(
    (left, right) => compareCanonicalStrings(left.id, right.id),
  );
  const operationScopes = [
    ...parallelProgram.operationScopes,
    {
      operationId: operation.id,
      scopeId: "scope:Process_ParallelForkJoin",
    },
  ].sort((left, right) =>
    compareCanonicalStrings(left.operationId, right.operationId)
  );
  return { ...parallelProgram, operations, operationScopes };
}

function requireInternal(
  records: ReadonlyArray<UnnumberedCommittedTransitionRecord>,
  index: number,
): Extract<
  UnnumberedCommittedTransitionRecord["transition"],
  { kind: SemanticTransitionKind.InternalOperation }
> {
  const transition = records[index]?.transition;
  assert.equal(transition?.kind, SemanticTransitionKind.InternalOperation);
  if (transition?.kind !== SemanticTransitionKind.InternalOperation) {
    throw new Error(`record ${index} is not an internal operation`);
  }
  return transition;
}

function replaceInternal(
  records: ReadonlyArray<UnnumberedCommittedTransitionRecord>,
  index: number,
  transition: Extract<
    UnnumberedCommittedTransitionRecord["transition"],
    { kind: SemanticTransitionKind.InternalOperation }
  >,
): ReadonlyArray<UnnumberedCommittedTransitionRecord> {
  return records.map((record, candidateIndex) =>
    candidateIndex === index ? { ...record, transition } : record
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
