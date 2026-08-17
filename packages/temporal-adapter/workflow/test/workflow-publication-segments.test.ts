import assert from "node:assert/strict";
import test from "node:test";

import {
  ScenarioStepKind,
  advanceScenario,
  initialState,
} from "@bpmn-lean/semantic-core";
import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  WorkflowPublicationSegmentQueryResultKind,
  WorkflowPublicationSegmentSelectionResultKind,
  bpmnWorkflowPublicationSegmentsV1,
} from "@bpmn-lean/temporal-protocol";

import {
  integrateCommandPublication,
  recordCommandPublicationOutcome,
} from "../dist/command-publication-integration.js";
import {
  emptyWorkflowPublicationSegmentDirectory,
  queryWorkflowPublicationSegment,
  restoreWorkflowCommandPublication,
  selectWorkflowPublication,
  snapshotWorkflowPublicationForSuccessor,
} from "../dist/workflow-publication-segments.js";
import type {
  CommandPublicationState,
} from "../dist/command-publication-integration.js";
import type {
  WorkflowPublicationSegmentRuntime,
} from "../dist/workflow-publication-segments.js";
import {
  createCommandPublicationState,
} from "../dist/command-publication-integration.js";
import {
  publicationCompletion,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

const firstRunId = "publication-run-1";
const secondRunId = "publication-run-2";

test("a continued Run selects and reads paired publication from its closed predecessor", () => {
  const { publication: closed, runtime: first } = firstRunPublication();
  const firstSelection = selectWorkflowPublication(
    publicationProgram,
    publicationStart.instanceId,
    first,
    closed,
    selectionRequest(0),
  );
  assert.ok(
    firstSelection.kind ===
      WorkflowPublicationSegmentSelectionResultKind.Available,
  );
  assert.equal(firstSelection.directory.segments.length, 0);
  assert.equal(firstSelection.selected.runId, firstRunId);
  const continuation = snapshotWorkflowPublicationForSuccessor(closed, first);
  const second: WorkflowPublicationSegmentRuntime = {
    runId: secondRunId,
    runOrdinal: 2,
    firstExecutionRunId: firstRunId,
    segmentDirectory: continuation.publication.segmentDirectory,
  };
  const continued = restoreWorkflowCommandPublication(continuation.publication);
  const selection = selectWorkflowPublication(
    publicationProgram,
    publicationStart.instanceId,
    second,
    continued,
    selectionRequest(0),
  );
  assert.equal(
    selection.kind,
    WorkflowPublicationSegmentSelectionResultKind.Available,
  );
  assert.ok(selection.kind === WorkflowPublicationSegmentSelectionResultKind.Available);
  assert.equal(selection.selected.runId, firstRunId);

  const paired = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    first,
    closed,
    {
      ...selectionRequest(0),
      descriptor: selection.selected,
      snapshot: selection.snapshot,
    },
  );
  assert.equal(paired.kind, WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(paired.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.equal(paired.execution.kind, ExecutionPublicationResultKind.Available);
  assert.equal(
    paired.flowNodeOccurrences.kind,
    FlowNodeOccurrencePublicationResultKind.Available,
  );
  assert.ok(paired.execution.kind === ExecutionPublicationResultKind.Available);
  assert.ok(
    paired.flowNodeOccurrences.kind ===
      FlowNodeOccurrencePublicationResultKind.Available,
  );
  assert.deepEqual(paired.execution.page.batches, closed.execution.batches);
  assert.deepEqual(
    paired.flowNodeOccurrences.page.batches,
    closed.flowNodeOccurrences.batches,
  );
});

test("rejects a digest substitution before returning another Run's data", () => {
  const { publication, runtime } = firstRunPublication();
  const continuation = snapshotWorkflowPublicationForSuccessor(publication, runtime);
  const descriptor = continuation.publication.segmentDirectory.segments[0];
  assert.ok(descriptor !== undefined);
  const snapshot = {
    definition: publication.execution.definition,
    processId: publication.execution.processId,
    processInstanceId: publication.execution.processInstanceId,
    headRevision: publication.execution.headRevision,
    current: publication.execution.current,
    currentOpen: publication.flowNodeOccurrences.currentOpen,
  };
  assert.ok(snapshot.current !== null);

  assert.throws(
    () => queryWorkflowPublicationSegment(
      publicationProgram,
      publicationStart.instanceId,
      runtime,
      publication,
      {
        ...selectionRequest(0),
        descriptor: { ...descriptor, sha256: "f".repeat(64) },
        snapshot: { ...snapshot, current: snapshot.current },
      },
    ),
    /digest substitution/u,
  );
});

test("returns aligned gaps inside a command batch and empty pages at the global head", () => {
  const { publication: closed, runtime: first } = firstRunPublication();
  const continuation = snapshotWorkflowPublicationForSuccessor(closed, first);
  const second: WorkflowPublicationSegmentRuntime = {
    runId: secondRunId,
    runOrdinal: 2,
    firstExecutionRunId: firstRunId,
    segmentDirectory: continuation.publication.segmentDirectory,
  };
  const continued = restoreWorkflowCommandPublication(continuation.publication);
  const inside = closed.execution.batches[0]!.fromRevision + 1;
  const insideSelection = selectWorkflowPublication(
    publicationProgram,
    publicationStart.instanceId,
    second,
    continued,
    selectionRequest(inside),
  );
  assert.ok(insideSelection.kind === WorkflowPublicationSegmentSelectionResultKind.Available);
  const gap = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    first,
    closed,
    {
      ...selectionRequest(inside),
      descriptor: insideSelection.selected,
      snapshot: insideSelection.snapshot,
    },
  );
  assert.ok(gap.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.equal(gap.execution.kind, ExecutionPublicationResultKind.Gap);
  assert.equal(
    gap.flowNodeOccurrences.kind,
    FlowNodeOccurrencePublicationResultKind.Gap,
  );

  const atHead = selectWorkflowPublication(
    publicationProgram,
    publicationStart.instanceId,
    second,
    continued,
    selectionRequest(continued.execution.headRevision),
  );
  assert.ok(atHead.kind === WorkflowPublicationSegmentSelectionResultKind.Available);
  assert.equal(atHead.selected.runId, secondRunId);
  const empty = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    second,
    continued,
    {
      ...selectionRequest(continued.execution.headRevision),
      descriptor: atHead.selected,
      snapshot: atHead.snapshot,
    },
  );
  assert.ok(empty.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(empty.execution.kind === ExecutionPublicationResultKind.Available);
  assert.ok(
    empty.flowNodeOccurrences.kind ===
      FlowNodeOccurrencePublicationResultKind.Available,
  );
  assert.deepEqual(empty.execution.page.batches, []);
  assert.deepEqual(empty.flowNodeOccurrences.page.batches, []);
  assert.equal(empty.execution.page.current?.revision, continued.execution.headRevision);
});

test("accepts the exact nonzero segment-start cursor and reports a changed current descriptor", () => {
  const { publication: firstPublication, state, runtime: first } = firstRunPublication();
  const continuation = snapshotWorkflowPublicationForSuccessor(firstPublication, first);
  const second: WorkflowPublicationSegmentRuntime = {
    runId: secondRunId,
    runOrdinal: 2,
    firstExecutionRunId: firstRunId,
    segmentDirectory: continuation.publication.segmentDirectory,
  };
  const before = restoreWorkflowCommandPublication(continuation.publication);
  const completion = publicationCompletion("UserTask_A");
  const step = advanceScenario(publicationProgram, state, completion);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) assert.fail("completion did not commit");
  const after = publish(before, completion, step, 2_000);
  const request = selectionRequest(before.execution.headRevision);
  const selection = selectWorkflowPublication(
    publicationProgram,
    publicationStart.instanceId,
    second,
    after,
    request,
  );
  assert.ok(selection.kind === WorkflowPublicationSegmentSelectionResultKind.Available);
  assert.equal(selection.selected.runId, secondRunId);
  const paired = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    second,
    after,
    { ...request, descriptor: selection.selected, snapshot: selection.snapshot },
  );
  assert.ok(paired.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(paired.execution.kind === ExecutionPublicationResultKind.Available);
  assert.equal(paired.execution.page.batches[0]?.fromRevision, request.afterRevision);

  const stale = { ...selection.selected, throughRevision: request.afterRevision };
  const changed = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    second,
    after,
    { ...request, descriptor: stale, snapshot: selection.snapshot },
  );
  assert.equal(changed.kind, WorkflowPublicationSegmentQueryResultKind.Changed);
});

