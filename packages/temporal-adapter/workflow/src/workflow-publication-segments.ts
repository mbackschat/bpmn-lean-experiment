import type {
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  defineQuery,
  setHandler,
} from "@temporalio/workflow";
import {
  WorkflowPublicationSegmentQueryResultKind,
  WorkflowPublicationSegmentSelectionResultKind,
  bpmnWorkflowPublicationSegmentDirectoryV1,
  bpmnWorkflowPublicationSegmentQueryName,
  bpmnWorkflowPublicationSegmentSelectionQueryName,
  canonicalWorkflowChainJson,
  requireBpmnWorkflowContinuationPublicationV1,
  requireWorkflowPublicationSegmentQueryRequestV1,
  requireWorkflowPublicationSegmentQueryResultV1,
  requireWorkflowPublicationSegmentSelectionRequestV1,
  requireWorkflowPublicationSegmentSelectionResultV1,
  selectWorkflowPublicationSegment,
  workflowPublicationSegmentDirectorySha256,
  workflowPublicationSegmentSha256,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnWorkflowContinuationPublicationV1,
  WorkflowPublicationSegmentDescriptorV1,
  WorkflowPublicationSegmentDirectoryV1,
  WorkflowPublicationSegmentQueryRequestV1,
  WorkflowPublicationSegmentQueryResultV1,
  WorkflowPublicationSegmentSelectionRequestV1,
  WorkflowPublicationSegmentSelectionResultV1,
  WorkflowPublicationSnapshotV1,
} from "@bpmn-lean/temporal-protocol";

import type {
  CommandPublicationState,
} from "./command-publication-integration.js";
import {
  requireWorkflowPublicationAlignment,
  workflowPublicationSegmentDescriptor,
  workflowSuccessorPublication,
} from "./workflow-publication-continuation.js";
import type {
  WorkflowPublicationSegmentRuntime,
} from "./workflow-publication-continuation.js";
import {
  queryExecutionPublication,
  registerExecutionPublicationQueryHandler,
} from "./execution-publication-query-handler.js";
import {
  queryFlowNodeOccurrences,
  registerFlowNodeOccurrenceQueryHandler,
} from "./flow-node-occurrence-query-handler.js";
import {
  fitWorkflowPublicationSegmentQueryResponse,
} from "./workflow-publication-query-capacity.js";
import type {
  WorkflowPublicationQueryCapacityLimits,
} from "./workflow-publication-query-capacity.js";

export const bpmnWorkflowPublicationSegmentSelectionQuery = defineQuery<
  WorkflowPublicationSegmentSelectionResultV1,
  [request: WorkflowPublicationSegmentSelectionRequestV1]
>(bpmnWorkflowPublicationSegmentSelectionQueryName);

export const bpmnWorkflowPublicationSegmentQuery = defineQuery<
  WorkflowPublicationSegmentQueryResultV1,
  [request: WorkflowPublicationSegmentQueryRequestV1]
>(bpmnWorkflowPublicationSegmentQueryName);

export type { WorkflowPublicationSegmentRuntime } from "./workflow-publication-continuation.js";

export const bpmnWorkflowContinuationInvalidFailureType =
  "BpmnWorkflowContinuationInvalid" as const;

export function emptyWorkflowPublicationSegmentDirectory():
WorkflowPublicationSegmentDirectoryV1 {
  return {
    format: bpmnWorkflowPublicationSegmentDirectoryV1,
    segments: [],
  };
}

export function snapshotWorkflowPublicationForSuccessor(
  state: CommandPublicationState,
  runtime: WorkflowPublicationSegmentRuntime,
): Readonly<{
  publication: BpmnWorkflowContinuationPublicationV1;
  directorySha256: string;
}> {
  const publication = workflowSuccessorPublication(
    state,
    describeCurrentWorkflowPublicationSegment(state, runtime),
    runtime,
  );
  return {
    publication,
    directorySha256: workflowPublicationSegmentDirectorySha256(
      publication.segmentDirectory,
    ),
  };
}

