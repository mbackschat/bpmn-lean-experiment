import type {
  DeepReadonly,
  ProcessStartStimulus,
  RuntimeState,
  SemanticFlowNodeOccurrenceAnchor,
  SemanticProcessIdentity,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import type {
  MessageDeliveryRecord,
} from "./contracts.js";
import type {
  OpenFlowNodeOccurrence,
} from "./flow-node-occurrence-publication.js";
import type {
  CurrentCommittedExecution,
} from "./semantic-publication.js";
import type {
  WorkflowChainRecoveryEntry,
} from "./workflow-chain.js";
import {
  WorkflowChainBudgetKind,
  canonicalWorkflowChainJson,
  requireWorkflowChainCanonicalByteBudget,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "./workflow-chain.js";
import { isMessageDeliveryRecord } from "./lifecycle-results.js";

export const bpmnWorkflowContinuationV1 =
  "bpmn-lean.workflow-continuation.v1" as const;
export const bpmnWorkflowChainPatchId = "bpmn-workflow-chain-v1" as const;
export const bpmnWorkflowRolloverInProgressFailureType =
  "BpmnWorkflowRolloverInProgress" as const;

export enum BpmnWorkflowHostInputKind {
  Initial = "initial",
  Continuation = "continuation",
}

/** Explicit initial input used only by the direct first-green host witness. */
export type BpmnWorkflowInitialHostInputV1 = DeepReadonly<{
  protocol: typeof bpmnWorkflowContinuationV1;
  kind: BpmnWorkflowHostInputKind.Initial;
  eventHistoryEventLimit: number;
}>;

/** Private chain metadata. Run identity remains absent from every public engine contract. */
export type BpmnWorkflowContinuationHostInputV1 = DeepReadonly<{
  protocol: typeof bpmnWorkflowContinuationV1;
  kind: BpmnWorkflowHostInputKind.Continuation;
  eventHistoryEventLimit: number;
  runOrdinal: number;
  firstExecutionRunId: string;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  startCommandId: string;
  completedMessageDeliveryRecords: MessageDeliveryRecord[];
}>;

export type BpmnWorkflowHostInputV1 =
  | BpmnWorkflowInitialHostInputV1
  | BpmnWorkflowContinuationHostInputV1;

export function requireBpmnWorkflowHostInputV1(
  value: unknown,
): BpmnWorkflowHostInputV1 {
  if (!isRecord(value) || value.protocol !== bpmnWorkflowContinuationV1) {
    throw new TypeError("Unsupported Workflow continuation schema");
  }
  if (
    !Number.isSafeInteger(value.eventHistoryEventLimit) ||
    Number(value.eventHistoryEventLimit) < 1 ||
    Number(value.eventHistoryEventLimit) >
      workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents)
  ) {
    throw new RangeError("Event History event limit is outside production bounds");
  }
  switch (value.kind) {
    case BpmnWorkflowHostInputKind.Initial:
      requireOnlyKeys(value, ["protocol", "kind", "eventHistoryEventLimit"]);
      return value as BpmnWorkflowInitialHostInputV1;
    case BpmnWorkflowHostInputKind.Continuation:
      requireOnlyKeys(value, [
        "protocol", "kind", "eventHistoryEventLimit", "runOrdinal",
        "firstExecutionRunId", "definition", "processId", "processInstanceId",
        "startCommandId", "completedMessageDeliveryRecords",
      ]);
      if (
        !Number.isSafeInteger(value.runOrdinal) ||
        Number(value.runOrdinal) < 2 ||
        Number(value.runOrdinal) >
          workflowChainProductionLimit(WorkflowChainBudgetKind.WorkflowChainRuns) ||
        !isNonemptyString(value.firstExecutionRunId) ||
        !isNonemptyString(value.processId) ||
        !isNonemptyString(value.processInstanceId) ||
        !isNonemptyString(value.startCommandId) ||
        !Array.isArray(value.completedMessageDeliveryRecords) ||
        !value.completedMessageDeliveryRecords.every(isMessageDeliveryRecord)
      ) {
        throw new TypeError("Malformed Workflow continuation metadata");
      }
      return value as BpmnWorkflowContinuationHostInputV1;
    default:
      throw new TypeError("Unknown Workflow continuation variant");
  }
}

/** The committed semantic state is a separate, independently measured Temporal argument. */
export type BpmnWorkflowContinuationStateV1 = RuntimeState;

/** Lifetime command recovery is a separate, independently measured Temporal argument. */
export type BpmnWorkflowContinuationRecoveryV1 = DeepReadonly<{
  entries: WorkflowChainRecoveryEntry[];
}>;

export type BpmnWorkflowContinuationPublicationV1 = DeepReadonly<{
  execution: {
    definition: SemanticProcessIdentity;
    processId: string;
    processInstanceId: string;
    headRevision: number;
    current: CurrentCommittedExecution | null;
  };
  flowNodeOccurrences: {
    definition: SemanticProcessIdentity;
    processId: string;
    processInstanceId: string;
    headRevision: number;
    currentOpen: OpenFlowNodeOccurrence[];
    retainedOpen: Array<{
      anchor: SemanticFlowNodeOccurrenceAnchor;
      occurrence: OpenFlowNodeOccurrence;
    }>;
    lastCommittedAtEpochMs: number | null;
  };
}>;

export function requireBpmnWorkflowContinuationPublicationV1(
  value: unknown,
  definition: SemanticProcessIdentity,
  processId: string,
  processInstanceId: string,
): BpmnWorkflowContinuationPublicationV1 {
  if (!isRecord(value)) {
    throw new TypeError("Malformed publication continuation");
  }
  requireOnlyKeys(value, ["execution", "flowNodeOccurrences"]);
  if (!isRecord(value.execution) || !isRecord(value.flowNodeOccurrences)) {
    throw new TypeError("Malformed publication continuation");
  }
  requireOnlyKeys(value.execution, [
    "definition", "processId", "processInstanceId", "headRevision", "current",
  ]);
  requireOnlyKeys(value.flowNodeOccurrences, [
    "definition", "processId", "processInstanceId", "headRevision",
    "currentOpen", "retainedOpen", "lastCommittedAtEpochMs",
  ]);
  const execution = value.execution;
  const occurrences = value.flowNodeOccurrences;
  const canonical = canonicalWorkflowChainJson;
  if (
    execution.processId !== processId ||
    execution.processInstanceId !== processInstanceId ||
    occurrences.processId !== processId ||
    occurrences.processInstanceId !== processInstanceId ||
    !Number.isSafeInteger(execution.headRevision) ||
    Number(execution.headRevision) < 0 ||
    !Number.isSafeInteger(occurrences.headRevision) ||
    Number(occurrences.headRevision) < 0 ||
    execution.headRevision !== occurrences.headRevision ||
    canonical(execution.definition) !== canonical(definition) ||
    canonical(occurrences.definition) !== canonical(definition) ||
    !Array.isArray(occurrences.currentOpen) ||
    !Array.isArray(occurrences.retainedOpen) ||
    canonical(occurrences.currentOpen) !== canonical(
      occurrences.retainedOpen.map((entry) =>
        isRecord(entry) ? entry.occurrence : undefined),
    ) ||
    (
      execution.headRevision === 0
        ? execution.current !== null || occurrences.lastCommittedAtEpochMs !== null
        : !isRecord(execution.current) ||
          execution.current.revision !== execution.headRevision ||
          !Number.isSafeInteger(occurrences.lastCommittedAtEpochMs) ||
          Number(occurrences.lastCommittedAtEpochMs) < 0
    )
  ) {
    throw new TypeError("Publication continuation identity or head mismatch");
  }
  return value as BpmnWorkflowContinuationPublicationV1;
}

export type WorkflowContinuationBudgetViolation = Readonly<{
  budget: WorkflowChainBudgetKind;
  observedValue: number;
  configuredBound: number;
}>;

export function requireWorkflowChainInitialArgumentBudgets(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
): void {
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.InitialStartStimulusBytes,
    start,
  );
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.SemanticProcessProgramBytes,
    program,
  );
}

