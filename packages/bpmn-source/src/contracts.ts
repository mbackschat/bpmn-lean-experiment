import type {
  CheckedProcess,
  DeepReadonly,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

export enum BpmnCompilationStatus {
  Accepted = "accepted",
  Rejected = "rejected",
}

export enum BpmnSourceDiagnosticCode {
  SourceTooLarge = "sourceTooLarge",
  UnsupportedEncoding = "unsupportedEncoding",
  InvalidUtf8 = "invalidUtf8",
  DoctypeForbidden = "doctypeForbidden",
  ParserFailure = "parserFailure",
  ParserWarning = "parserWarning",
  SourceIdentityMismatch = "sourceIdentityMismatch",
  UnsupportedModel = "unsupportedModel",
}

export type BpmnSourceDiagnostic = DeepReadonly<{
  code: BpmnSourceDiagnosticCode;
  evidence: string;
}>;

export type BpmnSourceIdentity = DeepReadonly<{
  kind: "bpmnSource";
  id: string;
  sha256: string;
  byteLength: number;
  declaredEncoding: string | null;
  decodedAs: "UTF-8" | null;
}>;

export type BpmnSourceLimits = DeepReadonly<{
  maxBytes: number;
  parserDeadlineMs: number;
}>;

/**
 * Compilation snapshots `bytes` before asynchronous parsing.
 *
 * This contract is intentionally shallow: TypeScript cannot make a
 * `Uint8Array` deeply immutable because its mutation methods remain callable.
 */
export type CompileBpmnToSemanticProcessRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string | undefined;
  semanticProfile: string;
  limits: BpmnSourceLimits;
}>;

type ExactSourceCapture = DeepReadonly<{
  source: BpmnSourceIdentity;
  copyExactBytes: () => Uint8Array;
}>;

export type AcceptedBpmnCompilation = ExactSourceCapture &
  DeepReadonly<{
    status: BpmnCompilationStatus.Accepted;
    diagnostics: readonly [];
    checkedProcess: CheckedProcess;
    semanticProcess: SemanticProcessProgram;
  }>;

export type RejectedBpmnCompilation = ExactSourceCapture &
  DeepReadonly<{
    status: BpmnCompilationStatus.Rejected;
    diagnostics: BpmnSourceDiagnostic[];
    checkedProcess: undefined;
    semanticProcess: undefined;
  }>;

export type BpmnCompilationResult =
  | AcceptedBpmnCompilation
  | RejectedBpmnCompilation;
