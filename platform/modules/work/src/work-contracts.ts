import type { DeepReadonly } from "@bpmn-lean/contract-types";
import type {
  PublicProcessInstanceIdentity,
  PublicWorkTaskId,
  WorkAuditEvent,
  WorkClaimResult,
  WorkCompletionResult,
  WorkReleaseResult,
} from "@bpmn-lean/platform-contracts";

export type ConfirmedProcessWorkPublication = DeepReadonly<{
  instance: PublicProcessInstanceIdentity;
  locator: string;
}>;

export type WorkProcessObservation = "active" | "closed" | "indeterminate";

export type WorkProcessRegistration = ConfirmedProcessWorkPublication & DeepReadonly<{
  observation: WorkProcessObservation;
}>;

/** A task occurrence stays paired with the hosting Process that supplied it. */
export type WorkTaskReference = DeepReadonly<{
  hostingProcessInstanceId: string;
  taskId: PublicWorkTaskId;
}>;

export type WorkClaimSnapshot = DeepReadonly<{
  claimGeneration: number;
  claim: null | { actorId: string; generation: number };
}>;

export type WorkClaimTransitionInput = DeepReadonly<{
  actionId: string;
  actorId: string;
  task: WorkTaskReference;
  expectedGeneration: number;
  audit: {
    claimed: WorkAuditEvent;
    idempotent: WorkAuditEvent;
    conflict: WorkAuditEvent;
  };
}>;

export type WorkClaimTransitionResult =
  | DeepReadonly<{ kind: "claimed"; result: WorkClaimResult }>
  | DeepReadonly<{ kind: "idempotent"; result: WorkClaimResult }>
  | DeepReadonly<{ kind: "conflict" }>;

export type StoredWorkClaimReleaseAction =
  | DeepReadonly<{
      binding: {
        actionId: string;
        actorId: string;
        task: WorkTaskReference;
        kind: "claim";
        expectedGeneration: number;
      };
      result: WorkClaimResult;
    }>
  | DeepReadonly<{
      binding: {
        actionId: string;
        actorId: string;
        task: WorkTaskReference;
        kind: "release";
        generation: number;
      };
      result: WorkReleaseResult;
    }>;

export type WorkReleaseTransitionInput = DeepReadonly<{
  actionId: string;
  actorId: string;
  task: WorkTaskReference;
  generation: number;
  audit: {
    released: WorkAuditEvent;
    idempotent: WorkAuditEvent;
    conflict: WorkAuditEvent;
  };
}>;

export type WorkReleaseTransitionResult =
  | DeepReadonly<{ kind: "released"; result: WorkReleaseResult }>
  | DeepReadonly<{ kind: "idempotent"; result: WorkReleaseResult }>
  | DeepReadonly<{ kind: "conflict" }>
  | DeepReadonly<{ kind: "notFound" }>;

export type WorkSubmittedField =
  | DeepReadonly<{
      key: string;
      declaredType: "string";
      value: { kind: "string"; value: string };
    }>
  | DeepReadonly<{
      key: string;
      declaredType: "boolean";
      value: { kind: "boolean"; value: boolean };
    }>;

export type WorkCompletionBinding = DeepReadonly<{
  actionId: string;
  actorId: string;
  task: WorkTaskReference;
  claimGeneration: number;
  submittedField: WorkSubmittedField;
}>;

export type WorkCompletionState =
  | "reserved"
  | "submitting"
  | "committed"
  | "rejected"
  | "indeterminate";

export type StoredWorkCompletionAction = DeepReadonly<{
  binding: WorkCompletionBinding;
  state: WorkCompletionState;
  result: WorkCompletionResult | null;
}>;

export type WorkCompletionReservationInput = DeepReadonly<{
  binding: WorkCompletionBinding;
  audit: WorkAuditEvent;
}>;

export type WorkCompletionReservationResult =
  | DeepReadonly<{ kind: "reserved"; action: StoredWorkCompletionAction }>
  | DeepReadonly<{ kind: "retained"; action: StoredWorkCompletionAction }>
  | DeepReadonly<{ kind: "conflict" }>
  | DeepReadonly<{ kind: "notFound" }>;

export type WorkCompletionSubmissionResult =
  | DeepReadonly<{ kind: "acquired"; action: StoredWorkCompletionAction }>
  | DeepReadonly<{ kind: "retained"; action: StoredWorkCompletionAction }>
  | DeepReadonly<{ kind: "conflict" }>;

export type WorkCompletionOutcome =
  | DeepReadonly<{ kind: "committed" }>
  | DeepReadonly<{
      kind: "semanticRejected";
      outcome: "rolledBack" | "rejected" | "semanticFailure" | "unsupported";
    }>
  | DeepReadonly<{ kind: "processClosed" }>
  | DeepReadonly<{ kind: "indeterminate" }>;

export type WorkCompletionOutcomeInput = DeepReadonly<{
  binding: WorkCompletionBinding;
  outcome: WorkCompletionOutcome;
  audit: WorkAuditEvent;
}>;

export type WorkCompletionOutcomeResult =
  | DeepReadonly<{ kind: "recorded"; action: StoredWorkCompletionAction }>
  | DeepReadonly<{ kind: "retained"; action: StoredWorkCompletionAction }>
  | DeepReadonly<{ kind: "conflict" }>;

export type WorkAuditOutboxItem = DeepReadonly<{
  ordinal: number;
  event: WorkAuditEvent;
}>;

export class WorkRepositoryIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkRepositoryIntegrityError";
  }
}

export class WorkRepositoryStoredValueError extends Error {
  constructor(cause: unknown) {
    super("stored Work repository value is invalid", { cause });
    this.name = "WorkRepositoryStoredValueError";
  }
}

export class WorkSchemaResetRequiredError extends Error {
  constructor() {
    super("Work SQLite schema is not the exact supported epoch");
    this.name = "WorkSchemaResetRequiredError";
  }
}
