/**
 * The port Product 2's correlated Message service consumes: target-free capability discovery and publication over
 * exact admitted definition bytes, and its realization over the engine's correlated Message ingress.
 *
 * Discovery lists each correlated catch the engine publishes for the definition (`correlatedChannels`) on an operation
 * channel with its one correlation key. A publication goes to the engine's ingress for the stored version, which
 * delivers it to the one instance whose key matches at delivery time. A deployment that serves no Messages answers
 * both operations `unavailable` with its host refusal code.
 */
import {
  EngineCorrelatedMessageStatus,
  engineCorrelationAmbiguousCode,
  engineHostRefusalCodes,
  engineNotCorrelatedCode,
  publishEngineCorrelatedMessage,
  type EngineCorrelatedMessageResult,
  type EngineDefinitionCapabilities,
  type EngineSourceOverlaySelection,
} from "@bpmn-lean/engine-api";
import type { PublicSourceOverlayIdentity } from "@bpmn-lean/platform-contracts";

import type { GatewayContext } from "./gateway-context.js";
import { recompileStoredDefinition, type StoredDefinitionVersion } from "./stored-definition.js";

type DefinitionSourceOverlaySelection = EngineSourceOverlaySelection;

export type DefinitionCorrelationIdentity = StoredDefinitionVersion & Readonly<{
  sourceOverlay?: PublicSourceOverlayIdentity | null;
}>;

export type DefinitionCorrelatedMessageCapability = Readonly<{
  catchEventId: string;
  channel: Readonly<{
    kind: "operationMessage";
    interfaceId: string;
    interfaceOperationId: string;
    messageId: string;
  }>;
  correlationKeyId: string;
}>;

export type DefinitionCorrelatedMessagePayload = Readonly<{
  kind: "string";
  value: string;
}>;

export type DefinitionCorrelatedMessageDescribeRequest = Readonly<{
  bytes: Uint8Array;
  sourceOverlay?: DefinitionSourceOverlaySelection | null;
  definition: DefinitionCorrelationIdentity;
}>;

/** `message` is the capability the service selected from this definition's described capabilities. */
export type DefinitionCorrelatedMessagePublishRequest =
  DefinitionCorrelatedMessageDescribeRequest & Readonly<{
    message: DefinitionCorrelatedMessageCapability;
    commandId: string;
    payload: DefinitionCorrelatedMessagePayload;
  }>;

export enum DefinitionCorrelatedMessageCapabilityStatus {
  Available = "available",
  Unavailable = "unavailable",
  IntegrityFailure = "integrityFailure",
}

/** The engine cannot serve correlated Messages; `code` is its stable refusal code. */
export type DefinitionCorrelationUnavailable = Readonly<{ code: string; evidence: string }>;

export type DefinitionCorrelatedMessageCapabilityResult =
  | Readonly<{
      status: DefinitionCorrelatedMessageCapabilityStatus.Available;
      messages: readonly DefinitionCorrelatedMessageCapability[];
    }>
  | (Readonly<{ status: DefinitionCorrelatedMessageCapabilityStatus.Unavailable }> & DefinitionCorrelationUnavailable)
  | Readonly<{
      status: DefinitionCorrelatedMessageCapabilityStatus.IntegrityFailure;
      evidence: string;
    }>;

export enum DefinitionCorrelatedMessagePublicationStatus {
  Resolved = "resolved",
  CapabilityNotFound = "capabilityNotFound",
  IdentityConflict = "identityConflict",
  Unavailable = "unavailable",
  IntegrityFailure = "integrityFailure",
}

export enum DefinitionCorrelatedMessageResolutionKind {
  Semantic = "semantic",
  Capacity = "capacity",
  InfrastructureIndeterminate = "infrastructureIndeterminate",
}

export enum DefinitionCorrelatedMessageSemanticOutcomeKind {
  Committed = "committed",
  RejectedNoMatch = "rejectedNoMatch",
  RejectedAmbiguous = "rejectedAmbiguous",
}

