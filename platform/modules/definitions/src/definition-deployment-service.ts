import {
  DefinitionCompilationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCompiler,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  HumanTaskCatalogProjectionBinding,
  HumanTaskCatalogProjectionResult,
} from "@bpmn-lean/platform-bpmn-definition-projection";
import type { HumanTaskCatalogV1 } from "@bpmn-lean/platform-contracts";

import {
  DefinitionArtifactIntegrityError,
  DefinitionDeploymentStatus,
} from "./contracts.js";
import type {
  DefinitionDeploymentRequest,
  DefinitionDeploymentResult,
  DefinitionDiagnostic,
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  ExactArtifactStore,
} from "./contracts.js";
import {
  cloneDefinitionMetadata,
  cloneDefinitionSource,
} from "./definition-values.js";
import { cloneDefinitionStartCapabilities } from "./definition-capabilities.js";

const structuredHumanWorkProfile =
  "bpmn-2.0.2-bpmn-lean-structured-human-work-draft";

type HumanTaskCatalogProjector = Readonly<{
  project(
    sourceXml: string,
    binding: HumanTaskCatalogProjectionBinding,
  ): HumanTaskCatalogProjectionResult | Promise<HumanTaskCatalogProjectionResult>;
}>;

/** Admission and accepted-only persistence for one exact BPMN definition source. */
export class DefinitionDeploymentService {
  readonly #compiler: DefinitionCompiler;
  readonly #artifacts: ExactArtifactStore;
  readonly #repository: DefinitionRepository;
  readonly #catalogProjector: HumanTaskCatalogProjector | null;

  constructor(
    compiler: DefinitionCompiler,
    artifacts: ExactArtifactStore,
    repository: DefinitionRepository,
    catalogProjector: HumanTaskCatalogProjector | null = null,
  ) {
    this.#compiler = compiler;
    this.#artifacts = artifacts;
    this.#repository = repository;
    this.#catalogProjector = catalogProjector;
  }

  async deploy(
    request: DefinitionDeploymentRequest,
  ): Promise<DefinitionDeploymentResult> {
    const sourceBytes = Uint8Array.from(request.bytes);
    const sourceId = request.sourceId;
    const semanticProfile = request.semanticProfile;
    const expectedSha256 = request.expectedSha256;
    const compilation = await this.#compiler.compileDefinition({
      bytes: Uint8Array.from(sourceBytes),
      sourceId,
      semanticProfile,
      expectedSha256,
    });

    switch (compilation.status) {
      case DefinitionCompilationStatus.Accepted: {
        const source = cloneDefinitionSource(compilation.source);
        const processId = compilation.definition.processId;
        const acceptedSemanticProfile = compilation.definition.semanticProfile;
        const startCapabilities = cloneDefinitionStartCapabilities(
          compilation.startCapabilities,
        );
        const catalog = await this.#projectHumanTaskCatalog(
          sourceBytes,
          processId,
          acceptedSemanticProfile,
          source.sha256,
        );
        if (catalog.kind === "rejected") {
          return {
            status: DefinitionDeploymentStatus.Rejected,
            source,
            diagnostics: [catalog.diagnostic],
            definition: undefined,
          };
        }
        await this.#artifacts.put({
          sha256: source.sha256,
          bytes: sourceBytes,
        });
        const definition = await this.#repository.allocateNext(
          {
            processId,
            source,
            semanticProfile: acceptedSemanticProfile,
            startCapabilities,
          },
          catalog.catalog,
        );
        return {
          status: DefinitionDeploymentStatus.Deployed,
          source,
          diagnostics: [],
          definition: cloneDefinitionMetadata(definition),
        };
      }
      case DefinitionCompilationStatus.Rejected:
        return {
          status: DefinitionDeploymentStatus.Rejected,
          source: cloneDefinitionSource(compilation.source),
          diagnostics: compilation.diagnostics.map(cloneDiagnostic),
          definition: undefined,
        };
      default:
        return assertNever(compilation);
    }
  }

  async listLatestDefinitions(): Promise<ReadonlyArray<DefinitionMetadata>> {
    return (await this.#repository.listLatest()).map(cloneDefinitionMetadata);
  }

  async listDefinitionVersions(
    processId: string,
  ): Promise<ReadonlyArray<DefinitionMetadata>> {
    return (await this.#repository.listVersions(processId)).map(
      cloneDefinitionMetadata,
    );
  }

  async getDefinitionMetadata(
    reference: DefinitionReference,
  ): Promise<DefinitionMetadata | null> {
    const definition = await this.#repository.get(reference);
    return definition === null ? null : cloneDefinitionMetadata(definition);
  }

  async getDefinitionSource(
    reference: DefinitionReference,
  ): Promise<Uint8Array | null> {
    const definition = await this.#repository.get(reference);
    if (definition === null) {
      return null;
    }
    const bytes = await this.#artifacts.get(definition.source.sha256);
    if (bytes === null) {
      throw new DefinitionArtifactIntegrityError(
        reference,
        definition.source.sha256,
      );
    }
    return Uint8Array.from(bytes);
  }

  async #projectHumanTaskCatalog(
    sourceBytes: Uint8Array,
    processId: string,
    semanticProfile: string,
    sourceSha256: string,
  ): Promise<
    | Readonly<{ kind: "accepted"; catalog: HumanTaskCatalogV1 | null }>
    | Readonly<{ kind: "rejected"; diagnostic: DefinitionDiagnostic }>
  > {
    if (semanticProfile !== structuredHumanWorkProfile) {
      return { kind: "accepted", catalog: null };
    }
    if (this.#catalogProjector === null) {
      return catalogRejection("Human Task catalog projection is unavailable");
    }
    let sourceXml: string;
    try {
      sourceXml = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
    } catch {
      return catalogRejection("Human Task catalog source is not exact UTF-8");
    }
    let projection: HumanTaskCatalogProjectionResult;
    try {
      projection = await this.#catalogProjector.project(sourceXml, {
        processId,
        semanticProfile,
        sourceSha256,
      });
    } catch (error: unknown) {
      const evidence = error instanceof Error ? error.message : "unknown projection failure";
      return catalogRejection(`Human Task catalog projection failed: ${evidence}`);
    }
    switch (projection.kind) {
      case "catalog":
        return { kind: "accepted", catalog: projection.catalog };
      case "absent":
        return catalogRejection("Human Task catalog is required for structured Human Work");
      case "invalid":
        return catalogRejection(`Human Task catalog is invalid: ${projection.evidence}`);
    }
  }
}

function catalogRejection(
  evidence: string,
): Readonly<{ kind: "rejected"; diagnostic: DefinitionDiagnostic }> {
  return {
    kind: "rejected",
    diagnostic: {
      code: "unsupportedHumanTaskCatalog",
      element: null,
      evidence,
    },
  };
}

function cloneDiagnostic(diagnostic: DefinitionDiagnostic): DefinitionDiagnostic {
  if (diagnostic.code === "unsupportedHumanTaskCatalog") {
    return {
      code: diagnostic.code,
      element: null,
      evidence: diagnostic.evidence,
    };
  }
  return {
    ...diagnostic,
    element: diagnostic.element === null ? null : { ...diagnostic.element },
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition compilation result: ${String(value)}`);
}
