import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

export const PostgresqlDefinitionsRecoveryStepKind = {
  Complete: "complete",
  Intermediate: "intermediate",
  Retry: "retry",
  Fail: "fail",
} as const;

export type PostgresqlDefinitionsRecoveryStepKind =
  typeof PostgresqlDefinitionsRecoveryStepKind[
    keyof typeof PostgresqlDefinitionsRecoveryStepKind
  ];

export const PostgresqlDefinitionsRecoveryRetryReason = {
  HostUnavailable: "hostUnavailable",
} as const;

export type PostgresqlDefinitionsRecoveryRetryReason =
  typeof PostgresqlDefinitionsRecoveryRetryReason[
    keyof typeof PostgresqlDefinitionsRecoveryRetryReason
  ];

export const PostgresqlDefinitionsRecoveryFailureCode = {
  StoredCorruption: "storedCorruption",
  MissingArtifact: "missingArtifact",
  HostIntegrityFailure: "hostIntegrityFailure",
} as const;

export type PostgresqlDefinitionsRecoveryFailureCode =
  typeof PostgresqlDefinitionsRecoveryFailureCode[
    keyof typeof PostgresqlDefinitionsRecoveryFailureCode
  ];

export const PostgresqlDefinitionsRecoveryFailureEvidence = {
  StoredRow: "storedRow",
  RetainedIntent: "retainedIntent",
  Artifact: "artifact",
  HostResult: "hostResult",
  Lifecycle: "lifecycle",
} as const;

export type PostgresqlDefinitionsRecoveryFailureEvidence =
  typeof PostgresqlDefinitionsRecoveryFailureEvidence[
    keyof typeof PostgresqlDefinitionsRecoveryFailureEvidence
  ];

export const PostgresqlDefinitionsRecoveryIntermediateResult = {
  Applied: "applied",
  LeaseLost: "leaseLost",
} as const;

export type PostgresqlDefinitionsRecoveryIntermediateResult =
  typeof PostgresqlDefinitionsRecoveryIntermediateResult[
    keyof typeof PostgresqlDefinitionsRecoveryIntermediateResult
  ];

export type PostgresqlDefinitionsRecoveryStepResult =
  | Readonly<{
      kind: typeof PostgresqlDefinitionsRecoveryStepKind.Complete;
      apply: (session: PostgresqlSession) => Promise<void>;
    }>
  | Readonly<{
      kind: typeof PostgresqlDefinitionsRecoveryStepKind.Intermediate;
      applyWhileOwned: (
        session: PostgresqlSession,
      ) => Promise<PostgresqlDefinitionsRecoveryIntermediateResult>;
      continue: () => Promise<PostgresqlDefinitionsRecoveryStepResult>;
    }>
  | Readonly<{
      kind: typeof PostgresqlDefinitionsRecoveryStepKind.Retry;
      reason: PostgresqlDefinitionsRecoveryRetryReason;
    }>
  | Readonly<{
      kind: typeof PostgresqlDefinitionsRecoveryStepKind.Fail;
      code: PostgresqlDefinitionsRecoveryFailureCode;
      evidence: PostgresqlDefinitionsRecoveryFailureEvidence;
    }>;

export function completeWithoutDatabaseChange(): PostgresqlDefinitionsRecoveryStepResult {
  return {
    kind: PostgresqlDefinitionsRecoveryStepKind.Complete,
    apply: async () => undefined,
  };
}

export function retryHostUnavailable(): PostgresqlDefinitionsRecoveryStepResult {
  return {
    kind: PostgresqlDefinitionsRecoveryStepKind.Retry,
    reason: PostgresqlDefinitionsRecoveryRetryReason.HostUnavailable,
  };
}

export function failRecovery(
  code: PostgresqlDefinitionsRecoveryFailureCode,
  evidence: PostgresqlDefinitionsRecoveryFailureEvidence,
): PostgresqlDefinitionsRecoveryStepResult {
  return { kind: PostgresqlDefinitionsRecoveryStepKind.Fail, code, evidence };
}

/** Distinguishes retained-value decoding from driver or connectivity failures. */
export class PostgresqlDefinitionsRecoveryStoredValueError extends Error {
  constructor() {
    super("stored Definitions recovery value is invalid");
    this.name = "PostgresqlDefinitionsRecoveryStoredValueError";
  }
}
