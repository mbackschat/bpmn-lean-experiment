import {
  decodeFlowNodeOccurrencePublicationPage,
  flowNodeOccurrencePublicationIdentityForPublicProcessInstance,
} from "@bpmn-lean/platform-contracts";
import type {
  ExecutionPublicationPage,
  ExecutionPublicationIdentity,
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrenceId,
  FlowNodeOccurrencePage,
  FlowNodeOccurrencePublicationIdentity,
  FlowNodeOccurrenceScopeId,
  FlowNodeOccurrenceTerminalKind,
  OpenFlowNodeOccurrence,
} from "@bpmn-lean/platform-contracts";

import {
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationProjectionImage,
  ExecutionPublicationRepository,
} from "./execution-publication-contracts.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";

export enum FlowNodeOccurrenceProjectionStatus {
  Healthy = "healthy",
  Gap = "gap",
  Unavailable = "unavailable",
}

export type ProjectedFlowNodeOccurrence = Readonly<{
  id: FlowNodeOccurrenceId;
  processId: string;
  elementId: string;
  owner: FlowNodeOccurrenceScopeId;
  startedAtEpochMs: number;
  terminal: FlowNodeOccurrenceTerminalKind | null;
  terminalAtEpochMs: number | null;
}>;

export type FlowNodeOccurrenceProjectionImage = Readonly<{
  identity: FlowNodeOccurrencePublicationIdentity;
  status: FlowNodeOccurrenceProjectionStatus;
  headRevision: number;
  producerHeadRevision: number | null;
  lastCommittedAtEpochMs: number | null;
  batches: readonly FlowNodeOccurrenceBatch[];
  occurrences: readonly ProjectedFlowNodeOccurrence[];
  currentOpen: readonly OpenFlowNodeOccurrence[];
}>;

export interface FlowNodeOccurrenceRepository {
  get(processInstanceId: string): Promise<FlowNodeOccurrenceProjectionImage | null>;
  applyPage(
    registration: OperateProcessRegistration,
    page: FlowNodeOccurrencePage,
  ): Promise<FlowNodeOccurrenceProjectionImage>;
  replaceFromPages(
    registration: OperateProcessRegistration,
    pages: readonly FlowNodeOccurrencePage[],
  ): Promise<FlowNodeOccurrenceProjectionImage>;
  mark(
    registration: OperateProcessRegistration,
    status:
      | FlowNodeOccurrenceProjectionStatus.Gap
      | FlowNodeOccurrenceProjectionStatus.Unavailable,
  ): Promise<void>;
}

export interface FlowNodeOccurrenceGateway {
  observe(request: Readonly<{
    locator: string;
    definition: FlowNodeOccurrencePublicationIdentity["definition"];
    processId: string;
    processInstanceId: string;
    afterRevision: number;
    limit?: number;
  }>): Promise<unknown>;
}

export class FlowNodeOccurrenceIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FlowNodeOccurrenceIntegrityError";
  }
}

export class FlowNodeOccurrenceStoredValueError extends Error {
  constructor(cause: unknown) {
    super("stored flow-node occurrence publication is invalid or inconsistent", {
      cause,
    });
    this.name = "FlowNodeOccurrenceStoredValueError";
  }
}

export function occurrenceIdentityFromRegistration(
  registration: Pick<OperateProcessRegistration, "instance">,
): FlowNodeOccurrencePublicationIdentity {
  return flowNodeOccurrencePublicationIdentityForPublicProcessInstance(
    registration.instance,
  );
}

export function createEmptyFlowNodeOccurrenceProjection(
  identity: FlowNodeOccurrencePublicationIdentity,
): FlowNodeOccurrenceProjectionImage {
  return {
    identity: structuredClone(identity),
    status: FlowNodeOccurrenceProjectionStatus.Healthy,
    headRevision: 0,
    producerHeadRevision: null,
    lastCommittedAtEpochMs: null,
    batches: [],
    occurrences: [],
    currentOpen: [],
  };
}

