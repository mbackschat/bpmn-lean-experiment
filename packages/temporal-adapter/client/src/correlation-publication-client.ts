/** Definition-scoped correlated Message publication with durable identity recovery. */
import type {
  CorrelatedMessageAddress,
  DeepReadonly,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  WorkflowUpdateFailedError,
} from "@temporalio/client";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  CorrelationPublicationAdmissionResultKind,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationStatusKind,
  CorrelationPublicationStoredResolutionKind,
  bpmnAdmitCorrelationPublicationUpdateName,
  bpmnCorrelationPublicationCapacityFailureType,
  bpmnCorrelationPublicationIdentityConflictFailureType,
  bpmnCorrelationPublicationInvalidFailureType,
  bpmnCorrelationPublicationStatusQueryName,
  correlationPublicationContentSha256,
  correlationPublicationUpdateId,
  productionCorrelationIngressConfiguration,
  requireCorrelationPublicationAdmissionResult,
  requireCorrelationPublicationCapacityFailure,
  requireCorrelationPublicationCommand,
  requireCorrelationPublicationStatus,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationPublicationCommand,
  CorrelationPublicationLedgerRecord,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationTarget,
} from "@bpmn-lean/temporal-protocol";

import {
  CorrelationIngressEnsureResultKind,
  ensureCorrelationIngress,
} from "./correlation-ingress-client.js";
import type {
  TemporalCorrelationIngressClient,
} from "./correlation-ingress-client.js";

const defaultOperationDeadlineMs = 5_000;
const resultPollMs = 20;

export type TemporalCorrelatedMessageClient = TemporalCorrelationIngressClient;

export enum TemporalCorrelatedMessagePublishResolutionKind {
  Semantic = "semantic",
  Capacity = "capacity",
  InfrastructureIndeterminate = "infrastructureIndeterminate",
}

export type TemporalCorrelatedMessagePublishRequest = DeepReadonly<{
  command: CorrelationPublicationCommand;
  taskQueue: string;
  deadlineMs?: number;
}>;

export type TemporalCorrelatedMessagePublishResolution =
  | DeepReadonly<{
      kind: TemporalCorrelatedMessagePublishResolutionKind.Semantic;
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: number;
      outcome:
        | { kind: CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch }
        | { kind: CorrelationPublicationSemanticOutcomeKind.RejectedAmbiguous }
        | {
            kind: CorrelationPublicationSemanticOutcomeKind.Committed;
            target: CorrelationPublicationTarget;
          };
    }>
  | DeepReadonly<{
      kind: TemporalCorrelatedMessagePublishResolutionKind.Capacity;
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: null;
      failure: {
        kind: "publicationQueue" | "publicationLedger";
        measure: "count" | "canonicalBytes";
        configuredBound: number;
        observedValue: number;
      };
    }>
  | DeepReadonly<{
      kind: TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate;
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: number | null;
      phase:
        | "ingressResolution"
        | "candidateFanout"
        | "targetDelivery"
        | "resultRecovery";
      target: null;
      failure:
        | { kind: "unconfirmed" }
        | {
            kind: "capacity";
            boundary:
              | "activityRequest"
              | "activityResult"
              | "queryResponse"
              | "continuation";
            configuredBound: number;
            observedValue: number;
          }
        | {
            kind: "runCapacity";
            configuredBound: number;
            observedValue: number;
          };
    }>
  | DeepReadonly<{
      kind: TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate;
      commandId: string;
      address: CorrelatedMessageAddress;
      ingressOrdinal: number | null;
      phase: "targetDelivery";
      target: CorrelationPublicationTarget;
      failure: { kind: "targetInconsistent" };
    }>;

export class BpmnCorrelatedMessageIngressInvalid extends Error {
  override readonly name = "BpmnCorrelatedMessageIngressInvalid";
}

export class BpmnCorrelatedMessageIdentityConflict extends Error {
  override readonly name = "BpmnCorrelatedMessageIdentityConflict";
}

