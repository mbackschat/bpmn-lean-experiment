import {
  decodeFlowNodeOccurrencePublicationPage,
  flowNodeOccurrenceKeyText,
  publicationIdentityForPublicProcessInstance,
  samePublicationIdentity,
} from "@bpmn-lean/platform-contracts";
import type {
  FlowNodeOccurrenceBatch,
  FlowNodeOccurrenceKey,
  FlowNodeOccurrencePage,
  FlowNodeOccurrenceTerminalKind,
  PublicationIdentity,
} from "@bpmn-lean/platform-contracts";

import {
  ExecutionPublicationProjectionStatus,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationProjectionImage,
  PublicationObservationRequest,
} from "./execution-publication-contracts.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";

export enum FlowNodeOccurrenceProjectionStatus {
  Healthy = "healthy",
  Gap = "gap",
  Unavailable = "unavailable",
}

/**
 * One projected occurrence, identified by the kernel's occurrence key. `startRevision` and `startIndex` (its index
 * among that transition's starts) are only its publication position, which orders and stores the occurrences.
 */
export type ProjectedFlowNodeOccurrence = Readonly<{
  occurrence: FlowNodeOccurrenceKey;
  startRevision: number;
  startIndex: number;
  owner: number;
  sourceType: string;
  terminal: FlowNodeOccurrenceTerminalKind | null;
}>;

export type FlowNodeOccurrenceProjectionImage = Readonly<{
  identity: PublicationIdentity;
  status: FlowNodeOccurrenceProjectionStatus;
  headRevision: number;
  producerHeadRevision: number | null;
  batches: readonly FlowNodeOccurrenceBatch[];
  occurrences: readonly ProjectedFlowNodeOccurrence[];
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
  observe(request: PublicationObservationRequest): Promise<unknown>;
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
): PublicationIdentity {
  return publicationIdentityForPublicProcessInstance(registration.instance);
}

/** The stored text of a projection's identity, in one fixed key order. */
export function occurrenceIdentityText(identity: PublicationIdentity): string {
  const { ref, profile, sourceOverlay } = identity.definition;
  return JSON.stringify({
    definition: {
      ref: { definitionKey: ref.definitionKey, version: ref.version, sha256: ref.sha256 },
      profile,
      sourceOverlay: sourceOverlay === null ? null : { id: sourceOverlay.id, sha256: sourceOverlay.sha256 },
    },
    processInstanceId: identity.processInstanceId,
  });
}

export function createEmptyFlowNodeOccurrenceProjection(
  identity: PublicationIdentity,
): FlowNodeOccurrenceProjectionImage {
  return {
    identity: structuredClone(identity),
    status: FlowNodeOccurrenceProjectionStatus.Healthy,
    headRevision: 0,
    producerHeadRevision: null,
    batches: [],
    occurrences: [],
  };
}

/** Folds one strict page from the retained occurrences and checks its E1 authority. */
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
  const indexByKey = new Map(occurrences.map((occurrence, index) => [
    flowNodeOccurrenceKeyText(occurrence.occurrence),
    index,
  ]));
  let headRevision = prior.headRevision;
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
    if (batch.fromRevision !== headRevision) {
      throw integrity("occurrence suffix skipped a batch");
    }
    for (const transition of batch.transitions) {
      transition.started.forEach((started, startIndex) => {
        const key = flowNodeOccurrenceKeyText(started.occurrence);
        if (indexByKey.has(key)) throw integrity("occurrence key was started again");
        indexByKey.set(key, occurrences.length);
        occurrences.push({
          occurrence: structuredClone(started.occurrence),
          startRevision: transition.revision,
          startIndex,
          owner: started.owner,
          sourceType: started.sourceType,
          terminal: null,
        });
      });
      for (const ended of transition.ended) {
        const index = indexByKey.get(flowNodeOccurrenceKeyText(ended.occurrence));
        const existing = index === undefined ? undefined : occurrences[index];
        if (index === undefined || existing === undefined || existing.terminal !== null) {
          throw integrity("occurrence terminal does not resolve one retained open start");
        }
        occurrences.splice(index, 1, { ...existing, terminal: ended.terminal });
      }
    }
    headRevision = batch.throughRevision;
    batches.push(structuredClone(batch));
  }
  if (headRevision !== page.pageThroughRevision) {
    throw integrity("occurrence page does not end at the projected head");
  }
  if (page.headRevision > headRevision && page.batches.length === 0) {
    throw integrity("occurrence producer omitted an available suffix");
  }
  return {
    identity,
    status: FlowNodeOccurrenceProjectionStatus.Healthy,
    headRevision,
    producerHeadRevision: page.headRevision,
    batches,
    occurrences,
  };
}

function requireHealthyExecution(
  execution: ExecutionPublicationProjectionImage,
  identity: PublicationIdentity,
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

/** Every committed input has one occurrence batch over the same command and revisions as its execution batch. */
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
    retained.throughRevision !== occurrence.throughRevision
  ) {
    throw integrity("occurrence batch is not aligned to retained E1");
  }
}

export function canonicalBatchText(batch: FlowNodeOccurrenceBatch): string {
  return JSON.stringify({
    commandId: batch.commandId,
    fromRevision: batch.fromRevision,
    throughRevision: batch.throughRevision,
    transitions: batch.transitions.map((transition) => ({
      revision: transition.revision,
      started: transition.started.map((started) => ({
        occurrence: keyValue(started.occurrence),
        owner: started.owner,
        sourceType: started.sourceType,
      })),
      ended: transition.ended.map((ended) => ({
        occurrence: keyValue(ended.occurrence),
        terminal: ended.terminal,
      })),
    })),
  });
}

export function canonicalOccurrenceText(
  occurrence: ProjectedFlowNodeOccurrence,
): string {
  return JSON.stringify({
    occurrence: keyValue(occurrence.occurrence),
    startRevision: occurrence.startRevision,
    startIndex: occurrence.startIndex,
    owner: occurrence.owner,
    sourceType: occurrence.sourceType,
    terminal: occurrence.terminal,
  });
}

function keyValue(key: FlowNodeOccurrenceKey): FlowNodeOccurrenceKey {
  return {
    processInstanceId: key.processInstanceId,
    elementId: key.elementId,
    activation: key.activation,
    role: key.role,
  };
}

function integrity(message: string): FlowNodeOccurrenceIntegrityError {
  return new FlowNodeOccurrenceIntegrityError(message);
}
