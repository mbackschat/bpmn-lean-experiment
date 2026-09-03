/** Product 2's target-free correlated Message boundary over exact admitted definition bytes. */
import {
  EngineCorrelatedMessagePublishResolutionKind,
  EngineCorrelatedMessageSemanticOutcomeKind,
  EngineCorrelatedMessageIdentityConflict,
  EngineCorrelatedMessageIngressInvalid,
  EngineDefinitionCompilationStatus,
  EngineVariableValueKind,
  compileBpmnDefinition,
  publishBpmnDefinitionCorrelatedMessage,
} from "@bpmn-lean/engine-api";
import type {
  EngineAcceptedDefinitionCompilation,
  EngineCorrelatedMessagePublishRequest,
  EngineCorrelatedMessagePublishResolution,
} from "@bpmn-lean/engine-api";

export type DefinitionCorrelationSource = Readonly<{
  id: string;
  sha256: string;
  byteLength: number;
}>;

export type DefinitionCorrelationIdentity = Readonly<{
  processId: string;
  source: DefinitionCorrelationSource;
  semanticProfile: string;
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
  definition: DefinitionCorrelationIdentity;
}>;

export type DefinitionCorrelatedMessagePublishRequest =
  DefinitionCorrelatedMessageDescribeRequest & Readonly<{
    catchEventId: string;
    commandId: string;
    payload: DefinitionCorrelatedMessagePayload;
  }>;

export enum DefinitionCorrelatedMessageCapabilityStatus {
  Available = "available",
  IntegrityFailure = "integrityFailure",
}

export type DefinitionCorrelatedMessageCapabilityResult =
  | Readonly<{
      status: DefinitionCorrelatedMessageCapabilityStatus.Available;
      messages: readonly DefinitionCorrelatedMessageCapability[];
    }>
  | Readonly<{
      status: DefinitionCorrelatedMessageCapabilityStatus.IntegrityFailure;
      evidence: string;
    }>;

export enum DefinitionCorrelatedMessagePublicationStatus {
  Resolved = "resolved",
  CapabilityNotFound = "capabilityNotFound",
  IdentityConflict = "identityConflict",
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

export type BpmnDefinitionCorrelatedMessageGatewayOptions = Readonly<{
  maxSourceBytes: number;
  parserDeadlineMs: number;
  temporalClient: EngineCorrelatedMessagePublishRequest["temporalClient"];
  temporalTaskQueue: string;
}>;

type ResolvedCompilation = Readonly<{
  kind: "resolved";
  compilation: EngineAcceptedDefinitionCompilation;
}>;

type CompilationIntegrityFailure = Readonly<{
  kind: "integrityFailure";
  evidence: string;
}>;

export class BpmnDefinitionCorrelatedMessageGateway
  implements DefinitionCorrelatedMessageHost
{
  readonly #limits: Readonly<{ maxBytes: number; parserDeadlineMs: number }>;
  readonly #temporalClient: EngineCorrelatedMessagePublishRequest["temporalClient"];
  readonly #taskQueue: string;

  constructor(options: BpmnDefinitionCorrelatedMessageGatewayOptions) {
    requirePositiveSafeInteger(options.maxSourceBytes, "maxSourceBytes");
    requirePositiveSafeInteger(options.parserDeadlineMs, "parserDeadlineMs");
    requireNonempty(options.temporalTaskQueue, "temporalTaskQueue");
    this.#limits = {
      maxBytes: options.maxSourceBytes,
      parserDeadlineMs: options.parserDeadlineMs,
    };
    this.#temporalClient = options.temporalClient;
    this.#taskQueue = options.temporalTaskQueue;
  }

  async describe(
    request: DefinitionCorrelatedMessageDescribeRequest,
  ): Promise<DefinitionCorrelatedMessageCapabilityResult> {
    const resolved = await this.#resolve(request);
    if (resolved.kind === "integrityFailure") {
      return {
        status: DefinitionCorrelatedMessageCapabilityStatus.IntegrityFailure,
        evidence: resolved.evidence,
      };
    }
    return {
      status: DefinitionCorrelatedMessageCapabilityStatus.Available,
      messages: resolved.compilation.correlationCapabilities.messages.map(
        projectCapability,
      ),
    };
  }

  async publish(
    request: DefinitionCorrelatedMessagePublishRequest,
  ): Promise<DefinitionCorrelatedMessagePublicationResult> {
    const snapshot = snapshotPublishRequest(request);
    const resolved = await this.#resolve(snapshot);
    if (resolved.kind === "integrityFailure") {
      return {
        status: DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure,
        evidence: resolved.evidence,
      };
    }
    const matches = resolved.compilation.correlationCapabilities.messages.filter(
      ({ catchEventId }) => catchEventId === snapshot.catchEventId,
    );
    if (matches.length === 0) {
      return {
        status: DefinitionCorrelatedMessagePublicationStatus.CapabilityNotFound,
      };
    }
    const capability = matches[0];
    if (matches.length !== 1 || capability === undefined) {
      return {
        status: DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure,
        evidence: "Stored definition produced duplicate correlated Message capability identity.",
      };
    }
    try {
      return {
        status: DefinitionCorrelatedMessagePublicationStatus.Resolved,
        resolution: projectResolution(
          await publishBpmnDefinitionCorrelatedMessage({
            temporalClient: this.#temporalClient,
            commandId: snapshot.commandId,
            address: capability.address,
            payload: {
              kind: EngineVariableValueKind.String,
              value: snapshot.payload.value,
            },
            taskQueue: this.#taskQueue,
          }),
        ),
      };
    } catch (error: unknown) {
      if (error instanceof EngineCorrelatedMessageIdentityConflict) {
        return {
          status: DefinitionCorrelatedMessagePublicationStatus.IdentityConflict,
        };
      }
      if (error instanceof EngineCorrelatedMessageIngressInvalid) {
        return {
          status: DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure,
          evidence: "The engine refused the reconstructed correlated Message command.",
        };
      }
      throw error;
    }
  }

