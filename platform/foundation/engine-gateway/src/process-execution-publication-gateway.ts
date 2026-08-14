/** Product 2's representation-free entry into one committed execution publication. */
import {
  observeEngineProcessExecution,
  parseEngineProcessLocator,
} from "@bpmn-lean/engine-api";
import type {
  EngineExecutionPublicationResult,
  EngineProcessExecutionObservationRequest,
} from "@bpmn-lean/engine-api";

export type SerializedProcessExecutionPublicationLocator = string;

export type ProcessExecutionPublicationObservationRequest = Readonly<{
  locator: SerializedProcessExecutionPublicationLocator;
  definition: EngineProcessExecutionObservationRequest["definition"];
  processId: string;
  processInstanceId: string;
  afterRevision: number;
  limit?: number;
}>;

export type ProcessExecutionPublicationObservationResult =
  EngineExecutionPublicationResult;

/** Parses the private locator locally, delegates once, and returns only closed public facts. */
export class BpmnProcessExecutionPublicationGateway {
  readonly #temporalClient: EngineProcessExecutionObservationRequest["temporalClient"];

  constructor(
    temporalClient: EngineProcessExecutionObservationRequest["temporalClient"],
  ) {
    this.#temporalClient = temporalClient;
  }

  observe(
    request: ProcessExecutionPublicationObservationRequest,
  ): Promise<ProcessExecutionPublicationObservationResult> {
    const locator = parseEngineProcessLocator(request.locator);
    return observeEngineProcessExecution({
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
