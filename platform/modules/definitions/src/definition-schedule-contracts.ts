import type { DefinitionSourceOverlaySelection } from "@bpmn-lean/platform-engine-gateway";
import type { PublicSourceOverlayIdentity } from "@bpmn-lean/platform-contracts";
import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  DefinitionSourceIdentity,
  DefinitionStartCapabilities,
  DefinitionScheduledTimerStart,
  ExactArtifactStore,
} from "./contracts.js";
import type {
  ProcessWorkLocatorFactory,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstancePublicationService,
} from "./confirmed-process-instance-publication-service.js";

export const DefinitionScheduleState = {
  Creating: "creating",
  CreatingHost: "creatingHost",
  Scheduled: "scheduled",
  Cancelling: "cancelling",
  Started: "started",
  Refused: "refused",
  Missed: "missed",
  Cancelled: "cancelled",
} as const;

export type DefinitionScheduleState =
  typeof DefinitionScheduleState[keyof typeof DefinitionScheduleState];

export const DefinitionScheduleHostPhase = {
  Pending: "pending",
  /** The action ran and the engine has not answered its firing yet. */
  Firing: "firing",
  Started: "started",
  /** The action ran and the engine refused the occurrence. */
  Refused: "refused",
  Missed: "missed",
  IntegrityFailure: "integrityFailure",
} as const;

export type DefinitionScheduleReference = DefinitionReference & Readonly<{
  scheduleId: string;
}>;

export type PutDefinitionSchedule = DefinitionScheduleReference & Readonly<{
  /** The occurrence the schedule fires, a canonical UTC instant. */
  dueAt: string;
}>;

/**
 * `processInstanceId` is the engine's identity of the instance the occurrence starts, read from the engine's
 * occurrence listing before reservation, so one occurrence binds at most one schedule.
 */
export type DefinitionSchedulePrivateIdentity = Readonly<{
  processInstanceId: string;
  hostScheduleId: string;
}>;

export type DefinitionScheduleCancellationOrigin =
  | typeof DefinitionScheduleState.CreatingHost
  | typeof DefinitionScheduleState.Scheduled;

export type NewDefinitionScheduleRecord = Readonly<{
  reference: DefinitionScheduleReference;
  definition: DefinitionMetadata;
  timerStart: DefinitionScheduledTimerStart;
  dueAt: string;
  identity: DefinitionSchedulePrivateIdentity;
}>;

/** `processLocator` is set exactly in `started`, `refusalCode` (the engine's code) exactly in `refused`. */
export type DefinitionScheduleRecord = NewDefinitionScheduleRecord & Readonly<{
  state: DefinitionScheduleState;
  cleanupComplete: boolean;
  cancellationOrigin: DefinitionScheduleCancellationOrigin | null;
  processLocator: string | null;
  refusalCode: string | null;
}>;

export type DefinitionScheduleReservation = Readonly<{
  inserted: boolean;
  record: DefinitionScheduleRecord;
}>;

export type DefinitionScheduleTransition = Readonly<{
  state: DefinitionScheduleState;
  cancellationOrigin?: DefinitionScheduleCancellationOrigin | null;
  processLocator?: string | null;
  refusalCode?: string | null;
  cleanupComplete?: boolean;
}>;

