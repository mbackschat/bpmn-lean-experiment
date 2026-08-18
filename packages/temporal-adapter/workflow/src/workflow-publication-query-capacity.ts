import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  WorkflowChainBudgetKind,
  WorkflowPublicationSegmentQueryResultKind,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import type {
  ExecutionPublicationResult,
  FlowNodeOccurrencePublicationResult,
  WorkflowPublicationSegmentQueryRequestV1,
  WorkflowPublicationSegmentQueryResultV1,
} from "@bpmn-lean/temporal-protocol";

export type WorkflowPublicationQueryCapacityLimits = Readonly<{
  queryResponseBytes: number;
}>;

type AvailableExecutionPublication = Extract<
  ExecutionPublicationResult,
  { kind: ExecutionPublicationResultKind.Available }
>;
type AvailableFlowNodeOccurrencePublication = Extract<
  FlowNodeOccurrencePublicationResult,
  { kind: FlowNodeOccurrencePublicationResultKind.Available }
>;

/** Fits one private selected-Run response without changing a semantic publication batch. */
export function fitWorkflowPublicationSegmentQueryResponse(
  request: WorkflowPublicationSegmentQueryRequestV1,
  execution: ExecutionPublicationResult,
  flowNodeOccurrences: FlowNodeOccurrencePublicationResult,
  limits: WorkflowPublicationQueryCapacityLimits = productionLimits(),
): WorkflowPublicationSegmentQueryResultV1 {
  if (execution.kind === ExecutionPublicationResultKind.Gap &&
    flowNodeOccurrences.kind === FlowNodeOccurrencePublicationResultKind.Gap) {
    const configured = requireLimits(limits);
    return requireFits({
      ...request,
      kind: WorkflowPublicationSegmentQueryResultKind.Available,
      execution,
      flowNodeOccurrences,
    }, configured.queryResponseBytes);
  }
  if (execution.kind !== ExecutionPublicationResultKind.Available ||
    flowNodeOccurrences.kind !==
      FlowNodeOccurrencePublicationResultKind.Available) {
    throw new TypeError("Workflow publication Query response arms are not paired");
  }
  requirePairedBatches(execution, flowNodeOccurrences);
  const configured = requireLimits(limits);
  if (execution.page.batches.length === 0) {
    return requireFits(
      candidateResponse(request, execution, flowNodeOccurrences, 0),
      configured.queryResponseBytes,
    );
  }

  let largest = candidateResponse(
    request,
    execution,
    flowNodeOccurrences,
    1,
  );
  if (workflowChainCanonicalUtf8ByteLength(largest) >
    configured.queryResponseBytes) {
    throw new RangeError(
      "queryResponseBytes cannot fit one complete paired publication batch",
    );
  }
  for (let prefixLength = 2;
    prefixLength <= execution.page.batches.length;
    prefixLength += 1) {
    const candidate = candidateResponse(
      request,
      execution,
      flowNodeOccurrences,
      prefixLength,
    );
    if (workflowChainCanonicalUtf8ByteLength(candidate) <=
      configured.queryResponseBytes) {
      largest = candidate;
      continue;
    }
    // Each next prefix adds both nonempty batches, never removes a snapshot, and advances a
    // nonnegative revision, so canonical size cannot fall after the first refusal.
    break;
  }
  return largest;
}

function candidateResponse(
  request: WorkflowPublicationSegmentQueryRequestV1,
  execution: AvailableExecutionPublication,
  flowNodeOccurrences: AvailableFlowNodeOccurrencePublication,
  prefixLength: number,
): WorkflowPublicationSegmentQueryResultV1 {
  const executionBatches = execution.page.batches.slice(0, prefixLength);
  const occurrenceBatches = flowNodeOccurrences.page.batches.slice(
    0,
    prefixLength,
  );
  const pageThroughRevision = executionBatches.at(-1)?.throughRevision ??
    request.afterRevision;
  const reachesSnapshotHead = pageThroughRevision ===
    request.snapshot.headRevision;
  return {
    ...request,
    kind: WorkflowPublicationSegmentQueryResultKind.Available,
    execution: {
      ...execution,
      page: {
        ...execution.page,
        pageThroughRevision,
        batches: executionBatches,
        current: reachesSnapshotHead ? execution.page.current : null,
      },
    },
    flowNodeOccurrences: {
      ...flowNodeOccurrences,
      page: {
        ...flowNodeOccurrences.page,
        pageThroughRevision,
        batches: occurrenceBatches,
        currentOpen: reachesSnapshotHead
          ? flowNodeOccurrences.page.currentOpen
          : null,
      },
    },
  };
}

function requirePairedBatches(
  execution: AvailableExecutionPublication,
  flowNodeOccurrences: AvailableFlowNodeOccurrencePublication,
): void {
  const paired = execution.page.batches.length ===
      flowNodeOccurrences.page.batches.length &&
    execution.page.batches.every((batch, batchIndex) => {
      const occurrence = flowNodeOccurrences.page.batches[batchIndex];
      return occurrence !== undefined &&
        batch.commandId === occurrence.commandId &&
        batch.fromRevision === occurrence.fromRevision &&
        batch.throughRevision === occurrence.throughRevision &&
        batch.transitions.length === occurrence.transitions.length &&
        batch.transitions.every((transition, transitionIndex) =>
          transition.revision ===
            occurrence.transitions[transitionIndex]?.revision);
    });
  if (!paired) {
    throw new TypeError(
      "Workflow publication Query response lost paired batch identity",
    );
  }
}

function requireFits<T>(value: T, queryResponseBytes: number): T {
  const observed = workflowChainCanonicalUtf8ByteLength(value);
  if (observed > queryResponseBytes) {
    throw new RangeError(
      `queryResponseBytes exceeds ${queryResponseBytes} canonical UTF-8 bytes: ${observed}`,
    );
  }
  return value;
}

function productionLimits(): WorkflowPublicationQueryCapacityLimits {
  return {
    queryResponseBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.QueryResponseBytes,
    ),
  };
}

function requireLimits(
  value: WorkflowPublicationQueryCapacityLimits,
): WorkflowPublicationQueryCapacityLimits {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, "queryResponseBytes")) {
    throw new TypeError("Workflow publication Query capacity limits are not closed");
  }
  if (!Number.isSafeInteger(value.queryResponseBytes) ||
    value.queryResponseBytes < 1) {
    throw new RangeError(
      "queryResponseBytes limit must be a positive safe integer",
    );
  }
  if (value.queryResponseBytes > workflowChainProductionLimit(
    WorkflowChainBudgetKind.QueryResponseBytes,
  )) {
    throw new RangeError("queryResponseBytes limit exceeds production");
  }
  return { queryResponseBytes: value.queryResponseBytes };
}
