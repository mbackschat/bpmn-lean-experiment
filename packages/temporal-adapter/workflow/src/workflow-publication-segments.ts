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
  bpmnWorkflowPublicationSegmentDescriptorV1,
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

export const bpmnWorkflowContinuationInvalidFailureType =
  "BpmnWorkflowContinuationInvalid" as const;

export type WorkflowPublicationSegmentRuntime = Readonly<{
  runId: string;
  runOrdinal: number;
  firstExecutionRunId: string;
  segmentDirectory: WorkflowPublicationSegmentDirectoryV1;
}>;

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
  const descriptor = describeCurrentWorkflowPublicationSegment(state, runtime);
  const directory: WorkflowPublicationSegmentDirectoryV1 = {
    format: bpmnWorkflowPublicationSegmentDirectoryV1,
    segments: [...runtime.segmentDirectory.segments, descriptor],
  };
  const publication: BpmnWorkflowContinuationPublicationV1 = {
    execution: {
      definition: state.execution.definition,
      processId: state.execution.processId,
      processInstanceId: state.execution.processInstanceId,
      headRevision: state.execution.headRevision,
      current: state.execution.current,
    },
    flowNodeOccurrences: {
      definition: state.flowNodeOccurrences.definition,
      processId: state.flowNodeOccurrences.processId,
      processInstanceId: state.flowNodeOccurrences.processInstanceId,
      headRevision: state.flowNodeOccurrences.headRevision,
      currentOpen: state.flowNodeOccurrences.currentOpen,
      retainedOpen: state.flowNodeOccurrences.retainedOpen,
      lastCommittedAtEpochMs: state.flowNodeOccurrences.lastCommittedAtEpochMs,
    },
    segmentDirectory: directory,
  };
  return {
    publication,
    directorySha256: workflowPublicationSegmentDirectorySha256(directory),
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
  requireLocalPublicationAlignment(state, runtime);
  const fromRevision = runtime.segmentDirectory.segments.at(-1)?.throughRevision ?? 0;
  return {
    format: bpmnWorkflowPublicationSegmentDescriptorV1,
    runId: runtime.runId,
    runOrdinal: runtime.runOrdinal,
    fromRevision,
    throughRevision: state.execution.headRevision,
    sha256: workflowPublicationSegmentSha256(
      state.execution.batches,
      state.flowNodeOccurrences.batches,
    ),
  };
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

function requireLocalPublicationAlignment(
  state: CommandPublicationState,
  runtime: WorkflowPublicationSegmentRuntime,
): void {
  const execution = state.execution;
  const occurrences = state.flowNodeOccurrences;
  const start = runtime.segmentDirectory.segments.at(-1)?.throughRevision ?? 0;
  const aligned = execution.headRevision === occurrences.headRevision &&
    execution.batches.length === occurrences.batches.length &&
    execution.processId === occurrences.processId &&
    execution.processInstanceId === occurrences.processInstanceId &&
    runtime.segmentDirectory.segments.length === runtime.runOrdinal - 1 &&
    (runtime.runOrdinal !== 1 || runtime.runId === runtime.firstExecutionRunId) &&
    !runtime.segmentDirectory.segments.some(({ runId }) => runId === runtime.runId) &&
    execution.batches.every((batch, index) => {
      const occurrence = occurrences.batches[index];
      const previous = execution.batches[index - 1];
      return occurrence !== undefined &&
        batch.fromRevision === (previous?.throughRevision ?? start) &&
        batch.commandId === occurrence.commandId &&
        batch.fromRevision === occurrence.fromRevision &&
        batch.throughRevision === occurrence.throughRevision &&
        batch.transitions.length === occurrence.transitions.length &&
        batch.transitions.every((transition, transitionIndex) =>
          transition.revision === occurrence.transitions[transitionIndex]?.revision);
    }) &&
    (execution.batches.at(-1)?.throughRevision ?? start) === execution.headRevision;
  if (!aligned) {
    throw new TypeError("Workflow publication segment lost paired local continuity");
  }
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