/** Ensures one immutable ingress, recovers retained identity, and waits only for its reserved result. */
export async function publishTemporalCorrelatedMessage(
  client: TemporalCorrelatedMessageClient,
  request: TemporalCorrelatedMessagePublishRequest,
): Promise<TemporalCorrelatedMessagePublishResolution> {
  const command = snapshotCommand(request.command);
  const taskQueue = requireNonempty(request.taskQueue, "taskQueue");
  const deadline = Date.now() + requireDeadline(request.deadlineMs);
  const ensured = await ensureCorrelationIngress(client, {
    address: command.address,
    configuration: productionCorrelationIngressConfiguration,
    taskQueue,
  });
  if (ensured.kind === CorrelationIngressEnsureResultKind.Unavailable) {
    return indeterminate(command, "ingressResolution", null);
  }

  const handle = workflowClientOf(client).getHandle(ensured.workflowId);
  const initial = await queryStatus(handle, command, deadline);
  if (initial === null) {
    return indeterminate(command, "resultRecovery", null);
  }
  if (initial.kind === CorrelationPublicationStatusKind.IdentityConflict) {
    throw identityConflict(command.commandId);
  }
  if (initial.kind === CorrelationPublicationStatusKind.Accepted) {
    return resolveAccepted(handle, command, initial.record, deadline);
  }

  let admission: unknown;
  try {
    admission = await beforeDeadline(
      deadline,
      "Correlation publication Update",
      () => handle.executeUpdate(
        bpmnAdmitCorrelationPublicationUpdateName,
        {
          args: [command],
          updateId: correlationPublicationUpdateId(command),
        },
      ),
    );
  } catch (error: unknown) {
    const known = knownUpdateFailure(error, command);
    if (known !== null) {
      return known;
    }
    const recovered = await queryStatus(handle, command, deadline);
    if (recovered?.kind === CorrelationPublicationStatusKind.IdentityConflict) {
      throw identityConflict(command.commandId);
    }
    if (recovered?.kind === CorrelationPublicationStatusKind.Accepted) {
      return resolveAccepted(handle, command, recovered.record, deadline);
    }
    return indeterminate(command, "resultRecovery", null);
  }

  let acceptedAdmission;
  try {
    acceptedAdmission = requireCorrelationPublicationAdmissionResult(admission);
  } catch {
    return indeterminate(command, "resultRecovery", null);
  }
  if (acceptedAdmission.commandId !== command.commandId) {
    return indeterminate(command, "resultRecovery", null);
  }
  switch (acceptedAdmission.kind) {
    case CorrelationPublicationAdmissionResultKind.AddressQuarantined:
      return targetInconsistent(
        command,
        null,
        acceptedAdmission.target,
      );
    case CorrelationPublicationAdmissionResultKind.Admitted:
    case CorrelationPublicationAdmissionResultKind.Retained:
      if (acceptedAdmission.contentSha256 !==
        correlationPublicationContentSha256(command)) {
        return indeterminate(command, "resultRecovery", null);
      }
      return pollAccepted(
        handle,
        command,
        acceptedAdmission.ordinal,
        null,
        deadline,
      );
  }
}

async function resolveAccepted(
  handle: WorkflowHandle,
  command: CorrelationPublicationCommand,
  record: CorrelationPublicationLedgerRecord,
  deadline: number,
): Promise<TemporalCorrelatedMessagePublishResolution> {
  if (!recordMatches(command, record)) {
    return indeterminate(command, "resultRecovery", null);
  }
  if (record.phase !== CorrelationPublicationLedgerPhase.Settled) {
    return pollAccepted(handle, command, record.ordinal, record.target, deadline);
  }
  if (record.ordinal === null || record.resolution === null) {
    return indeterminate(command, "resultRecovery", null);
  }
  switch (record.resolution.kind) {
    case CorrelationPublicationStoredResolutionKind.Semantic:
      return {
        kind: TemporalCorrelatedMessagePublishResolutionKind.Semantic,
        commandId: command.commandId,
        address: command.address,
        ingressOrdinal: record.ordinal,
        outcome: record.resolution.outcome,
      };
    case CorrelationPublicationStoredResolutionKind.TargetInconsistent:
      return targetInconsistent(
        command,
        record.ordinal,
        record.resolution.target,
      );
  }
}

async function pollAccepted(
  handle: WorkflowHandle,
  command: CorrelationPublicationCommand,
  knownOrdinal: number | null,
  knownTarget: CorrelationPublicationTarget | null,
  deadline: number,
): Promise<TemporalCorrelatedMessagePublishResolution> {
  let ordinal = knownOrdinal;
  let target = knownTarget;
  let phase: "candidateFanout" | "targetDelivery" = target === null
    ? "candidateFanout"
    : "targetDelivery";
  while (Date.now() < deadline) {
    const status = await queryStatus(handle, command, deadline);
    if (status?.kind === CorrelationPublicationStatusKind.IdentityConflict) {
      throw identityConflict(command.commandId);
    }
    if (status === null || status.kind === CorrelationPublicationStatusKind.Absent) {
      return indeterminate(command, "resultRecovery", ordinal);
    }
    if (!recordMatches(command, status.record)) {
      return indeterminate(command, "resultRecovery", ordinal);
    }
    ordinal = status.record.ordinal;
    target = status.record.target;
    phase = target === null ? "candidateFanout" : "targetDelivery";
    if (status.record.phase === CorrelationPublicationLedgerPhase.Settled) {
      return resolveAccepted(handle, command, status.record, deadline);
    }
    await pollDelay(deadline);
  }
  return indeterminate(command, phase, ordinal);
}