export function restoreWorkflowCommandPublication(
  value: BpmnWorkflowContinuationPublicationV1,
): CommandPublicationState {
  return {
    execution: { ...value.execution, batches: [] },
    flowNodeOccurrences: { ...value.flowNodeOccurrences, batches: [] },
    commandResults: [],
  };
}

export function requireWorkflowPublicationSuccessor(
  publication: BpmnWorkflowContinuationPublicationV1,
  program: SemanticProcessProgram,
  state: RuntimeState,
  processInstanceId: string,
  firstExecutionRunId: string,
  successorRunOrdinal: number,
): void {
  try {
    requireBpmnWorkflowContinuationPublicationV1(
      publication,
      program,
      state,
      processInstanceId,
      { firstExecutionRunId, successorRunOrdinal },
    );
  } catch (error: unknown) {
    throw ApplicationFailure.nonRetryable(
      "Invalid successor publication continuation",
      bpmnWorkflowContinuationInvalidFailureType,
      String(error),
    );
  }
}

export function describeCurrentWorkflowPublicationSegment(
  state: CommandPublicationState,
  runtime: WorkflowPublicationSegmentRuntime,
): WorkflowPublicationSegmentDescriptorV1 {
  requireWorkflowPublicationAlignment(state, runtime);
  return workflowPublicationSegmentDescriptor(state, runtime, workflowPublicationSegmentSha256(
    state.execution.batches,
    state.flowNodeOccurrences.batches,
  ));
}


/** Installs both private chain-navigation Queries before semantic evaluation. */
export function registerWorkflowPublicationQueries(
  program: SemanticProcessProgram,
  processInstanceId: string,
  runtime: WorkflowPublicationSegmentRuntime | null,
  publication: () => CommandPublicationState,
): void {
  registerExecutionPublicationQueryHandler(
    program,
    () => publication().execution,
  );
  registerFlowNodeOccurrenceQueryHandler(
    program,
    () => publication().execution,
    () => publication().flowNodeOccurrences,
  );
  if (runtime === null) return;
  setHandler(
    bpmnWorkflowPublicationSegmentSelectionQuery,
    (request) => selectWorkflowPublication(
      program,
      processInstanceId,
      runtime,
      publication(),
      request,
    ),
  );
  setHandler(
    bpmnWorkflowPublicationSegmentQuery,
    (request) => queryWorkflowPublicationSegment(
      program,
      processInstanceId,
      runtime,
      publication(),
      request,
    ),
  );
}

export function selectWorkflowPublication(
  program: SemanticProcessProgram,
  processInstanceId: string,
  runtime: WorkflowPublicationSegmentRuntime,
  state: CommandPublicationState,
  requestValue: unknown,
): WorkflowPublicationSegmentSelectionResultV1 {
  const request = requireWorkflowPublicationSegmentSelectionRequestV1(requestValue);
  requireQueryIdentity(program, processInstanceId, state, request.processInstanceId);
  if (state.execution.headRevision === 0) {
    return requireWorkflowPublicationSegmentSelectionResultV1({
      ...request,
      kind: WorkflowPublicationSegmentSelectionResultKind.NotReady,
    }, request);
  }
  if (request.afterRevision > state.execution.headRevision) {
    return requireWorkflowPublicationSegmentSelectionResultV1({
      ...request,
      kind: WorkflowPublicationSegmentSelectionResultKind.Gap,
    }, request);
  }
  const currentRun = describeCurrentWorkflowPublicationSegment(state, runtime);
  const selected = selectWorkflowPublicationSegment(
    runtime.segmentDirectory,
    currentRun,
    request.afterRevision,
    state.execution.headRevision,
  );
  if (selected === null) {
    throw new TypeError("Workflow publication directory lost a reachable segment");
  }
  return requireWorkflowPublicationSegmentSelectionResultV1({
    ...request,
    kind: WorkflowPublicationSegmentSelectionResultKind.Available,
    directory: runtime.segmentDirectory,
    selected,
    currentRun,
    snapshot: snapshotWorkflowPublication(state),
  }, request);
}

