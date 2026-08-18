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
  WorkflowChainBudgetKind,
  WorkflowPublicationSegmentQueryResultKind,
  WorkflowPublicationSegmentSelectionResultKind,
  bpmnWorkflowPublicationSegmentsV1,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

import {
  createCommandPublicationState,
  integrateCommandPublication,
  recordCommandPublicationOutcome,
} from "../dist/command-publication-integration.js";
import {
  emptyWorkflowPublicationSegmentDirectory,
  queryWorkflowPublicationSegment,
  selectWorkflowPublication,
} from "../dist/workflow-publication-segments.js";
import type {
  CommandPublicationState,
} from "../dist/command-publication-integration.js";
import type {
  WorkflowPublicationSegmentRuntime,
} from "../dist/workflow-publication-segments.js";
import {
  fitWorkflowPublicationSegmentQueryResponse,
} from "../dist/workflow-publication-query-capacity.js";
import {
  publicationCompletion,
  publicationProgram,
  publicationStart,
} from "./execution-publication-fixture.ts";

test("returns only the largest complete real publication prefix at the exact Query bound", () => {
  const { publication, runtime } = twoBatchPublication();
  const request = segmentRequest(publication, runtime, 0);
  const unbounded = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    runtime,
    publication,
    request,
  );
  assert.ok(unbounded.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(unbounded.execution.kind === ExecutionPublicationResultKind.Available);
  assert.ok(
    unbounded.flowNodeOccurrences.kind ===
      FlowNodeOccurrencePublicationResultKind.Available,
  );
  assert.equal(unbounded.execution.page.batches.length, 2);

  const firstExecution = unbounded.execution.page.batches[0];
  const firstOccurrence = unbounded.flowNodeOccurrences.page.batches[0];
  assert.ok(firstExecution !== undefined && firstOccurrence !== undefined);
  const exactOneBatch = {
    ...request,
    kind: WorkflowPublicationSegmentQueryResultKind.Available,
    execution: {
      ...unbounded.execution,
      page: {
        ...unbounded.execution.page,
        pageThroughRevision: firstExecution.throughRevision,
        batches: [firstExecution],
        current: null,
      },
    },
    flowNodeOccurrences: {
      ...unbounded.flowNodeOccurrences,
      page: {
        ...unbounded.flowNodeOccurrences.page,
        pageThroughRevision: firstOccurrence.throughRevision,
        batches: [firstOccurrence],
        currentOpen: null,
      },
    },
  } as const;
  const bound = workflowChainCanonicalUtf8ByteLength(exactOneBatch);
  assert.ok(workflowChainCanonicalUtf8ByteLength(unbounded) > bound);

  const bounded = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    runtime,
    publication,
    request,
    { queryResponseBytes: bound },
  );
  assert.ok(bounded.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(bounded.execution.kind === ExecutionPublicationResultKind.Available);
  assert.ok(
    bounded.flowNodeOccurrences.kind ===
      FlowNodeOccurrencePublicationResultKind.Available,
  );
  assert.equal(bounded.execution.page.batches.length, 1);
  assert.equal(workflowChainCanonicalUtf8ByteLength(bounded), bound);
  assert.deepEqual(
    bounded.execution.page.batches,
    publication.execution.batches.slice(0, 1),
  );
  assert.deepEqual(
    bounded.flowNodeOccurrences.page.batches,
    publication.flowNodeOccurrences.batches.slice(0, 1),
  );
  assert.equal(bounded.execution.page.current, null);
  assert.equal(bounded.flowNodeOccurrences.page.currentOpen, null);
  assert.ok(
    bounded.execution.page.pageThroughRevision < request.snapshot.headRevision,
  );
  assert.deepEqual(
    queryWorkflowPublicationSegment(
      publicationProgram,
      publicationStart.instanceId,
      runtime,
      publication,
      request,
      { queryResponseBytes: bound },
    ),
    bounded,
  );

  const nextRequest = segmentRequest(
    publication,
    runtime,
    bounded.execution.page.pageThroughRevision,
  );
  const remainder = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    runtime,
    publication,
    nextRequest,
  );
  assert.ok(remainder.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(remainder.execution.kind === ExecutionPublicationResultKind.Available);
  assert.ok(
    remainder.flowNodeOccurrences.kind ===
      FlowNodeOccurrencePublicationResultKind.Available,
  );
  assert.deepEqual(
    remainder.execution.page.batches,
    publication.execution.batches.slice(1),
  );
  assert.deepEqual(
    remainder.flowNodeOccurrences.page.batches,
    publication.flowNodeOccurrences.batches.slice(1),
  );
  assert.equal(
    remainder.execution.page.pageThroughRevision,
    request.snapshot.headRevision,
  );
  assert.deepEqual(remainder.execution.page.current, unbounded.execution.page.current);
  assert.deepEqual(
    remainder.flowNodeOccurrences.page.currentOpen,
    unbounded.flowNodeOccurrences.page.currentOpen,
  );
  assert.ok(
    workflowChainCanonicalUtf8ByteLength(remainder) <=
      workflowChainProductionLimit(WorkflowChainBudgetKind.QueryResponseBytes),
  );

  assert.throws(
    () => queryWorkflowPublicationSegment(
      publicationProgram,
      publicationStart.instanceId,
      runtime,
      publication,
      request,
      { queryResponseBytes: bound - 1 },
    ),
    /queryResponseBytes/u,
  );
});