/** Measures each carried argument and their aggregate without classifying the caller. */
export function workflowContinuationBudgetViolation(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  host: BpmnWorkflowContinuationHostInputV1,
  state: RuntimeState,
  recovery: BpmnWorkflowContinuationRecoveryV1,
  publication: BpmnWorkflowContinuationPublicationV1,
): WorkflowContinuationBudgetViolation | null {
  const aggregate = [start, program, host, state, recovery, publication];
  const measured: ReadonlyArray<readonly [WorkflowChainBudgetKind, unknown]> = [
    [WorkflowChainBudgetKind.InitialStartStimulusBytes, start],
    [WorkflowChainBudgetKind.SemanticProcessProgramBytes, program],
    [WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes, host],
    [WorkflowChainBudgetKind.CommittedRuntimeStateBytes, state],
    [WorkflowChainBudgetKind.CommandRecoveryLedgerBytes, recovery.entries],
    [WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes, publication],
    [WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes, aggregate],
  ];
  for (const [budget, value] of measured) {
    const observedValue = workflowChainCanonicalUtf8ByteLength(value);
    const configuredBound = workflowChainProductionLimit(budget);
    if (observedValue > configuredBound) {
      return { budget, observedValue, configuredBound };
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): void {
  if (
    Object.keys(value).length !== keys.length ||
    !Object.keys(value).every((key) => keys.includes(key))
  ) {
    throw new TypeError("Workflow continuation contains unknown fields");
  }
}
