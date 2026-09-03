import {
  DefinitionCorrelatedMessageResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind,
} from "@bpmn-lean/platform-contracts";
import type {
  DefinitionCorrelatedMessageCapabilities,
  DefinitionCorrelatedMessageResolution,
  PublicCorrelatedMessageCapability,
} from "@bpmn-lean/platform-contracts";
import {
  DefinitionCorrelatedMessageCapabilityStatus,
  DefinitionCorrelatedMessagePublicationStatus,
  DefinitionCorrelatedMessageResolutionKind as GatewayResolutionKind,
  DefinitionCorrelatedMessageSemanticOutcomeKind as GatewayOutcomeKind,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  DefinitionCorrelatedMessageCapability,
  DefinitionCorrelatedMessageDescribeRequest,
  DefinitionCorrelatedMessageResolution as GatewayResolution,
} from "@bpmn-lean/platform-engine-gateway";

import type {
  DefinitionMetadata,
  DefinitionReference,
} from "./contracts.js";
import {
  DefinitionCorrelatedMessageIntegrityError,
  DefinitionCorrelatedMessagePublishStatus,
} from "./definition-correlated-message-contracts.js";
import type {
  DefinitionCorrelatedMessageOperations,
  DefinitionCorrelatedMessagePublishCommand,
  DefinitionCorrelatedMessagePublishResult,
  DefinitionCorrelatedMessageServiceDependencies,
} from "./definition-correlated-message-contracts.js";
import { cloneDefinitionMetadata } from "./definition-values.js";
import { toPublicDefinition } from "./definition-public-values.js";

type LoadedDefinition = Readonly<{
  definition: DefinitionMetadata;
  bytes: Uint8Array;
}>;

/** Reconstructs and publishes definition-scoped Message correlation without a target index. */
export class DefinitionCorrelatedMessageService
  implements DefinitionCorrelatedMessageOperations
{
  readonly #dependencies: DefinitionCorrelatedMessageServiceDependencies;

  constructor(dependencies: DefinitionCorrelatedMessageServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async describe(
    reference: DefinitionReference,
  ): Promise<DefinitionCorrelatedMessageCapabilities | null> {
    const selected = snapshotReference(reference);
    const loaded = await this.#load(selected);
    if (loaded === null) return null;
    return {
      definition: toPublicDefinition(loaded.definition),
      messages: await this.#describeMessages(loaded),
    };
  }

  async publish(
    command: DefinitionCorrelatedMessagePublishCommand,
  ): Promise<DefinitionCorrelatedMessagePublishResult> {
    const snapshot = snapshotCommand(command);
    const loaded = await this.#load(snapshot.definition);
    if (loaded === null) {
      return { status: DefinitionCorrelatedMessagePublishStatus.DefinitionNotFound };
    }
    const messages = await this.#describeMessages(loaded);
    const matches = messages.filter(
      ({ catchEventId }) => catchEventId === snapshot.catchEventId,
    );
    if (matches.length === 0) {
      return { status: DefinitionCorrelatedMessagePublishStatus.CapabilityNotFound };
    }
    const selected = matches[0];
    if (matches.length !== 1 || selected === undefined) {
      throw new DefinitionCorrelatedMessageIntegrityError(
        "reconstructed definition repeated one correlated Message Catch Event identity",
      );
    }
    const result = await this.#dependencies.host.publish({
      ...hostDescribeRequest(loaded),
      catchEventId: snapshot.catchEventId,
      commandId: snapshot.commandId,
      payload: { ...snapshot.payload },
    });
    switch (result.status) {
      case DefinitionCorrelatedMessagePublicationStatus.Resolved:
        if (result.resolution.commandId !== snapshot.commandId) {
          throw new DefinitionCorrelatedMessageIntegrityError(
            "engine resolution changed the correlated Message command identity",
          );
        }
        return {
          status: DefinitionCorrelatedMessagePublishStatus.Resolved,
          publication: {
            definition: toPublicDefinition(loaded.definition),
            correlatedMessage: cloneCapability(selected),
            resolution: projectResolution(result.resolution),
          },
        };
      case DefinitionCorrelatedMessagePublicationStatus.IdentityConflict:
        return { status: DefinitionCorrelatedMessagePublishStatus.IdentityConflict };
      case DefinitionCorrelatedMessagePublicationStatus.CapabilityNotFound:
        throw new DefinitionCorrelatedMessageIntegrityError(
          "correlated Message capability disappeared between reconstruction and publication",
        );
      case DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure:
        throw new DefinitionCorrelatedMessageIntegrityError(result.evidence);
      default:
        return assertNever(result);
    }
  }

  async #load(reference: DefinitionReference): Promise<LoadedDefinition | null> {
    const stored = await this.#dependencies.repository.get(reference);
    if (stored === null) return null;
    const definition = cloneDefinitionMetadata(stored);
    if (
      definition.processId !== reference.processId ||
      definition.version !== reference.version
    ) {
      throw new DefinitionCorrelatedMessageIntegrityError(
        "definition repository did not preserve the exact version binding",
      );
    }
    const artifact = await this.#dependencies.artifacts.get(definition.source.sha256);
    if (artifact === null) {
      throw new DefinitionCorrelatedMessageIntegrityError(
        "stored correlated Message definition artifact is missing",
      );
    }
    const bytes = Uint8Array.from(artifact);
    if (bytes.byteLength !== definition.source.byteLength) {
      throw new DefinitionCorrelatedMessageIntegrityError(
        "stored correlated Message definition artifact length drifted",
      );
    }
    return { definition, bytes };
  }

  async #describeMessages(
    loaded: LoadedDefinition,
  ): Promise<readonly PublicCorrelatedMessageCapability[]> {
    const result = await this.#dependencies.host.describe(hostDescribeRequest(loaded));
    switch (result.status) {
      case DefinitionCorrelatedMessageCapabilityStatus.Available:
        return result.messages.map(cloneCapability);
      case DefinitionCorrelatedMessageCapabilityStatus.IntegrityFailure:
        throw new DefinitionCorrelatedMessageIntegrityError(result.evidence);
      default:
        return assertNever(result);
    }
  }
}

