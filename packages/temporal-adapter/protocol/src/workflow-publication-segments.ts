import {
  ActivityHandlerKind,
  attachedHandlersForBodyAnchor,
  isWellFormedWireString,
  observeStableState,
  projectCurrentControlPositions,
  projectOpenFlowNodeOccurrences,
  SemanticFlowNodeOccurrenceAnchorKind,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  ActivityHandlerOccurrence,
  RuntimeState,
  SemanticFlowNodeOccurrenceAnchor,
  SemanticProcessIdentity,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { deterministicSha256Hex } from "./deterministic-sha256.js";
import {
  FlowNodeOccurrencePublicationResultKind,
  requireFlowNodeOccurrencePublicationResult,
} from "./flow-node-occurrence-publication.js";
import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrencePublicationResult,
  OpenFlowNodeOccurrence,
} from "./flow-node-occurrence-publication.js";
import {
  requireExecutionPublicationPage,
} from "./semantic-publication.js";
import type {
  CommittedTransitionBatch,
  CurrentCommittedExecution,
  ExecutionPublicationResult,
} from "./semantic-publication.js";
import {
  WorkflowChainBudgetKind,
  canonicalWorkflowChainJson,
  requireWorkflowChainCanonicalByteBudget,
  workflowChainProductionLimit,
} from "./workflow-chain.js";
import { requireWorkflowChainPlainDataTree } from "./workflow-chain-plain-data.js";

export const bpmnWorkflowPublicationSegmentsV1 =
  "bpmn-lean.workflow-publication-segments.v1" as const;
export const bpmnWorkflowPublicationSegmentDescriptorV1 =
  "bpmn-lean.workflow-publication-segment.v1" as const;
export const bpmnWorkflowPublicationSegmentDirectoryV1 =
  "bpmn-lean.workflow-publication-segment-directory.v1" as const;
export const bpmnWorkflowPublicationSegmentSelectionQueryName =
  "bpmn-workflow-publication-segment-selection" as const;
export const bpmnWorkflowPublicationSegmentQueryName =
  "bpmn-workflow-publication-segment" as const;

export type WorkflowPublicationSegmentDescriptorV1 = DeepReadonly<{
  format: typeof bpmnWorkflowPublicationSegmentDescriptorV1;
  runId: string;
  runOrdinal: number;
  fromRevision: number;
  throughRevision: number;
  sha256: string;
}>;

export type WorkflowPublicationSegmentDirectoryV1 = DeepReadonly<{
  format: typeof bpmnWorkflowPublicationSegmentDirectoryV1;
  segments: WorkflowPublicationSegmentDescriptorV1[];
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
      attachedHandlers: ActivityHandlerOccurrence[];
    }>;
    lastCommittedAtEpochMs: number | null;
  };
  segmentDirectory: WorkflowPublicationSegmentDirectoryV1;
}>;

export type WorkflowPublicationSnapshotV1 = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  headRevision: number;
  current: CurrentCommittedExecution;
  currentOpen: OpenFlowNodeOccurrence[];
}>;

