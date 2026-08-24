/** Product 2's only entry into the BPMN engine contract. */
import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionStartDescriptionStatus,
  EngineDefinitionStartStatus,
  EngineVariableValueKind,
  compileBpmnDefinition,
  describeBpmnDefinitionVersionStart,
  prepareBpmnDefinitionVersionStart,
  serializeEngineProcessWorkLocator,
  startPreparedBpmnDefinitionVersion,
  startBpmnDefinitionVersion,
} from "@bpmn-lean/engine-api";
import type {
  EngineDefinitionCompilationResult,
  EngineDefinitionStartDescriptionResult,
  EngineDefinitionStartIntent,
  EngineDefinitionStartPreparationRequest,
  EngineDefinitionStartPreparationResult,
  EngineDefinitionStartResult,
} from "@bpmn-lean/engine-api";
import type {
  VariableBinding as PlatformVariableBinding,
  VariableValue as PlatformVariableValue,
} from "@bpmn-lean/platform-contracts";
import {
  createLazyTemporalClientRuntime,
} from "@bpmn-lean/temporal-client/definition-start";

import {
  BpmnDefinitionScheduleGateway,
} from "./definition-schedule-gateway.js";
import type {
  BpmnDefinitionScheduleGatewayOptions,
} from "./definition-schedule-gateway.js";
import {
  mapDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import type {
  DefinitionStartCapabilities,
} from "./definition-capabilities.js";
import {
  BpmnDefinitionMessageStartGateway,
} from "./definition-message-start-gateway.js";
import type {
  BpmnDefinitionMessageStartGatewayOptions,
} from "./definition-message-start-gateway.js";
import type {
  LazyTemporalClientRuntime,
  TemporalDefinitionStartClient,
} from "@bpmn-lean/temporal-client/definition-start";
import type {
  TemporalProcessWorkClient,
} from "@bpmn-lean/temporal-client/process-work";
import { BpmnProcessWorkGateway } from "./process-work-gateway.js";
import { BpmnProcessOperationsGateway } from "./process-operations-gateway.js";
import { BpmnProcessExecutionPublicationGateway } from "./process-execution-publication-gateway.js";
import { BpmnProcessFlowNodeOccurrenceGateway } from "./process-flow-node-occurrence-gateway.js";

export const DefinitionCompilationStatus = EngineDefinitionCompilationStatus;

export type DefinitionCompilationResult =
  | (Omit<
      Extract<EngineDefinitionCompilationResult, { status: "accepted" }>,
      "startCapabilities"
    > & Readonly<{ startCapabilities: DefinitionStartCapabilities }>)
  | Extract<EngineDefinitionCompilationResult, { status: "rejected" }>;

export const DefinitionStartStatus = EngineDefinitionStartStatus;
export const DefinitionStartDescriptionStatus = EngineDefinitionStartDescriptionStatus;

export type DefinitionStartResult = EngineDefinitionStartResult;
export type DefinitionStartIntent = EngineDefinitionStartIntent;
export type DefinitionStartDescriptionResult = EngineDefinitionStartDescriptionResult;

export type DefinitionStartPreparationResult =
  | (Omit<
      Extract<EngineDefinitionStartPreparationResult, { status: "admitted" }>,
      "locator"
    > & Readonly<{ locator: string }>)
  | Exclude<EngineDefinitionStartPreparationResult, { status: "admitted" }>;

export type DefinitionCompilationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  semanticProfile: string;
  expectedSha256: string | undefined;
}>;

export type EngineGatewayLimits = Readonly<{
  maxSourceBytes: number;
  parserDeadlineMs: number;
}>;

export type DefinitionVersionStartRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
  processInstanceId: string;
  initialVariables: readonly PlatformVariableBinding[];
}>;

export type PreparedDefinitionVersionStartRequest =
  DefinitionVersionStartRequest & Readonly<{
    expectedIntent: DefinitionStartIntent;
  }>;

export type DefinitionVersionStartDescriptionRequest = Readonly<{
  processInstanceId: string;
  expectedIntent: DefinitionStartIntent;
}>;

export type BpmnEngineGatewayOptions = EngineGatewayLimits & Readonly<{
  temporalClient: TemporalDefinitionStartClient;
  temporalTaskQueue: string;
}>;

export type BpmnEngineGatewayRuntimeOptions = EngineGatewayLimits & Readonly<{
  temporalAddress: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
  temporalConnectTimeoutMs: number;
}>;

export interface DefinitionCompiler {
  compileDefinition(
    request: DefinitionCompilationRequest,
  ): Promise<DefinitionCompilationResult>;
}

