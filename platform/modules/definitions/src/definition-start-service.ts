import {
  DefinitionStartStatus as EngineDefinitionStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionStartIntent,
  DefinitionStartPreparationResult,
  DefinitionStartResult as EngineDefinitionStartResult,
  DefinitionVersionStartDescriptionRequest,
  DefinitionVersionStartRequest,
  DefinitionVersionStarter,
} from "@bpmn-lean/platform-engine-gateway";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

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
import {
  ConfirmedProcessInstanceIntegrityError,
  ConfirmedProcessInstanceState,
} from "./confirmed-process-instance-contracts.js";
import type {
  DirectProcessInstanceHost,
} from "./confirmed-process-instance-contracts.js";
import type {
  ConfirmedProcessInstancePublicationService,
} from "./confirmed-process-instance-publication-service.js";
import { toPublicDefinition } from "./definition-public-values.js";

export type ProcessInstanceIdGenerator = () => string;

/** Starts one exact stored definition version through the narrowed engine boundary. */
export class DefinitionStartService {
  readonly #starter: DefinitionVersionStarter;
  readonly #artifacts: ExactArtifactStore;
  readonly #repository: DefinitionRepository;
  readonly #processInstanceIdGenerator: ProcessInstanceIdGenerator;
  readonly #confirmedInstances: ConfirmedProcessInstancePublicationService;

  constructor(
    starter: DefinitionVersionStarter,
    artifacts: ExactArtifactStore,
    repository: DefinitionRepository,
    processInstanceIdGenerator: ProcessInstanceIdGenerator,
    confirmedInstances: ConfirmedProcessInstancePublicationService,
  ) {
    this.#starter = starter;
    this.#artifacts = artifacts;
    this.#repository = repository;
    this.#processInstanceIdGenerator = processInstanceIdGenerator;
    this.#confirmedInstances = confirmedInstances;
  }

