/** Exact current incident observation and content-bound actions at one hosting Workflow. */
import {
  ProcessStatus,
  StimulusKind,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  RetryIncidentStimulus,
} from "@bpmn-lean/semantic-core";
import { WorkflowNotFoundError } from "@temporalio/client";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  bpmnIncidentOperationsQueryName,
  decodeWorkflowTerminalResult,
  requireTemporalIncidentOperationsSnapshot,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";

export type {
  ProcessCommandResult,
  TemporalIncidentOperationsIncident,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ProcessCommandResult,
  TemporalIncidentOperationsIncident,
} from "@bpmn-lean/temporal-protocol";

import type {
  TemporalDefinitionStartClient,
} from "./definition-start-client.js";
import {
  submitIncidentProcessCancellationAtWorkflowId,
  submitIncidentRetryAtWorkflowId,
} from "./incident-client.js";

const operationDeadlineMs = 5_000;

export type TemporalProcessOperationsClient = TemporalDefinitionStartClient;

export enum TemporalProcessOperationsObservationStatus {
  Observed = "observed",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type TemporalProcessOperationsObservationResult =
  | Readonly<{
      status: TemporalProcessOperationsObservationStatus.Observed;
      incidents: readonly TemporalIncidentOperationsIncident[];
    }>
  | Readonly<{
      status:
        | TemporalProcessOperationsObservationStatus.Closed
        | TemporalProcessOperationsObservationStatus.Unknown
        | TemporalProcessOperationsObservationStatus.Unavailable;
    }>;

export type TemporalIncidentOperationStimulus =
  | RetryIncidentStimulus
  | CancelIncidentProcessStimulus;

/** Queries and strictly validates the exact current incident snapshot at the supplied address. */
export async function observeTemporalProcessIncidents(
  client: TemporalProcessOperationsClient,
  workflowId: string,
  hostingProcessInstanceId: string,
): Promise<TemporalProcessOperationsObservationResult> {
  const snapshot = snapshotAddress(workflowId, hostingProcessInstanceId);
  const handle = workflowClientOf(client).getHandle<BpmnProcessWorkflow>(
    snapshot.workflowId,
  );
  try {
    const observation = requireTemporalIncidentOperationsSnapshot(
      await withDeadline(
        handle.query<unknown>(bpmnIncidentOperationsQueryName),
        operationDeadlineMs,
        "incident operations Query",
      ),
    );
    if (observation === null) {
      return { status: TemporalProcessOperationsObservationStatus.Unavailable };
    }
    if (observation.instanceId !== snapshot.hostingProcessInstanceId) {
      return { status: TemporalProcessOperationsObservationStatus.Unavailable };
    }
    switch (observation.status) {
      case ProcessStatus.Running:
        return {
          status: TemporalProcessOperationsObservationStatus.Observed,
          incidents: structuredClone(observation.incidents),
        };
      case ProcessStatus.Completed:
      case ProcessStatus.Cancelled:
      case ProcessStatus.Failed:
        return await corroborateTerminalObservation(
          handle,
          snapshot.hostingProcessInstanceId,
          observation.status,
        );
      default:
        return assertNever(observation);
    }
  } catch (error: unknown) {
    if (error instanceof WorkflowNotFoundError) {
      return resolveObservationAbsence(
        handle,
        snapshot.hostingProcessInstanceId,
      );
    }
    return { status: TemporalProcessOperationsObservationStatus.Unavailable };
  }
}

/** Submits one exact published Retry or Cancel stimulus at the same retained address. */
export function submitTemporalIncidentOperation(
  client: TemporalProcessOperationsClient,
  workflowId: string,
  hostingProcessInstanceId: string,
  stimulus: TemporalIncidentOperationStimulus,
): Promise<ProcessCommandResult> {
  const snapshot = snapshotAddress(workflowId, hostingProcessInstanceId);
  switch (stimulus.kind) {
    case StimulusKind.RetryIncident:
      return submitIncidentRetryAtWorkflowId(
        workflowClientOf(client),
        snapshot.workflowId,
        snapshot.hostingProcessInstanceId,
        structuredClone(stimulus),
      );
    case StimulusKind.CancelIncidentProcess:
      return submitIncidentProcessCancellationAtWorkflowId(
        workflowClientOf(client),
        snapshot.workflowId,
        snapshot.hostingProcessInstanceId,
        structuredClone(stimulus),
      );
    default:
      return assertNever(stimulus);
  }
}

async function corroborateTerminalObservation(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  hostingProcessInstanceId: string,
  status:
    | ProcessStatus.Completed
    | ProcessStatus.Cancelled
    | ProcessStatus.Failed,
): Promise<TemporalProcessOperationsObservationResult> {
  try {
    const { receipt } = decodeWorkflowTerminalResult(await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "retained terminal Process result",
    ));
    return receipt.processInstanceId === hostingProcessInstanceId &&
        receipt.finalState.status === status
      ? { status: TemporalProcessOperationsObservationStatus.Closed }
      : { status: TemporalProcessOperationsObservationStatus.Unavailable };
  } catch {
    return { status: TemporalProcessOperationsObservationStatus.Unavailable };
  }
}

async function resolveObservationAbsence(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  hostingProcessInstanceId: string,
): Promise<TemporalProcessOperationsObservationResult> {
  try {
    const { receipt } = decodeWorkflowTerminalResult(await withDeadline(
      handle.result(),
      operationDeadlineMs,
      "retained terminal Process result",
    ));
    return receipt.processInstanceId === hostingProcessInstanceId
      ? { status: TemporalProcessOperationsObservationStatus.Closed }
      : { status: TemporalProcessOperationsObservationStatus.Unavailable };
  } catch (error: unknown) {
    return error instanceof WorkflowNotFoundError
      ? { status: TemporalProcessOperationsObservationStatus.Unknown }
      : { status: TemporalProcessOperationsObservationStatus.Unavailable };
  }
}

function snapshotAddress(
  workflowId: string,
  hostingProcessInstanceId: string,
): Readonly<{ workflowId: string; hostingProcessInstanceId: string }> {
  requireNonempty(workflowId, "workflowId");
  requireNonempty(hostingProcessInstanceId, "hostingProcessInstanceId");
  return { workflowId, hostingProcessInstanceId };
}

function workflowClientOf(client: TemporalProcessOperationsClient): WorkflowClient {
  const concrete = client as unknown as Readonly<{ workflow?: WorkflowClient }>;
  return concrete.workflow ?? client as unknown as WorkflowClient;
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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported incident operation: ${String(value)}`);
}
