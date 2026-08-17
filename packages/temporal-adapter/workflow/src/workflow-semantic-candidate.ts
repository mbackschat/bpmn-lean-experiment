import type {
  RuntimeState,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

import type {
  CommandPublicationState,
} from "./command-publication-integration.js";

export type WorkflowSemanticCandidateLimits = Readonly<{
  committedRuntimeStateBytes: number;
  publicationBatchBytes: number;
}>;

export type WorkflowSemanticCandidate = Readonly<{
  state: RuntimeState;
  publicationBefore: CommandPublicationState;
  publication: CommandPublicationState;
}>;

export enum WorkflowSemanticCandidatePreflightKind {
  Ready = "ready",
  CapacityExceeded = "capacityExceeded",
}

export type WorkflowSemanticCandidatePreflight =
  | Readonly<{
      kind: WorkflowSemanticCandidatePreflightKind.Ready;
      observedStateBytes: number;
      observedPublicationBatchBytes: number | null;
    }>
  | Readonly<{
      kind: WorkflowSemanticCandidatePreflightKind.CapacityExceeded;
      failure: WorkflowSemanticCandidateCapacityBound;
    }>;

export type WorkflowSemanticCandidateCapacityBound = Readonly<{
  budget:
    | WorkflowChainBudgetKind.CommittedRuntimeStateBytes
    | WorkflowChainBudgetKind.PublicationBatchBytes;
  configuredBound: number;
  observedValue: number;
}>;

/** Measures one complete semantic successor without mutating any retained Workflow fact. */
export function preflightWorkflowSemanticCandidate(
  candidate: WorkflowSemanticCandidate,
  limits: WorkflowSemanticCandidateLimits = productionLimits(),
): WorkflowSemanticCandidatePreflight {
  const configured = requireLimits(limits);
  const observedStateBytes = workflowChainCanonicalUtf8ByteLength(
    candidate.state,
  );
  if (observedStateBytes > configured.committedRuntimeStateBytes) {
    return capacityExceeded(
      WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
      configured.committedRuntimeStateBytes,
      observedStateBytes,
    );
  }

  const batch = pairedPublicationBatch(candidate);
  const observedPublicationBatchBytes = batch === null
    ? null
    : workflowChainCanonicalUtf8ByteLength(batch);
  if (
    observedPublicationBatchBytes !== null &&
    observedPublicationBatchBytes > configured.publicationBatchBytes
  ) {
    return capacityExceeded(
      WorkflowChainBudgetKind.PublicationBatchBytes,
      configured.publicationBatchBytes,
      observedPublicationBatchBytes,
    );
  }
  return {
    kind: WorkflowSemanticCandidatePreflightKind.Ready,
    observedStateBytes,
    observedPublicationBatchBytes,
  };
}

function pairedPublicationBatch(candidate: WorkflowSemanticCandidate) {
  const beforeExecution = candidate.publicationBefore.execution.batches.length;
  const afterExecution = candidate.publication.execution.batches.length;
  const beforeOccurrences =
    candidate.publicationBefore.flowNodeOccurrences.batches.length;
  const afterOccurrences = candidate.publication.flowNodeOccurrences.batches.length;
  const executionGrowth = afterExecution - beforeExecution;
  const occurrenceGrowth = afterOccurrences - beforeOccurrences;
  if (executionGrowth === 0 && occurrenceGrowth === 0) {
    return null;
  }
  if (executionGrowth !== 1 || occurrenceGrowth !== 1) {
    throw new TypeError("paired publication candidate advanced asymmetrically");
  }
  const execution = candidate.publication.execution.batches.at(-1);
  const flowNodeOccurrences =
    candidate.publication.flowNodeOccurrences.batches.at(-1);
  if (
    execution === undefined ||
    flowNodeOccurrences === undefined ||
    execution.commandId !== flowNodeOccurrences.commandId ||
    execution.fromRevision !== flowNodeOccurrences.fromRevision ||
    execution.throughRevision !== flowNodeOccurrences.throughRevision
  ) {
    throw new TypeError("paired publication candidate is not revision-aligned");
  }
  return { execution, flowNodeOccurrences };
}

function capacityExceeded(
  budget: WorkflowSemanticCandidateCapacityBound["budget"],
  configuredBound: number,
  observedValue: number,
): WorkflowSemanticCandidatePreflight {
  return {
    kind: WorkflowSemanticCandidatePreflightKind.CapacityExceeded,
    failure: { budget, configuredBound, observedValue },
  };
}

function productionLimits(): WorkflowSemanticCandidateLimits {
  return {
    committedRuntimeStateBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
    ),
    publicationBatchBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.PublicationBatchBytes,
    ),
  };
}

function requireLimits(
  limits: WorkflowSemanticCandidateLimits,
): WorkflowSemanticCandidateLimits {
  requireLimit(
    limits.committedRuntimeStateBytes,
    WorkflowChainBudgetKind.CommittedRuntimeStateBytes,
  );
  requireLimit(
    limits.publicationBatchBytes,
    WorkflowChainBudgetKind.PublicationBatchBytes,
  );
  return { ...limits };
}

function requireLimit(value: number, budget: WorkflowChainBudgetKind): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${budget} limit must be a positive safe integer`);
  }
  if (value > workflowChainProductionLimit(budget)) {
    throw new RangeError(`${budget} limit exceeds production`);
  }
}
