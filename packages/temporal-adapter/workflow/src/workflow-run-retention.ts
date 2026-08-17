import type {
  CanonicalObservation,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

import type {
  CommandPublicationState,
} from "./command-publication-integration.js";
import type {
  WorkflowChainObservedCapacityBound,
} from "./workflow-chain-capacity.js";

export type WorkflowRunRetentionLimits = Readonly<{
  retainedRunTraceAndPublicationBytes: number;
}>;

export type WorkflowRunRetentionState = Readonly<{
  configuredBound: number;
  retainedCanonicalUtf8Bytes: number;
  traceEntries: number;
  executionBatches: number;
  flowNodeOccurrenceBatches: number;
  rolloverRequested: boolean;
}>;

export type WorkflowRunRetentionCandidate = Readonly<{
  traceEntriesBefore: number;
  observations: ReadonlyArray<CanonicalObservation>;
  publicationBefore: CommandPublicationState;
  publication: CommandPublicationState;
}>;

export enum WorkflowRunRetentionPreflightKind {
  Ready = "ready",
  CapacityExceeded = "capacityExceeded",
}

export type WorkflowRunRetentionPreflight =
  | Readonly<{
      kind: WorkflowRunRetentionPreflightKind.Ready;
      successor: WorkflowRunRetentionState;
    }>
  | Readonly<{
      kind: WorkflowRunRetentionPreflightKind.CapacityExceeded;
      failure: WorkflowChainObservedCapacityBound;
    }>;

/** Measures the exact Run-local trace and paired publication arrays covered by the 2 MiB row. */
export function measureWorkflowRunRetention(
  trace: ReadonlyArray<CanonicalObservation>,
  publication: CommandPublicationState,
): number {
  return workflowChainCanonicalUtf8ByteLength({
    executionBatches: publication.execution.batches,
    flowNodeOccurrenceBatches: publication.flowNodeOccurrences.batches,
    trace,
  });
}

/**
 * Maximum retained growth of one already-admitted semantic candidate.
 *
 * A committed candidate contributes one 64 KiB paired batch, the state observation already
 * contained in that batch, and a command observation whose identity came from a 64 KiB stimulus.
 * One additional 64 KiB block covers canonical field and array framing. Two such reservations let
 * the main loop close its current candidate and drain one Signal that raced the rollover fence.
 */
export function workflowRunRetentionCandidateReserveBytes(): number {
  return 4 * Math.max(
    workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticStimulusBytes),
    workflowChainProductionLimit(WorkflowChainBudgetKind.PublicationBatchBytes),
  );
}

export function initializeWorkflowRunRetention(
  trace: ReadonlyArray<CanonicalObservation>,
  publication: CommandPublicationState,
  limits: WorkflowRunRetentionLimits = productionLimits(),
): WorkflowRunRetentionState {
  const configured = requireLimits(limits);
  const retainedCanonicalUtf8Bytes = measureWorkflowRunRetention(
    trace,
    publication,
  );
  if (
    retainedCanonicalUtf8Bytes >
      configured.retainedRunTraceAndPublicationBytes
  ) {
    throw new RangeError("initial retained Run exceeds its configured limit");
  }
  return {
    configuredBound: configured.retainedRunTraceAndPublicationBytes,
    retainedCanonicalUtf8Bytes,
    traceEntries: trace.length,
    executionBatches: publication.execution.batches.length,
    flowNodeOccurrenceBatches:
      publication.flowNodeOccurrences.batches.length,
    rolloverRequested: false,
  };
}