export type DefinitionCorrelatedMessageResolution =
  | Readonly<{
      kind: DefinitionCorrelatedMessageResolutionKind.Semantic;
      commandId: string;
      ingressOrdinal: number;
      outcome:
        | { kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch }
        | { kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous }
        | {
            kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed;
            target: Readonly<{ processInstanceId: string }>;
          };
    }>
  | Readonly<{
      kind: DefinitionCorrelatedMessageResolutionKind.Capacity;
      commandId: string;
      ingressOrdinal: null;
      failure: Readonly<{
        kind: "publicationQueue" | "publicationLedger";
        measure: "count" | "canonicalBytes";
        configuredBound: number;
        observedValue: number;
      }>;
    }>
  | Readonly<{
      kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate;
      commandId: string;
      ingressOrdinal: number | null;
      phase:
        | "ingressResolution"
        | "candidateFanout"
        | "targetDelivery"
        | "resultRecovery";
      target: null;
      failure:
        | Readonly<{ kind: "unconfirmed" }>
        | Readonly<{
            kind: "capacity";
            boundary:
              | "activityRequest"
              | "activityResult"
              | "queryResponse"
              | "continuation";
            configuredBound: number;
            observedValue: number;
          }>
        | Readonly<{
            kind: "runCapacity";
            configuredBound: number;
            observedValue: number;
          }>;
    }>
  | Readonly<{
      kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate;
      commandId: string;
      ingressOrdinal: number | null;
      phase: "targetDelivery";
      target: Readonly<{ processInstanceId: string }>;
      failure: Readonly<{ kind: "targetInconsistent" }>;
    }>;

export type DefinitionCorrelatedMessagePublicationResult =
  | Readonly<{
      status: DefinitionCorrelatedMessagePublicationStatus.Resolved;
      resolution: DefinitionCorrelatedMessageResolution;
    }>
  | Readonly<{
      status: DefinitionCorrelatedMessagePublicationStatus.CapabilityNotFound;
    }>
  | Readonly<{
      status: DefinitionCorrelatedMessagePublicationStatus.IdentityConflict;
    }>
  | (Readonly<{ status: DefinitionCorrelatedMessagePublicationStatus.Unavailable }> & DefinitionCorrelationUnavailable)
  | Readonly<{
      status: DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure;
      evidence: string;
    }>;

export interface DefinitionCorrelatedMessageHost {
  describe(
    request: DefinitionCorrelatedMessageDescribeRequest,
  ): Promise<DefinitionCorrelatedMessageCapabilityResult>;
  publish(
    request: DefinitionCorrelatedMessagePublishRequest,
  ): Promise<DefinitionCorrelatedMessagePublicationResult>;
}

const unserved: DefinitionCorrelationUnavailable = {
  code: engineHostRefusalCodes.messages,
  evidence: "The deployment does not serve Messages.",
};

/**
 * Every correlated catch on an operation channel with exactly one criterion, the shape admission admits
 * (`message.correlation.channel`, `message.correlation.keys`); `null` when the engine publishes another.
 */
function correlatedMessages(capabilities: EngineDefinitionCapabilities): DefinitionCorrelatedMessageCapability[] | null {
  const messages: DefinitionCorrelatedMessageCapability[] = [];
  for (const { channel, catches } of capabilities.correlatedChannels) {
    for (const { elementId, criteria } of catches) {
      const [criterion] = criteria;
      if (channel.kind !== "operationMessage" || criterion === undefined || criteria.length !== 1) return null;
      messages.push({ catchEventId: elementId, channel: { ...channel }, correlationKeyId: criterion.key });
    }
  }
  return messages;
}

