/**
 * The publication continuation a Continue-As-New carries, built and measured without the Temporal Workflow SDK, so the
 * commit preflight that measures it stays a pure module.
 */
import {
  bpmnWorkflowPublicationSegmentDescriptorV1,
  bpmnWorkflowPublicationSegmentDirectoryV1,
  workflowChainCanonicalUtf8ByteLength,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnWorkflowContinuationPublicationV1,
  WorkflowPublicationSegmentDescriptorV1,
  WorkflowPublicationSegmentDirectoryV1,
} from "@bpmn-lean/temporal-protocol";

import type {
  CommandPublicationState,
} from "./command-publication-integration.js";

export type WorkflowPublicationSegmentRuntime = Readonly<{
  runId: string;
  runOrdinal: number;
  firstExecutionRunId: string;
  segmentDirectory: WorkflowPublicationSegmentDirectoryV1;
}>;

/**
 * The canonical bytes of the publication continuation a Continue-As-New directly after `state` would carry. A segment
 * digest is 64 lowercase hex characters whatever the batches hold, so a placeholder of that length measures exactly
 * without hashing the Run's whole publication on every commit.
 */
export function measureWorkflowContinuationPublicationBytes(
  state: CommandPublicationState,
  runtime: WorkflowPublicationSegmentRuntime,
): number {
  requireWorkflowPublicationAlignment(state, runtime);
  return workflowChainCanonicalUtf8ByteLength(workflowSuccessorPublication(
    state,
    workflowPublicationSegmentDescriptor(state, runtime, "0".repeat(64)),
    runtime,
  ));
}

export function workflowSuccessorPublication(
  state: CommandPublicationState,
  descriptor: WorkflowPublicationSegmentDescriptorV1,
  runtime: WorkflowPublicationSegmentRuntime,
): BpmnWorkflowContinuationPublicationV1 {
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
  return publication;
}


export function workflowPublicationSegmentDescriptor(
  state: CommandPublicationState,
  runtime: WorkflowPublicationSegmentRuntime,
  sha256: string,
): WorkflowPublicationSegmentDescriptorV1 {
  return {
    format: bpmnWorkflowPublicationSegmentDescriptorV1,
    runId: runtime.runId,
    runOrdinal: runtime.runOrdinal,
    fromRevision: runtime.segmentDirectory.segments.at(-1)?.throughRevision ?? 0,
    throughRevision: state.execution.headRevision,
    sha256,
  };
}

export function requireWorkflowPublicationAlignment(
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