export type WorkflowPublicationSegmentSelectionRequestV1 = DeepReadonly<{
  protocol: typeof bpmnWorkflowPublicationSegmentsV1;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

export enum WorkflowPublicationSegmentSelectionResultKind {
  Available = "available",
  NotReady = "notReady",
  Gap = "gap",
}

type SelectionIdentityEcho = WorkflowPublicationSegmentSelectionRequestV1;

export type WorkflowPublicationSegmentSelectionResultV1 = DeepReadonly<
  | (SelectionIdentityEcho & { kind: WorkflowPublicationSegmentSelectionResultKind.NotReady })
  | (SelectionIdentityEcho & { kind: WorkflowPublicationSegmentSelectionResultKind.Gap })
  | (SelectionIdentityEcho & {
      kind: WorkflowPublicationSegmentSelectionResultKind.Available;
      directory: WorkflowPublicationSegmentDirectoryV1;
      selected: WorkflowPublicationSegmentDescriptorV1;
      currentRun: WorkflowPublicationSegmentDescriptorV1;
      snapshot: WorkflowPublicationSnapshotV1;
    })
>;

export type WorkflowPublicationSegmentQueryRequestV1 = DeepReadonly<
  WorkflowPublicationSegmentSelectionRequestV1 & {
    descriptor: WorkflowPublicationSegmentDescriptorV1;
    snapshot: WorkflowPublicationSnapshotV1;
  }
>;

export enum WorkflowPublicationSegmentQueryResultKind {
  Available = "available",
  Changed = "changed",
}

type SegmentQueryIdentityEcho = WorkflowPublicationSegmentQueryRequestV1;

export type WorkflowPublicationSegmentQueryResultV1 = DeepReadonly<
  | (SegmentQueryIdentityEcho & {
      kind: WorkflowPublicationSegmentQueryResultKind.Changed;
      currentDescriptor: WorkflowPublicationSegmentDescriptorV1;
    })
  | (SegmentQueryIdentityEcho & {
      kind: WorkflowPublicationSegmentQueryResultKind.Available;
      execution: ExecutionPublicationResult;
      flowNodeOccurrences: FlowNodeOccurrencePublicationResult;
    })
>;

export function workflowPublicationSegmentSha256(
  executionBatches: ReadonlyArray<CommittedTransitionBatch>,
  flowNodeOccurrenceBatches: ReadonlyArray<FlowNodeOccurrenceBatch>,
): string {
  return deterministicSha256Hex(canonicalWorkflowChainJson({
    executionBatches,
    flowNodeOccurrenceBatches,
  }));
}

export function workflowPublicationSegmentDirectorySha256(
  directory: WorkflowPublicationSegmentDirectoryV1,
): string {
  return deterministicSha256Hex(canonicalWorkflowChainJson(directory));
}

export function requireWorkflowPublicationSegmentDirectoryV1(
  value: unknown,
  context?: Readonly<{
    firstExecutionRunId: string;
    successorRunOrdinal: number;
    headRevision: number;
  }>,
): WorkflowPublicationSegmentDirectoryV1 {
  requireWorkflowChainPlainDataTree(value);
  if (!isRecord(value) || !hasOnlyKeys(value, ["format", "segments"]) ||
    value.format !== bpmnWorkflowPublicationSegmentDirectoryV1 ||
    !Array.isArray(value.segments) ||
    value.segments.length > workflowChainProductionLimit(
      WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryEntries,
    )) {
    throw new TypeError("Malformed Workflow publication segment directory");
  }
  const segments = value.segments.map(
    requireWorkflowPublicationSegmentDescriptorV1,
  );
  let cursor = 0;
  const runIds = new Set<string>();
  for (const [index, segment] of segments.entries()) {
    if (segment.runOrdinal !== index + 1 || segment.fromRevision !== cursor ||
      runIds.has(segment.runId)) {
      throw new TypeError("Workflow publication segment directory is not contiguous");
    }
    runIds.add(segment.runId);
    cursor = segment.throughRevision;
  }
  if (context !== undefined && (
    segments.length !== context.successorRunOrdinal - 1 ||
    segments[0]?.runId !== context.firstExecutionRunId ||
    cursor !== context.headRevision
  )) {
    throw new TypeError("Workflow publication segment directory identity mismatch");
  }
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.PublicationContinuationAndSegmentDirectoryBytes,
    value,
  );
  return value as WorkflowPublicationSegmentDirectoryV1;
}

