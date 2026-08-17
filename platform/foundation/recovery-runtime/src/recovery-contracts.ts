import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

export const recoveryBounds = Object.freeze({
  familyBytes: 128,
  itemKeyBytes: 4_096,
  workerIdBytes: 1_024,
  candidateCount: 10_000,
  batchSize: 1_000,
  durationMs: 86_400_000,
  concurrency: 1_000,
  failureCodeBytes: 128,
  failureEvidenceBytes: 4_096,
});

export type RecoveryLease = Readonly<{
  family: string;
  itemKey: Uint8Array;
  leaseToken: string;
  workerId: Uint8Array;
  leaseExpiresAtEpochMs: number;
  attempt: number;
}>;

export type ClaimCandidatesInput = Readonly<{
  family: string;
  candidateKeys: readonly Uint8Array[];
  batchSize: number;
  leaseDurationMs: number;
  workerId: Uint8Array;
  createLeaseToken: () => string;
}>;

export enum LeaseMutationResult {
  Applied = "applied",
  LeaseLost = "leaseLost",
}

export type RetryLeaseInput = Readonly<{
  retryDelayMs: number;
}>;

export type FailLeaseInput = Readonly<{
  failureCode: string;
  failureEvidence: Uint8Array;
}>;

/**
 * Owns private lease transitions only. Claim commits before returning; outcome methods
 * compare the exact token and never invoke a completion callback after ownership is lost.
 */
export interface RecoveryLeaseStore {
  claimCandidates(input: ClaimCandidatesInput): Promise<readonly RecoveryLease[]>;
  complete(
    lease: RecoveryLease,
    apply: (session: PostgresqlSession) => Promise<void>,
  ): Promise<LeaseMutationResult>;
  retry(
    lease: RecoveryLease,
    input: RetryLeaseInput,
  ): Promise<LeaseMutationResult>;
  fail(
    lease: RecoveryLease,
    input: FailLeaseInput,
  ): Promise<LeaseMutationResult>;
}

export enum RecoveryHandlerOutcomeKind {
  Complete = "complete",
  Retry = "retry",
  Fail = "fail",
}

export type RecoveryHandlerOutcome =
  | Readonly<{
      kind: RecoveryHandlerOutcomeKind.Complete;
      apply: (session: PostgresqlSession) => Promise<void>;
    }>
  | Readonly<{
      kind: RecoveryHandlerOutcomeKind.Retry;
      retryDelayMs?: number;
    }>
  | Readonly<{
      kind: RecoveryHandlerOutcomeKind.Fail;
      failureCode: string;
      failureEvidence: Uint8Array;
    }>;

/** A process-clock handler deadline and cooperative signal, never a PostgreSQL cancellation promise. */
export type RecoveryHandlerContext = Readonly<{
  deadlineEpochMs: number;
  signal: AbortSignal;
}>;

export type RecoveryLoopOptions = Readonly<{
  family: string;
  workerId: Uint8Array;
  batchSize: number;
  leaseDurationMs: number;
  itemDeadlineMs: number;
  retryDelayMs: number;
  concurrency: number;
  pollingDelayMs: number;
  createLeaseToken: () => string;
  listCandidateKeys: () => Promise<readonly Uint8Array[]>;
  handle: (
    lease: RecoveryLease,
    context: RecoveryHandlerContext,
  ) => Promise<RecoveryHandlerOutcome>;
}>;

export type RecoveryLoopRun = Readonly<{
  claimed: number;
  completed: number;
  retried: number;
  permanentlyFailed: number;
  leaseLost: number;
  errors: number;
}>;

export class InvalidRecoveryInputError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    super(`invalid recovery ${field}: ${reason}`);
    this.name = "InvalidRecoveryInputError";
    this.field = field;
  }
}

export class RecoveryLeaseIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryLeaseIntegrityError";
  }
}
