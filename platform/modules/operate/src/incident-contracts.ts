import type {
  IncidentActionRequest,
  IncidentActionResult,
  IncidentAuditEvent,
  IncidentAuditOutcome,
  PublicCancelIncidentProcessInteraction,
  PublicEffectIncident,
  PublicEffectIncidentId,
  PublicEffectOccurrenceId,
  PublicIncident,
  PublicIncidentSnapshot,
  PublicProcessInstanceIdentity,
  PublicRetryIncidentInteraction,
} from "@bpmn-lean/platform-contracts";
import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

export type {
  IncidentActionRequest,
  IncidentActionResult,
  IncidentAuditEvent,
  IncidentAuditOutcome,
};

export type ConfirmedProcessOperationsPublication = Readonly<{
  instance: PublicProcessInstanceIdentity;
  locator: string;
}>;

export type OperateProcessObservation = "active" | "closed" | "indeterminate";

export type OperateProcessRegistration = ConfirmedProcessOperationsPublication & Readonly<{
  ordinal: number;
  observation: OperateProcessObservation;
}>;

export type IncidentEffectOccurrenceId = PublicEffectOccurrenceId;
export type IncidentId = PublicEffectIncidentId;
export type EffectIncident = PublicEffectIncident;
export type RetryIncidentInteraction = PublicRetryIncidentInteraction;
export type CancelIncidentProcessInteraction = PublicCancelIncidentProcessInteraction;

export type IncidentPublishedOperations = Readonly<{
  incident: EffectIncident;
  interactions:
    | readonly [RetryIncidentInteraction]
    | readonly [RetryIncidentInteraction, CancelIncidentProcessInteraction];
}>;

export type CurrentIncident = PublicIncident;
export type IncidentSnapshot = PublicIncidentSnapshot;

export type IncidentObservationResult =
  | Readonly<{ status: "observed"; incidents: readonly IncidentPublishedOperations[] }>
  | Readonly<{ status: "closed" | "unknown" | "unavailable" }>;

export interface IncidentOperationsGateway {
  observeIncidents(request: Readonly<{
    locator: string;
    hostingProcessInstanceId: string;
  }>): Promise<unknown>;
  submitIncidentOperation(request: IncidentOperationSubmission): Promise<unknown>;
}

export type IncidentOperationStimulus =
  | Readonly<{
      kind: "retryIncident";
      commandId: string;
      incidentId: IncidentId;
    }>
  | Readonly<{
      kind: "cancelIncidentProcess";
      commandId: string;
      processInstanceId: string;
      incidentId: IncidentId;
    }>;

export type IncidentOperationSubmission = Readonly<{
  locator: string;
  hostingProcessInstanceId: string;
  stimulus: IncidentOperationStimulus;
}>;

export type IncidentActionState =
  | "reserved"
  | "submitting"
  | "committed"
  | "rejected"
  | "indeterminate";

export type IncidentActionBinding = Readonly<{
  actionId: string;
  actorId: string;
  hostingInstance: PublicProcessInstanceIdentity;
  locator: string;
  incident: EffectIncident;
  interaction: IncidentActionRequest;
}>;

export type StoredIncidentAction = Readonly<{
  binding: IncidentActionBinding;
  state: IncidentActionState;
  result: IncidentActionResult | null;
}>;

export type IncidentAuditEventSeed = Omit<IncidentAuditEvent, "eventId" | "recordedAt">;

export interface IncidentAuditEventFactory {
  create(seed: IncidentAuditEventSeed): IncidentAuditEvent;
}

export type IncidentAuditOutboxItem = Readonly<{
  ordinal: number;
  event: IncidentAuditEvent;
}>;

export type IncidentActionReservationResult =
  | Readonly<{ kind: "reserved" | "retained"; action: StoredIncidentAction }>
  | Readonly<{ kind: "forbidden" | "conflict" }>;

export type IncidentActionSubmissionResult =
  | Readonly<{ kind: "acquired" | "retained"; action: StoredIncidentAction }>
  | Readonly<{ kind: "conflict" }>;

export type IncidentActionOutcomeResult =
  | Readonly<{ kind: "recorded" | "retained"; action: StoredIncidentAction }>
  | Readonly<{ kind: "conflict" }>;

export interface IncidentActionRepository {
  get(actionId: string): Promise<StoredIncidentAction | null>;
  getReservedAuditDelivery(
    binding: IncidentActionBinding,
  ): Promise<Readonly<{ kind: "pending" | "acknowledged" }>>;
  reserve(
    binding: IncidentActionBinding,
    audit: IncidentAuditEvent,
  ): Promise<IncidentActionReservationResult>;
  beginSubmission(
    actionId: string,
    binding: IncidentActionBinding,
  ): Promise<IncidentActionSubmissionResult>;
  recordOutcome(
    binding: IncidentActionBinding,
    result: IncidentActionResult,
    audit: IncidentAuditEvent,
  ): Promise<IncidentActionOutcomeResult>;
  listReconciliableActions(): Promise<ReadonlyArray<StoredIncidentAction>>;
  listUndeliveredAuditEvents(limit?: number): Promise<ReadonlyArray<IncidentAuditOutboxItem>>;
  acknowledgeAuditEvent(eventId: string): Promise<void>;
}

/** Applies lease-fenced incident-action transitions through the caller's transaction. */
export interface IncidentActionRecoveryRepository {
  applyRecoverySubmission(
    session: PostgresqlSession,
    expected: StoredIncidentAction,
  ): Promise<void>;
  applyRecoveryOutcome(
    session: PostgresqlSession,
    expected: StoredIncidentAction,
    result: IncidentActionResult,
    audit: IncidentAuditEvent,
  ): Promise<void>;
}

export const maximumIncidentAuditDeliveryBatchSize = 1_000;

export function requireIncidentAuditDeliveryLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumIncidentAuditDeliveryBatchSize) {
    throw new RangeError(
      `Incident audit delivery limit must be an integer from 1 through ${maximumIncidentAuditDeliveryBatchSize}`,
    );
  }
  return limit;
}

export type AuthorizedIncidentActor = Readonly<{ actorId: string }>;

export type IncidentMutationResult =
  | Readonly<{ kind: "result"; result: IncidentActionResult }>
  | Readonly<{ kind: "forbidden" | "conflict" }>;

export class IncidentSnapshotUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("The current incident snapshot is unavailable.", { cause });
    this.name = "IncidentSnapshotUnavailableError";
  }
}

export class OperateIncidentIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperateIncidentIntegrityError";
  }
}

export class OperateIncidentStoredValueError extends Error {
  constructor(cause: unknown) {
    super("stored Operate incident value is invalid", { cause });
    this.name = "OperateIncidentStoredValueError";
  }
}
