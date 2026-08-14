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