/** Atomic persistence operations; every method completes before any host await. */
export interface DefinitionScheduleRepository {
  /**
   * Inserts the record, or returns the one its public identity already holds; throws
   * `DefinitionScheduleConflictError` when another schedule identity already holds its process-instance identity.
   */
  reserve(
    record: NewDefinitionScheduleRecord,
  ): Promise<DefinitionScheduleReservation>;
  get(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionScheduleRecord | null>;
  listForDefinition(
    reference: DefinitionReference,
  ): Promise<ReadonlyArray<DefinitionScheduleRecord>>;
  listForReconciliation(): Promise<ReadonlyArray<DefinitionScheduleRecord>>;
  compareAndSet(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleState,
    transition: DefinitionScheduleTransition,
  ): Promise<DefinitionScheduleRecord | null>;
  requestCancellation(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionScheduleRecord | null>;
  markCleanupComplete(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleState,
  ): Promise<DefinitionScheduleRecord | null>;
}

export type DefinitionScheduleValidationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
  sourceOverlay?: DefinitionSourceOverlaySelection | null;
}>;

export type AcceptedDefinitionScheduleValidation = Readonly<{
  status: "accepted";
  source: DefinitionSourceIdentity;
  processId: string;
  semanticProfile: string;
  startCapabilities: DefinitionStartCapabilities;
  sourceOverlay: PublicSourceOverlayIdentity | null;
}>;

export type RejectedDefinitionScheduleValidation = Readonly<{
  status: "rejected";
  evidence: string;
}>;

export type DefinitionScheduleValidationResult =
  | AcceptedDefinitionScheduleValidation
  | RejectedDefinitionScheduleValidation;

export type DefinitionTimerStartHostRequest = Readonly<{
  bytes: Uint8Array;
  sourceOverlay?: DefinitionSourceOverlaySelection | null;
  definition: DefinitionMetadata;
  timerStart: DefinitionScheduledTimerStart;
}>;

export type DefinitionScheduleHostRequest = DefinitionTimerStartHostRequest & Readonly<{
  dueAt: string;
  processInstanceId: string;
  hostScheduleId: string;
}>;

export type DefinitionTimerOccurrencesHostRequest = DefinitionTimerStartHostRequest & Readonly<{
  from: string;
  limit: number;
}>;

export type DefinitionTimerOccurrencesHostResult =
  | Readonly<{ kind: "listed"; occurrences: ReadonlyArray<Readonly<{ dueAt: string; processInstanceId: string }>> }>
  | Readonly<{ kind: "refused"; code: string; evidence: string }>
  | Readonly<{ kind: "integrityFailure"; evidence: string }>;

export type PendingDefinitionScheduleHostResult = Readonly<{
  phase: typeof DefinitionScheduleHostPhase.Pending | typeof DefinitionScheduleHostPhase.Firing;
  paused: boolean;
}>;

export type StartedDefinitionScheduleHostResult = Readonly<{
  phase: typeof DefinitionScheduleHostPhase.Started;
  processInstanceId: string;
  processLocator: string;
}>;

export type RefusedDefinitionScheduleHostResult = Readonly<{
  phase: typeof DefinitionScheduleHostPhase.Refused;
  code: string;
}>;

export type MissedDefinitionScheduleHostResult = Readonly<{
  phase: typeof DefinitionScheduleHostPhase.Missed;
}>;

export type IntegrityDefinitionScheduleHostResult = Readonly<{
  phase: typeof DefinitionScheduleHostPhase.IntegrityFailure;
  evidence: string;
}>;

export type DefinitionScheduleHostResult =
  | PendingDefinitionScheduleHostResult
  | StartedDefinitionScheduleHostResult
  | RefusedDefinitionScheduleHostResult
  | MissedDefinitionScheduleHostResult
  | IntegrityDefinitionScheduleHostResult;

/** Handle-free host capability consumed by the definition schedule lifecycle. */
export interface DefinitionScheduleHost {
  validateDefinition(
    request: DefinitionScheduleValidationRequest,
  ): Promise<DefinitionScheduleValidationResult>;
  occurrences(
    request: DefinitionTimerOccurrencesHostRequest,
  ): Promise<DefinitionTimerOccurrencesHostResult>;
  createOrCompare(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult>;
  inspect(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult>;
  pause(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult>;
  delete(request: DefinitionScheduleHostRequest): Promise<void>;
}

export type DefinitionScheduleIdentityGenerators = Readonly<{
  hostScheduleId: (reference: DefinitionScheduleReference) => string;
}>;

export type DefinitionScheduleBase = Readonly<{
  scheduleId: string;
  definition: DefinitionMetadata;
  timerStart: DefinitionScheduledTimerStart;
  dueAt: string;
}>;

export type DefinitionSchedule =
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleState.Scheduled;
      instance: null;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleState.Started;
      instance: Readonly<{
        processInstanceId: string;
        definition: DefinitionMetadata;
      }>;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleState.Refused;
      instance: null;
      refusal: string;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleState.Missed;
      instance: null;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleState.Cancelled;
      instance: null;
    }>);

/** The occurrences of one exact version's Timer start, due at or after the requested instant. */
export type DefinitionScheduleOccurrences = Readonly<{
  definition: DefinitionMetadata;
  timerStart: DefinitionScheduledTimerStart;
  occurrences: ReadonlyArray<Readonly<{ dueAt: string }>>;
}>;

export type PutDefinitionScheduleResult = Readonly<{
  created: boolean;
  schedule: DefinitionSchedule;
}>;

export class DefinitionScheduleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitionScheduleConflictError";
  }
}

export class DefinitionScheduleIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitionScheduleIntegrityError";
  }
}

export class DefinitionScheduleNotFoundError extends Error {
  readonly reference: Readonly<{ processId: string; version: number }>;

  constructor(reference: Readonly<{ processId: string; version: number }>) {
    super(`definition ${reference.processId}/${reference.version} was not found`);
    this.name = "DefinitionScheduleNotFoundError";
    this.reference = { ...reference };
  }
}

export class DefinitionScheduleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitionScheduleValidationError";
  }
}

export type DefinitionScheduleServiceDependencies = Readonly<{
  artifacts: ExactArtifactStore;
  definitions: DefinitionRepository;
  schedules: DefinitionScheduleRepository;
  host: DefinitionScheduleHost;
  identities: DefinitionScheduleIdentityGenerators;
  now: () => number;
  confirmedInstances: ConfirmedProcessInstancePublicationService;
  locators: ProcessWorkLocatorFactory;
}>;
