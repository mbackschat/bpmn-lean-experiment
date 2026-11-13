/** Product 2's representation-free gateway for current incident operations. */
import {
  EngineIncidentObservationStatus,
  EngineIncidentOperationKind,
  observeEngineProcessIncidents,
  parseEngineProcessLocator,
  submitEngineIncidentOperation,
  type EngineHost,
  type EngineOccurrenceId,
  type EngineOpenWait,
} from "@bpmn-lean/engine-api";
import type {
  PublicCancelIncidentProcessInteraction,
  PublicEffectIncident,
  PublicRetryIncidentInteraction,
} from "@bpmn-lean/platform-contracts";

import { occurrenceId } from "./gateway-context.js";
import { processCommandResult, type ProcessCommandResult } from "./process-command-result.js";

export const ProcessIncidentObservationStatus = EngineIncidentObservationStatus;

/** One open incident and the operations the engine accepts on it: Retry always, Cancel when cancellable. */
export type ProcessIncident = Readonly<{
  incident: PublicEffectIncident;
  interactions:
    | readonly [PublicRetryIncidentInteraction]
    | readonly [PublicRetryIncidentInteraction, PublicCancelIncidentProcessInteraction];
}>;

export type ProcessIncidentObservationResult =
  | Readonly<{ status: EngineIncidentObservationStatus.Observed; incidents: readonly ProcessIncident[] }>
  | Readonly<{
      status: EngineIncidentObservationStatus.Closed | EngineIncidentObservationStatus.Unknown |
        EngineIncidentObservationStatus.Unavailable;
    }>;

/** Private persisted locator bytes with no publicly inspectable host field shape. */
export type SerializedProcessOperationsLocator = string;

export type ProcessIncidentObservationRequest = Readonly<{
  locator: SerializedProcessOperationsLocator;
  hostingProcessInstanceId: string;
}>;

export type ProcessIncidentId = Readonly<{ effectId: EngineOccurrenceId; generation: number }>;

export type ProcessIncidentOperationStimulus =
  | Readonly<{ kind: "retryIncident"; commandId: string; incidentId: ProcessIncidentId }>
  | Readonly<{ kind: "cancelIncidentProcess"; commandId: string; processInstanceId: string; incidentId: ProcessIncidentId }>;

export type ProcessIncidentOperationRequest = ProcessIncidentObservationRequest & Readonly<{
  stimulus: ProcessIncidentOperationStimulus;
}>;

export type ProcessIncidentOperationResult = ProcessCommandResult;

/** The kernel's incident detail (`canonical-result.schema.json#/$defs/incidentDetail`). */
type IncidentDetail = Readonly<{
  effect: Readonly<{ protocol: string; operation: string; arguments: readonly unknown[] }>;
  generation: number;
  cancellable: boolean;
}>;

/**
 * The incident of one open incident wait. Product 2's incident carries no effect arguments, so an incident whose
 * failed effect had arguments is refused here rather than shown without them.
 */
export function processIncident(wait: EngineOpenWait, hostingProcessInstanceId: string): ProcessIncident {
  const detail = wait.detail as unknown as IncidentDetail;
  if (detail.effect.arguments.length > 0) {
    throw new TypeError(`The incident at ${wait.id.elementId} has effect arguments, which Product 2 cannot present`);
  }
  const incidentId = { effectId: occurrenceId(wait.id), generation: detail.generation };
  const retry: PublicRetryIncidentInteraction = { kind: "retryIncident", incidentId };
  return {
    incident: {
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: {
        id: occurrenceId(wait.id),
        descriptor: { protocol: detail.effect.protocol, operation: detail.effect.operation },
        arguments: [],
      },
    },
    interactions: detail.cancellable
      ? [retry, { kind: "cancelIncidentProcess", processInstanceId: hostingProcessInstanceId, incidentId }]
      : [retry],
  };
}

export class BpmnProcessOperationsGateway {
  readonly #host: EngineHost;

  constructor(host: EngineHost) {
    this.#host = host;
  }

  async observeIncidents(request: ProcessIncidentObservationRequest): Promise<ProcessIncidentObservationResult> {
    const result = await observeEngineProcessIncidents({
      host: this.#host,
      locator: parseEngineProcessLocator(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
    });
    return result.status === EngineIncidentObservationStatus.Observed
      ? {
          status: result.status,
          incidents: result.incidents.map((wait) => processIncident(wait, request.hostingProcessInstanceId)),
        }
      : result;
  }

  async submitIncidentOperation(request: ProcessIncidentOperationRequest): Promise<ProcessIncidentOperationResult> {
    const stimulus = request.stimulus;
    return processCommandResult(await submitEngineIncidentOperation({
      host: this.#host,
      locator: parseEngineProcessLocator(request.locator),
      hostingProcessInstanceId: request.hostingProcessInstanceId,
      operation: {
        kind: operationKind(stimulus),
        commandId: stimulus.commandId,
        incident: { occurrence: stimulus.incidentId.effectId, generation: stimulus.incidentId.generation },
      },
    }));
  }
}

function operationKind(stimulus: ProcessIncidentOperationStimulus): EngineIncidentOperationKind {
  switch (stimulus.kind) {
    case "retryIncident":
      return EngineIncidentOperationKind.RetryIncident;
    case "cancelIncidentProcess":
      return EngineIncidentOperationKind.CancelIncidentProcess;
  }
}
