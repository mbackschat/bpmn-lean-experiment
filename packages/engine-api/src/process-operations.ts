/** Product 1 current-incident observation and commands behind one opaque Process locator. */
import {
  StimulusKind,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import {
  TemporalProcessOperationsObservationStatus,
  observeTemporalProcessIncidents,
  submitTemporalIncidentOperation,
} from "@bpmn-lean/temporal-client/process-operations";
import type {
  ProcessCommandResult,
  TemporalIncidentOperationsIncident,
  TemporalIncidentOperationStimulus,
  TemporalProcessOperationsClient,
} from "@bpmn-lean/temporal-client/process-operations";

import {
  engineProcessWorkflowIdFromLocator,
  parseEngineProcessLocator,
} from "./process-locator.js";
import type { EngineProcessLocator } from "./process-locator.js";

export const EngineIncidentOperationKind = {
  RetryIncident: StimulusKind.RetryIncident,
  CancelIncidentProcess: StimulusKind.CancelIncidentProcess,
} as const;

export enum EngineIncidentObservationStatus {
  Observed = "observed",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type EngineIncidentObservationResult =
  | Readonly<{
      status: EngineIncidentObservationStatus.Observed;
      incidents: readonly TemporalIncidentOperationsIncident[];
    }>
  | Readonly<{
      status:
        | EngineIncidentObservationStatus.Closed
        | EngineIncidentObservationStatus.Unknown
        | EngineIncidentObservationStatus.Unavailable;
    }>;

export type EngineIncidentObservationRequest = Readonly<{
  temporalClient: TemporalProcessOperationsClient;
  locator: EngineProcessLocator;
  hostingProcessInstanceId: string;
}>;

export type EngineIncidentOperationRequest =
  EngineIncidentObservationRequest & Readonly<{
    stimulus: TemporalIncidentOperationStimulus;
  }>;

/** Reads the exact committed incident publication without exposing host addressing. */
export async function observeEngineProcessIncidents(
  request: EngineIncidentObservationRequest,
): Promise<EngineIncidentObservationResult> {
  const snapshot = snapshotRequest(request);
  const observation = await observeTemporalProcessIncidents(
    snapshot.temporalClient,
    engineProcessWorkflowIdFromLocator(snapshot.locator),
    snapshot.hostingProcessInstanceId,
  );
  switch (observation.status) {
    case TemporalProcessOperationsObservationStatus.Observed:
      return {
        status: EngineIncidentObservationStatus.Observed,
        incidents: observation.incidents,
      };
    case TemporalProcessOperationsObservationStatus.Closed:
      return { status: EngineIncidentObservationStatus.Closed };
    case TemporalProcessOperationsObservationStatus.Unknown:
      return { status: EngineIncidentObservationStatus.Unknown };
    case TemporalProcessOperationsObservationStatus.Unavailable:
      return { status: EngineIncidentObservationStatus.Unavailable };
  }
}

/** Submits one exact content-bound Retry or Cancel through the private locator. */
export function submitEngineIncidentOperation(
  request: EngineIncidentOperationRequest,
): Promise<ProcessCommandResult> {
  const snapshot = snapshotRequest(request);
  return submitTemporalIncidentOperation(
    snapshot.temporalClient,
    engineProcessWorkflowIdFromLocator(snapshot.locator),
    snapshot.hostingProcessInstanceId,
    request.stimulus,
  );
}

function snapshotRequest(
  request: EngineIncidentObservationRequest,
): EngineIncidentObservationRequest {
  const locator = parseEngineProcessLocator(request.locator);
  requireNonempty(request.hostingProcessInstanceId, "hostingProcessInstanceId");
  return {
    temporalClient: request.temporalClient,
    locator,
    hostingProcessInstanceId: request.hostingProcessInstanceId,
  };
}

function requireNonempty(value: string, name: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !isWellFormedWireString(value)
  ) {
    throw new TypeError(`${name} must be a nonempty well-formed Unicode string`);
  }
}
