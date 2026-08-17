/** Private Product 1 traversal of one immutable Workflow publication segment. */
import {
  QueryNotRegisteredError,
  WorkflowNotFoundError,
} from "@temporalio/client";
import type { WorkflowClient } from "@temporalio/client";
import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  WorkflowPublicationSegmentQueryResultKind,
  WorkflowPublicationSegmentSelectionResultKind,
  bpmnWorkflowPublicationSegmentQueryName,
  bpmnWorkflowPublicationSegmentSelectionQueryName,
  bpmnWorkflowPublicationSegmentsV1,
  requireExecutionPublicationTransportResult,
  requireFlowNodeOccurrencePublicationTransportResult,
  requireWorkflowPublicationSegmentQueryResultV1,
  requireWorkflowPublicationSegmentSelectionResultV1,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ExecutionPublicationRequest,
  ExecutionPublicationResult,
  FlowNodeOccurrencePublicationResult,
  WorkflowPublicationSegmentQueryRequestV1,
  WorkflowPublicationSegmentQueryResultV1,
  WorkflowPublicationSegmentSelectionRequestV1,
  WorkflowPublicationSnapshotV1,
} from "@bpmn-lean/temporal-protocol";

const operationDeadlineMs = 5_000;
const changedSegmentPollMs = 20;

export enum WorkflowPublicationObservationKind {
  Paired = "paired",
  Legacy = "legacy",
  NotFound = "notFound",
  Unavailable = "unavailable",
}

export type WorkflowPublicationObservation =
  | Readonly<{
      kind: WorkflowPublicationObservationKind.Paired;
      execution: ExecutionPublicationResult;
      flowNodeOccurrences: FlowNodeOccurrencePublicationResult;
    }>
  | Readonly<{ kind: WorkflowPublicationObservationKind.Legacy }>
  | Readonly<{ kind: WorkflowPublicationObservationKind.NotFound }>
  | Readonly<{ kind: WorkflowPublicationObservationKind.Unavailable }>;

/**
 * Selects against the latest Run, then reads only that immutable selection.
 * The selected Run ID and every segment descriptor remain inside this owner.
 */
export async function observeWorkflowPublicationSegment(
  client: WorkflowClient,
  workflowId: string,
  processInstanceId: string,
  request: ExecutionPublicationRequest,
): Promise<WorkflowPublicationObservation> {
  const deadline = Date.now() + operationDeadlineMs;
  const selectionRequest: WorkflowPublicationSegmentSelectionRequestV1 = {
    protocol: bpmnWorkflowPublicationSegmentsV1,
    processInstanceId,
    afterRevision: request.afterRevision,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  };

  while (true) {
    const selected = await selectSegment(
      client,
      workflowId,
      selectionRequest,
      deadline,
    );
    if (selected.kind !== SelectionAttemptKind.Selected) {
      return selectionAttemptResult(selected.kind);
    }
    const queryRequest: WorkflowPublicationSegmentQueryRequestV1 = {
      ...selectionRequest,
      descriptor: selected.value.selected,
      snapshot: selected.value.snapshot,
    };
    const segment = await querySelectedSegment(
      client,
      workflowId,
      queryRequest,
      deadline,
    );
    if (segment.kind === SegmentAttemptKind.Unavailable) {
      return { kind: WorkflowPublicationObservationKind.Unavailable };
    }
    if (segment.value.kind === WorkflowPublicationSegmentQueryResultKind.Changed) {
      if (!(await waitForChangedSegment(deadline))) {
        return { kind: WorkflowPublicationObservationKind.Unavailable };
      }
      continue;
    }
    return assemblePublicPair(segment.value, queryRequest);
  }
}

enum SelectionAttemptKind {
  Selected = "selected",
  Legacy = "legacy",
  NotFound = "notFound",
  Unavailable = "unavailable",
  NotReady = "notReady",
  Gap = "gap",
}

type SelectionAttempt =
  | Readonly<{
      kind: SelectionAttemptKind.Selected;
      value: Extract<
        ReturnType<typeof requireWorkflowPublicationSegmentSelectionResultV1>,
        { kind: WorkflowPublicationSegmentSelectionResultKind.Available }
      >;
    }>
  | Readonly<{ kind: Exclude<SelectionAttemptKind, SelectionAttemptKind.Selected> }>;

async function selectSegment(
  client: WorkflowClient,
  workflowId: string,
  request: WorkflowPublicationSegmentSelectionRequestV1,
  deadline: number,
): Promise<SelectionAttempt> {
  let candidate: unknown;
  try {
    candidate = await beforeDeadline(
      deadline,
      "Workflow publication segment selection Query",
      () => client.getHandle<BpmnProcessWorkflow>(workflowId)
        .query<unknown, [WorkflowPublicationSegmentSelectionRequestV1]>(
          bpmnWorkflowPublicationSegmentSelectionQueryName,
          request,
        ),
    );
  } catch (error: unknown) {
    if (error instanceof QueryNotRegisteredError) {
      return { kind: SelectionAttemptKind.Legacy };
    }
    return {
      kind: error instanceof WorkflowNotFoundError
        ? SelectionAttemptKind.NotFound
        : SelectionAttemptKind.Unavailable,
    };
  }
  const result = requireWorkflowPublicationSegmentSelectionResultV1(
    candidate,
    request,
  );
  switch (result.kind) {
    case WorkflowPublicationSegmentSelectionResultKind.Available:
      return { kind: SelectionAttemptKind.Selected, value: result };
    case WorkflowPublicationSegmentSelectionResultKind.NotReady:
      return { kind: SelectionAttemptKind.NotReady };
    case WorkflowPublicationSegmentSelectionResultKind.Gap:
      return { kind: SelectionAttemptKind.Gap };
    default:
      return assertNever(result);
  }
}