  async start(
    reference: DefinitionReference,
  ): Promise<DefinitionVersionStartResult> {
    const selectedReference = cloneReference(reference);
    const stored = await this.#repository.get(selectedReference);
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
    const request = {
      bytes: Uint8Array.from(bytes),
      sourceId: definition.source.id,
      expectedSha256: definition.source.sha256,
      semanticProfile: definition.semanticProfile,
      expectedProcessId: definition.processId,
      processInstanceId,
    } satisfies DefinitionVersionStartRequest;
    const prepared = await this.#starter.prepareDefinitionVersion(request);
    requireExactDefinitionBinding(
      prepared,
      processInstanceId,
      definition,
      selectedReference,
    );

    switch (prepared.status) {
      case EngineDefinitionStartStatus.Admitted: {
        const instance = {
          processInstanceId,
          definition: toPublicDefinition(definition),
        };
        let record;
        try {
          record = await this.#confirmedInstances.startDirect(
            {
              instance,
              locator: prepared.locator,
              intent: prepared.intent,
            },
            this.#directHost(request, prepared.intent, definition, selectedReference),
          );
        } catch (error: unknown) {
          if (error instanceof ConfirmedProcessInstanceIntegrityError) {
            throw new DefinitionStartIntegrityError(selectedReference);
          }
          throw error;
        }
        if (record.state !== ConfirmedProcessInstanceState.Confirmed) {
          throw new DefinitionStartIntegrityError(selectedReference);
        }
        return {
          status: DefinitionVersionStartStatus.Started,
          instance: structuredClone(record.instance),
        };
      }
      case EngineDefinitionStartStatus.Rejected:
        return {
          status: DefinitionVersionStartStatus.Rejected,
          definition: cloneDefinitionMetadata(definition),
          failure: { ...prepared.failure },
        };
      case EngineDefinitionStartStatus.IntegrityFailure:
        throw new DefinitionStartIntegrityError(selectedReference);
      default:
        return assertNever(prepared);
    }
  }

  /** Dispatches safe reserved starts and describes only already-dispatched starts. */
  async reconcileAll(): Promise<void> {
    await this.#confirmedInstances.reconcileDirect(this.#reconciliationHost());
    await this.#confirmedInstances.reconcileDeliveries();
  }

  /** Reconciles one exact durable direct-start identity. */
  async reconcileProcessInstance(processInstanceId: string): Promise<void> {
    await this.#confirmedInstances.reconcileDirectProcessInstance(
      processInstanceId,
      this.#reconciliationHost(),
    );
  }

  #reconciliationHost(): DirectProcessInstanceHost {
    return {
      start: async (reservation) => {
        if (reservation.intent.protocol !== "bpmn-direct-start-v1") {
          return {
            status: "integrityFailure",
            evidence: "reserved direct start has an unsupported intent protocol",
          };
        }
        const reference = {
          processId: reservation.instance.definition.processId,
          version: reservation.instance.definition.version,
        };
        const definition = toDefinitionMetadata(
          reservation.instance.definition,
        );
        const artifact = await this.#artifacts.get(definition.source.sha256);
        if (artifact === null) {
          throw new DefinitionArtifactIntegrityError(
            reference,
            definition.source.sha256,
          );
        }
        if (artifact.byteLength !== definition.source.byteLength) {
          throw new DefinitionArtifactIntegrityError(
            reference,
            definition.source.sha256,
            {
              expected: definition.source.byteLength,
              actual: artifact.byteLength,
            },
          );
        }
        const request = {
          bytes: Uint8Array.from(artifact),
          sourceId: definition.source.id,
          expectedSha256: definition.source.sha256,
          semanticProfile: definition.semanticProfile,
          expectedProcessId: definition.processId,
          processInstanceId: reservation.instance.processInstanceId,
        } satisfies DefinitionVersionStartRequest;
        return this.#directHost(
          request,
          {
            protocol: "bpmn-direct-start-v1",
            intentSha256: reservation.intent.intentSha256,
          },
          definition,
          reference,
        ).start(reservation);
      },
      describe: async (reservation) => {
        if (reservation.intent.protocol !== "bpmn-direct-start-v1") {
          return { status: "divergent" };
        }
        const result = await this.#starter.describeDefinitionVersionStart({
          processInstanceId: reservation.instance.processInstanceId,
          expectedIntent: {
            protocol: "bpmn-direct-start-v1",
            intentSha256: reservation.intent.intentSha256,
          },
        });
        return { status: result.status };
      },
    };
  }

  #directHost(
    request: DefinitionVersionStartRequest,
    expectedIntent: DefinitionStartIntent,
    definition: DefinitionMetadata,
    reference: DefinitionReference,
  ): DirectProcessInstanceHost {
    return {
      start: async () => {
        const result = await this.#starter.startPreparedDefinitionVersion({
          ...request,
          bytes: Uint8Array.from(request.bytes),
          expectedIntent: { ...expectedIntent },
        });
        try {
          requireExactDefinitionBinding(
            result,
            request.processInstanceId,
            definition,
            reference,
          );
        } catch (error: unknown) {
          if (error instanceof DefinitionStartIntegrityError) {
            return {
              status: "integrityFailure",
              evidence: "prepared direct start returned divergent identity",
            };
          }
          throw error;
        }
        switch (result.status) {
          case EngineDefinitionStartStatus.Started:
            return { status: "started" };
          case EngineDefinitionStartStatus.Rejected:
          case EngineDefinitionStartStatus.IntegrityFailure:
            return { status: result.status, evidence: result.failure.evidence };
          default:
            return assertNever(result);
        }
      },
      describe: async () => {
        const descriptionRequest = {
          processInstanceId: request.processInstanceId,
          expectedIntent: { ...expectedIntent },
        } satisfies DefinitionVersionStartDescriptionRequest;
        const result = await this.#starter.describeDefinitionVersionStart(
          descriptionRequest,
        );
        return { status: result.status };
      },
    };
  }
}

function toDefinitionMetadata(
  definition: DeployedDefinitionVersion,
): DefinitionMetadata {
  return {
    processId: definition.processId,
    version: definition.version,
    source: { ...definition.source },
    semanticProfile: definition.semanticProfile,
    startCapabilities: {
      messageStarts: definition.startCapabilities.messageStarts.map(
        ({ startEventId, channel }) => ({
          startEventId,
          channel: { ...channel },
        }),
      ),
      timerStarts: definition.startCapabilities.timerStarts.map(
        ({ startEventId, durationMs }) => ({ startEventId, durationMs }),
      ),
    },
  };
}

function requireExactDefinitionBinding(
  result: EngineDefinitionStartResult | DefinitionStartPreparationResult,
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
      (
        result.status === EngineDefinitionStartStatus.Started ||
        result.status === EngineDefinitionStartStatus.Admitted
      ) &&
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
