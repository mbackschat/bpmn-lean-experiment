import type { SequentialUserTaskExecutableIr } from "@bpmn-lean/semantic-core";

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

export type BpmnSourceDiagnostic = Readonly<{
  code: BpmnSourceDiagnosticCode;
  evidence: string;
}>;

export type BpmnSourceIdentity = Readonly<{
  schemaVersion: "0.1.0";
  id: string;
  sha256: string;
  byteLength: number;
  declaredEncoding: string | null;
  decodedAs: "UTF-8" | null;
}>;

export type BpmnSourceLimits = Readonly<{
  maxBytes: number;
  parserDeadlineMs: number;
}>;

export type CompileSequentialUserTaskBpmnRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string | undefined;
  semanticProfile: string;
  limits: BpmnSourceLimits;
}>;

type ExactSourceCapture = Readonly<{
  source: BpmnSourceIdentity;
  copyExactBytes: () => Uint8Array;
}>;

export type AcceptedBpmnCompilation = ExactSourceCapture &
  Readonly<{
    status: BpmnCompilationStatus.Accepted;
    diagnostics: readonly [];
    executableIr: SequentialUserTaskExecutableIr;
  }>;

export type RejectedBpmnCompilation = ExactSourceCapture &
  Readonly<{
    status: BpmnCompilationStatus.Rejected;
    diagnostics: ReadonlyArray<BpmnSourceDiagnostic>;
    executableIr: undefined;
  }>;

export type BpmnCompilationResult =
  | AcceptedBpmnCompilation
  | RejectedBpmnCompilation;