/** Derives the complete retention successor without mutating either retained owner. */
export function preflightWorkflowRunRetentionCandidate(
  state: WorkflowRunRetentionState,
  candidate: WorkflowRunRetentionCandidate,
): WorkflowRunRetentionPreflight {
  const configured = requireLimits({
    retainedRunTraceAndPublicationBytes: state.configuredBound,
  });
  requireRetainedPrefix(state, candidate);
  const executionGrowth = publicationGrowth(
    candidate.publicationBefore.execution.batches.length,
    candidate.publication.execution.batches.length,
  );
  const occurrenceGrowth = publicationGrowth(
    candidate.publicationBefore.flowNodeOccurrences.batches.length,
    candidate.publication.flowNodeOccurrences.batches.length,
  );
  if (executionGrowth !== occurrenceGrowth) {
    throw new TypeError("retained publication candidate advanced asymmetrically");
  }

  const newExecutionBatches = executionGrowth === 0
    ? []
    : [requireLast(candidate.publication.execution.batches)];
  const newOccurrenceBatches = occurrenceGrowth === 0
    ? []
    : [requireLast(candidate.publication.flowNodeOccurrences.batches)];
  const candidateContribution =
    canonicalArrayAppendBytes(state.traceEntries, candidate.observations) +
    canonicalArrayAppendBytes(state.executionBatches, newExecutionBatches) +
    canonicalArrayAppendBytes(
      state.flowNodeOccurrenceBatches,
      newOccurrenceBatches,
    );
  if (candidateContribution > workflowRunRetentionCandidateReserveBytes()) {
    throw new TypeError("retained candidate exceeded its derived byte reservation");
  }

  const observedValue = state.retainedCanonicalUtf8Bytes + candidateContribution;
  if (observedValue > configured.retainedRunTraceAndPublicationBytes) {
    return {
      kind: WorkflowRunRetentionPreflightKind.CapacityExceeded,
      failure: {
        budget: WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes,
        configuredBound: configured.retainedRunTraceAndPublicationBytes,
        observedValue,
      },
    };
  }
  const reserve = workflowRunRetentionCandidateReserveBytes();
  return {
    kind: WorkflowRunRetentionPreflightKind.Ready,
    successor: {
      configuredBound: configured.retainedRunTraceAndPublicationBytes,
      retainedCanonicalUtf8Bytes: observedValue,
      traceEntries: state.traceEntries + candidate.observations.length,
      executionBatches: state.executionBatches + executionGrowth,
      flowNodeOccurrenceBatches:
        state.flowNodeOccurrenceBatches + occurrenceGrowth,
      rolloverRequested: state.rolloverRequested ||
        observedValue + (2 * reserve) >
          configured.retainedRunTraceAndPublicationBytes,
    },
  };
}

function requireRetainedPrefix(
  state: WorkflowRunRetentionState,
  candidate: WorkflowRunRetentionCandidate,
): void {
  if (candidate.traceEntriesBefore !== state.traceEntries) {
    throw new TypeError("retained trace prefix changed before candidate preflight");
  }
  if (
    candidate.publicationBefore.execution.batches.length !==
      state.executionBatches ||
    candidate.publicationBefore.flowNodeOccurrences.batches.length !==
      state.flowNodeOccurrenceBatches
  ) {
    throw new TypeError("retained publication prefix changed before candidate preflight");
  }
}

function publicationGrowth(before: number, after: number): 0 | 1 {
  const growth = after - before;
  if (growth === 0 || growth === 1) {
    return growth;
  }
  throw new TypeError("retained publication candidate must append at most one batch");
}

function canonicalArrayAppendBytes(
  retainedEntries: number,
  appended: ReadonlyArray<unknown>,
): number {
  if (appended.length === 0) {
    return 0;
  }
  return appended.reduce<number>(
    (total, value) => total + workflowChainCanonicalUtf8ByteLength(value),
    appended.length - 1 + (retainedEntries === 0 ? 0 : 1),
  );
}

function requireLast<T>(values: ReadonlyArray<T>): T {
  const value = values.at(-1);
  if (value === undefined) {
    throw new TypeError("retained publication candidate lost its appended batch");
  }
  return value;
}

function productionLimits(): WorkflowRunRetentionLimits {
  return {
    retainedRunTraceAndPublicationBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes,
    ),
  };
}

function requireLimits(
  limits: WorkflowRunRetentionLimits,
): WorkflowRunRetentionLimits {
  const value = limits.retainedRunTraceAndPublicationBytes;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("retained Run limit must be a positive safe integer");
  }
  if (
    value > workflowChainProductionLimit(
      WorkflowChainBudgetKind.RetainedRunTraceAndPublicationBytes,
    )
  ) {
    throw new RangeError("retained Run limit exceeds production");
  }
  return { ...limits };
}