function resolution(commandId: string, result: EngineCorrelatedMessageResult): DefinitionCorrelatedMessagePublicationResult {
  switch (result.status) {
    case EngineCorrelatedMessageStatus.Delivered:
      return {
        status: DefinitionCorrelatedMessagePublicationStatus.Resolved,
        resolution: {
          kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
          commandId,
          ingressOrdinal: result.ingressOrdinal,
          outcome: {
            kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
            target: { processInstanceId: result.target.processInstanceId },
          },
        },
      };
    case EngineCorrelatedMessageStatus.Rejected:
      if (result.target !== null) {
        // The sole match refused the delivery when it rechecked it: no rematch, the target is reported.
        return {
          status: DefinitionCorrelatedMessagePublicationStatus.Resolved,
          resolution: {
            kind: DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
            commandId,
            ingressOrdinal: result.ingressOrdinal,
            phase: "targetDelivery",
            target: { processInstanceId: result.target.processInstanceId },
            failure: { kind: "targetInconsistent" },
          },
        };
      }
      if (result.failure.code !== engineNotCorrelatedCode && result.failure.code !== engineCorrelationAmbiguousCode) {
        return { status: DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure, evidence: result.failure.evidence };
      }
      return {
        status: DefinitionCorrelatedMessagePublicationStatus.Resolved,
        resolution: {
          kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
          commandId,
          ingressOrdinal: result.ingressOrdinal,
          outcome: {
            kind: result.failure.code === engineNotCorrelatedCode
              ? DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch
              : DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous,
          },
        },
      };
    case EngineCorrelatedMessageStatus.IdentityConflict:
      return { status: DefinitionCorrelatedMessagePublicationStatus.IdentityConflict };
    case EngineCorrelatedMessageStatus.Refused:
      return { status: DefinitionCorrelatedMessagePublicationStatus.Unavailable, ...result.failure };
  }
}

export class BpmnDefinitionCorrelatedMessageGateway implements DefinitionCorrelatedMessageHost {
  readonly #context: GatewayContext;

  constructor(context: GatewayContext) {
    this.#context = context;
  }

  async describe(request: DefinitionCorrelatedMessageDescribeRequest): Promise<DefinitionCorrelatedMessageCapabilityResult> {
    const resolved = await recompileStoredDefinition(
      this.#context, request.bytes, request.sourceOverlay ?? null, request.definition);
    if (resolved.kind === "integrityFailure") {
      return { status: DefinitionCorrelatedMessageCapabilityStatus.IntegrityFailure, evidence: resolved.evidence };
    }
    if (!this.#context.host.served.messages) return { status: DefinitionCorrelatedMessageCapabilityStatus.Unavailable, ...unserved };
    const messages = correlatedMessages(resolved.compilation.capabilities);
    if (messages === null) {
      return {
        status: DefinitionCorrelatedMessageCapabilityStatus.IntegrityFailure,
        evidence: "The engine published a correlated catch outside an operation channel with one correlation key.",
      };
    }
    return { status: DefinitionCorrelatedMessageCapabilityStatus.Available, messages };
  }

  async publish(request: DefinitionCorrelatedMessagePublishRequest): Promise<DefinitionCorrelatedMessagePublicationResult> {
    const resolved = await recompileStoredDefinition(
      this.#context, request.bytes, request.sourceOverlay ?? null, request.definition);
    if (resolved.kind === "integrityFailure") {
      return { status: DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure, evidence: resolved.evidence };
    }
    const messages = correlatedMessages(resolved.compilation.capabilities) ?? [];
    if (!messages.some((message) => message.catchEventId === request.message.catchEventId &&
        message.correlationKeyId === request.message.correlationKeyId &&
        message.channel.messageId === request.message.channel.messageId &&
        message.channel.interfaceId === request.message.channel.interfaceId &&
        message.channel.interfaceOperationId === request.message.channel.interfaceOperationId)) {
      return { status: DefinitionCorrelatedMessagePublicationStatus.CapabilityNotFound };
    }
    const { ref, profile, sourceOverlay } = resolved.compilation.definition;
    const result = await publishEngineCorrelatedMessage({
      host: this.#context.host,
      definition: { ref: { ...ref, version: request.definition.version }, profile, sourceOverlay },
      channel: { ...request.message.channel },
      correlationKey: request.message.correlationKeyId,
      commandId: request.commandId,
      payload: { ...request.payload },
    });
    return resolution(request.commandId, result);
  }
}
