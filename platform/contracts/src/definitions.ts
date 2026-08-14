import type { DeepReadonly } from "@bpmn-lean/contract-types";

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

/** Platform-owned projection of one resolved Timer Start capability. */
export type PublicTimerStartCapability = Readonly<{
  startEventId: string;
  durationMs: number;
}>;

/** Complete operation-addressed public channel of one Message Start capability. */
export type PublicOperationMessageChannel = Readonly<{
  kind: "operationMessage";
  interfaceId: string;
  interfaceOperationId: string;
  messageId: string;
}>;

/** Platform-owned projection of one resolved Message Start capability. */
export type PublicMessageStartCapability = Readonly<{
  startEventId: string;
  channel: PublicOperationMessageChannel;
}>;

/** Start capabilities published for one exact deployed definition version. */
export type PublicDefinitionStartCapabilities = Readonly<{
  messageStarts: readonly PublicMessageStartCapability[];
  timerStarts: readonly PublicTimerStartCapability[];
}>;

/** Durable public identity of one deployed definition version. */
export type DeployedDefinitionVersion = Readonly<{
  processId: string;
  version: number;
  source: ExactPublicSourceIdentity;
  semanticProfile: string;
  startCapabilities: PublicDefinitionStartCapabilities;
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
  MethodNotAllowed: "methodNotAllowed",
  UnsupportedMediaType: "unsupportedMediaType",
  PayloadTooLarge: "payloadTooLarge",
  NotFound: "notFound",
  InternalFailure: "internalFailure",
  Conflict: "conflict",
  Forbidden: "forbidden",
  FormValueIncompatible: "formValueIncompatible",
  WorkSnapshotUnavailable: "workSnapshotUnavailable",
  IncidentSnapshotUnavailable: "incidentSnapshotUnavailable",
  ExecutionPublicationUnavailable: "executionPublicationUnavailable",
} as const;

export type PublicApiErrorCode =
  | typeof PublicApiErrorCode.InvalidRequest
  | typeof PublicApiErrorCode.MethodNotAllowed
  | typeof PublicApiErrorCode.UnsupportedMediaType
  | typeof PublicApiErrorCode.PayloadTooLarge
  | typeof PublicApiErrorCode.NotFound
  | typeof PublicApiErrorCode.InternalFailure
  | typeof PublicApiErrorCode.Conflict;

/** Exact error set retained by every pre-Work route. */
export const LegacyPublicApiErrorCodes = [
  PublicApiErrorCode.InvalidRequest,
  PublicApiErrorCode.MethodNotAllowed,
  PublicApiErrorCode.UnsupportedMediaType,
  PublicApiErrorCode.PayloadTooLarge,
  PublicApiErrorCode.NotFound,
  PublicApiErrorCode.InternalFailure,
  PublicApiErrorCode.Conflict,
] as const satisfies readonly PublicApiErrorCode[];

/** Every code in the single public catalog, including route-specific Work codes. */
export type PublicApiErrorCatalogCode =
  typeof PublicApiErrorCode[keyof typeof PublicApiErrorCode];

export type PublicApiError<Code extends string = PublicApiErrorCode> = DeepReadonly<{
  code: Code;
  message: string;
}>;

export type PublicApiErrorResponse<Code extends string = PublicApiErrorCode> =
  DeepReadonly<{ error: PublicApiError<Code> }>;
