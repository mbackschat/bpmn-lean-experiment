import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";

import {
  accumulateExecutionPublication,
  createExecutionPublicationState,
} from "../dist/execution-publication-state.js";
import {
  publicationCompletion,
  publicationProcessInstanceId,
  publicationProgram,
  publicationStart,
  timedPublicationCompletion,
  timedPublicationFire,
  timedPublicationProcessInstanceId,
  timedPublicationProgram,
  timedPublicationStart,
} from "./execution-publication-fixture.ts";

test("numbers one real multi-transition start only after stable closure", () => {
  const empty = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const step = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.equal(step.kind, ScenarioStepKind.Committed);
  assert.ok(step.kind === ScenarioStepKind.Committed);
  assert.ok((step.publication?.transitions.length ?? 0) > 2);

  const accumulated = accumulateExecutionPublication(
    publicationProgram,
    empty,
    publicationStart,
    step,
  );
  assert.equal(accumulated.batches.length, 1);
  assert.equal(accumulated.batches[0]?.fromRevision, 0);
  assert.equal(
    accumulated.batches[0]?.throughRevision,
    step.publication?.transitions.length,
  );
  assert.deepEqual(
    accumulated.batches[0]?.transitions.map(({ revision }) => revision),
    step.publication?.transitions.map((_, index) => index + 1),
  );
  assert.equal(accumulated.current?.revision, accumulated.headRevision);
  assert.deepEqual(empty, createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  ));
});

test("does not advance for rejection or closure-bound failure", () => {
  const empty = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const start = advanceScenario(publicationProgram, initialState, publicationStart);
  assert.ok(start.kind === ScenarioStepKind.Committed);
  const started = accumulateExecutionPublication(
    publicationProgram,
    empty,
    publicationStart,
    start,
  );

  const rejectedStimulus = publicationCompletion("UserTask_A", 99);
  const rejected = advanceScenario(
    publicationProgram,
    start.state,
    rejectedStimulus,
  );
  assert.equal(rejected.kind, ScenarioStepKind.Terminal);
  assert.equal(
    accumulateExecutionPublication(
      publicationProgram,
      started,
      rejectedStimulus,
      rejected,
    ),
    started,
  );

  const bounded = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
    1,
  );
  assert.equal(bounded.kind, ScenarioStepKind.HarnessFailure);
  assert.equal(
    accumulateExecutionPublication(
      publicationProgram,
      empty,
      publicationStart,
      bounded,
    ),
    empty,
  );
});

test("fails closed when a committed evaluator step omits its publication", () => {
  const empty = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const step = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  assert.throws(
    () => accumulateExecutionPublication(
      publicationProgram,
      empty,
      publicationStart,
      { ...step, publication: null },
    ),
    /committed semantic step has no publishable trace/u,
  );
});

test("validates redundant operation facts against the exact in-Workflow Program", () => {
  const step = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const publication = structuredClone(step.publication) as unknown as {
    transitions: Array<{
      transition: { kind: string; operationKind?: string };
    }>;
  };
  const internal = publication.transitions.find(
    ({ transition }) => transition.kind === "internalOperation",
  );
  assert.ok(internal?.transition.operationKind !== undefined);
  internal.transition.operationKind = internal.transition.operationKind === "initiate"
    ? "duplicate"
    : "initiate";
  assert.throws(
    () => accumulateExecutionPublication(
      publicationProgram,
      createExecutionPublicationState(
        publicationProgram,
        publicationProcessInstanceId,
      ),
      publicationStart,
      { ...step, publication } as never,
    ),
    /malformed execution publication page/u,
  );
});

test("rejects a later current whose multiplicity disagrees with its real delta", () => {
  const start = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(start.kind === ScenarioStepKind.Committed);
  const accumulated = accumulateExecutionPublication(
    publicationProgram,
    createExecutionPublicationState(
      publicationProgram,
      publicationProcessInstanceId,
    ),
    publicationStart,
    start,
  );
  assert.ok(accumulated.headRevision > 0);
  assert.ok(accumulated.current !== null);

  const completion = publicationCompletion("UserTask_A");
  const step = advanceScenario(publicationProgram, start.state, completion);
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const publication = structuredClone(step.publication)!;
  assert.equal(publication.current.controlTokens[0]?.multiplicity, 1);
  publication.current.controlTokens[0]!.multiplicity = 2;

  assert.throws(
    () => accumulateExecutionPublication(
      publicationProgram,
      accumulated,
      completion,
      { ...step, publication },
    ),
    /publication position delta does not reach its current positions/u,
  );
});

test("rejects a later batch whose logical time precedes the accumulated head", () => {
  const startedStep = advanceScenario(
    timedPublicationProgram,
    initialState,
    timedPublicationStart,
  );
  assert.ok(startedStep.kind === ScenarioStepKind.Committed);
  const started = accumulateExecutionPublication(
    timedPublicationProgram,
    createExecutionPublicationState(
      timedPublicationProgram,
      timedPublicationProcessInstanceId,
    ),
    timedPublicationStart,
    startedStep,
  );
  const firedStep = advanceScenario(
    timedPublicationProgram,
    startedStep.state,
    timedPublicationFire,
  );
  assert.ok(firedStep.kind === ScenarioStepKind.Committed);
  const fired = accumulateExecutionPublication(
    timedPublicationProgram,
    started,
    timedPublicationFire,
    firedStep,
  );
  assert.equal(fired.current?.state.logicalTimeMs, 1000);

  const completedStep = advanceScenario(
    timedPublicationProgram,
    firedStep.state,
    timedPublicationCompletion,
  );
  assert.ok(completedStep.kind === ScenarioStepKind.Committed);
  const publication = structuredClone(completedStep.publication)!;
  for (const transition of publication.transitions) {
    transition.logicalTimeMs = 999;
  }
  publication.current.state.logicalTimeMs = 999;

  assert.throws(
    () => accumulateExecutionPublication(
      timedPublicationProgram,
      fired,
      timedPublicationCompletion,
      { ...completedStep, publication },
    ),
    /publication logical time precedes its accumulated head/u,
  );
});

test("compares folded positions one-to-one across duplicate and substituted tokens", () => {
  const start = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(start.kind === ScenarioStepKind.Committed);
  const started = accumulateExecutionPublication(
    publicationProgram,
    createExecutionPublicationState(
      publicationProgram,
      publicationProcessInstanceId,
    ),
    publicationStart,
    start,
  );
  const completionA = publicationCompletion("UserTask_A");
  const stepA = advanceScenario(publicationProgram, start.state, completionA);
  assert.ok(stepA.kind === ScenarioStepKind.Committed);
  const afterA = accumulateExecutionPublication(
    publicationProgram,
    started,
    completionA,
    stepA,
  );
  const duplicated = structuredClone(afterA);
  assert.ok(duplicated.current !== null);
  const tokenA = duplicated.current.controlTokens[0]!;
  duplicated.current.controlTokens = [tokenA, structuredClone(tokenA)];

  const completionB = publicationCompletion("UserTask_B");
  const stepB = advanceScenario(publicationProgram, start.state, completionB);
  assert.ok(stepB.kind === ScenarioStepKind.Committed);
  const publication = structuredClone(stepB.publication)!;
  const tokenB = publication.current.controlTokens[0]!;
  publication.transitions[0]!.positionDelta = {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  };
  publication.current.controlTokens = [tokenA, tokenB];

  assert.throws(
    () => accumulateExecutionPublication(
      publicationProgram,
      duplicated,
      completionB,
      { ...stepB, publication },
    ),
    /publication position delta does not reach its current positions/u,
  );
});
