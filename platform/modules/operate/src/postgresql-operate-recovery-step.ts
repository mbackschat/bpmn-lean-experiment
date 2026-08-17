import type { PostgresqlSession } from "@bpmn-lean/platform-postgresql-runtime";

export const PostgresqlOperateRecoveryStepKind = {
  Complete: "complete",
  Retry: "retry",
  Fail: "fail",
} as const;

export type PostgresqlOperateRecoveryStepKind = typeof PostgresqlOperateRecoveryStepKind[
  keyof typeof PostgresqlOperateRecoveryStepKind
];

export const PostgresqlOperateRecoveryRetryReason = {
  GatewayUnavailable: "gatewayUnavailable",
  ProducerNotReady: "producerNotReady",
  ExecutionAuthorityNotReady: "executionAuthorityNotReady",
} as const;

export type PostgresqlOperateRecoveryRetryReason =
  typeof PostgresqlOperateRecoveryRetryReason[
    keyof typeof PostgresqlOperateRecoveryRetryReason
  ];

export const PostgresqlOperateRecoveryFailureCode = {
  StoredCorruption: "storedCorruption",
  ProducerGap: "producerGap",
  ImpossibleAuthority: "impossibleAuthority",
  DecoderDivergence: "decoderDivergence",
  ChangedOverlap: "changedOverlap",
} as const;

export type PostgresqlOperateRecoveryFailureCode =
  typeof PostgresqlOperateRecoveryFailureCode[
    keyof typeof PostgresqlOperateRecoveryFailureCode
  ];

export const PostgresqlOperateRecoveryFailureEvidence = {
  RegistrationAndProjection: "registrationAndProjection",
  ProducerResult: "producerResult",
  PreparedPage: "preparedPage",
  ExecutionAuthority: "executionAuthority",
} as const;

export type PostgresqlOperateRecoveryFailureEvidence =
  typeof PostgresqlOperateRecoveryFailureEvidence[
    keyof typeof PostgresqlOperateRecoveryFailureEvidence
  ];

export type PostgresqlOperateRecoveryStepResult =
  | Readonly<{
      kind: typeof PostgresqlOperateRecoveryStepKind.Complete;
      apply: (session: PostgresqlSession) => Promise<void>;
    }>
  | Readonly<{
      kind: typeof PostgresqlOperateRecoveryStepKind.Retry;
      reason: PostgresqlOperateRecoveryRetryReason;
    }>
  | Readonly<{
      kind: typeof PostgresqlOperateRecoveryStepKind.Fail;
      code: PostgresqlOperateRecoveryFailureCode;
      evidence: PostgresqlOperateRecoveryFailureEvidence;
    }>;

/** Signals that the prepared cursor or identity lost its lease-fenced database image. */
export class PostgresqlOperateRecoveryFenceError extends Error {
  constructor() {
    super("prepared Operate recovery step lost its exact database image");
    this.name = "PostgresqlOperateRecoveryFenceError";
  }
}

export function completeWithoutDatabaseChange(): PostgresqlOperateRecoveryStepResult {
  return {
    kind: PostgresqlOperateRecoveryStepKind.Complete,
    apply: async () => undefined,
  };
}

export function retry(
  reason: PostgresqlOperateRecoveryRetryReason,
): PostgresqlOperateRecoveryStepResult {
  return { kind: PostgresqlOperateRecoveryStepKind.Retry, reason };
}

export function fail(
  code: PostgresqlOperateRecoveryFailureCode,
  evidence: PostgresqlOperateRecoveryFailureEvidence,
): PostgresqlOperateRecoveryStepResult {
  return { kind: PostgresqlOperateRecoveryStepKind.Fail, code, evidence };
}
