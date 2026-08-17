import {
  InvalidRecoveryInputError,
  recoveryBounds,
} from "./recovery-contracts.js";
import type {
  ClaimCandidatesInput,
  FailLeaseInput,
  RecoveryLease,
  RetryLeaseInput,
} from "./recovery-contracts.js";

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const textEncoder = new TextEncoder();

export type ClaimCandidatesSnapshot = Readonly<{
  family: string;
  candidateKeys: readonly Uint8Array[];
  batchSize: number;
  leaseDurationMs: number;
  workerId: Uint8Array;
  createLeaseToken: () => string;
}>;

export function snapshotClaimCandidates(
  input: ClaimCandidatesInput,
): ClaimCandidatesSnapshot {
  validateFamily(input.family);
  validateBoundedInteger(input.batchSize, "batchSize", recoveryBounds.batchSize);
  validateBoundedInteger(
    input.leaseDurationMs,
    "leaseDurationMs",
    recoveryBounds.durationMs,
  );
  validateByteValue(input.workerId, "workerId", recoveryBounds.workerIdBytes);
  if (input.candidateKeys.length > recoveryBounds.candidateCount) {
    throw new InvalidRecoveryInputError(
      "candidateKeys",
      `must contain at most ${recoveryBounds.candidateCount}`,
    );
  }
  const candidateKeys = input.candidateKeys.map((key, index) => {
    validateByteValue(key, `candidateKeys[${index}]`, recoveryBounds.itemKeyBytes);
    return Uint8Array.from(key);
  });
  const identities = new Set(candidateKeys.map((key) => Buffer.from(key).toString("hex")));
  if (identities.size !== candidateKeys.length) {
    throw new InvalidRecoveryInputError("candidateKeys", "must not contain duplicates");
  }
  if (typeof input.createLeaseToken !== "function") {
    throw new InvalidRecoveryInputError("createLeaseToken", "must be a function");
  }
  return {
    family: input.family,
    candidateKeys,
    batchSize: input.batchSize,
    leaseDurationMs: input.leaseDurationMs,
    workerId: Uint8Array.from(input.workerId),
    createLeaseToken: input.createLeaseToken,
  };
}

export function snapshotLease(lease: RecoveryLease): RecoveryLease {
  validateFamily(lease.family);
  validateByteValue(lease.itemKey, "itemKey", recoveryBounds.itemKeyBytes);
  validateByteValue(lease.workerId, "workerId", recoveryBounds.workerIdBytes);
  validateLeaseToken(lease.leaseToken);
  validateSafeNonnegativeInteger(lease.leaseExpiresAtEpochMs, "leaseExpiresAtEpochMs");
  validateSafePositiveInteger(lease.attempt, "attempt");
  return {
    ...lease,
    itemKey: Uint8Array.from(lease.itemKey),
    workerId: Uint8Array.from(lease.workerId),
  };
}

export function snapshotRetry(input: RetryLeaseInput): RetryLeaseInput {
  validateNonnegativeBoundedInteger(
    input.retryDelayMs,
    "retryDelayMs",
    recoveryBounds.durationMs,
  );
  return { retryDelayMs: input.retryDelayMs };
}

export function snapshotFailure(input: FailLeaseInput): FailLeaseInput {
  validateBoundedText(
    input.failureCode,
    "failureCode",
    recoveryBounds.failureCodeBytes,
  );
  validateByteValue(
    input.failureEvidence,
    "failureEvidence",
    recoveryBounds.failureEvidenceBytes,
  );
  return {
    failureCode: input.failureCode,
    failureEvidence: Uint8Array.from(input.failureEvidence),
  };
}

export function validateFamily(family: string): void {
  validateBoundedText(family, "family", recoveryBounds.familyBytes);
}

export function validateLeaseToken(token: string): void {
  if (!canonicalUuidPattern.test(token)) {
    throw new InvalidRecoveryInputError(
      "leaseToken",
      "must be a canonical lowercase UUID",
    );
  }
}

export function validateBoundedInteger(
  value: number,
  field: string,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new InvalidRecoveryInputError(
      field,
      `must be an integer from 1 through ${maximum}`,
    );
  }
}

export function validateNonnegativeBoundedInteger(
  value: number,
  field: string,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new InvalidRecoveryInputError(
      field,
      `must be an integer from 0 through ${maximum}`,
    );
  }
}

function validateByteValue(
  value: Uint8Array,
  field: string,
  maximum: number,
): void {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > maximum) {
    throw new InvalidRecoveryInputError(
      field,
      `must contain from 1 through ${maximum} bytes`,
    );
  }
}

function validateBoundedText(value: string, field: string, maximum: number): void {
  if (typeof value !== "string") {
    throw new InvalidRecoveryInputError(field, "must be a string");
  }
  if (!value.isWellFormed() || value.includes("\u0000")) {
    throw new InvalidRecoveryInputError(
      field,
      "must contain only Unicode scalar values and no U+0000",
    );
  }
  const length = textEncoder.encode(value).byteLength;
  if (length < 1 || length > maximum) {
    throw new InvalidRecoveryInputError(
      field,
      `must contain from 1 through ${maximum} UTF-8 bytes`,
    );
  }
}

function validateSafePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new InvalidRecoveryInputError(field, "must be a positive safe integer");
  }
}

function validateSafeNonnegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidRecoveryInputError(field, "must be a non-negative safe integer");
  }
}