export function queryWorkflowPublicationSegment(
  program: SemanticProcessProgram,
  processInstanceId: string,
  runtime: WorkflowPublicationSegmentRuntime,
  state: CommandPublicationState,
  requestValue: unknown,
  capacityLimits?: WorkflowPublicationQueryCapacityLimits,
): WorkflowPublicationSegmentQueryResultV1 {
  const request = requireWorkflowPublicationSegmentQueryRequestV1(requestValue);
  requireQueryIdentity(program, processInstanceId, state, request.processInstanceId);
  const currentDescriptor = describeCurrentWorkflowPublicationSegment(state, runtime);
  requireDescriptorTargetsCurrentRun(request.descriptor, currentDescriptor);
  if (request.descriptor.throughRevision < currentDescriptor.throughRevision) {
    return requireWorkflowPublicationSegmentQueryResultV1({
      ...request,
      kind: WorkflowPublicationSegmentQueryResultKind.Changed,
      currentDescriptor,
    }, request);
  }
  if (canonicalWorkflowChainJson(request.descriptor) !==
    canonicalWorkflowChainJson(currentDescriptor)) {
    throw new TypeError("Workflow publication descriptor digest substitution");
  }
  const executionState = {
    ...state.execution,
    headRevision: request.snapshot.headRevision,
    current: request.snapshot.current,
  };
  const occurrenceState = {
    ...state.flowNodeOccurrences,
    headRevision: request.snapshot.headRevision,
    currentOpen: request.snapshot.currentOpen,
  };
  const publicRequest = {
    afterRevision: request.afterRevision,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  };
  const execution = queryExecutionPublication(
    program,
    executionState,
    publicRequest,
    request.descriptor.fromRevision,
  );
  const flowNodeOccurrences = queryFlowNodeOccurrences(
    program,
    executionState,
    occurrenceState,
    publicRequest,
    request.descriptor.fromRevision,
  );
  const bounded = fitWorkflowPublicationSegmentQueryResponse(
    request,
    execution,
    flowNodeOccurrences,
    capacityLimits,
  );
  return requireWorkflowPublicationSegmentQueryResultV1(bounded, request);
}

function snapshotWorkflowPublication(
  state: CommandPublicationState,
): WorkflowPublicationSnapshotV1 {
  if (state.execution.current === null) {
    throw new TypeError("Workflow publication snapshot has no current fold");
  }
  return {
    definition: state.execution.definition,
    processId: state.execution.processId,
    processInstanceId: state.execution.processInstanceId,
    headRevision: state.execution.headRevision,
    current: state.execution.current,
    currentOpen: state.flowNodeOccurrences.currentOpen,
  };
}


function requireDescriptorTargetsCurrentRun(
  requested: WorkflowPublicationSegmentDescriptorV1,
  current: WorkflowPublicationSegmentDescriptorV1,
): void {
  if (requested.runId !== current.runId ||
    requested.runOrdinal !== current.runOrdinal ||
    requested.fromRevision !== current.fromRevision ||
    requested.throughRevision > current.throughRevision) {
    throw new TypeError("Workflow publication descriptor targets another Run");
  }
}

function requireQueryIdentity(
  program: SemanticProcessProgram,
  processInstanceId: string,
  state: CommandPublicationState,
  requestedProcessInstanceId: string,
): void {
  if (requestedProcessInstanceId !== processInstanceId ||
    state.execution.processInstanceId !== processInstanceId ||
    state.flowNodeOccurrences.processInstanceId !== processInstanceId ||
    state.execution.processId !== program.processId ||
    state.flowNodeOccurrences.processId !== program.processId ||
    canonicalWorkflowChainJson(state.execution.definition) !==
      canonicalWorkflowChainJson(program.identity) ||
    canonicalWorkflowChainJson(state.flowNodeOccurrences.definition) !==
      canonicalWorkflowChainJson(program.identity)) {
    throw new TypeError("Workflow publication Query identity mismatch");
  }
}
