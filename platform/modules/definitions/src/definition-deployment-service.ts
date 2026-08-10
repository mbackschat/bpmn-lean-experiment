import {
  DefinitionCompilationStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCompiler,
} from "@bpmn-lean/platform-engine-gateway";

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

/** Admission and accepted-only persistence for one exact BPMN definition source. */
export class DefinitionDeploymentService {
  readonly #compiler: DefinitionCompiler;
  readonly #artifacts: ExactArtifactStore;
  readonly #repository: DefinitionRepository;

  constructor(
    compiler: DefinitionCompiler,
    artifacts: ExactArtifactStore,
    repository: DefinitionRepository,
  ) {
    this.#compiler = compiler;
    this.#artifacts = artifacts;
    this.#repository = repository;
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
        await this.#artifacts.put({
          sha256: source.sha256,
          bytes: sourceBytes,
        });
        const definition = this.#repository.allocateNext({
          processId,
          source,
          semanticProfile: acceptedSemanticProfile,
        });
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

  listLatestDefinitions(): ReadonlyArray<DefinitionMetadata> {
    return this.#repository.listLatest().map(cloneDefinitionMetadata);
  }

  listDefinitionVersions(processId: string): ReadonlyArray<DefinitionMetadata> {
    return this.#repository
      .listVersions(processId)
      .map(cloneDefinitionMetadata);
  }

  getDefinitionMetadata(reference: DefinitionReference): DefinitionMetadata | null {
    const definition = this.#repository.get(reference);
    return definition === null ? null : cloneDefinitionMetadata(definition);
  }

  async getDefinitionSource(
    reference: DefinitionReference,
  ): Promise<Uint8Array | null> {
    const definition = this.#repository.get(reference);
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
}

function cloneDiagnostic(diagnostic: DefinitionDiagnostic): DefinitionDiagnostic {
  return {
    ...diagnostic,
    element: diagnostic.element === null ? null : { ...diagnostic.element },
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition compilation result: ${String(value)}`);
}
