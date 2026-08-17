import type {
  SemanticProcessIdentity,
} from "@bpmn-lean/semantic-core";
import { isWellFormedWireString } from "@bpmn-lean/semantic-core";

import {
  FlowNodeOccurrencePublicationResultKind,
  requireFlowNodeOccurrencePublicationTransportResult,
} from "./flow-node-occurrence-publication.js";
import {
  ExecutionPublicationResultKind,
  requireExecutionPublicationTransportResult,
} from "./semantic-publication.js";
import {
  WorkflowChainBudgetKind,
  canonicalWorkflowChainJson,
  requireWorkflowChainCanonicalByteBudget,
} from "./workflow-chain.js";
import { requireWorkflowChainPlainDataTree } from "./workflow-chain-plain-data.js";
import {
  WorkflowPublicationSegmentQueryResultKind,
  WorkflowPublicationSegmentSelectionResultKind,
  bpmnWorkflowPublicationSegmentsV1,
  requireWorkflowPublicationSegmentDescriptorV1,
  requireWorkflowPublicationSegmentDirectoryV1,
  selectWorkflowPublicationSegment,
} from "./workflow-publication-segments.js";
import type {
  WorkflowPublicationSegmentQueryRequestV1,
  WorkflowPublicationSegmentQueryResultV1,
  WorkflowPublicationSegmentSelectionRequestV1,
  WorkflowPublicationSegmentSelectionResultV1,
  WorkflowPublicationSnapshotV1,
} from "./workflow-publication-segments.js";

export function requireWorkflowPublicationSegmentSelectionRequestV1(
  value: unknown,
): WorkflowPublicationSegmentSelectionRequestV1 {
  requireWorkflowChainPlainDataTree(value);
  const keys = isRecord(value) && Object.hasOwn(value, "limit")
    ? ["protocol", "processInstanceId", "afterRevision", "limit"]
    : ["protocol", "processInstanceId", "afterRevision"];
  if (!isRecord(value) || !hasOnlyKeys(value, keys) ||
    value.protocol !== bpmnWorkflowPublicationSegmentsV1 ||
    !isNonemptyString(value.processInstanceId) || !isSafe(value.afterRevision, 0) ||
    (Object.hasOwn(value, "limit") && (!isSafe(value.limit, 1) || value.limit > 100))) {
    throw new TypeError("Malformed Workflow publication segment selection request");
  }
  return value as WorkflowPublicationSegmentSelectionRequestV1;
}

export function requireWorkflowPublicationSegmentQueryRequestV1(
  value: unknown,
): WorkflowPublicationSegmentQueryRequestV1 {
  requireWorkflowChainPlainDataTree(value);
  const keys = isRecord(value) && Object.hasOwn(value, "limit")
    ? ["protocol", "processInstanceId", "afterRevision", "limit", "descriptor", "snapshot"]
    : ["protocol", "processInstanceId", "afterRevision", "descriptor", "snapshot"];
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) {
    throw new TypeError("Malformed Workflow publication segment Query request");
  }
  requireWorkflowPublicationSegmentSelectionRequestV1({
    protocol: value.protocol,
    processInstanceId: value.processInstanceId,
    afterRevision: value.afterRevision,
    ...(Object.hasOwn(value, "limit") ? { limit: value.limit } : {}),
  });
  const descriptor = requireWorkflowPublicationSegmentDescriptorV1(value.descriptor);
  const snapshot = requireSnapshot(value.snapshot);
  if (snapshot.processInstanceId !== value.processInstanceId ||
    descriptor.throughRevision > snapshot.headRevision ||
    Number(value.afterRevision) < descriptor.fromRevision ||
    Number(value.afterRevision) > descriptor.throughRevision) {
    throw new TypeError("Workflow publication segment Query identity mismatch");
  }
  return value as WorkflowPublicationSegmentQueryRequestV1;
}