  async #resolve(
    request: DefinitionCorrelatedMessageDescribeRequest,
  ): Promise<ResolvedCompilation | CompilationIntegrityFailure> {
    const snapshot = snapshotDescribeRequest(request);
    let result;
    try {
      result = await compileBpmnDefinition({
        bytes: snapshot.bytes,
        sourceId: snapshot.definition.source.id,
        semanticProfile: snapshot.definition.semanticProfile,
        expectedSha256: snapshot.definition.source.sha256,
        limits: this.#limits,
      });
    } catch {
      return integrityFailure(
        "Stored definition could not be reconstructed through the engine compiler.",
      );
    }
    if (result.status === EngineDefinitionCompilationStatus.Rejected) {
      return integrityFailure(
        "Stored definition is no longer accepted by its recorded engine profile.",
      );
    }
    if (
      result.definition.processId !== snapshot.definition.processId ||
      result.definition.semanticProfile !== snapshot.definition.semanticProfile ||
      result.source.id !== snapshot.definition.source.id ||
      result.source.sha256 !== snapshot.definition.source.sha256 ||
      result.source.byteLength !== snapshot.definition.source.byteLength
    ) {
      return integrityFailure(
        "Stored definition identity differs from the reconstructed engine definition.",
      );
    }
    return { kind: "resolved", compilation: result };
  }
}

function snapshotDescribeRequest(
  request: DefinitionCorrelatedMessageDescribeRequest,
): DefinitionCorrelatedMessageDescribeRequest {
  return {
    bytes: Uint8Array.from(request.bytes),
    definition: {
      processId: request.definition.processId,
      source: {
        id: request.definition.source.id,
        sha256: request.definition.source.sha256,
        byteLength: request.definition.source.byteLength,
      },
      semanticProfile: request.definition.semanticProfile,
    },
  };
}

function snapshotPublishRequest(
  request: DefinitionCorrelatedMessagePublishRequest,
): DefinitionCorrelatedMessagePublishRequest {
  const described = snapshotDescribeRequest(request);
  return {
    ...described,
    catchEventId: request.catchEventId,
    commandId: request.commandId,
    payload: { kind: request.payload.kind, value: request.payload.value },
  };
}

function projectCapability(
  capability: EngineAcceptedDefinitionCompilation["correlationCapabilities"]["messages"][number],
): DefinitionCorrelatedMessageCapability {
  return {
    catchEventId: capability.catchEventId,
    channel: {
      kind: capability.address.channel.kind,
      interfaceId: capability.address.channel.interfaceId,
      interfaceOperationId: capability.address.channel.interfaceOperationId,
      messageId: capability.address.channel.messageId,
    },
    correlationKeyId: capability.address.correlationKeyId,
  };
}

function projectResolution(
  resolution: EngineCorrelatedMessagePublishResolution,
): DefinitionCorrelatedMessageResolution {
  switch (resolution.kind) {
    case EngineCorrelatedMessagePublishResolutionKind.Semantic:
      return {
        kind: DefinitionCorrelatedMessageResolutionKind.Semantic,
        commandId: resolution.commandId,
        ingressOrdinal: resolution.ingressOrdinal,
        outcome: projectSemanticOutcome(resolution.outcome),
      };
    case EngineCorrelatedMessagePublishResolutionKind.Capacity:
      return {
        kind: DefinitionCorrelatedMessageResolutionKind.Capacity,
        commandId: resolution.commandId,
        ingressOrdinal: null,
        failure: { ...resolution.failure },
      };
    case EngineCorrelatedMessagePublishResolutionKind.InfrastructureIndeterminate:
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
  }
}

function projectSemanticOutcome(
  outcome: Extract<
    EngineCorrelatedMessagePublishResolution,
    { kind: EngineCorrelatedMessagePublishResolutionKind.Semantic }
  >["outcome"],
): Extract<
  DefinitionCorrelatedMessageResolution,
  { kind: DefinitionCorrelatedMessageResolutionKind.Semantic }
>["outcome"] {
  switch (outcome.kind) {
    case EngineCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch:
      return { kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedNoMatch };
    case EngineCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous:
      return { kind: DefinitionCorrelatedMessageSemanticOutcomeKind.RejectedAmbiguous };
    case EngineCorrelatedMessageSemanticOutcomeKind.Committed:
      return {
        kind: DefinitionCorrelatedMessageSemanticOutcomeKind.Committed,
        target: { processInstanceId: outcome.target.processInstanceId },
      };
  }
}

function integrityFailure(evidence: string): CompilationIntegrityFailure {
  return { kind: "integrityFailure", evidence };
}

function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}
