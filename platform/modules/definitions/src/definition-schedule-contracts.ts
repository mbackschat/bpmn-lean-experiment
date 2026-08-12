import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  DefinitionSourceIdentity,
  DefinitionStartCapabilities,
  DefinitionTimerStartCapability,
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
  Missed: "missed",
  Cancelled: "cancelled",
} as const;

export type DefinitionScheduleState =
  typeof DefinitionScheduleState[keyof typeof DefinitionScheduleState];

export const DefinitionScheduleHostPhase = {
  Pending: "pending",
  Started: "started",
  Missed: "missed",
  IntegrityFailure: "integrityFailure",
} as const;

export type DefinitionScheduleReference = DefinitionReference & Readonly<{
  scheduleId: string;
}>;

export type PutDefinitionSchedule = DefinitionScheduleReference & Readonly<{
  activationAt: string;
}>;

export type DefinitionSchedulePrivateIdentity = Readonly<{
  processInstanceId: string;
  hostScheduleId: string;
  configuredWorkflowIdBase: string;
}>;

export type DefinitionScheduleCancellationOrigin =
  | typeof DefinitionScheduleState.CreatingHost
  | typeof DefinitionScheduleState.Scheduled;

export type NewDefinitionScheduleRecord = Readonly<{
  reference: DefinitionScheduleReference;
  definition: DefinitionMetadata;
  timerStart: DefinitionTimerStartCapability;
  activationAt: string;
  dueAt: string;
  identity: DefinitionSchedulePrivateIdentity;
}>;

export type DefinitionScheduleRecord = NewDefinitionScheduleRecord & Readonly<{
  state: DefinitionScheduleState;
  cleanupComplete: boolean;
  cancellationOrigin: DefinitionScheduleCancellationOrigin | null;
  executionWorkflowId: string | null;
  firstRunId: string | null;
}>;

export type DefinitionScheduleReservation = Readonly<{
  inserted: boolean;
  record: DefinitionScheduleRecord;
}>;

export type DefinitionScheduleTransition = Readonly<{
  state: DefinitionScheduleState;
  cancellationOrigin?: DefinitionScheduleCancellationOrigin | null;
  executionWorkflowId?: string | null;
  firstRunId?: string | null;
  cleanupComplete?: boolean;
}>;

/** Atomic persistence operations; every method completes before any host await. */
export interface DefinitionScheduleRepository {
  reserve(record: NewDefinitionScheduleRecord): DefinitionScheduleReservation;
  get(reference: DefinitionScheduleReference): DefinitionScheduleRecord | null;
  listForDefinition(reference: DefinitionReference): ReadonlyArray<DefinitionScheduleRecord>;
  listForReconciliation(): ReadonlyArray<DefinitionScheduleRecord>;
  compareAndSet(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleState,
    transition: DefinitionScheduleTransition,
  ): DefinitionScheduleRecord | null;
  requestCancellation(
    reference: DefinitionScheduleReference,
  ): DefinitionScheduleRecord | null;
  markCleanupComplete(
    reference: DefinitionScheduleReference,
    expected: DefinitionScheduleState,
  ): DefinitionScheduleRecord | null;
}

export type DefinitionScheduleValidationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
}>;

export type AcceptedDefinitionScheduleValidation = Readonly<{
  status: "accepted";
  source: DefinitionSourceIdentity;
  processId: string;
  semanticProfile: string;
  startCapabilities: DefinitionStartCapabilities;
}>;

export type RejectedDefinitionScheduleValidation = Readonly<{
  status: "rejected";
  evidence: string;
}>;

export type DefinitionScheduleValidationResult =
  | AcceptedDefinitionScheduleValidation
  | RejectedDefinitionScheduleValidation;

export type DefinitionScheduleHostRequest = Readonly<{
  bytes: Uint8Array;
  definition: DefinitionMetadata;
  timerStart: DefinitionTimerStartCapability;
  activationAt: string;
  dueAt: string;
  processInstanceId: string;
  hostScheduleId: string;
  configuredWorkflowIdBase: string;
}>;

export type PendingDefinitionScheduleHostResult = Readonly<{
  phase: typeof DefinitionScheduleHostPhase.Pending;
  paused: boolean;
}>;

export type StartedDefinitionScheduleHostResult = Readonly<{
  phase: typeof DefinitionScheduleHostPhase.Started;
  executionWorkflowId: string;
  firstRunId: string;
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
  | MissedDefinitionScheduleHostResult
  | IntegrityDefinitionScheduleHostResult;

/** Handle-free host capability consumed by the definition schedule lifecycle. */
export interface DefinitionScheduleHost {
  validateDefinition(
    request: DefinitionScheduleValidationRequest,
  ): Promise<DefinitionScheduleValidationResult>;
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
  processInstanceId: () => string;
  hostScheduleId: (reference: DefinitionScheduleReference) => string;
  configuredWorkflowIdBase: (processInstanceId: string) => string;
}>;

export type DefinitionScheduleBase = Readonly<{
  scheduleId: string;
  definition: DefinitionMetadata;
  timerStart: DefinitionTimerStartCapability;
  activationAt: string;
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
      status: typeof DefinitionScheduleState.Missed;
      instance: null;
    }>)
  | (DefinitionScheduleBase & Readonly<{
      status: typeof DefinitionScheduleState.Cancelled;
      instance: null;
    }>);

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