function hostDescribeRequest(
  loaded: LoadedDefinition,
): DefinitionCorrelatedMessageDescribeRequest {
  return {
    bytes: Uint8Array.from(loaded.bytes),
    definition: {
      processId: loaded.definition.processId,
      source: {
        id: loaded.definition.source.id,
        sha256: loaded.definition.source.sha256,
        byteLength: loaded.definition.source.byteLength,
      },
      semanticProfile: loaded.definition.semanticProfile,
    },
  };
}

function cloneCapability(
  capability: DefinitionCorrelatedMessageCapability,
): PublicCorrelatedMessageCapability {
  return {
    catchEventId: capability.catchEventId,
    channel: { ...capability.channel },
    correlationKeyId: capability.correlationKeyId,
  };
}

function snapshotReference(reference: DefinitionReference): DefinitionReference {
  requireNonempty(reference.processId, "processId");
  if (!Number.isSafeInteger(reference.version) || reference.version <= 0) {
    throw new TypeError("version must be a positive safe integer");
  }
  return { processId: reference.processId, version: reference.version };
}

function snapshotCommand(
  command: DefinitionCorrelatedMessagePublishCommand,
): DefinitionCorrelatedMessagePublishCommand {
  const definition = snapshotReference(command.definition);
  requireNonempty(command.catchEventId, "catchEventId");
  requireNonempty(command.commandId, "commandId");
  if (command.payload.kind !== "string") {
    throw new TypeError("payload.kind must be string");
  }
  requireNonempty(command.payload.value, "payload.value");
  return {
    definition,
    catchEventId: command.catchEventId,
    commandId: command.commandId,
    payload: { kind: command.payload.kind, value: command.payload.value },
  };
}

function projectResolution(
  resolution: GatewayResolution,
): DefinitionCorrelatedMessageResolution {
  switch (resolution.kind) {
    case GatewayResolutionKind.Semantic:
      return {
        kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
        commandId: resolution.commandId,
        ingressOrdinal: resolution.ingressOrdinal,
        outcome: projectSemanticOutcome(resolution.outcome),
      };
    case GatewayResolutionKind.Capacity:
      return {
        kind: DefinitionCorrelatedMessageResolutionKind.Capacity,
        commandId: resolution.commandId,
        ingressOrdinal: null,
        failure: { ...resolution.failure },
      };
    case GatewayResolutionKind.InfrastructureIndeterminate:
      return resolution.target === null
        ? {
            kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
            commandId: resolution.commandId,
            ingressOrdinal: resolution.ingressOrdinal,
            phase: resolution.phase,
            target: null,
            failure: { ...resolution.failure },
          }
        : {
            kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
            commandId: resolution.commandId,
            ingressOrdinal: resolution.ingressOrdinal,
            phase: "targetDelivery",
            target: { processInstanceId: resolution.target.processInstanceId },
            failure: { kind: "targetInconsistent" },
          };
    default:
      return assertNever(resolution);
  }
}

function projectSemanticOutcome(
  outcome: Extract<GatewayResolution, { kind: "semantic" }>["outcome"],
): Extract<DefinitionCorrelatedMessageResolution, { kind: "semantic" }>["outcome"] {
  switch (outcome.kind) {
    case GatewayOutcomeKind.Committed:
      return {
        kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
        target: { processInstanceId: outcome.target.processInstanceId },
      };
    case GatewayOutcomeKind.RejectedNoMatch:
      return { kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch };
    case GatewayOutcomeKind.RejectedAmbiguous:
      return { kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous };
    default:
      return assertNever(outcome);
  }
}

function requireNonempty(value: string, label: string): void {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be a non-empty well-formed string`);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported correlated Message value: ${String(value)}`);
}