function selectionAttemptResult(
  kind: Exclude<SelectionAttemptKind, SelectionAttemptKind.Selected>,
): WorkflowPublicationObservation {
  switch (kind) {
    case SelectionAttemptKind.Legacy:
      return { kind: WorkflowPublicationObservationKind.Legacy };
    case SelectionAttemptKind.NotFound:
      return { kind: WorkflowPublicationObservationKind.NotFound };
    case SelectionAttemptKind.Unavailable:
      return { kind: WorkflowPublicationObservationKind.Unavailable };
    case SelectionAttemptKind.NotReady:
      return {
        kind: WorkflowPublicationObservationKind.Paired,
        execution: { kind: ExecutionPublicationResultKind.NotReady },
        flowNodeOccurrences: {
          kind: FlowNodeOccurrencePublicationResultKind.NotReady,
        },
      };
    case SelectionAttemptKind.Gap:
      return {
        kind: WorkflowPublicationObservationKind.Paired,
        execution: { kind: ExecutionPublicationResultKind.Gap },
        flowNodeOccurrences: { kind: FlowNodeOccurrencePublicationResultKind.Gap },
      };
    default:
      return assertNever(kind);
  }
}

enum SegmentAttemptKind {
  Result = "result",
  Unavailable = "unavailable",
}

type SegmentAttempt =
  | Readonly<{
      kind: SegmentAttemptKind.Result;
      value: WorkflowPublicationSegmentQueryResultV1;
    }>
  | Readonly<{ kind: SegmentAttemptKind.Unavailable }>;

async function querySelectedSegment(
  client: WorkflowClient,
  workflowId: string,
  request: WorkflowPublicationSegmentQueryRequestV1,
  deadline: number,
): Promise<SegmentAttempt> {
  let candidate: unknown;
  try {
    candidate = await beforeDeadline(
      deadline,
      "selected Workflow publication segment Query",
      () => client.getHandle<BpmnProcessWorkflow>(
        workflowId,
        request.descriptor.runId,
      ).query<unknown, [WorkflowPublicationSegmentQueryRequestV1]>(
        bpmnWorkflowPublicationSegmentQueryName,
        request,
      ),
    );
  } catch {
    return { kind: SegmentAttemptKind.Unavailable };
  }
  return {
    kind: SegmentAttemptKind.Result,
    value: requireWorkflowPublicationSegmentQueryResultV1(candidate, request),
  };
}

function assemblePublicPair(
  response: Extract<
    WorkflowPublicationSegmentQueryResultV1,
    { kind: WorkflowPublicationSegmentQueryResultKind.Available }
  >,
  request: WorkflowPublicationSegmentQueryRequestV1,
): WorkflowPublicationObservation {
  switch (response.execution.kind) {
    case ExecutionPublicationResultKind.Available: {
      if (response.flowNodeOccurrences.kind !==
        FlowNodeOccurrencePublicationResultKind.Available) {
        throw new TypeError("Workflow publication segment results are not paired");
      }
      const reachesHead = response.execution.page.pageThroughRevision ===
        request.snapshot.headRevision;
      const context = transportContext(request.snapshot, request);
      return {
        kind: WorkflowPublicationObservationKind.Paired,
        execution: requireExecutionPublicationTransportResult({
          kind: ExecutionPublicationResultKind.Available,
          page: {
            ...response.execution.page,
            headRevision: request.snapshot.headRevision,
            current: reachesHead ? request.snapshot.current : null,
          },
        }, context),
        flowNodeOccurrences: requireFlowNodeOccurrencePublicationTransportResult({
          kind: FlowNodeOccurrencePublicationResultKind.Available,
          page: {
            ...response.flowNodeOccurrences.page,
            headRevision: request.snapshot.headRevision,
            currentOpen: reachesHead ? request.snapshot.currentOpen : null,
          },
        }, context),
      };
    }
    case ExecutionPublicationResultKind.Gap:
      if (response.flowNodeOccurrences.kind !==
        FlowNodeOccurrencePublicationResultKind.Gap) {
        throw new TypeError("Workflow publication segment results are not paired");
      }
      return {
        kind: WorkflowPublicationObservationKind.Paired,
        execution: response.execution,
        flowNodeOccurrences: response.flowNodeOccurrences,
      };
    default:
      throw new TypeError("Workflow publication segment returned an invalid public arm");
  }
}

function transportContext(
  snapshot: WorkflowPublicationSnapshotV1,
  request: ExecutionPublicationRequest,
) {
  return {
    definition: snapshot.definition,
    processId: snapshot.processId,
    processInstanceId: snapshot.processInstanceId,
    afterRevision: request.afterRevision,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  };
}

async function beforeDeadline<Value>(
  deadline: number,
  operation: string,
  invoke: () => Promise<Value>,
): Promise<Value> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`${operation} exceeded the client deadline`);
  }
  return withDeadline(invoke(), remaining, operation);
}

async function waitForChangedSegment(deadline: number): Promise<boolean> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return false;
  }
  await new Promise<void>((resolve) =>
    setTimeout(resolve, Math.min(changedSegmentPollMs, remaining))
  );
  return deadline - Date.now() > 0;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Workflow publication value: ${String(value)}`);
}
