/** Public deployment outcomes. Engine reason codes remain deliberately opaque to product 2. */
export const DefinitionDeployStatus = {
  Deployed: "deployed",
  Rejected: "rejected",
} as const;

export type DefinitionDeployStatus =
  typeof DefinitionDeployStatus[keyof typeof DefinitionDeployStatus];

/** Exact identity of the source bytes captured during engine admission. */
export type ExactPublicSourceIdentity = Readonly<{
  kind: "bpmnSource";
  id: string;
  sha256: string;
  byteLength: number;
  declaredEncoding: string | null;
  decodedAs: "UTF-8" | null;
}>;

/** Source location attached by the engine to one admission diagnostic. */
export type LocatedAdmissionElement = Readonly<{
  id: string | null;
  type: string | null;
  containmentPath: string;
  subject: string | null;
  requiredCapability: string | null;
}>;

/** One admission fact reported by the engine without platform-side interpretation. */
export type AdmissionDiagnostic = Readonly<{
  code: string;
  element: LocatedAdmissionElement | null;
  evidence: string;
}>;

/** Durable public identity of one deployed definition version. */
export type DeployedDefinitionVersion = Readonly<{
  processId: string;
  version: number;
  source: ExactPublicSourceIdentity;
  semanticProfile: string;
}>;

export type DeployedDefinitionResult = Readonly<{
  status: typeof DefinitionDeployStatus.Deployed;
  definition: DeployedDefinitionVersion;
}>;

export type RejectedDefinitionResult = Readonly<{
  status: typeof DefinitionDeployStatus.Rejected;
  source: ExactPublicSourceIdentity;
  semanticProfile: string;
  diagnostics: readonly [AdmissionDiagnostic, ...AdmissionDiagnostic[]];
}>;

export type DefinitionDeployResult =
  | DeployedDefinitionResult
  | RejectedDefinitionResult;

/** Current deployed version for every known process identifier. */
export type DefinitionListResponse = Readonly<{
  definitions: ReadonlyArray<DeployedDefinitionVersion>;
}>;

/** Every deployed version for one process identifier, in server-defined stable order. */
export type DefinitionVersionListResponse = Readonly<{
  processId: string;
  versions: ReadonlyArray<DeployedDefinitionVersion>;
}>;

export const PublicApiErrorCode = {
  InvalidRequest: "invalidRequest",
  UnsupportedMediaType: "unsupportedMediaType",
  PayloadTooLarge: "payloadTooLarge",
  NotFound: "notFound",
  InternalFailure: "internalFailure",
} as const;

export type PublicApiErrorCode =
  typeof PublicApiErrorCode[keyof typeof PublicApiErrorCode];

type PublicApiErrorFor<Code extends PublicApiErrorCode> = Readonly<{
  code: Code;
  message: string;
}>;

export type PublicApiError =
  | PublicApiErrorFor<typeof PublicApiErrorCode.InvalidRequest>
  | PublicApiErrorFor<typeof PublicApiErrorCode.UnsupportedMediaType>
  | PublicApiErrorFor<typeof PublicApiErrorCode.PayloadTooLarge>
  | PublicApiErrorFor<typeof PublicApiErrorCode.NotFound>
  | PublicApiErrorFor<typeof PublicApiErrorCode.InternalFailure>;

export type PublicApiErrorResponse = Readonly<{
  error: PublicApiError;
}>;
