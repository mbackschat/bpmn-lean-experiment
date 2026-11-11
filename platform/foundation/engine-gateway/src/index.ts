/** Product 2's only entry into the BPMN engine contract. */
import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionStartStatus,
  EngineDeploymentStatus,
  EngineStartDescriptionStatus,
  compileBpmnDefinition,
  createEngineHostRuntime,
  describeBpmnDefinitionVersionStart,
  prepareBpmnDefinitionVersionStart,
  registerEngineDeployment,
  serializeEngineProcessLocator,
  startBpmnDefinitionVersion,
  startPreparedBpmnDefinitionVersion,
  type EngineDefinitionStartPreparationResult,
  type EngineDefinitionStartRequest,
  type EngineDefinitionStartResult,
  type EngineDiagnostic,
  type EngineHost,
  type EngineHostRuntime,
  type EngineIntent,
  type EngineServedRequirements,
  type EngineSourceOverlaySelection,
} from "@bpmn-lean/engine-api";
import type {
  ExactPublicSourceIdentity,
  VariableBinding as PlatformVariableBinding,
} from "@bpmn-lean/platform-contracts";

import { mapDefinitionStartCapabilities, type DefinitionStartCapabilities } from "./definition-capabilities.js";
import { BpmnDefinitionCorrelatedMessageGateway } from "./definition-correlated-message-host.js";
import { BpmnDefinitionMessageStartGateway } from "./definition-message-start-gateway.js";
import { BpmnDefinitionScheduleGateway } from "./definition-schedule-gateway.js";
import {
  engineBindings,
  gatewayContext,
  platformIdentity,
  platformSource,
  requireNonempty,
  resolveProfile,
  storedProfile,
  type DefinitionIdentity,
  type GatewayContext,
  type GatewayLimits,
  type ProfileRelations,
} from "./gateway-context.js";
import { BpmnProcessOperationsGateway } from "./process-operations-gateway.js";
import {
  BpmnProcessExecutionPublicationGateway,
  BpmnProcessFlowNodeOccurrenceGateway,
} from "./process-publication-gateway.js";
import { BpmnProcessWorkGateway } from "./process-work-gateway.js";

export const DefinitionCompilationStatus = EngineDefinitionCompilationStatus;
export const DefinitionStartStatus = EngineDefinitionStartStatus;
export const DefinitionStartDescriptionStatus = EngineStartDescriptionStatus;

export type DefinitionSourceOverlaySelection = EngineSourceOverlaySelection;
export type DefinitionStartIntent = EngineIntent;
export type DefinitionDiagnostic = EngineDiagnostic;
export type { DefinitionIdentity, EngineHostRuntime, ProfileRelations };

/** The refusal of a definition whose profile the deployment's catalog does not hold. */
export const unknownProfileCode = "platform.profileUnknown";

export type DefinitionCompilationResult =
  | Readonly<{
      status: EngineDefinitionCompilationStatus.Accepted;
      source: ExactPublicSourceIdentity;
      diagnostics: readonly [];
      definition: DefinitionIdentity;
      startCapabilities: DefinitionStartCapabilities;
    }>
  | Readonly<{
      status: EngineDefinitionCompilationStatus.Rejected;
      source: ExactPublicSourceIdentity;
      diagnostics: readonly DefinitionDiagnostic[];
      definition: undefined;
    }>;

/** An engine start result in Product 2's terms: the source and definition identity as Product 2 names them. */
type PlatformStart<R> = R extends Readonly<{ definition: unknown }>
  ? Omit<R, "definition" | "locator" | "source"> &
    Readonly<{ source: ExactPublicSourceIdentity; definition: DefinitionIdentity }>
  : never;

export type DefinitionStartResult = PlatformStart<EngineDefinitionStartResult>;

export type DefinitionStartPreparationResult =
  | (PlatformStart<Extract<EngineDefinitionStartPreparationResult, { status: EngineDefinitionStartStatus.Admitted }>> &
      Readonly<{ locator: string }>)
  | PlatformStart<Exclude<EngineDefinitionStartPreparationResult, { status: EngineDefinitionStartStatus.Admitted }>>;

export type DefinitionStartDescriptionResult = Readonly<{ status: EngineStartDescriptionStatus }>;

export type DefinitionCompilationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  semanticProfile: string;
  expectedSha256: string | undefined;
  sourceOverlay?: DefinitionSourceOverlaySelection | null;
}>;

export type DefinitionVersionStartRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
  /** The deployed version Product 2 stored the definition under; the engine names the started definition by it. */
  version: number;
  processInstanceId: string;
  initialVariables: readonly PlatformVariableBinding[];
  sourceOverlay?: DefinitionSourceOverlaySelection | null;
}>;

export type PreparedDefinitionVersionStartRequest = DefinitionVersionStartRequest & Readonly<{
  expectedIntent: DefinitionStartIntent;
}>;

