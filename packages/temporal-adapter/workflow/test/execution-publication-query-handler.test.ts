import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import { ExecutionPublicationResultKind } from "@bpmn-lean/temporal-protocol";

import {
  accumulateExecutionPublication,
  createExecutionPublicationState,
} from "../dist/execution-publication-state.js";
import { queryExecutionPublication } from "../dist/execution-publication-query-handler.js";
import {
  publicationCompletion,
  publicationProcessInstanceId,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

test("returns only notReady at revision zero without mutating state", () => {
  const state = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const before = structuredClone(state);
  for (const afterRevision of [0, 7]) {
    assert.deepEqual(
      queryExecutionPublication(
        publicationProgram,
        state,
        { afterRevision },
      ),
      { kind: ExecutionPublicationResultKind.NotReady },
    );
  }
  assert.deepEqual(state, before);
});

test("pages complete batches, counts batches rather than records, and rejects invalid cursors", () => {
  let runtime = initialState;
  let publication = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  for (const stimulus of [
    publicationStart,
    publicationCompletion("UserTask_A"),
    publicationCompletion("UserTask_B"),
  ]) {
    const step = advanceScenario(publicationProgram, runtime, stimulus);
    assert.ok(step.kind === ScenarioStepKind.Committed);
    publication = accumulateExecutionPublication(
      publicationProgram,
      publication,
      stimulus,
      step,
    );
    runtime = step.state;
  }
  assert.equal(publication.batches.length, 3);
  assert.ok((publication.batches[0]?.transitions.length ?? 0) > 1);

  const first = queryExecutionPublication(
    publicationProgram,
    publication,
    { afterRevision: 0, limit: 1 },
  );
  assert.equal(first.kind, ExecutionPublicationResultKind.Available);
  assert.ok(first.kind === ExecutionPublicationResultKind.Available);
  assert.equal(first.page.batches.length, 1);
  assert.equal(first.page.current, null);
  assert.equal(
    first.page.pageThroughRevision,
    publication.batches[0]?.throughRevision,
  );

  const insideFirstBatch = (publication.batches[0]?.fromRevision ?? 0) + 1;
  for (const afterRevision of [insideFirstBatch, publication.headRevision + 1]) {
    assert.deepEqual(
      queryExecutionPublication(
        publicationProgram,
        publication,
        { afterRevision },
      ),
      { kind: ExecutionPublicationResultKind.Gap },
    );
  }

  const atHead = queryExecutionPublication(
    publicationProgram,
    publication,
    { afterRevision: publication.headRevision },
  );
  assert.equal(atHead.kind, ExecutionPublicationResultKind.Available);
  assert.ok(atHead.kind === ExecutionPublicationResultKind.Available);
  assert.deepEqual(atHead.page.batches, []);
  assert.equal(atHead.page.current?.revision, publication.headRevision);
});

test("repeated and at-head queries never mutate or allocate revisions", () => {
  const step = advanceScenario(publicationProgram, initialState, publicationStart);
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const publication = accumulateExecutionPublication(
    publicationProgram,
    createExecutionPublicationState(
      publicationProgram,
      publicationProcessInstanceId,
    ),
    publicationStart,
    step,
  );
  const before = structuredClone(publication);
  const request = { afterRevision: publication.headRevision } as const;
  assert.deepEqual(
    queryExecutionPublication(publicationProgram, publication, request),
    queryExecutionPublication(publicationProgram, publication, request),
  );
  assert.deepEqual(publication, before);
});

test("strictly rejects malformed requests", () => {
  const state = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  for (const request of [
    {},
    { afterRevision: -1 },
    { afterRevision: 0, limit: 0 },
    { afterRevision: 0, limit: 101 },
    { afterRevision: 0, extra: true },
  ]) {
    assert.throws(
      () => queryExecutionPublication(publicationProgram, state, request),
      /malformed execution publication request/u,
    );
  }
});