export interface DefinitionVersionStarter {
  prepareDefinitionVersion(
    request: DefinitionVersionStartRequest,
  ): Promise<DefinitionStartPreparationResult>;
  startPreparedDefinitionVersion(
    request: PreparedDefinitionVersionStartRequest,
  ): Promise<DefinitionStartResult>;
  describeDefinitionVersionStart(
    request: DefinitionVersionStartDescriptionRequest,
  ): Promise<DefinitionStartDescriptionResult>;
  startDefinitionVersion(
    request: DefinitionVersionStartRequest,
  ): Promise<DefinitionStartResult>;
}

export class BpmnEngineGateway
  implements DefinitionCompiler, DefinitionVersionStarter
{
  private readonly limits: EngineGatewayLimits;
  private readonly temporalClient: TemporalDefinitionStartClient;
  private readonly temporalTaskQueue: string;

  constructor(options: BpmnEngineGatewayOptions) {
    requirePositiveSafeInteger(options.maxSourceBytes, "maxSourceBytes");
    requirePositiveSafeInteger(options.parserDeadlineMs, "parserDeadlineMs");
    requireNonempty(options.temporalTaskQueue, "temporalTaskQueue");
    this.limits = {
      maxSourceBytes: options.maxSourceBytes,
      parserDeadlineMs: options.parserDeadlineMs,
    };
    this.temporalClient = options.temporalClient;
    this.temporalTaskQueue = options.temporalTaskQueue;
  }

  compileDefinition(
    request: DefinitionCompilationRequest,
  ): Promise<DefinitionCompilationResult> {
    return this.compileAndMapDefinition(request);
  }

  private async compileAndMapDefinition(
    request: DefinitionCompilationRequest,
  ): Promise<DefinitionCompilationResult> {
    const result = await compileBpmnDefinition({
      ...request,
      limits: {
        maxBytes: this.limits.maxSourceBytes,
        parserDeadlineMs: this.limits.parserDeadlineMs,
      },
    });
    switch (result.status) {
      case EngineDefinitionCompilationStatus.Accepted:
        return {
          ...result,
          startCapabilities: mapDefinitionStartCapabilities(
            result.startCapabilities,
          ),
        };
      case EngineDefinitionCompilationStatus.Rejected:
        return result;
      default:
        return assertNever(result);
    }
  }

  startDefinitionVersion(
    request: DefinitionVersionStartRequest,
  ): Promise<DefinitionStartResult> {
    return startBpmnDefinitionVersion({
      ...request,
      initialVariables: toEngineVariableBindings(request.initialVariables),
      limits: {
        maxBytes: this.limits.maxSourceBytes,
        parserDeadlineMs: this.limits.parserDeadlineMs,
      },
      temporalClient: this.temporalClient,
      taskQueue: this.temporalTaskQueue,
    });
  }

  async prepareDefinitionVersion(
    request: DefinitionVersionStartRequest,
  ): Promise<DefinitionStartPreparationResult> {
    const result = await prepareBpmnDefinitionVersionStart({
      ...request,
      initialVariables: toEngineVariableBindings(request.initialVariables),
      limits: {
        maxBytes: this.limits.maxSourceBytes,
        parserDeadlineMs: this.limits.parserDeadlineMs,
      },
      taskQueue: this.temporalTaskQueue,
    });
    return result.status === EngineDefinitionStartStatus.Admitted
      ? {
          ...result,
          locator: serializeEngineProcessWorkLocator(result.locator),
        }
      : result;
  }

  startPreparedDefinitionVersion(
    request: PreparedDefinitionVersionStartRequest,
  ): Promise<DefinitionStartResult> {
    return startPreparedBpmnDefinitionVersion({
      ...request,
      initialVariables: toEngineVariableBindings(request.initialVariables),
      limits: {
        maxBytes: this.limits.maxSourceBytes,
        parserDeadlineMs: this.limits.parserDeadlineMs,
      },
      temporalClient: this.temporalClient,
      taskQueue: this.temporalTaskQueue,
    });
  }

  describeDefinitionVersionStart(
    request: DefinitionVersionStartDescriptionRequest,
  ): Promise<DefinitionStartDescriptionResult> {
    return describeBpmnDefinitionVersionStart({
      ...request,
      temporalClient: this.temporalClient,
      taskQueue: this.temporalTaskQueue,
    });
  }
}

function toEngineVariableBindings(
  bindings: readonly PlatformVariableBinding[],
): EngineDefinitionStartPreparationRequest["initialVariables"] {
  return bindings.map(({ name, value }) => ({
    name,
    value: toEngineVariableValue(value),
  }));
}