export function requireBpmnWorkflowContinuationPublicationV1(
  value: unknown,
  program: SemanticProcessProgram,
  state: RuntimeState,
  processInstanceId: string,
  context: Readonly<{
    firstExecutionRunId: string;
    successorRunOrdinal: number;
  }>,
): BpmnWorkflowContinuationPublicationV1 {
  requireWorkflowChainPlainDataTree(value);
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "execution", "flowNodeOccurrences", "segmentDirectory",
  ]) || !isRecord(value.execution) || !isRecord(value.flowNodeOccurrences)) {
    throw new TypeError("Malformed publication continuation");
  }
  const execution = value.execution;
  const occurrences = value.flowNodeOccurrences;
  requireOnlyKeys(execution, [
    "definition", "processId", "processInstanceId", "headRevision", "current",
  ]);
  requireOnlyKeys(occurrences, [
    "definition", "processId", "processInstanceId", "headRevision",
    "currentOpen", "retainedOpen", "lastCommittedAtEpochMs",
  ]);
  const canonical = canonicalWorkflowChainJson;
  if (execution.processId !== program.processId ||
    execution.processInstanceId !== processInstanceId ||
    occurrences.processId !== program.processId ||
    occurrences.processInstanceId !== processInstanceId ||
    !isSafe(execution.headRevision, 1) || !isSafe(occurrences.headRevision, 1) ||
    execution.headRevision !== occurrences.headRevision ||
    canonical(execution.definition) !== canonical(program.identity) ||
    canonical(occurrences.definition) !== canonical(program.identity) ||
    !isRecord(execution.current) || !Array.isArray(occurrences.currentOpen) ||
    !Array.isArray(occurrences.retainedOpen) ||
    !isSafe(occurrences.lastCommittedAtEpochMs, 0)) {
    throw new TypeError("Publication continuation identity or head mismatch");
  }
  const headRevision = Number(execution.headRevision);
  const executionPage = requireExecutionPublicationPage({
    definition: execution.definition,
    processId: execution.processId,
    processInstanceId: execution.processInstanceId,
    requestedAfterRevision: headRevision,
    pageThroughRevision: headRevision,
    headRevision,
    batches: [],
    current: execution.current,
  }, { program, processInstanceId, afterRevision: headRevision, limit: 1 });
  const observation = observeStableState(program, state);
  const positions = projectCurrentControlPositions(program, state);
  if (observation === null || positions === null || canonical(execution.current) !== canonical({
    revision: headRevision,
    state: observation,
    controlTokens: positions.controlTokens,
    scopes: positions.scopes,
  })) {
    throw new TypeError("Publication current does not match committed RuntimeState");
  }
  requireFlowNodeOccurrencePublicationResult({
    kind: FlowNodeOccurrencePublicationResultKind.Available,
    page: {
      definition: occurrences.definition,
      processId: occurrences.processId,
      processInstanceId: occurrences.processInstanceId,
      requestedAfterRevision: headRevision,
      pageThroughRevision: headRevision,
      headRevision,
      batches: [],
      currentOpen: occurrences.currentOpen,
    },
  }, {
    program,
    processInstanceId,
    executionPublication: executionPage,
    afterRevision: headRevision,
    limit: 1,
  });
  const projectedOpen = projectOpenFlowNodeOccurrences(program, state);
  if (projectedOpen === null || !retainedOpenMatchesRuntime(
    occurrences.retainedOpen,
    occurrences.currentOpen,
    projectedOpen,
    Number(occurrences.lastCommittedAtEpochMs),
    state,
  )) {
    throw new TypeError("Publication open occurrences do not match RuntimeState");
  }
  requireWorkflowPublicationSegmentDirectoryV1(value.segmentDirectory, {
    ...context,
    headRevision,
  });
  return value as BpmnWorkflowContinuationPublicationV1;
}

export function selectWorkflowPublicationSegment(
  directory: WorkflowPublicationSegmentDirectoryV1,
  currentRun: WorkflowPublicationSegmentDescriptorV1,
  afterRevision: number,
  headRevision: number,
): WorkflowPublicationSegmentDescriptorV1 | null {
  if (headRevision === 0 || afterRevision > headRevision) return null;
  if (afterRevision === headRevision) return currentRun;
  return [...directory.segments, currentRun].find((segment) =>
    segment.fromRevision <= afterRevision && segment.throughRevision > afterRevision) ?? null;
}

export function requireWorkflowPublicationSegmentDescriptorV1(
  value: unknown,
): WorkflowPublicationSegmentDescriptorV1 {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "format", "runId", "runOrdinal", "fromRevision", "throughRevision", "sha256",
  ]) || value.format !== bpmnWorkflowPublicationSegmentDescriptorV1 ||
    !isNonemptyString(value.runId) || !isSafe(value.runOrdinal, 1) ||
    !isSafe(value.fromRevision, 0) || !isSafe(value.throughRevision, 0) ||
    Number(value.throughRevision) < Number(value.fromRevision) || !isSha256(value.sha256)) {
    throw new TypeError("Malformed Workflow publication segment descriptor");
  }
  return value as WorkflowPublicationSegmentDescriptorV1;
}