/** Folds one strict page from the retained open set and checks its E1 authority. */
export function applyFlowNodeOccurrencePage(
  priorValue: FlowNodeOccurrenceProjectionImage,
  pageValue: FlowNodeOccurrencePage,
  execution: ExecutionPublicationProjectionImage,
  executionHead: "exact" | "mayBeAhead" = "exact",
): FlowNodeOccurrenceProjectionImage {
  const prior = structuredClone(priorValue);
  const identity = structuredClone(prior.identity);
  const page = decodeFlowNodeOccurrencePublicationPage(
    structuredClone(pageValue),
    { ...identity, afterRevision: pageValue.requestedAfterRevision, limit: 100 },
  );
  requireHealthyExecution(execution, identity, page.headRevision, executionHead);
  if (
    page.requestedAfterRevision > prior.headRevision ||
    page.pageThroughRevision < prior.headRevision ||
    (prior.producerHeadRevision !== null &&
      page.headRevision < prior.producerHeadRevision)
  ) {
    throw integrity("occurrence cursor or producer head is not monotonic");
  }

  const batches = [...prior.batches];
  const occurrences = prior.occurrences.map((value) => structuredClone(value));
  const byId = new Map(occurrences.map((occurrence) => [idKey(occurrence.id), occurrence]));
  let headRevision = prior.headRevision;
  let lastCommittedAtEpochMs = prior.lastCommittedAtEpochMs;
  for (const batch of page.batches) {
    requireAlignedBatch(batch, execution);
    if (batch.throughRevision <= prior.headRevision) {
      const retained = batches.find(({ fromRevision }) =>
        fromRevision === batch.fromRevision
      );
      if (
        retained === undefined ||
        canonicalBatchText(retained) !== canonicalBatchText(batch)
      ) {
        throw integrity("overlapping occurrence batch changed");
      }
      continue;
    }
    if (
      batch.fromRevision !== headRevision ||
      (lastCommittedAtEpochMs !== null &&
        batch.committedAtEpochMs < lastCommittedAtEpochMs)
    ) {
      throw integrity("occurrence suffix skipped a batch or regressed time");
    }
    for (const transition of batch.transitions) {
      if (transition.revision !== headRevision + 1) {
        throw integrity("occurrence transition revision is not contiguous");
      }
      for (const started of transition.lifecycle.started) {
        const key = idKey(started.id);
        if (byId.has(key)) throw integrity("occurrence start identity was reused");
        const occurrence: ProjectedFlowNodeOccurrence = {
          ...structuredClone(started),
          startedAtEpochMs: batch.committedAtEpochMs,
          terminal: null,
          terminalAtEpochMs: null,
        };
        occurrences.push(occurrence);
        byId.set(key, occurrence);
      }
      for (const ended of transition.lifecycle.ended) {
        const key = idKey(ended.id);
        const existing = byId.get(key);
        if (existing === undefined || existing.terminal !== null) {
          throw integrity("occurrence terminal does not resolve one retained open start");
        }
        const terminal: ProjectedFlowNodeOccurrence = {
          ...existing,
          terminal: ended.terminal,
          terminalAtEpochMs: batch.committedAtEpochMs,
        };
        const index = occurrences.findIndex((candidate) => idKey(candidate.id) === key);
        if (index < 0) throw integrity("occurrence index is inconsistent");
        occurrences.splice(index, 1, terminal);
        byId.set(key, terminal);
      }
      headRevision = transition.revision;
    }
    if (headRevision !== batch.throughRevision) {
      throw integrity("occurrence batch range disagrees with its transitions");
    }
    lastCommittedAtEpochMs = batch.committedAtEpochMs;
    batches.push(structuredClone(batch));
  }
  if (headRevision !== page.pageThroughRevision) {
    throw integrity("occurrence page does not end at the projected head");
  }
  if (page.headRevision > headRevision && page.batches.length === 0) {
    throw integrity("occurrence producer omitted an available suffix");
  }
  const currentOpen = occurrences
    .filter((occurrence) => occurrence.terminal === null)
    .map(toOpen)
    .sort((left, right) => compareId(left.id, right.id));
  if (
    page.currentOpen !== null &&
    canonicalOpenText(currentOpen) !== canonicalOpenText(page.currentOpen)
  ) {
    throw integrity("occurrence currentOpen disagrees with the retained fold");
  }
  return {
    identity,
    status: FlowNodeOccurrenceProjectionStatus.Healthy,
    headRevision,
    producerHeadRevision: page.headRevision,
    lastCommittedAtEpochMs,
    batches,
    occurrences,
    currentOpen,
  };
}

function requireHealthyExecution(
  execution: ExecutionPublicationProjectionImage,
  identity: FlowNodeOccurrencePublicationIdentity,
  producerHead: number,
  executionHead: "exact" | "mayBeAhead",
): void {
  if (
    execution.status !== ExecutionPublicationProjectionStatus.Healthy ||
    execution.current === null ||
    execution.headRevision !== execution.producerHeadRevision ||
    (executionHead === "exact"
      ? execution.headRevision !== producerHead
      : execution.headRevision < producerHead) ||
    !samePublicationIdentity(execution.identity, identity)
  ) {
    throw integrity("occurrence publication has no matching complete E1 authority");
  }
}