export type DefinitionVersionStartDescriptionRequest = Readonly<{
  processInstanceId: string;
  expectedIntent: DefinitionStartIntent;
}>;

/** A stored definition version, named as Product 2 stored it, to register with the engine's population. */
export type DefinitionVersionRegistrationRequest = Omit<DefinitionVersionStartRequest, "processInstanceId" | "initialVariables">;

export const DefinitionRegistrationStatus = EngineDeploymentStatus;

/** `registered`, or the engine's refusal: the population's code, or an integrity failure of the stored version. */
export type DefinitionVersionRegistrationResult =
  | Readonly<{ status: EngineDeploymentStatus.Registered }>
  | Readonly<{
      status: EngineDeploymentStatus.Refused | EngineDeploymentStatus.IntegrityFailure;
      failure: Readonly<{ code: string; evidence: string }>;
    }>;

/**
 * Registers a deployed definition version with the engine, which every start of the version and every publication to
 * it needs (`definition-not-deployed` otherwise); a repeated registration answers as the first.
 */
export interface DefinitionVersionRegistrar {
  registerDefinitionVersion(request: DefinitionVersionRegistrationRequest): Promise<DefinitionVersionRegistrationResult>;
}

export interface DefinitionCompiler {
  compileDefinition(request: DefinitionCompilationRequest): Promise<DefinitionCompilationResult>;
}

export interface DefinitionVersionStarter {
  prepareDefinitionVersion(request: DefinitionVersionStartRequest): Promise<DefinitionStartPreparationResult>;
  startPreparedDefinitionVersion(request: PreparedDefinitionVersionStartRequest): Promise<DefinitionStartResult>;
  describeDefinitionVersionStart(request: DefinitionVersionStartDescriptionRequest): Promise<DefinitionStartDescriptionResult>;
  startDefinitionVersion(request: DefinitionVersionStartRequest): Promise<DefinitionStartResult>;
}

export type BpmnEngineGatewayOptions = GatewayLimits & Readonly<{
  host: EngineHost;
  profileRelations: ProfileRelations;
}>;

export class BpmnEngineGateway implements DefinitionCompiler, DefinitionVersionRegistrar, DefinitionVersionStarter {
  readonly #context: GatewayContext;

  constructor(options: BpmnEngineGatewayOptions) {
    this.#context = gatewayContext(options, options.host, options.profileRelations);
  }