async function queryStatus(
  handle: WorkflowHandle,
  command: CorrelationPublicationCommand,
  deadline: number,
) {
  try {
    const value = await beforeDeadline(
      deadline,
      "Correlation publication status Query",
      () => handle.query(bpmnCorrelationPublicationStatusQueryName, command),
    );
    const status = requireCorrelationPublicationStatus(value);
    const expectedSha256 = correlationPublicationContentSha256(command);
    switch (status.kind) {
      case CorrelationPublicationStatusKind.Absent:
        return status.commandId === command.commandId &&
            status.contentSha256 === expectedSha256
          ? status
          : null;
      case CorrelationPublicationStatusKind.Accepted:
        return recordMatches(command, status.record) ? status : null;
      case CorrelationPublicationStatusKind.IdentityConflict:
        return status.commandId === command.commandId &&
            status.requestedContentSha256 === expectedSha256
          ? status
          : null;
    }
  } catch {
    return null;
  }
}

function knownUpdateFailure(
  error: unknown,
  command: CorrelationPublicationCommand,
): TemporalCorrelatedMessagePublishResolution | null {
  const failure = applicationFailure(error);
  switch (failure?.type) {
    case bpmnCorrelationPublicationIdentityConflictFailureType:
      throw identityConflict(command.commandId);
    case bpmnCorrelationPublicationInvalidFailureType:
      throw new BpmnCorrelatedMessageIngressInvalid(
        `Correlation publication ${command.commandId} was rejected as invalid`,
      );
    case bpmnCorrelationPublicationCapacityFailureType:
      try {
        const capacity = requireCorrelationPublicationCapacityFailure(
          failure.details?.[0],
        );
        return {
          kind: TemporalCorrelatedMessagePublishResolutionKind.Capacity,
          commandId: command.commandId,
          address: command.address,
          ingressOrdinal: null,
          failure: capacity,
        };
      } catch {
        return indeterminate(command, "resultRecovery", null);
      }
    default:
      return null;
  }
}

function snapshotCommand(value: CorrelationPublicationCommand) {
  try {
    return structuredClone(requireCorrelationPublicationCommand(value));
  } catch {
    throw new BpmnCorrelatedMessageIngressInvalid(
      "Correlation publication command is malformed",
    );
  }
}

function recordMatches(
  command: CorrelationPublicationCommand,
  record: CorrelationPublicationLedgerRecord,
): boolean {
  return record.commandId === command.commandId &&
    record.contentSha256 === correlationPublicationContentSha256(command);
}

function indeterminate(
  command: CorrelationPublicationCommand,
  phase: "ingressResolution" | "candidateFanout" | "targetDelivery" | "resultRecovery",
  ingressOrdinal: number | null,
): TemporalCorrelatedMessagePublishResolution {
  return {
    kind: TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate,
    commandId: command.commandId,
    address: command.address,
    ingressOrdinal,
    phase,
    target: null,
    failure: { kind: "unconfirmed" },
  };
}

function targetInconsistent(
  command: CorrelationPublicationCommand,
  ingressOrdinal: number | null,
  target: CorrelationPublicationTarget,
): TemporalCorrelatedMessagePublishResolution {
  return {
    kind: TemporalCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate,
    commandId: command.commandId,
    address: command.address,
    ingressOrdinal,
    phase: "targetDelivery",
    target,
    failure: { kind: "targetInconsistent" },
  };
}

function applicationFailure(error: unknown): ApplicationFailure | null {
  return error instanceof WorkflowUpdateFailedError &&
      error.cause instanceof ApplicationFailure
    ? error.cause
    : null;
}

function identityConflict(commandId: string): BpmnCorrelatedMessageIdentityConflict {
  return new BpmnCorrelatedMessageIdentityConflict(
    `Correlation publication ${commandId} conflicts with retained content`,
  );
}

function workflowClientOf(client: TemporalCorrelatedMessageClient): WorkflowClient {
  const concrete = client as unknown as Readonly<{ workflow?: WorkflowClient }>;
  return concrete.workflow ?? client as unknown as WorkflowClient;
}

async function beforeDeadline<Value>(
  deadline: number,
  operation: string,
  invoke: () => Promise<Value>,
): Promise<Value> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`${operation} exceeded the client deadline`);
  }
  return withDeadline(invoke(), remaining, operation);
}

async function pollDelay(deadline: number): Promise<void> {
  const remaining = deadline - Date.now();
  if (remaining > 0) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(resultPollMs, remaining))
    );
  }
}

function requireDeadline(value: number | undefined): number {
  const deadline = value ?? defaultOperationDeadlineMs;
  if (!Number.isSafeInteger(deadline) || deadline < 1) {
    throw new TypeError("Correlation publication deadline must be a positive integer");
  }
  return deadline;
}

function requireNonempty(value: string, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
  return value;
}