function firstRunPublication(): Readonly<{
  publication: CommandPublicationState;
  state: ReturnType<typeof advanceScenario>["state"];
  runtime: WorkflowPublicationSegmentRuntime;
}> {
  const step = advanceScenario(publicationProgram, initialState, publicationStart);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) assert.fail("start did not commit");
  return {
    publication: publish(
      createCommandPublicationState(publicationProgram, publicationStart.instanceId),
      publicationStart,
      step,
      1_000,
    ),
    state: step.state,
    runtime: {
      runId: firstRunId,
      runOrdinal: 1,
      firstExecutionRunId: firstRunId,
      segmentDirectory: emptyWorkflowPublicationSegmentDirectory(),
    },
  };
}

function publish(
  before: CommandPublicationState,
  stimulus: Parameters<typeof integrateCommandPublication>[2],
  step: Parameters<typeof integrateCommandPublication>[3],
  committedAtEpochMs: number,
): CommandPublicationState {
  const candidate = integrateCommandPublication(
    publicationProgram,
    before,
    stimulus,
    step,
    () => committedAtEpochMs,
  );
  return recordCommandPublicationOutcome(
    candidate,
    stimulus,
    step.observations,
  );
}

function selectionRequest(afterRevision: number) {
  return {
    protocol: bpmnWorkflowPublicationSegmentsV1,
    processInstanceId: publicationStart.instanceId,
    afterRevision,
  } as const;
}
