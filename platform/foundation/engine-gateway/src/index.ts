/** Product 2's only entry into the BPMN engine contract. */
import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionStartStatus,
  compileBpmnDefinition,
  startBpmnDefinitionVersion,
} from "@bpmn-lean/engine-api";
import type {
  EngineDefinitionCompilationResult,
  EngineDefinitionStartResult,
} from "@bpmn-lean/engine-api";
import {
  createLazyTemporalClientRuntime,
} from "@bpmn-lean/temporal-client/definition-start";
import type {
  LazyTemporalClientRuntime,
  TemporalDefinitionStartClient,
} from "@bpmn-lean/temporal-client/definition-start";

export const DefinitionCompilationStatus = EngineDefinitionCompilationStatus;

export type DefinitionCompilationResult = EngineDefinitionCompilationResult;

export const DefinitionStartStatus = EngineDefinitionStartStatus;

export type DefinitionStartResult = EngineDefinitionStartResult;

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
    return compileBpmnDefinition({
      ...request,
      limits: {
        maxBytes: this.limits.maxSourceBytes,
        parserDeadlineMs: this.limits.parserDeadlineMs,
      },
    });
  }

  startDefinitionVersion(
    request: DefinitionVersionStartRequest,
  ): Promise<DefinitionStartResult> {
    return startBpmnDefinitionVersion({
      ...request,
      limits: {
        maxBytes: this.limits.maxSourceBytes,
        parserDeadlineMs: this.limits.parserDeadlineMs,
      },
      temporalClient: this.temporalClient,
      taskQueue: this.temporalTaskQueue,
    });
  }
}

/** Composition-facing owner of one gateway and its lazy Temporal connection lifecycle. */
export class BpmnEngineGatewayRuntime {
  readonly gateway: BpmnEngineGateway;
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
  }

  close(): Promise<void> {
    return this.#temporalRuntime.close();
  }
}

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