function toEngineVariableValue(
  value: PlatformVariableValue,
): EngineDefinitionStartPreparationRequest["initialVariables"][number]["value"] {
  switch (value.kind) {
    case "boolean":
      return { kind: EngineVariableValueKind.Boolean, value: value.value };
    case "integer":
      return { kind: EngineVariableValueKind.Integer, value: value.value };
    case "string":
      return { kind: EngineVariableValueKind.String, value: value.value };
    case "stringList":
      return { kind: EngineVariableValueKind.StringList, value: [...value.value] };
    case "null":
      return { kind: EngineVariableValueKind.Null };
    default:
      return assertNever(value);
  }
}

/** Composition-facing owner of one gateway and its lazy Temporal connection lifecycle. */
export class BpmnEngineGatewayRuntime {
  readonly gateway: BpmnEngineGateway;
  readonly scheduleHost: BpmnDefinitionScheduleGateway;
  readonly messageStartHost: BpmnDefinitionMessageStartGateway;
  readonly processWork: BpmnProcessWorkGateway;
  readonly processOperations: BpmnProcessOperationsGateway;
  readonly processExecution: BpmnProcessExecutionPublicationGateway;
  readonly processFlowNodeOccurrences: BpmnProcessFlowNodeOccurrenceGateway;
  readonly #temporalRuntime: LazyTemporalClientRuntime;

  constructor(options: BpmnEngineGatewayRuntimeOptions) {
    const snapshot = { ...options };
    requirePositiveSafeInteger(snapshot.maxSourceBytes, "maxSourceBytes");
    requirePositiveSafeInteger(snapshot.parserDeadlineMs, "parserDeadlineMs");
    requireNonempty(snapshot.temporalTaskQueue, "temporalTaskQueue");
    this.#temporalRuntime = createLazyTemporalClientRuntime({
      address: snapshot.temporalAddress,
      namespace: snapshot.temporalNamespace,
      connectTimeoutMs: snapshot.temporalConnectTimeoutMs,
    });
    this.gateway = new BpmnEngineGateway({
      maxSourceBytes: snapshot.maxSourceBytes,
      parserDeadlineMs: snapshot.parserDeadlineMs,
      temporalClient: this.#temporalRuntime.client,
      temporalTaskQueue: snapshot.temporalTaskQueue,
    });
    this.scheduleHost = new BpmnDefinitionScheduleGateway({
      maxSourceBytes: snapshot.maxSourceBytes,
      parserDeadlineMs: snapshot.parserDeadlineMs,
      temporalClient: this.#temporalRuntime.client as unknown as
        BpmnDefinitionScheduleGatewayOptions["temporalClient"],
      temporalTaskQueue: snapshot.temporalTaskQueue,
    });
    this.messageStartHost = new BpmnDefinitionMessageStartGateway({
      maxSourceBytes: snapshot.maxSourceBytes,
      parserDeadlineMs: snapshot.parserDeadlineMs,
      temporalClient: this.#temporalRuntime.client as unknown as
        BpmnDefinitionMessageStartGatewayOptions["temporalClient"],
      temporalTaskQueue: snapshot.temporalTaskQueue,
    });
    this.processWork = new BpmnProcessWorkGateway(
      this.#temporalRuntime.client as unknown as TemporalProcessWorkClient,
    );
    this.processOperations = new BpmnProcessOperationsGateway(
      this.#temporalRuntime.client as unknown as ConstructorParameters<
        typeof BpmnProcessOperationsGateway
      >[0],
    );
    this.processExecution = new BpmnProcessExecutionPublicationGateway(
      this.#temporalRuntime.client as unknown as ConstructorParameters<
        typeof BpmnProcessExecutionPublicationGateway
      >[0],
    );
    this.processFlowNodeOccurrences = new BpmnProcessFlowNodeOccurrenceGateway(
      this.#temporalRuntime.client as unknown as ConstructorParameters<
        typeof BpmnProcessFlowNodeOccurrenceGateway
      >[0],
    );
  }

  /** Proves the shared lazy Temporal connection before this runtime is declared ready. */
  ensureConnected(): Promise<void> {
    return this.#temporalRuntime.ensureConnected();
  }

  close(): Promise<void> {
    return this.#temporalRuntime.close();
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported engine gateway result: ${String(value)}`);
}

export * from "./definition-schedule-gateway.js";
export * from "./definition-schedule-address.js";
export * from "./definition-capabilities.js";
export * from "./definition-message-start-gateway.js";
export * from "./message-start-publication-address.js";
export * from "./process-work-gateway.js";
export * from "./process-operations-gateway.js";
export * from "./process-execution-publication-gateway.js";
export * from "./process-flow-node-occurrence-gateway.js";

export function createBpmnEngineGatewayRuntime(
  options: BpmnEngineGatewayRuntimeOptions,
): BpmnEngineGatewayRuntime {
  return new BpmnEngineGatewayRuntime(options);
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
