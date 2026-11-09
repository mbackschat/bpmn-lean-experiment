/**
 * Product 2's representation-free entry into one process's committed execution and flow-node-occurrence facts, in
 * the platform publication contracts' shapes. The engine's batches already have the contract's form; the gateway adds
 * the page's identity and cursor and names each engine status by its contract result kind.
 */
import {
  EnginePublicationStatus,
  observeEngineProcessExecution,
  observeEngineProcessFlowNodeOccurrences,
  parseEngineProcessLocator,
  type EngineHost,
  type EnginePublicationRequest,
} from "@bpmn-lean/engine-api";
import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrencePublicationResultKind,
  type CommittedTransitionBatch,
  type CurrentCommittedExecution,
  type ExecutionPublicationResult,
  type FlowNodeOccurrenceBatch,
  type FlowNodeOccurrencePublicationResult,
  type PublicationDefinitionIdentity,
} from "@bpmn-lean/platform-contracts";

import { engineDefinitionIdentity } from "./gateway-context.js";

export type SerializedProcessPublicationLocator = string;

export type ProcessPublicationObservationRequest = Readonly<{
  locator: SerializedProcessPublicationLocator;
  definition: PublicationDefinitionIdentity;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

export type ProcessExecutionPublicationObservationResult = ExecutionPublicationResult;
export type ProcessFlowNodeOccurrenceObservationResult = FlowNodeOccurrencePublicationResult;

function engineRequest(host: EngineHost, request: ProcessPublicationObservationRequest): EnginePublicationRequest {
  return {
    host,
    locator: parseEngineProcessLocator(request.locator),
    definition: engineDefinitionIdentity(request.definition),
    processInstanceId: request.processInstanceId,
    afterRevision: request.afterRevision,
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  };
}

/** The page frame both publications share: identity, cursor and head. */
function pageFrame(
  request: ProcessPublicationObservationRequest,
  headRevision: number,
  batches: readonly Readonly<{ throughRevision: number }>[],
) {
  return {
    definition: structuredClone(request.definition),
    processInstanceId: request.processInstanceId,
    requestedAfterRevision: request.afterRevision,
    pageThroughRevision: batches.at(-1)?.throughRevision ?? request.afterRevision,
    headRevision,
  };
}

/** The contract result of an engine status other than an available page. */
function unavailablePage(status: Exclude<EnginePublicationStatus, EnginePublicationStatus.Available>) {
  switch (status) {
    case EnginePublicationStatus.Gap:
      return ExecutionPublicationResultKind.Gap;
    case EnginePublicationStatus.Unknown:
      return ExecutionPublicationResultKind.NotFound;
    case EnginePublicationStatus.Unavailable:
      return ExecutionPublicationResultKind.Unavailable;
    case EnginePublicationStatus.IntegrityFailure:
      return ExecutionPublicationResultKind.IntegrityFailure;
  }
}

export class BpmnProcessExecutionPublicationGateway {
  readonly #host: EngineHost;

  constructor(host: EngineHost) {
    this.#host = host;
  }

  async observe(request: ProcessPublicationObservationRequest): Promise<ProcessExecutionPublicationObservationResult> {
    const result = await observeEngineProcessExecution(engineRequest(this.#host, request));
    if (result.status !== EnginePublicationStatus.Available) return { kind: unavailablePage(result.status) };
    // A chain whose start never committed has published nothing, which the contract names as no instance.
    if (result.headRevision === 0) return { kind: ExecutionPublicationResultKind.NotFound };
    const batches = structuredClone(result.batches) as unknown as CommittedTransitionBatch[];
    return {
      kind: ExecutionPublicationResultKind.Available,
      page: {
        ...pageFrame(request, result.headRevision, batches),
        batches,
        current: structuredClone(result.current) as unknown as CurrentCommittedExecution | null,
      },
    };
  }
}

export class BpmnProcessFlowNodeOccurrenceGateway {
  readonly #host: EngineHost;

  constructor(host: EngineHost) {
    this.#host = host;
  }

  async observe(request: ProcessPublicationObservationRequest): Promise<ProcessFlowNodeOccurrenceObservationResult> {
    const result = await observeEngineProcessFlowNodeOccurrences(engineRequest(this.#host, request));
    if (result.status !== EnginePublicationStatus.Available) return { kind: unavailablePage(result.status) };
    if (result.headRevision === 0) return { kind: FlowNodeOccurrencePublicationResultKind.NotFound };
    const batches = structuredClone(result.batches) as unknown as FlowNodeOccurrenceBatch[];
    return {
      kind: FlowNodeOccurrencePublicationResultKind.Available,
      page: { ...pageFrame(request, result.headRevision, batches), batches },
    };
  }
}