function requireAlignedBatch(
  occurrence: FlowNodeOccurrenceBatch,
  execution: ExecutionPublicationProjectionImage,
): void {
  const retained = execution.batches.find(({ fromRevision }) =>
    fromRevision === occurrence.fromRevision
  );
  if (
    retained === undefined ||
    retained.commandId !== occurrence.commandId ||
    retained.fromRevision !== occurrence.fromRevision ||
    retained.throughRevision !== occurrence.throughRevision ||
    retained.transitions.length !== occurrence.transitions.length ||
    retained.transitions.some((transition, index) =>
      transition.revision !== occurrence.transitions[index]?.revision
    )
  ) {
    throw integrity("occurrence batch is not aligned to retained E1");
  }
}

function samePublicationIdentity(
  execution: ExecutionPublicationIdentity,
  occurrence: FlowNodeOccurrencePublicationIdentity,
): boolean {
  return execution.processId === occurrence.processId &&
    execution.processInstanceId === occurrence.processInstanceId &&
    execution.definition.compiler === occurrence.definition.compiler &&
    execution.definition.semanticProfile === occurrence.definition.semanticProfile &&
    execution.definition.sourceId === occurrence.definition.sourceId &&
    execution.definition.sourceSha256 === occurrence.definition.sourceSha256 &&
    JSON.stringify(execution.definition.sourceOverlay) ===
      JSON.stringify(occurrence.definition.sourceOverlay);
}

function toOpen(occurrence: ProjectedFlowNodeOccurrence): OpenFlowNodeOccurrence {
  return {
    id: structuredClone(occurrence.id),
    processId: occurrence.processId,
    elementId: occurrence.elementId,
    owner: structuredClone(occurrence.owner),
    startedAtEpochMs: occurrence.startedAtEpochMs,
  };
}

export function canonicalBatchText(batch: FlowNodeOccurrenceBatch): string {
  return JSON.stringify({
    commandId: batch.commandId,
    fromRevision: batch.fromRevision,
    throughRevision: batch.throughRevision,
    committedAtEpochMs: batch.committedAtEpochMs,
    transitions: batch.transitions.map((transition) => ({
      revision: transition.revision,
      lifecycle: {
        started: transition.lifecycle.started.map((started) => ({
          id: { ...started.id },
          processId: started.processId,
          elementId: started.elementId,
          owner: { ...started.owner },
        })),
        ended: transition.lifecycle.ended.map((ended) => ({
          id: { ...ended.id },
          terminal: ended.terminal,
        })),
      },
    })),
  });
}

export function canonicalOccurrenceText(
  occurrence: ProjectedFlowNodeOccurrence,
): string {
  return JSON.stringify({
    id: { ...occurrence.id },
    processId: occurrence.processId,
    elementId: occurrence.elementId,
    owner: { ...occurrence.owner },
    startedAtEpochMs: occurrence.startedAtEpochMs,
    terminal: occurrence.terminal,
    terminalAtEpochMs: occurrence.terminalAtEpochMs,
  });
}

function canonicalOpenText(open: readonly OpenFlowNodeOccurrence[]): string {
  return JSON.stringify(open.map((occurrence) => ({
    id: { ...occurrence.id },
    processId: occurrence.processId,
    elementId: occurrence.elementId,
    owner: { ...occurrence.owner },
    startedAtEpochMs: occurrence.startedAtEpochMs,
  })));
}

function compareId(left: FlowNodeOccurrenceId, right: FlowNodeOccurrenceId): number {
  // Code-unit order, never `localeCompare`: this ordering reaches a public projection, so a
  // locale-sensitive comparison would order the same occurrences differently on two hosts.
  const byInstance = left.processInstanceId < right.processInstanceId
    ? -1
    : left.processInstanceId > right.processInstanceId
    ? 1
    : 0;
  return byInstance ||
    left.startRevision - right.startRevision ||
    left.startIndex - right.startIndex;
}

function idKey(id: FlowNodeOccurrenceId): string {
  return JSON.stringify([
    id.processInstanceId,
    id.startRevision,
    id.startIndex,
  ]);
}

function integrity(message: string): FlowNodeOccurrenceIntegrityError {
  return new FlowNodeOccurrenceIntegrityError(message);
}
