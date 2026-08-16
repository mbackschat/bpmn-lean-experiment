import type {
  ArtifactPutRequest,
  ArtifactPutResult,
} from "@bpmn-lean/platform-artifact-store";
import type {
  DefinitionCompilationResult,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  HumanTaskCatalogV1,
} from "@bpmn-lean/platform-contracts";

export const DefinitionDeploymentStatus = {
  Deployed: "deployed",
  Rejected: "rejected",
} as const;

export type DefinitionDeploymentStatus =
  typeof DefinitionDeploymentStatus[keyof typeof DefinitionDeploymentStatus];

export type DefinitionDeploymentRequest = Readonly<{
  /** Caller-owned exact source bytes, snapshotted synchronously by `deploy`. */
  bytes: Uint8Array;
  sourceId: string;
  semanticProfile: string;
  expectedSha256: string | undefined;
}>;

export type DefinitionReference = Readonly<{
  processId: string;
  version: number;
}>;

export type DefinitionTimerStartCapability = Readonly<{
  startEventId: string;
  durationMs: number;
}>;

export type DefinitionOperationMessageChannel = Readonly<{
  kind: "operationMessage";
  interfaceId: string;
  interfaceOperationId: string;
  messageId: string;
}>;

export type DefinitionMessageStartCapability = Readonly<{
  startEventId: string;
  channel: DefinitionOperationMessageChannel;
}>;

export type DefinitionStartCapabilities = Readonly<{
  messageStarts: ReadonlyArray<DefinitionMessageStartCapability>;
  timerStarts: ReadonlyArray<DefinitionTimerStartCapability>;
}>;

export type DefinitionMetadata = Readonly<{
  processId: string;
  version: number;
  source: DefinitionSourceIdentity;
  semanticProfile: string;
  startCapabilities: DefinitionStartCapabilities;
}>;

export type NewDefinitionMetadata = Readonly<{
  processId: string;
  source: DefinitionSourceIdentity;
  semanticProfile: string;
  startCapabilities: DefinitionStartCapabilities;
}>;

type RejectedCompilation = Extract<
  DefinitionCompilationResult,
  { status: "rejected" }
>;

export type DefinitionSourceIdentity = DefinitionCompilationResult["source"];
export type DefinitionDiagnostic =
  | RejectedCompilation["diagnostics"][number]
  | Readonly<{
      code: "unsupportedHumanTaskCatalog";
      element: null;
      evidence: string;
    }>;

export type DeployedDefinitionDeployment = Readonly<{
  status: typeof DefinitionDeploymentStatus.Deployed;
  source: DefinitionSourceIdentity;
  diagnostics: readonly [];
  definition: DefinitionMetadata;
}>;

export type RejectedDefinitionDeployment = Readonly<{
  status: typeof DefinitionDeploymentStatus.Rejected;
  source: DefinitionSourceIdentity;
  diagnostics: ReadonlyArray<DefinitionDiagnostic>;
  definition: undefined;
}>;

export type DefinitionDeploymentResult =
  | DeployedDefinitionDeployment
  | RejectedDefinitionDeployment;

export const DefinitionVersionStartStatus = {
  Started: "started",
  Rejected: "rejected",
  NotFound: "notFound",
} as const;

export type DefinitionVersionStartStatus =
  typeof DefinitionVersionStartStatus[keyof typeof DefinitionVersionStartStatus];

export type DefinitionStartFailure = Readonly<{
  code: string;
  evidence: string;
}>;

export type DefinitionProcessInstanceIdentity = Readonly<{
  processInstanceId: string;
  definition: DefinitionMetadata;
}>;

export type StartedDefinitionVersionStart = Readonly<{
  status: typeof DefinitionVersionStartStatus.Started;
  instance: DefinitionProcessInstanceIdentity;
}>;

export type RejectedDefinitionVersionStart = Readonly<{
  status: typeof DefinitionVersionStartStatus.Rejected;
  definition: DefinitionMetadata;
  failure: DefinitionStartFailure;
}>;

export type MissingDefinitionVersionStart = Readonly<{
  status: typeof DefinitionVersionStartStatus.NotFound;
  reference: DefinitionReference;
}>;

export type DefinitionVersionStartResult =
  | StartedDefinitionVersionStart
  | RejectedDefinitionVersionStart
  | MissingDefinitionVersionStart;

/** Exact-byte capability consumed by the definitions business workflow. */
export interface ExactArtifactStore {
  put(request: ArtifactPutRequest): Promise<ArtifactPutResult>;
  get(sha256: string): Promise<Uint8Array | null>;
}

/** Metadata capability consumed by the definitions business workflow. */
export interface DefinitionRepository {
  allocateNext(
    metadata: NewDefinitionMetadata,
    humanTaskCatalog?: HumanTaskCatalogV1 | null,
  ): Promise<DefinitionMetadata>;
  listLatest(): Promise<ReadonlyArray<DefinitionMetadata>>;
  listVersions(processId: string): Promise<ReadonlyArray<DefinitionMetadata>>;
  get(reference: DefinitionReference): Promise<DefinitionMetadata | null>;
}

/** Exact source-bound catalog lookup consumed by Product 2 Work. */
export interface HumanTaskCatalogRepository {
  getHumanTaskCatalog(
    reference: DefinitionReference,
  ): Promise<HumanTaskCatalogV1 | null>;
}

/** Raised when durable metadata points at source bytes that are no longer present. */
export class DefinitionArtifactIntegrityError extends Error {
  readonly definition: DefinitionReference;
  readonly sourceSha256: string;
  readonly expectedByteLength: number | null;
  readonly actualByteLength: number | null;

  constructor(
    definition: DefinitionReference,
    sourceSha256: string,
    lengths: Readonly<{
      expected: number;
      actual: number;
    }> | null = null,
  ) {
    super(
      lengths === null
        ? `definition ${definition.processId}/${definition.version} references missing artifact ${sourceSha256}`
        : `definition ${definition.processId}/${definition.version} artifact ${sourceSha256} has ${lengths.actual} bytes instead of ${lengths.expected}`,
    );
    this.name = "DefinitionArtifactIntegrityError";
    this.definition = { ...definition };
    this.sourceSha256 = sourceSha256;
    this.expectedByteLength = lengths?.expected ?? null;
    this.actualByteLength = lengths?.actual ?? null;
  }
}

/** Raised when engine start does not preserve the selected stored definition binding. */
export class DefinitionStartIntegrityError extends Error {
  readonly definition: DefinitionReference;

  constructor(definition: DefinitionReference) {
    super(
      `definition ${definition.processId}/${definition.version} did not remain identity-bound during start`,
    );
    this.name = "DefinitionStartIntegrityError";
    this.definition = { ...definition };
  }
}
