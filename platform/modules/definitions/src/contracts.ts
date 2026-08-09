import type {
  ArtifactPutRequest,
  ArtifactPutResult,
} from "@bpmn-lean/platform-artifact-store";
import type {
  DefinitionCompilationResult,
} from "@bpmn-lean/platform-engine-gateway";

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

export type DefinitionMetadata = Readonly<{
  processId: string;
  version: number;
  source: DefinitionSourceIdentity;
  semanticProfile: string;
}>;

export type NewDefinitionMetadata = Readonly<{
  processId: string;
  source: DefinitionSourceIdentity;
  semanticProfile: string;
}>;

type RejectedCompilation = Extract<
  DefinitionCompilationResult,
  { status: "rejected" }
>;

export type DefinitionSourceIdentity = DefinitionCompilationResult["source"];
export type DefinitionDiagnostic = RejectedCompilation["diagnostics"][number];

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

/** Exact-byte capability consumed by the definitions business workflow. */
export interface ExactArtifactStore {
  put(request: ArtifactPutRequest): Promise<ArtifactPutResult>;
  get(sha256: string): Promise<Uint8Array | null>;
}

/** Metadata capability consumed by the definitions business workflow. */
export interface DefinitionRepository {
  allocateNext(metadata: NewDefinitionMetadata): DefinitionMetadata;
  listLatest(): ReadonlyArray<DefinitionMetadata>;
  listVersions(processId: string): ReadonlyArray<DefinitionMetadata>;
  get(reference: DefinitionReference): DefinitionMetadata | null;
}

/** Raised when durable metadata points at source bytes that are no longer present. */
export class DefinitionArtifactIntegrityError extends Error {
  readonly definition: DefinitionReference;
  readonly sourceSha256: string;

  constructor(definition: DefinitionReference, sourceSha256: string) {
    super(
      `definition ${definition.processId}/${definition.version} references missing artifact ${sourceSha256}`,
    );
    this.name = "DefinitionArtifactIntegrityError";
    this.definition = { ...definition };
    this.sourceSha256 = sourceSha256;
  }
}
