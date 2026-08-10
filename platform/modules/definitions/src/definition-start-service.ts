import {
  DefinitionStartStatus as EngineDefinitionStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionStartResult as EngineDefinitionStartResult,
  DefinitionVersionStarter,
} from "@bpmn-lean/platform-engine-gateway";

import {
  DefinitionArtifactIntegrityError,
  DefinitionStartIntegrityError,
  DefinitionVersionStartStatus,
} from "./contracts.js";
import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionRepository,
  DefinitionVersionStartResult,
  ExactArtifactStore,
} from "./contracts.js";
import { cloneDefinitionMetadata } from "./definition-values.js";

export type ProcessInstanceIdGenerator = () => string;

/** Starts one exact stored definition version through the narrowed engine boundary. */
export class DefinitionStartService {
  readonly #starter: DefinitionVersionStarter;
  readonly #artifacts: ExactArtifactStore;
  readonly #repository: DefinitionRepository;
  readonly #processInstanceIdGenerator: ProcessInstanceIdGenerator;

  constructor(
    starter: DefinitionVersionStarter,
    artifacts: ExactArtifactStore,
    repository: DefinitionRepository,
    processInstanceIdGenerator: ProcessInstanceIdGenerator,
  ) {
    this.#starter = starter;
    this.#artifacts = artifacts;
    this.#repository = repository;
    this.#processInstanceIdGenerator = processInstanceIdGenerator;
  }

  async start(
    reference: DefinitionReference,
  ): Promise<DefinitionVersionStartResult> {
    const selectedReference = cloneReference(reference);
    const stored = this.#repository.get(selectedReference);
    if (stored === null) {
      return {
        status: DefinitionVersionStartStatus.NotFound,
        reference: selectedReference,
      };
    }
    const definition = cloneDefinitionMetadata(stored);
    if (
      definition.processId !== selectedReference.processId ||
      definition.version !== selectedReference.version
    ) {
      throw new DefinitionStartIntegrityError(selectedReference);
    }
    const artifact = await this.#artifacts.get(definition.source.sha256);
    if (artifact === null) {
      throw new DefinitionArtifactIntegrityError(
        selectedReference,
        definition.source.sha256,
      );
    }
    const bytes = Uint8Array.from(artifact);
    if (bytes.byteLength !== definition.source.byteLength) {
      throw new DefinitionArtifactIntegrityError(
        selectedReference,
        definition.source.sha256,
        {
          expected: definition.source.byteLength,
          actual: bytes.byteLength,
        },
      );
    }

    const processInstanceId = this.#processInstanceIdGenerator();
    requireProcessInstanceId(processInstanceId);
    const result = await this.#starter.startDefinitionVersion({
      bytes: Uint8Array.from(bytes),
      sourceId: definition.source.id,
      expectedSha256: definition.source.sha256,
      semanticProfile: definition.semanticProfile,
      expectedProcessId: definition.processId,
      processInstanceId,
    });
    requireExactDefinitionBinding(
      result,
      processInstanceId,
      definition,
      selectedReference,
    );

    switch (result.status) {
      case EngineDefinitionStartStatus.Started:
        return {
          status: DefinitionVersionStartStatus.Started,
          instance: {
            processInstanceId,
            definition: cloneDefinitionMetadata(definition),
          },
        };
      case EngineDefinitionStartStatus.Rejected:
        return {
          status: DefinitionVersionStartStatus.Rejected,
          definition: cloneDefinitionMetadata(definition),
          failure: { ...result.failure },
        };
      case EngineDefinitionStartStatus.IntegrityFailure:
        throw new DefinitionStartIntegrityError(selectedReference);
      default:
        return assertNever(result);
    }
  }
}

function requireExactDefinitionBinding(
  result: EngineDefinitionStartResult,
  processInstanceId: string,
  definition: DefinitionMetadata,
  reference: DefinitionReference,
): void {
  if (
    result.source.kind !== definition.source.kind ||
    result.source.id !== definition.source.id ||
    result.source.sha256 !== definition.source.sha256 ||
    result.source.byteLength !== definition.source.byteLength ||
    result.source.declaredEncoding !== definition.source.declaredEncoding ||
    result.source.decodedAs !== definition.source.decodedAs ||
    result.definition.processId !== definition.processId ||
    result.definition.semanticProfile !== definition.semanticProfile ||
    (
      result.status === EngineDefinitionStartStatus.Started &&
      result.processInstanceId !== processInstanceId
    )
  ) {
    throw new DefinitionStartIntegrityError(reference);
  }
}

function requireProcessInstanceId(processInstanceId: string): void {
  if (
    typeof processInstanceId !== "string" ||
    processInstanceId.length === 0 ||
    !processInstanceId.isWellFormed()
  ) {
    throw new TypeError(
      "processInstanceId generator must return nonempty well-formed Unicode",
    );
  }
}

function cloneReference(reference: DefinitionReference): DefinitionReference {
  return {
    processId: reference.processId,
    version: reference.version,
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition start result: ${String(value)}`);
}
