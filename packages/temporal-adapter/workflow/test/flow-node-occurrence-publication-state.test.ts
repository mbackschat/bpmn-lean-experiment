import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import {
  FlowNodeOccurrencePublicationResultKind,
} from "@bpmn-lean/temporal-protocol";

import {
  accumulateExecutionPublication,
  createExecutionPublicationState,
} from "../dist/execution-publication-state.js";
import {
  accumulateFlowNodeOccurrencePublication,
  createFlowNodeOccurrencePublicationState,
} from "../dist/flow-node-occurrence-publication-state.js";
import {
  queryFlowNodeOccurrences,
} from "../dist/flow-node-occurrence-query-handler.js";
import {
  publicationCompletion,
  publicationProcessInstanceId,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

function startPublications(committedAtEpochMs = 1_000) {
  const step = advanceScenario(
    publicationProgram,
    initialState,
    publicationStart,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const executionBefore = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const execution = accumulateExecutionPublication(
    publicationProgram,
    executionBefore,
    publicationStart,
    step,
  );
  const occurrences = accumulateFlowNodeOccurrencePublication(
    publicationProgram,
    createFlowNodeOccurrencePublicationState(
      publicationProgram,
      publicationProcessInstanceId,
    ),
    executionBefore,
    execution,
    publicationStart,
    step,
    committedAtEpochMs,
  );
  return { step, execution, occurrences };
}

test("numbers, folds, and E1-aligns one real multi-transition lifecycle batch", () => {
  const { step, execution, occurrences } = startPublications();
  assert.equal(occurrences.headRevision, execution.headRevision);
  assert.deepEqual(
    occurrences.batches[0]?.transitions.map(({ revision }) => revision),
    execution.batches[0]?.transitions.map(({ revision }) => revision),
  );
  assert.equal(
    occurrences.batches[0]?.transitions.length,
    step.flowNodeOccurrenceLifecycles?.length,
  );
  assert.equal(occurrences.batches[0]?.committedAtEpochMs, 1_000);
  assert.deepEqual(
    occurrences.currentOpen.map(({ elementId }) => elementId),
    ["UserTask_A", "UserTask_B"],
  );
  assert.ok(occurrences.currentOpen.every(({ startedAtEpochMs }) =>
    startedAtEpochMs === 1_000));
  const publicBytes = JSON.stringify({
    batches: occurrences.batches,
    currentOpen: occurrences.currentOpen,
  });
  assert.doesNotMatch(
    publicBytes,
    /"anchor"|"transitionIndex"|"localIndex"/u,
  );
  assert.ok(occurrences.retainedOpen.every(({ anchor }) =>
    anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Transition));
});

test("resolves terminals once and keeps one nondecreasing time per command batch", () => {
  const started = startPublications();
  const completion = publicationCompletion("UserTask_A");
  const step = advanceScenario(
    publicationProgram,
    started.step.state,
    completion,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const execution = accumulateExecutionPublication(
    publicationProgram,
    started.execution,
    completion,
    step,
  );
  const occurrences = accumulateFlowNodeOccurrencePublication(
    publicationProgram,
    started.occurrences,
    started.execution,
    execution,
    completion,
    step,
    1_250,
  );
  assert.deepEqual(
    occurrences.currentOpen.map(({ elementId }) => elementId),
    ["UserTask_B"],
  );
  const ended = occurrences.batches[1]?.transitions.flatMap(
    ({ lifecycle }) => lifecycle.ended,
  ) ?? [];
  assert.ok(ended.some(({ id }) =>
    id.startRevision === started.occurrences.currentOpen[0]?.id.startRevision));
  assert.equal(occurrences.lastCommittedAtEpochMs, 1_250);

  assert.throws(
    () => accumulateFlowNodeOccurrencePublication(
      publicationProgram,
      started.occurrences,
      started.execution,
      execution,
      completion,
      step,
      999,
    ),
    /accumulator continuity drifted/u,
  );
});

test("rejects a forged positive-cursor anchor map and duplicate or unknown lifecycle anchors", () => {
  const started = startPublications();
  const completion = publicationCompletion("UserTask_A");
  const step = advanceScenario(
    publicationProgram,
    started.step.state,
    completion,
  );
  assert.ok(step.kind === ScenarioStepKind.Committed);
  const execution = accumulateExecutionPublication(
    publicationProgram,
    started.execution,
    completion,
    step,
  );
  const forged = {
    ...started.occurrences,
    retainedOpen: [],
  };
  assert.throws(
    () => accumulateFlowNodeOccurrencePublication(
      publicationProgram,
      forged,
      started.execution,
      execution,
      completion,
      step,
      1_250,
    ),
    /accumulator continuity drifted/u,
  );
  const swapped = {
    ...started.occurrences,
    retainedOpen: started.occurrences.retainedOpen.map((entry, index, all) => ({
      ...entry,
      anchor: structuredClone(all[all.length - index - 1]!.anchor),
    })),
  };
  assert.throws(
    () => accumulateFlowNodeOccurrencePublication(
      publicationProgram,
      swapped,
      started.execution,
      execution,
      completion,
      step,
      1_250,
    ),
    /accumulator continuity drifted/u,
  );

  const unknown = structuredClone(step);
  assert.ok(unknown.flowNodeOccurrenceLifecycles !== null);
  const deltaWithEnd = unknown.flowNodeOccurrenceLifecycles.find(
    ({ ended }) => ended.length > 0,
  );
  assert.ok(deltaWithEnd?.ended[0] !== undefined);
  deltaWithEnd.ended[0].anchor = {
    kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
    id: {
      processInstanceId: publicationProcessInstanceId,
      elementId: "Unknown_Task",
      activation: 99,
    },
  };
  assert.throws(
    () => accumulateFlowNodeOccurrencePublication(
      publicationProgram,
      started.occurrences,
      started.execution,
      execution,
      completion,
      unknown,
      1_250,
    ),
    /ended an unknown anchor/u,
  );

  const duplicated = structuredClone(step);
  assert.ok(duplicated.flowNodeOccurrenceLifecycles !== null);
  const deltaWithStart = duplicated.flowNodeOccurrenceLifecycles.find(
    ({ started: values }) => values.length > 0,
  );
  if (deltaWithStart !== undefined) {
    deltaWithStart.started.push(structuredClone(deltaWithStart.started[0]!));
    assert.throws(
      () => accumulateFlowNodeOccurrencePublication(
        publicationProgram,
        started.occurrences,
        started.execution,
        execution,
        completion,
        duplicated,
        1_250,
      ),
      /not canonical|reused an open anchor/u,
    );
  }
});

test("queries complete aligned batches, all valid revision-zero cursors, gaps, and immutable copies", () => {
  const emptyExecution = createExecutionPublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  const emptyOccurrences = createFlowNodeOccurrencePublicationState(
    publicationProgram,
    publicationProcessInstanceId,
  );
  for (const afterRevision of [0, 7]) {
    assert.deepEqual(
      queryFlowNodeOccurrences(
        publicationProgram,
        emptyExecution,
        emptyOccurrences,
        { afterRevision },
      ),
      { kind: FlowNodeOccurrencePublicationResultKind.NotReady },
    );
  }

  const started = startPublications();
  const completion = publicationCompletion("UserTask_A");
  const completionStep = advanceScenario(
    publicationProgram,
    started.step.state,
    completion,
  );
  assert.ok(completionStep.kind === ScenarioStepKind.Committed);
  const completedExecution = accumulateExecutionPublication(
    publicationProgram,
    started.execution,
    completion,
    completionStep,
  );
  const completedOccurrences = accumulateFlowNodeOccurrencePublication(
    publicationProgram,
    started.occurrences,
    started.execution,
    completedExecution,
    completion,
    completionStep,
    1_250,
  );
  const firstBatch = queryFlowNodeOccurrences(
    publicationProgram,
    completedExecution,
    completedOccurrences,
    { afterRevision: 0, limit: 1 },
  );
  assert.ok(firstBatch.kind === FlowNodeOccurrencePublicationResultKind.Available);
  assert.equal(firstBatch.page.batches.length, 1);
  assert.equal(firstBatch.page.currentOpen, null);
  assert.equal(
    firstBatch.page.pageThroughRevision,
    completedOccurrences.batches[0]?.throughRevision,
  );

  const atHead = queryFlowNodeOccurrences(
    publicationProgram,
    started.execution,
    started.occurrences,
    { afterRevision: started.occurrences.headRevision },
  );
  assert.equal(atHead.kind, FlowNodeOccurrencePublicationResultKind.Available);
  assert.ok(atHead.kind === FlowNodeOccurrencePublicationResultKind.Available);
  assert.deepEqual(atHead.page.batches, []);
  assert.deepEqual(atHead.page.currentOpen, started.occurrences.currentOpen);

  for (const afterRevision of [1, started.occurrences.headRevision + 1]) {
    assert.deepEqual(
      queryFlowNodeOccurrences(
        publicationProgram,
        started.execution,
        started.occurrences,
        { afterRevision },
      ),
      { kind: FlowNodeOccurrencePublicationResultKind.Gap },
    );
  }

  const first = queryFlowNodeOccurrences(
    publicationProgram,
    started.execution,
    started.occurrences,
    { afterRevision: 0, limit: 1 },
  );
  assert.ok(first.kind === FlowNodeOccurrencePublicationResultKind.Available);
  const mutable = first as unknown as {
    page: { currentOpen: Array<{ elementId: string }> };
  };
  mutable.page.currentOpen[0]!.elementId = "mutated-query-copy";
  assert.notEqual(
    started.occurrences.currentOpen[0]?.elementId,
    "mutated-query-copy",
  );
});
