import { createHash } from "node:crypto";
import { DefinitionCompilationStatus } from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCompiler,
  DefinitionVersionRegistrar,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  HumanTaskCatalogProjectionBinding,
  HumanTaskCatalogProjectionResult,
} from "@bpmn-lean/platform-bpmn-definition-projection";
import type { HumanTaskCatalogV1 } from "@bpmn-lean/platform-contracts";

import {
  DefinitionArtifactIntegrityError,
  DefinitionDeploymentStatus,
  DefinitionEngineRegistrationError,
  DefinitionDeploymentIntegrityError,
} from "./contracts.js";
import type {
  DefinitionDeploymentRequest,
  DefinitionDeploymentResult,
  DefinitionDiagnostic,
  DefinitionEngineRegistration,
  DefinitionEngineRegistrationRepository,
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  ExactArtifactStore,
} from "./contracts.js";
import {
  cloneDefinitionMetadata,
  cloneDefinitionSource,
  cloneSourceOverlayIdentity,
  equalSourceOverlayIdentity,
} from "./definition-values.js";
import { cloneDefinitionStartCapabilities } from "./definition-capabilities.js";
import { readRetainedDefinitionArtifacts } from "./definition-artifacts.js";
import { registerRetainedDefinitionVersion } from "./definition-engine-registration.js";

const structuredHumanWorkProfile =
  "bpmn-2.0.2";

type HumanTaskCatalogProjector = Readonly<{
  project(
    sourceXml: string,
    binding: HumanTaskCatalogProjectionBinding,
  ): HumanTaskCatalogProjectionResult | Promise<HumanTaskCatalogProjectionResult>;
}>;

/**
 * Admission and accepted-only persistence for one exact BPMN definition source, then its registration with the engine,
 * which every start of the version and publication to it needs.
 *
 * The engine orders a process's deployments by registration, not by the version a deployment's identity names: a later
 * registration supersedes the earlier ones and numbers the key's next version (`Kernel.Population.deploy`). So the
 * versions of one process register in version order: a deploy first registers every earlier pending version, and a
 * transport failure stops the process's registrations, leaving that version and every later one pending.
 */
export class DefinitionDeploymentService {
  readonly #compiler: DefinitionCompiler & DefinitionVersionRegistrar;
  readonly #artifacts: ExactArtifactStore;
  readonly #repository: DefinitionRepository & DefinitionEngineRegistrationRepository;
  readonly #catalogProjector: HumanTaskCatalogProjector | null;

  constructor(
    compiler: DefinitionCompiler & DefinitionVersionRegistrar,
    artifacts: ExactArtifactStore,
    repository: DefinitionRepository & DefinitionEngineRegistrationRepository,
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
    const sourceOverlay = request.sourceOverlay === undefined || request.sourceOverlay === null
      ? null
      : { id: request.sourceOverlay.id, sha256: request.sourceOverlay.sha256, bytes: Uint8Array.from(request.sourceOverlay.bytes) };
    const capturedSourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    const compilation = await this.#compiler.compileDefinition({
      bytes: Uint8Array.from(sourceBytes),
      sourceId,
      semanticProfile,
      expectedSha256,
      sourceOverlay: sourceOverlay === null ? null : { ...sourceOverlay, bytes: Uint8Array.from(sourceOverlay.bytes) },
    });

    switch (compilation.status) {
      case DefinitionCompilationStatus.Accepted: {
        if (compilation.source.id !== sourceId || compilation.source.sha256 !== capturedSourceSha256 ||
          compilation.source.byteLength !== sourceBytes.byteLength || compilation.definition.semanticProfile !== semanticProfile ||
          !equalSourceOverlayIdentity(compilation.definition.sourceOverlay, sourceOverlay)) {
          throw new DefinitionDeploymentIntegrityError();
        }
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
        if (sourceOverlay !== null) {
          await this.#artifacts.put({ sha256: sourceOverlay.sha256, bytes: sourceOverlay.bytes });
        }
        const definition = await this.#repository.allocateNext(
          {
            processId,
            source,
            semanticProfile: acceptedSemanticProfile,
            startCapabilities,
            sourceOverlay: cloneSourceOverlayIdentity(sourceOverlay),
          },
          catalog.catalog,
        );
        const registration = await this.#registerThrough(definition);
        if (registration.state === "refused") {
          throw new DefinitionEngineRegistrationError(definition, registration.code);
        }
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

  /**
   * Registers every pending version with the engine, each process's in version order, as recovery does before any
   * start, Schedule or publication of a version is reconciled.
   */
  async reconcileAll(): Promise<void> {
    for (const pending of await this.#repository.listPendingEngineRegistrations()) {
      await this.#register(pending);
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

  /**
   * Registers the earlier pending versions of `definition`'s process, then `definition` itself, and answers its
   * registration. It registers even when a concurrent deploy of a later version registered it first, since the engine
   * answers a repeated registration as the first.
   */
  async #registerThrough(definition: DefinitionMetadata): Promise<DefinitionEngineRegistration> {
    for (const pending of await this.#repository.listPendingEngineRegistrations(definition.processId)) {
      if (pending.version >= definition.version) break;
      await this.#register(pending);
    }
    return await this.#register(definition);
  }

  /** Registers one stored version from its retained exact bytes and records the engine's answer. */
  async #register(definition: DefinitionMetadata): Promise<DefinitionEngineRegistration> {
    const retained = await readRetainedDefinitionArtifacts(this.#artifacts, definition);
    const registration = await registerRetainedDefinitionVersion(this.#compiler, definition, retained);
    await this.#repository.recordEngineRegistration(
      { processId: definition.processId, version: definition.version },
      registration,
    );
    return registration;
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
        // The structured-Human-Work profile became the standards profile in 3a10a909a, so a source opts into
        // structured Human Work by carrying the project rendering, not by naming the profile.
        return { kind: "accepted", catalog: null };
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
  return { code: diagnostic.code, element: diagnostic.element, evidence: diagnostic.evidence };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition compilation result: ${String(value)}`);
}