export function requireWorkflowPublicationSegmentSelectionResultV1(
  value: unknown,
  expected: WorkflowPublicationSegmentSelectionRequestV1,
): WorkflowPublicationSegmentSelectionResultV1 {
  requireWorkflowChainPlainDataTree(value);
  if (!isRecord(value) || !matchesSelectionIdentity(value, expected)) {
    throw new TypeError("Workflow publication selection response identity mismatch");
  }
  switch (value.kind) {
    case WorkflowPublicationSegmentSelectionResultKind.NotReady:
    case WorkflowPublicationSegmentSelectionResultKind.Gap:
      requireOnlyKeys(value, [...selectionKeys(expected), "kind"]);
      return requireQueryResponseBudget(
        value as WorkflowPublicationSegmentSelectionResultV1,
      );
    case WorkflowPublicationSegmentSelectionResultKind.Available: {
      requireOnlyKeys(value, [
        ...selectionKeys(expected), "kind", "directory", "selected", "currentRun", "snapshot",
      ]);
      const selected = requireWorkflowPublicationSegmentDescriptorV1(value.selected);
      const currentRun = requireWorkflowPublicationSegmentDescriptorV1(value.currentRun);
      const snapshot = requireSnapshot(value.snapshot);
      const directory = requireWorkflowPublicationSegmentDirectoryV1(value.directory);
      const expectedSelected = selectWorkflowPublicationSegment(
        directory,
        currentRun,
        expected.afterRevision,
        snapshot.headRevision,
      );
      if (expectedSelected === null || canonicalWorkflowChainJson(selected) !==
        canonicalWorkflowChainJson(expectedSelected) ||
        currentRun.runOrdinal !== directory.segments.length + 1 ||
        currentRun.fromRevision !==
          (directory.segments.at(-1)?.throughRevision ?? 0) ||
        directory.segments.some(({ runId }) => runId === currentRun.runId) ||
        currentRun.throughRevision !== snapshot.headRevision ||
        snapshot.processInstanceId !== expected.processInstanceId) {
        throw new TypeError("Workflow publication selection response is inconsistent");
      }
      return requireQueryResponseBudget(
        value as WorkflowPublicationSegmentSelectionResultV1,
      );
    }
    default:
      throw new TypeError("Unknown Workflow publication selection response");
  }
}

export function requireWorkflowPublicationSegmentQueryResultV1(
  value: unknown,
  expected: WorkflowPublicationSegmentQueryRequestV1,
): WorkflowPublicationSegmentQueryResultV1 {
  requireWorkflowChainPlainDataTree(value);
  if (!isRecord(value) || !matchesSegmentQueryIdentity(value, expected)) {
    throw new TypeError("Workflow publication segment response identity mismatch");
  }
  switch (value.kind) {
    case WorkflowPublicationSegmentQueryResultKind.Changed: {
      requireOnlyKeys(value, [...segmentQueryKeys(expected), "kind", "currentDescriptor"]);
      const current = requireWorkflowPublicationSegmentDescriptorV1(value.currentDescriptor);
      if (current.runId !== expected.descriptor.runId ||
        current.runOrdinal !== expected.descriptor.runOrdinal ||
        current.fromRevision !== expected.descriptor.fromRevision ||
        current.throughRevision <= expected.descriptor.throughRevision) {
        throw new TypeError("Workflow publication changed response is inconsistent");
      }
      return requireQueryResponseBudget(value as WorkflowPublicationSegmentQueryResultV1);
    }
    case WorkflowPublicationSegmentQueryResultKind.Available:
      requireOnlyKeys(value, [
        ...segmentQueryKeys(expected), "kind", "execution", "flowNodeOccurrences",
      ]);
      requirePairedPublicResults(value, expected);
      return requireQueryResponseBudget(value as WorkflowPublicationSegmentQueryResultV1);
    default:
      throw new TypeError("Unknown Workflow publication segment response");
  }
}

