/** Product 2's representation-free entry into public flow-node occurrences. */
import {
  observeEngineProcessFlowNodeOccurrences,
  parseEngineProcessLocator,
} from "@bpmn-lean/engine-api";
import type {
  EngineFlowNodeOccurrencePublicationResult,
  EngineProcessFlowNodeOccurrenceObservationRequest,
} from "@bpmn-lean/engine-api";

export type SerializedProcessFlowNodeOccurrenceLocator = string;

export type ProcessFlowNodeOccurrenceObservationRequest = Readonly<{
  locator: SerializedProcessFlowNodeOccurrenceLocator;
  definition: EngineProcessFlowNodeOccurrenceObservationRequest["definition"];
  processId: string;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

export type ProcessFlowNodeOccurrenceObservationResult =
  EngineFlowNodeOccurrencePublicationResult;

/** Parses one opaque locator, delegates once, and returns only closed public facts. */
export class BpmnProcessFlowNodeOccurrenceGateway {
  readonly #temporalClient:
    EngineProcessFlowNodeOccurrenceObservationRequest["temporalClient"];

  constructor(
    temporalClient: EngineProcessFlowNodeOccurrenceObservationRequest["temporalClient"],
  ) {
    this.#temporalClient = temporalClient;
  }

  observe(
    request: ProcessFlowNodeOccurrenceObservationRequest,
  ): Promise<ProcessFlowNodeOccurrenceObservationResult> {
    const locator = parseEngineProcessLocator(request.locator);
    return observeEngineProcessFlowNodeOccurrences({
      temporalClient: this.#temporalClient,
      locator,
      definition: request.definition,
      processId: request.processId,
      processInstanceId: request.processInstanceId,
      afterRevision: request.afterRevision,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    });
  }
}