test("preserves bounded paired Gap and empty-at-head responses", () => {
  const { publication, runtime } = twoBatchPublication();
  const firstBatch = publication.execution.batches[0];
  assert.ok(firstBatch !== undefined);
  const insideRequest = segmentRequest(
    publication,
    runtime,
    firstBatch.fromRevision + 1,
  );
  const gap = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    runtime,
    publication,
    insideRequest,
  );
  assert.ok(gap.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.equal(gap.execution.kind, ExecutionPublicationResultKind.Gap);
  assert.equal(
    gap.flowNodeOccurrences.kind,
    FlowNodeOccurrencePublicationResultKind.Gap,
  );
  const gapBytes = workflowChainCanonicalUtf8ByteLength(gap);
  assert.deepEqual(
    queryWorkflowPublicationSegment(
      publicationProgram,
      publicationStart.instanceId,
      runtime,
      publication,
      insideRequest,
      { queryResponseBytes: gapBytes },
    ),
    gap,
  );

  const headRequest = segmentRequest(
    publication,
    runtime,
    publication.execution.headRevision,
  );
  const empty = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    runtime,
    publication,
    headRequest,
  );
  assert.ok(empty.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(empty.execution.kind === ExecutionPublicationResultKind.Available);
  assert.ok(
    empty.flowNodeOccurrences.kind ===
      FlowNodeOccurrencePublicationResultKind.Available,
  );
  assert.deepEqual(empty.execution.page.batches, []);
  assert.deepEqual(empty.flowNodeOccurrences.page.batches, []);
  assert.deepEqual(empty.execution.page.current, headRequest.snapshot.current);
  assert.deepEqual(
    empty.flowNodeOccurrences.page.currentOpen,
    headRequest.snapshot.currentOpen,
  );
  const emptyBytes = workflowChainCanonicalUtf8ByteLength(empty);
  assert.deepEqual(
    queryWorkflowPublicationSegment(
      publicationProgram,
      publicationStart.instanceId,
      runtime,
      publication,
      headRequest,
      { queryResponseBytes: emptyBytes },
    ),
    empty,
  );
  assert.throws(
    () => queryWorkflowPublicationSegment(
      publicationProgram,
      publicationStart.instanceId,
      runtime,
      publication,
      headRequest,
      { queryResponseBytes: emptyBytes - 1 },
    ),
    /queryResponseBytes/u,
  );
});

test("rejects asymmetric and malformed E1/E2 batch pairing before pagination", () => {
  const { publication, runtime } = twoBatchPublication();
  const request = segmentRequest(publication, runtime, 0);
  const source = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    runtime,
    publication,
    request,
  );
  assert.ok(source.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(source.execution.kind === ExecutionPublicationResultKind.Available);
  assert.ok(
    source.flowNodeOccurrences.kind ===
      FlowNodeOccurrencePublicationResultKind.Available,
  );
  const limits = productionQueryLimits();

  assert.throws(
    () => fitWorkflowPublicationSegmentQueryResponse(
      request,
      source.execution,
      { kind: FlowNodeOccurrencePublicationResultKind.Gap },
      limits,
    ),
    /arms are not paired/u,
  );

  const first = source.flowNodeOccurrences.page.batches[0];
  assert.ok(first !== undefined);
  const malformedFirstBatches = [
    { ...first, commandId: `${first.commandId}-substituted` },
    { ...first, fromRevision: first.fromRevision + 1 },
    { ...first, throughRevision: first.throughRevision + 1 },
    { ...first, transitions: first.transitions.slice(1) },
    {
      ...first,
      transitions: first.transitions.map((transition, index) =>
        index === 0
          ? { ...transition, revision: transition.revision + 1 }
          : transition),
    },
  ];
  for (const malformedFirst of malformedFirstBatches) {
    const malformed = {
      ...source.flowNodeOccurrences,
      page: {
        ...source.flowNodeOccurrences.page,
        batches: [
          malformedFirst,
          ...source.flowNodeOccurrences.page.batches.slice(1),
        ],
      },
    } as unknown as typeof source.flowNodeOccurrences;
    assert.throws(
      () => fitWorkflowPublicationSegmentQueryResponse(
        request,
        source.execution,
        malformed,
        limits,
      ),
      /lost paired batch identity/u,
    );
  }
});

