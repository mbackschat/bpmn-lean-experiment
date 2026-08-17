import type {
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  bpmnFlowNodeOccurrencesQueryName,
  requireFlowNodeOccurrencePublicationRequest,
  requireFlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/temporal-protocol";
import type {
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationRequest,
  FlowNodeOccurrencePublicationResult,
} from "@bpmn-lean/temporal-protocol";

import type {
  ExecutionPublicationState,
} from "./execution-publication-state.js";
import {
  queryExecutionPublication,
} from "./execution-publication-query-handler.js";
import type {
  FlowNodeOccurrencePublicationState,
} from "./flow-node-occurrence-publication-state.js";

export const bpmnFlowNodeOccurrencesQuery = defineQuery<
  FlowNodeOccurrencePublicationResult,
  [request: FlowNodeOccurrencePublicationRequest]
>(bpmnFlowNodeOccurrencesQueryName);

/** Installs the unconditional read-only occurrence Query before evaluation. */
export function registerFlowNodeOccurrenceQueryHandler(
  program: SemanticProcessProgram,
  execution: () => ExecutionPublicationState,
  occurrences: () => FlowNodeOccurrencePublicationState,
): void {
  setHandler(
    bpmnFlowNodeOccurrencesQuery,
    (request) => queryFlowNodeOccurrences(
      program,
      execution(),
      occurrences(),
      request,
    ),
  );
}

/** Pages exactly the same complete command batches as the E1 Query. */
export function queryFlowNodeOccurrences(
  program: SemanticProcessProgram,
  execution: ExecutionPublicationState,
  occurrences: FlowNodeOccurrencePublicationState,
  requestValue: unknown,
  segmentStartRevision = 0,
): FlowNodeOccurrencePublicationResult {
  const request = requireFlowNodeOccurrencePublicationRequest(requestValue);
  requireAlignedAccumulatorHeads(execution, occurrences);
  const executionResult = queryExecutionPublication(
    program,
    execution,
    request,
    segmentStartRevision,
  );
  switch (executionResult.kind) {
    case ExecutionPublicationResultKind.NotReady:
      return { kind: FlowNodeOccurrencePublicationResultKind.NotReady };
    case ExecutionPublicationResultKind.Gap:
      return { kind: FlowNodeOccurrencePublicationResultKind.Gap };
    case ExecutionPublicationResultKind.NotFound:
      return { kind: FlowNodeOccurrencePublicationResultKind.NotFound };
    case ExecutionPublicationResultKind.Unavailable:
      return { kind: FlowNodeOccurrencePublicationResultKind.Unavailable };
    case ExecutionPublicationResultKind.Available: {
      const batches = alignedBatches(
        occurrences,
        executionResult.page.batches,
      );
      const page: FlowNodeOccurrencePage = {
        definition: cloneDefinition(occurrences.definition),
        processId: occurrences.processId,
        processInstanceId: occurrences.processInstanceId,
        requestedAfterRevision: request.afterRevision,
        pageThroughRevision: executionResult.page.pageThroughRevision,
        headRevision: occurrences.headRevision,
        batches: batches.map(cloneBatch),
        currentOpen: executionResult.page.current === null
          ? null
          : occurrences.currentOpen.map(cloneOpen),
      };
      return requireFlowNodeOccurrencePublicationResult(
        {
          kind: FlowNodeOccurrencePublicationResultKind.Available,
          page,
        },
        {
          program,
          processInstanceId: occurrences.processInstanceId,
          executionPublication: executionResult.page,
          afterRevision: request.afterRevision,
          ...(request.limit === undefined ? {} : { limit: request.limit }),
        },
      );
    }
    default:
      return assertNever(executionResult);
  }
}

function alignedBatches(
  occurrences: FlowNodeOccurrencePublicationState,
  executionBatches: ExecutionPublicationState["batches"],
) {
  const selected = executionBatches.map((executionBatch) =>
    occurrences.batches.find((candidate) =>
      candidate.fromRevision === executionBatch.fromRevision));
  if (selected.some((batch) => batch === undefined)) {
    throw new TypeError(
      "flow-node occurrence publication lost an aligned command batch",
    );
  }
  return selected as FlowNodeOccurrencePublicationState["batches"];
}

function requireAlignedAccumulatorHeads(
  execution: ExecutionPublicationState,
  occurrences: FlowNodeOccurrencePublicationState,
): void {
  if (
    execution.headRevision !== occurrences.headRevision ||
    execution.batches.length !== occurrences.batches.length ||
    execution.processId !== occurrences.processId ||
    execution.processInstanceId !== occurrences.processInstanceId
  ) {
    throw new TypeError(
      "flow-node occurrence and execution publication heads drifted",
    );
  }
}

function cloneBatch(
  batch: FlowNodeOccurrencePublicationState["batches"][number],
) {
  const transitions = batch.transitions.map((transition) => ({
    revision: transition.revision,
    lifecycle: {
      started: transition.lifecycle.started.map((start) => ({
        id: { ...start.id },
        processId: start.processId,
        elementId: start.elementId,
        owner: { ...start.owner },
      })),
      ended: transition.lifecycle.ended.map((end) => ({
        id: { ...end.id },
        terminal: end.terminal,
      })),
    },
  }));
  const first = transitions[0];
  if (first === undefined) {
    throw new TypeError("flow-node occurrence publication batch is empty");
  }
  return {
    commandId: batch.commandId,
    fromRevision: batch.fromRevision,
    throughRevision: batch.throughRevision,
    committedAtEpochMs: batch.committedAtEpochMs,
    transitions: [first, ...transitions.slice(1)] as const,
  };
}

function cloneDefinition(
  definition: FlowNodeOccurrencePublicationState["definition"],
) {
  return {
    compiler: definition.compiler,
    semanticProfile: definition.semanticProfile,
    sourceId: definition.sourceId,
    sourceSha256: definition.sourceSha256,
    sourceOverlay: definition.sourceOverlay === null
      ? null
      : { ...definition.sourceOverlay },
  };
}

function cloneOpen(
  occurrence: FlowNodeOccurrencePublicationState["currentOpen"][number],
) {
  return {
    id: { ...occurrence.id },
    processId: occurrence.processId,
    elementId: occurrence.elementId,
    owner: { ...occurrence.owner },
    startedAtEpochMs: occurrence.startedAtEpochMs,
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported execution publication result: ${String(value)}`);
}