/**
 * Whether the retained accumulator agrees with the runtime state it claims to describe.
 *
 * `attachedHandlers` is recomputed from the state's Activity occurrence records rather than trusted,
 * because a continuation payload is untrusted input and this field is what the completeness relation
 * pairs a boundary Timer through. Admitting a forged pairing would let a restored Workflow attribute a
 * deadline to the wrong host, which is the failure the ordinal join it replaces could not produce.
 */
function retainedOpenMatchesRuntime(
  retained: ReadonlyArray<unknown>,
  current: ReadonlyArray<unknown>,
  projected: NonNullable<ReturnType<typeof projectOpenFlowNodeOccurrences>>,
  lastCommittedAtEpochMs: number,
  state: RuntimeState,
): boolean {
  if (retained.length !== current.length || retained.length !== projected.length ||
    canonicalWorkflowChainJson(current) !== canonicalWorkflowChainJson(
      retained.map((entry) => isRecord(entry) ? entry.occurrence : undefined),
    )) return false;
  const anchors = new Set<string>();
  return retained.every((entry) => {
    if (!isRecord(entry) ||
      !hasOnlyKeys(entry, ["anchor", "occurrence", "attachedHandlers"]) ||
      !isAnchor(entry.anchor) || !isRecord(entry.occurrence) ||
      !Array.isArray(entry.attachedHandlers) ||
      !entry.attachedHandlers.every(isActivityHandlerOccurrence) ||
      !isSafe(entry.occurrence.startedAtEpochMs, 0) ||
      Number(entry.occurrence.startedAtEpochMs) > lastCommittedAtEpochMs) return false;
    if (canonicalWorkflowChainJson(entry.attachedHandlers) !==
      canonicalWorkflowChainJson(attachedHandlersForBodyAnchor(state, entry.anchor))) return false;
    const key = canonicalWorkflowChainJson(entry.anchor);
    if (anchors.has(key)) return false;
    anchors.add(key);
    const match = projected.find((candidate) =>
      canonicalWorkflowChainJson(candidate.anchor) === key);
    return match !== undefined && match.processId === entry.occurrence.processId &&
      match.elementId === entry.occurrence.elementId &&
      canonicalWorkflowChainJson(match.owner) === canonicalWorkflowChainJson(entry.occurrence.owner);
  });
}

function isAnchor(value: unknown): value is SemanticFlowNodeOccurrenceAnchor {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case SemanticFlowNodeOccurrenceAnchorKind.Wait:
    case SemanticFlowNodeOccurrenceAnchorKind.CallActivity:
    case SemanticFlowNodeOccurrenceAnchorKind.CompensationTrigger:
    case SemanticFlowNodeOccurrenceAnchorKind.CompensationHandler:
      return hasOnlyKeys(value, ["kind", "id"]) && isOccurrenceId(value.id);
    case SemanticFlowNodeOccurrenceAnchorKind.Scope:
      return hasOnlyKeys(value, ["kind", "id"]) && isScopeId(value.id);
    case SemanticFlowNodeOccurrenceAnchorKind.Transition:
      return hasOnlyKeys(value, ["kind", "commandId", "transitionIndex", "localIndex"]) &&
        isNonemptyString(value.commandId) && isSafe(value.transitionIndex, 0) &&
        isSafe(value.localIndex, 0);
    default:
      return false;
  }
}

function isOccurrenceId(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "processInstanceId", "elementId", "activation",
  ]) && isNonemptyString(value.processInstanceId) &&
    isNonemptyString(value.elementId) && isSafe(value.activation, 1);
}

function isActivityHandlerOccurrence(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, ["kind", "occurrence"]) &&
    (value.kind === ActivityHandlerKind.Timer || value.kind === ActivityHandlerKind.Message) &&
    isOccurrenceId(value.occurrence);
}

function isScopeId(value: unknown): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "processInstanceId", "definitionScopeId", "activation",
  ]) && isNonemptyString(value.processInstanceId) &&
    isNonemptyString(value.definitionScopeId) && isSafe(value.activation, 1);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isSafe(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isNonemptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function requireOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): void {
  if (!hasOnlyKeys(value, keys)) {
    throw new TypeError("Workflow publication value contains unknown fields");
  }
}