test("accepts only a closed lowered Query limit beneath the production ceiling", () => {
  const { publication, runtime } = twoBatchPublication();
  const request = segmentRequest(publication, runtime, 0);
  const source = queryWorkflowPublicationSegment(
    publicationProgram,
    publicationStart.instanceId,
    runtime,
    publication,
    request,
  );
  assert.ok(source.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  assert.ok(source.execution.kind === ExecutionPublicationResultKind.Available);
  assert.ok(
    source.flowNodeOccurrences.kind ===
      FlowNodeOccurrencePublicationResultKind.Available,
  );

  for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => fitWorkflowPublicationSegmentQueryResponse(
        request,
        source.execution,
        source.flowNodeOccurrences,
        { queryResponseBytes: invalid },
      ),
      /queryResponseBytes limit must be a positive safe integer/u,
    );
  }
  assert.throws(
    () => fitWorkflowPublicationSegmentQueryResponse(
      request,
      source.execution,
      source.flowNodeOccurrences,
      {
        queryResponseBytes: workflowChainProductionLimit(
          WorkflowChainBudgetKind.QueryResponseBytes,
        ) + 1,
      },
    ),
    /queryResponseBytes limit exceeds production/u,
  );
  assert.throws(
    () => fitWorkflowPublicationSegmentQueryResponse(
      request,
      source.execution,
      source.flowNodeOccurrences,
      {
        ...productionQueryLimits(),
        unexpected: 1,
      } as never,
    ),
    /capacity limits are not closed/u,
  );
});

function twoBatchPublication(): Readonly<{
  publication: CommandPublicationState;
  runtime: WorkflowPublicationSegmentRuntime;
}> {
  let semanticState = initialState;
  let publication = createCommandPublicationState(
    publicationProgram,
    publicationStart.instanceId,
  );
  const inputs = [
    { stimulus: publicationStart, committedAtEpochMs: 1_000 },
    {
      stimulus: publicationCompletion("UserTask_A"),
      committedAtEpochMs: 2_000,
    },
  ] as const;
  for (const { stimulus, committedAtEpochMs } of inputs) {
    const step = advanceScenario(publicationProgram, semanticState, stimulus);
    assert.equal(step.kind, ScenarioStepKind.Committed);
    if (step.kind !== ScenarioStepKind.Committed) {
      assert.fail("real semantic publication input did not commit");
    }
    publication = publish(publication, stimulus, step, committedAtEpochMs);
    semanticState = step.state;
  }
  return {
    publication,
    runtime: {
      runId: "query-capacity-run-1",
      runOrdinal: 1,
      firstExecutionRunId: "query-capacity-run-1",
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

function segmentRequest(
  publication: CommandPublicationState,
  runtime: WorkflowPublicationSegmentRuntime,
  afterRevision: number,
) {
  const selectionRequest = {
    protocol: bpmnWorkflowPublicationSegmentsV1,
    processInstanceId: publicationStart.instanceId,
    afterRevision,
  } as const;
  const selection = selectWorkflowPublication(
    publicationProgram,
    publicationStart.instanceId,
    runtime,
    publication,
    selectionRequest,
  );
  assert.ok(
    selection.kind === WorkflowPublicationSegmentSelectionResultKind.Available,
  );
  return {
    ...selectionRequest,
    descriptor: selection.selected,
    snapshot: selection.snapshot,
  };
}

function productionQueryLimits() {
  return {
    queryResponseBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.QueryResponseBytes,
    ),
  } as const;
}
