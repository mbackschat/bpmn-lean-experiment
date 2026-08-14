/** Product 2's representation-free entry into exact current incident operations. */
import {
  EngineIncidentObservationStatus,
  observeEngineProcessIncidents,
  parseEngineProcessLocator,
  submitEngineIncidentOperation,
} from "@bpmn-lean/engine-api";
import type {
  EngineIncidentObservationResult,
  EngineIncidentObservationRequest,
  EngineIncidentOperationRequest,
} from "@bpmn-lean/engine-api";

export const ProcessIncidentObservationStatus = EngineIncidentObservationStatus;
export type ProcessIncidentObservationResult = EngineIncidentObservationResult;

/** Private persisted locator bytes with no publicly inspectable host field shape. */
export type SerializedProcessOperationsLocator = string;

export type ProcessIncidentObservationRequest = Readonly<{
  locator: SerializedProcessOperationsLocator;
  hostingProcessInstanceId: string;
}>;

export type ProcessIncidentOperationRequest = Omit<
  EngineIncidentOperationRequest,
  "temporalClient" | "locator"
> & Readonly<{ locator: SerializedProcessOperationsLocator }>;
export type ProcessIncidentOperationResult = Awaited<
  ReturnType<typeof submitEngineIncidentOperation>
>;

/** Interprets private addresses inside Product 1 and returns only closed engine facts. */
export class BpmnProcessOperationsGateway {
  readonly #temporalClient: EngineIncidentObservationRequest["temporalClient"];

  constructor(
    temporalClient: EngineIncidentObservationRequest["temporalClient"],
  ) {
    this.#temporalClient = temporalClient;
  }

  observeIncidents(
    request: ProcessIncidentObservationRequest,
  ): Promise<ProcessIncidentObservationResult> {
    return observeEngineProcessIncidents({
      temporalClient: this.#temporalClient,
      locator: parseEngineProcessLocator(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
    });
  }

  submitIncidentOperation(
    request: ProcessIncidentOperationRequest,
  ): Promise<ProcessIncidentOperationResult> {
    return submitEngineIncidentOperation({
      temporalClient: this.#temporalClient,
      locator: parseEngineProcessLocator(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
      stimulus: request.stimulus,
    });
  }
}