  async compileDefinition(request: DefinitionCompilationRequest): Promise<DefinitionCompilationResult> {
    const profile = resolveProfile(this.#context, request.semanticProfile);
    const bytes = Uint8Array.from(request.bytes);
    if (profile === null) {
      return rejected({
        kind: "bpmnSource", id: request.sourceId, sha256: "", byteLength: bytes.byteLength, declaredEncoding: null, decodedAs: null,
      },
        { code: unknownProfileCode, element: null, evidence: `The profile catalog does not hold ${request.semanticProfile}.` });
    }
    const result = await compileBpmnDefinition({
      bytes,
      sourceId: request.sourceId,
      ...(request.expectedSha256 === undefined ? {} : { expectedSha256: request.expectedSha256 }),
      profile,
      sourceOverlay: request.sourceOverlay ?? null,
      limits: this.#context.limits,
    });
    switch (result.status) {
      case EngineDefinitionCompilationStatus.Accepted: {
        const mapped = mapDefinitionStartCapabilities(result.capabilities);
        if (mapped.kind === "refused") {
          return rejected(platformSource(result.source), { code: mapped.code, element: mapped.element, evidence: mapped.evidence });
        }
        return {
          status: EngineDefinitionCompilationStatus.Accepted,
          source: platformSource(result.source),
          diagnostics: [],
          definition: platformIdentity(result.definition),
          startCapabilities: mapped.capabilities,
        };
      }
      case EngineDefinitionCompilationStatus.Rejected:
        return {
          status: result.status,
          source: platformSource(result.source),
          diagnostics: result.diagnostics,
          definition: undefined,
        };
    }
  }

  async registerDefinitionVersion(request: DefinitionVersionRegistrationRequest): Promise<DefinitionVersionRegistrationResult> {
    const result = await registerEngineDeployment({
      host: this.#context.host,
      bytes: request.bytes,
      sourceId: request.sourceId,
      expectedSha256: request.expectedSha256,
      profile: storedProfile(this.#context, request.semanticProfile),
      sourceOverlay: request.sourceOverlay ?? null,
      expectedProcessId: request.expectedProcessId,
      version: request.version,
      limits: this.#context.limits,
    });
    return result.status === EngineDeploymentStatus.Registered ? { status: result.status } : result;
  }

  async startDefinitionVersion(request: DefinitionVersionStartRequest): Promise<DefinitionStartResult> {
    return platformStart(await startBpmnDefinitionVersion(this.#engineRequest(request)));
  }

  async prepareDefinitionVersion(request: DefinitionVersionStartRequest): Promise<DefinitionStartPreparationResult> {
    const result = await prepareBpmnDefinitionVersionStart(this.#engineRequest(request));
    if (result.status !== EngineDefinitionStartStatus.Admitted) return platformStart(result);
    const { locator, definition, source, ...admitted } = result;
    return {
      ...admitted,
      source: platformSource(source),
      definition: platformIdentity(definition),
      locator: serializeEngineProcessLocator(locator),
    };
  }

  async startPreparedDefinitionVersion(request: PreparedDefinitionVersionStartRequest): Promise<DefinitionStartResult> {
    return platformStart(await startPreparedBpmnDefinitionVersion({
      ...this.#engineRequest(request),
      expectedIntent: request.expectedIntent,
    }));
  }

  async describeDefinitionVersionStart(
    request: DefinitionVersionStartDescriptionRequest,
  ): Promise<DefinitionStartDescriptionResult> {
    return {
      status: await describeBpmnDefinitionVersionStart({
        host: this.#context.host,
        processInstanceId: request.processInstanceId,
        expectedIntent: request.expectedIntent,
      }),
    };
  }

  #engineRequest(request: DefinitionVersionStartRequest): EngineDefinitionStartRequest {
    return {
      host: this.#context.host,
      bytes: request.bytes,
      sourceId: request.sourceId,
      expectedSha256: request.expectedSha256,
      profile: storedProfile(this.#context, request.semanticProfile),
      sourceOverlay: request.sourceOverlay ?? null,
      expectedProcessId: request.expectedProcessId,
      version: request.version,
      processInstanceId: request.processInstanceId,
      initialVariables: engineBindings(request.initialVariables),
      limits: this.#context.limits,
    };
  }
}

function rejected(source: ExactPublicSourceIdentity, diagnostic: DefinitionDiagnostic): DefinitionCompilationResult {
  return { status: EngineDefinitionCompilationStatus.Rejected, source, diagnostics: [diagnostic], definition: undefined };
}

function platformStart<R extends EngineDefinitionStartResult | EngineDefinitionStartPreparationResult>(
  result: R & Readonly<{ status: Exclude<EngineDefinitionStartStatus, EngineDefinitionStartStatus.Admitted> }>,
): PlatformStart<R> {
  return {
    ...result,
    source: platformSource(result.source),
    definition: platformIdentity(result.definition),
  } as PlatformStart<R>;
}

export type BpmnEngineGatewayRuntimeOptions = GatewayLimits & Readonly<{
  temporalAddress: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
  temporalConnectTimeoutMs: number;
  /** The deployment's profile catalog. */
  profileRelations: ProfileRelations;
  /** What the deployment's Workers serve; a definition needing more is refused before it starts. */
  servedRequirements: EngineServedRequirements;
  /** The transport bound of one effect Activity attempt. */
  effectStartToCloseMs: number;
  /**
   * The engine host to run against instead of a Temporal connection opened from the options above, such as the
   * in-process host of `@bpmn-lean/platform-engine-gateway/testing`; it must serve `temporalTaskQueue`.
   */
  engineHostRuntime?: EngineHostRuntime;
}>;

/** Composition-facing owner of the gateway's collaborators and their shared lazy Temporal connection. */
export class BpmnEngineGatewayRuntime {
  readonly gateway: BpmnEngineGateway;
  readonly scheduleHost: BpmnDefinitionScheduleGateway;
  readonly messageStartHost: BpmnDefinitionMessageStartGateway;
  readonly correlatedMessageHost: BpmnDefinitionCorrelatedMessageGateway;
  readonly processWork: BpmnProcessWorkGateway;
  readonly processOperations: BpmnProcessOperationsGateway;
  readonly processExecution: BpmnProcessExecutionPublicationGateway;
  readonly processFlowNodeOccurrences: BpmnProcessFlowNodeOccurrenceGateway;
  readonly #runtime: EngineHostRuntime;

  constructor(options: BpmnEngineGatewayRuntimeOptions) {
    requireNonempty(options.temporalTaskQueue, "temporalTaskQueue");
    if (options.engineHostRuntime !== undefined && options.engineHostRuntime.host.taskQueue !== options.temporalTaskQueue) {
      throw new TypeError("engineHostRuntime must serve temporalTaskQueue");
    }
    this.#runtime = options.engineHostRuntime ?? createEngineHostRuntime({
      address: options.temporalAddress,
      namespace: options.temporalNamespace,
      taskQueue: options.temporalTaskQueue,
      connectTimeoutMs: options.temporalConnectTimeoutMs,
      served: options.servedRequirements,
      effectStartToCloseMs: options.effectStartToCloseMs,
    });
    const host = this.#runtime.host;
    const context = gatewayContext(options, host, options.profileRelations);
    this.gateway = new BpmnEngineGateway({ ...options, host });
    this.scheduleHost = new BpmnDefinitionScheduleGateway(context);
    this.messageStartHost = new BpmnDefinitionMessageStartGateway(context);
    this.correlatedMessageHost = new BpmnDefinitionCorrelatedMessageGateway(context);
    this.processWork = new BpmnProcessWorkGateway(host);
    this.processOperations = new BpmnProcessOperationsGateway(host);
    this.processExecution = new BpmnProcessExecutionPublicationGateway(host);
    this.processFlowNodeOccurrences = new BpmnProcessFlowNodeOccurrenceGateway(host);
  }

  /** Proves the shared lazy Temporal connection before this runtime is declared ready. */
  ensureConnected(): Promise<void> {
    return this.#runtime.ensureConnected();
  }

  close(): Promise<void> {
    return this.#runtime.close();
  }
}

export function createBpmnEngineGatewayRuntime(options: BpmnEngineGatewayRuntimeOptions): BpmnEngineGatewayRuntime {
  return new BpmnEngineGatewayRuntime(options);
}

export {
  engineTimerSchedule,
  mapDefinitionStartCapabilities,
  sameStartCapabilities,
  unaddressableMessageStartCode,
  type DefinitionMessageStartCapability,
  type DefinitionOperationMessageChannel,
  type DefinitionStartCapabilities,
  type DefinitionTimerStartCapability,
  type StartCapabilityMapping,
} from "./definition-capabilities.js";
export * from "./definition-correlated-message-host.js";
export {
  BpmnDefinitionMessageStartGateway,
  DefinitionMessageStartDescriptionStatus,
  DefinitionMessageStartStatus,
  type DefinitionMessageStartDescribeRequest,
  type DefinitionMessageStartDescriptionResult,
  type DefinitionMessageStartDispatchRequest,
  type DefinitionMessageStartHost,
  type DefinitionMessageStartIntent,
  type DefinitionMessageStartPreparationResult,
  type DefinitionMessageStartRequest,
  type DefinitionMessageStartResult,
} from "./definition-message-start-gateway.js";
export {
  definitionScheduleHostId,
  definitionScheduleWorkflowIdBase,
  type DefinitionSchedulePublicReference,
} from "./definition-schedule-address.js";
export {
  BpmnDefinitionScheduleGateway,
  DefinitionScheduleHostPhase,
  type DefinitionScheduleHost,
  type DefinitionScheduleHostRequest,
  type DefinitionScheduleHostResult,
  type DefinitionScheduleValidationRequest,
  type DefinitionScheduleValidationResult,
} from "./definition-schedule-gateway.js";
export {
  decodeEngineDeployment,
  engineDeploymentEnvironmentVariable,
  engineDeploymentRuntimeOptions,
  readEngineDeploymentEnvironment,
  type EngineDeployment,
} from "./engine-deployment.js";
export {
  engineDefinitionIdentity,
  gatewayContext,
  platformSource,
  type GatewayContext,
  type GatewayLimits,
} from "./gateway-context.js";
export {
  messageStartPublicationCommandId,
  messageStartPublicationProcessInstanceId,
  messageStartPublicationWorkflowId,
} from "./message-start-publication-address.js";
export type { ProcessCommandOutcome, ProcessCommandResult } from "./process-command-result.js";
export {
  BpmnProcessOperationsGateway,
  ProcessIncidentObservationStatus,
  processIncident,
  type ProcessIncident,
  type ProcessIncidentId,
  type ProcessIncidentObservationRequest,
  type ProcessIncidentObservationResult,
  type ProcessIncidentOperationRequest,
  type ProcessIncidentOperationResult,
  type ProcessIncidentOperationStimulus,
  type SerializedProcessOperationsLocator,
} from "./process-operations-gateway.js";
export {
  BpmnProcessExecutionPublicationGateway,
  BpmnProcessFlowNodeOccurrenceGateway,
  type ProcessExecutionPublicationObservationResult,
  type ProcessFlowNodeOccurrenceObservationResult,
  type ProcessPublicationObservationRequest,
  type SerializedProcessPublicationLocator,
} from "./process-publication-gateway.js";
export {
  BpmnProcessWorkGateway,
  ProcessWorkDetailStatus,
  ProcessWorkObservationStatus,
  processWorkTask,
  type ProcessWorkCompletionRequest,
  type ProcessWorkCompletionValue,
  type ProcessWorkDetailRequest,
  type ProcessWorkDetailResult,
  type ProcessWorkObservationRequest,
  type ProcessWorkObservationResult,
  type ProcessWorkTask,
  type SerializedProcessWorkLocator,
} from "./process-work-gateway.js";
