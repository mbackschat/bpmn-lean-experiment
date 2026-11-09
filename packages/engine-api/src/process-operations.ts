/**
 * Incident operations: the open incident waits of a process, and Retry or Cancel as the kernel's `retryIncident` and
 * `cancelIncidentProcess` commands on the failed effect's occurrence.
 *
 * An operation names the incident by occurrence and generation, and the command carries both: the kernel rejects a
 * generation that is not the open incident's (`incident-generation-stale`) in the same step that would apply the
 * command, so no check here can go stale between a read and the command's arrival.
 */
import { requireWireString, type EngineOccurrenceId } from "./common.js";
import type { EngineHost } from "./host.js";
import {
  ObservedKind,
  closed,
  observeProcess,
  requireOccurrence,
  submitCommand,
  waitsWithDetail,
  type EngineCommandResult,
  type EngineOpenWait,
} from "./process-observation.js";
import { engineProcessLocatorWorkflowId, parseEngineProcessLocator, type EngineProcessLocator } from "./process-locator.js";

/** The canonical result's detail form of an incident wait. */
const incidentDetail = "incident";

export enum EngineIncidentObservationStatus {
  Observed = "observed",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type EngineIncidentObservationResult =
  | Readonly<{ status: EngineIncidentObservationStatus.Observed; incidents: readonly EngineOpenWait[] }>
  | Readonly<{
      status: EngineIncidentObservationStatus.Closed | EngineIncidentObservationStatus.Unknown |
        EngineIncidentObservationStatus.Unavailable;
    }>;

export type EngineIncidentObservationRequest = Readonly<{
  host: EngineHost;
  locator: EngineProcessLocator;
  hostingProcessInstanceId: string;
}>;

export enum EngineIncidentOperationKind {
  RetryIncident = "retryIncident",
  CancelIncidentProcess = "cancelIncidentProcess",
}

export type EngineIncidentId = Readonly<{ occurrence: EngineOccurrenceId; generation: number }>;

export type EngineIncidentOperation = Readonly<{
  kind: EngineIncidentOperationKind;
  commandId: string;
  incident: EngineIncidentId;
}>;

export type EngineIncidentOperationRequest = EngineIncidentObservationRequest & Readonly<{ operation: EngineIncidentOperation }>;

export async function observeEngineProcessIncidents(
  request: EngineIncidentObservationRequest,
): Promise<EngineIncidentObservationResult> {
  const observed = await observeProcess(request.host, parseEngineProcessLocator(request.locator), request.hostingProcessInstanceId);
  switch (observed.kind) {
    case ObservedKind.Running:
      return { status: EngineIncidentObservationStatus.Observed, incidents: waitsWithDetail(observed.state, incidentDetail) };
    case ObservedKind.Closed:
      return { status: EngineIncidentObservationStatus.Closed };
    case ObservedKind.Unknown:
      return { status: EngineIncidentObservationStatus.Unknown };
    case ObservedKind.Unavailable:
      return { status: EngineIncidentObservationStatus.Unavailable };
  }
}

/** Submits Retry or Cancel for the named incident generation; the kernel decides whether it is still open. */
export async function submitEngineIncidentOperation(request: EngineIncidentOperationRequest): Promise<EngineCommandResult> {
  const locator = parseEngineProcessLocator(request.locator);
  const commandId = requireWireString(request.operation.commandId, "commandId");
  const occurrence = requireOccurrence(request.operation.incident.occurrence, "incident.occurrence");
  const generation = request.operation.incident.generation;
  if (!Number.isSafeInteger(generation) || generation < 1) throw new RangeError("incident.generation must be a positive safe integer");
  const observed = await observeProcess(request.host, locator, request.hostingProcessInstanceId);
  if (observed.kind === ObservedKind.Closed) {
    return closed(request.host, engineProcessLocatorWorkflowId(locator), commandId, request.hostingProcessInstanceId);
  }
  if (observed.kind !== ObservedKind.Running) throw new Error(`The process behind the locator is ${observed.kind}.`);
  return submitCommand(request.host, locator, request.hostingProcessInstanceId,
    { kind: "command", commandId, occurrence, action: { kind: request.operation.kind, generation } });
}