function requirePairedPublicResults(
  value: Record<string, unknown>,
  request: WorkflowPublicationSegmentQueryRequestV1,
): void {
  const context = {
    definition: request.snapshot.definition,
    processId: request.snapshot.processId,
    processInstanceId: request.processInstanceId,
    afterRevision: request.afterRevision,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  };
  const execution = requireExecutionPublicationTransportResult(value.execution, context);
  const occurrences = requireFlowNodeOccurrencePublicationTransportResult(
    value.flowNodeOccurrences,
    context,
  );
  const aligned = execution.kind === ExecutionPublicationResultKind.Gap &&
      occurrences.kind === FlowNodeOccurrencePublicationResultKind.Gap ||
    execution.kind === ExecutionPublicationResultKind.Available &&
      occurrences.kind === FlowNodeOccurrencePublicationResultKind.Available &&
      execution.page.pageThroughRevision === occurrences.page.pageThroughRevision &&
      execution.page.headRevision === request.snapshot.headRevision &&
      occurrences.page.headRevision === request.snapshot.headRevision &&
      execution.page.pageThroughRevision <= request.descriptor.throughRevision &&
      execution.page.batches.every((batch) =>
        batch.fromRevision >= request.descriptor.fromRevision &&
        batch.throughRevision <= request.descriptor.throughRevision) &&
      occurrences.page.batches.every((batch) =>
        batch.fromRevision >= request.descriptor.fromRevision &&
        batch.throughRevision <= request.descriptor.throughRevision) &&
      execution.page.batches.length === occurrences.page.batches.length &&
      execution.page.batches.every((batch, index) => {
        const occurrence = occurrences.page.batches[index];
        return occurrence !== undefined &&
          canonicalWorkflowChainJson(batchIdentity(batch)) ===
            canonicalWorkflowChainJson(batchIdentity(occurrence)) &&
          batch.transitions.length === occurrence.transitions.length &&
          batch.transitions.every((transition, transitionIndex) =>
            transition.revision === occurrence.transitions[transitionIndex]?.revision);
      });
  if (!aligned) {
    throw new TypeError("Workflow publication segment response is not paired");
  }
}

function requireSnapshot(value: unknown): WorkflowPublicationSnapshotV1 {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "definition", "processId", "processInstanceId", "headRevision", "current", "currentOpen",
  ]) || !isRecord(value.definition) || !isNonemptyString(value.processId) ||
    !isNonemptyString(value.processInstanceId) || !isSafe(value.headRevision, 1) ||
    !isRecord(value.current) || value.current.revision !== value.headRevision ||
    !Array.isArray(value.currentOpen)) {
    throw new TypeError("Malformed Workflow publication snapshot");
  }
  const context = {
    definition: value.definition as SemanticProcessIdentity,
    processId: value.processId,
    processInstanceId: value.processInstanceId,
    afterRevision: Number(value.headRevision),
    limit: 1,
  };
  requireExecutionPublicationTransportResult({
    kind: ExecutionPublicationResultKind.Available,
    page: {
      definition: value.definition,
      processId: value.processId,
      processInstanceId: value.processInstanceId,
      requestedAfterRevision: value.headRevision,
      pageThroughRevision: value.headRevision,
      headRevision: value.headRevision,
      batches: [],
      current: value.current,
    },
  }, context);
  requireFlowNodeOccurrencePublicationTransportResult({
    kind: FlowNodeOccurrencePublicationResultKind.Available,
    page: {
      definition: value.definition,
      processId: value.processId,
      processInstanceId: value.processInstanceId,
      requestedAfterRevision: value.headRevision,
      pageThroughRevision: value.headRevision,
      headRevision: value.headRevision,
      batches: [],
      currentOpen: value.currentOpen,
    },
  }, context);
  return value as WorkflowPublicationSnapshotV1;
}

function requireQueryResponseBudget<T>(value: T): T {
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.QueryResponseBytes,
    value,
  );
  return value;
}

function matchesSelectionIdentity(
  value: Record<string, unknown>,
  expected: WorkflowPublicationSegmentSelectionRequestV1,
): boolean {
  return value.protocol === expected.protocol &&
    value.processInstanceId === expected.processInstanceId &&
    value.afterRevision === expected.afterRevision && value.limit === expected.limit;
}

function matchesSegmentQueryIdentity(
  value: Record<string, unknown>,
  expected: WorkflowPublicationSegmentQueryRequestV1,
): boolean {
  return matchesSelectionIdentity(value, expected) &&
    canonicalWorkflowChainJson(value.descriptor) === canonicalWorkflowChainJson(expected.descriptor) &&
    canonicalWorkflowChainJson(value.snapshot) === canonicalWorkflowChainJson(expected.snapshot);
}

function selectionKeys(value: WorkflowPublicationSegmentSelectionRequestV1): string[] {
  return [
    "protocol", "processInstanceId", "afterRevision",
    ...(value.limit === undefined ? [] : ["limit"]),
  ];
}

function segmentQueryKeys(value: WorkflowPublicationSegmentQueryRequestV1): string[] {
  return [...selectionKeys(value), "descriptor", "snapshot"];
}

function batchIdentity(batch: {
  commandId: string;
  fromRevision: number;
  throughRevision: number;
}) {
  return {
    commandId: batch.commandId,
    fromRevision: batch.fromRevision,
    throughRevision: batch.throughRevision,
  };
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
