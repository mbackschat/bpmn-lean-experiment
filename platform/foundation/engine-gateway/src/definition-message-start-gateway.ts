/** Product 2's representation-free direct Message Start host collaborator. */
import {
  EngineDefinitionMessageStartDescriptionStatus,
  EngineDefinitionMessageStartStatus,
  describeBpmnDefinitionMessageStart,
  prepareBpmnDefinitionMessageStart,
  startBpmnDefinitionMessageStart,
} from "@bpmn-lean/engine-api";
import type {
  EngineDefinitionMessageStartDescriptionResult,
  EngineDefinitionMessageStartIntent,
  EngineDefinitionMessageStartPreparationResult,
  EngineDefinitionMessageStartRequest,
  EngineDefinitionMessageStartResult,
} from "@bpmn-lean/engine-api";

import type {
  DefinitionMessageStartCapability,
  DefinitionStartCapabilities,
} from "./definition-capabilities.js";

export type DefinitionMessageStartIntent = EngineDefinitionMessageStartIntent;

export type DefinitionMessageStartRequest = Readonly<{
  bytes: Uint8Array;
  definition: Readonly<{
    processId: string;
    source: Readonly<{
      id: string;
      sha256: string;
      byteLength: number;
    }>;
    semanticProfile: string;
    startCapabilities: DefinitionStartCapabilities;
  }>;
  messageStart: DefinitionMessageStartCapability;
  processInstanceId: string;
  commandId: string;
  workflowId: string;
}>;

export type DefinitionMessageStartDispatchRequest =
  DefinitionMessageStartRequest & Readonly<{
    expectedIntent: DefinitionMessageStartIntent;
  }>;

export type DefinitionMessageStartDescribeRequest = Readonly<{
  workflowId: string;
  expectedIntent: DefinitionMessageStartIntent;
}>;

export enum DefinitionMessageStartStatus {
  Admitted = "admitted",
  Started = "started",
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export type DefinitionMessageStartPreparationResult =
  | Readonly<{
      status: DefinitionMessageStartStatus.Admitted;
      intent: DefinitionMessageStartIntent;
    }>
  | Readonly<{
      status: DefinitionMessageStartStatus.Rejected;
      evidence: string;
    }>
  | Readonly<{
      status: DefinitionMessageStartStatus.IntegrityFailure;
      evidence: string;
    }>;

export type DefinitionMessageStartResult =
  | Readonly<{ status: DefinitionMessageStartStatus.Started }>
  | Exclude<
      DefinitionMessageStartPreparationResult,
      { status: DefinitionMessageStartStatus.Admitted }
    >;

export enum DefinitionMessageStartDescriptionStatus {
  Matching = "matching",
  Missing = "missing",
  Divergent = "divergent",
  Unavailable = "unavailable",
}

export type DefinitionMessageStartDescriptionResult = Readonly<{
  status: DefinitionMessageStartDescriptionStatus;
}>;

export interface DefinitionMessageStartHost {
  prepare(
    request: DefinitionMessageStartRequest,
  ): Promise<DefinitionMessageStartPreparationResult>;
  start(
    request: DefinitionMessageStartDispatchRequest,
  ): Promise<DefinitionMessageStartResult>;
  describe(
    request: DefinitionMessageStartDescribeRequest,
  ): Promise<DefinitionMessageStartDescriptionResult>;
}

export type BpmnDefinitionMessageStartGatewayOptions = Readonly<{
  maxSourceBytes: number;
  parserDeadlineMs: number;
  temporalClient: EngineDefinitionMessageStartRequest["temporalClient"];
  temporalTaskQueue: string;
}>;

export class BpmnDefinitionMessageStartGateway
  implements DefinitionMessageStartHost
{
  readonly #limits: Readonly<{ maxBytes: number; parserDeadlineMs: number }>;
  readonly #temporalClient: EngineDefinitionMessageStartRequest["temporalClient"];
  readonly #taskQueue: string;

  constructor(options: BpmnDefinitionMessageStartGatewayOptions) {
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

  async prepare(
    request: DefinitionMessageStartRequest,
  ): Promise<DefinitionMessageStartPreparationResult> {
    return mapPreparation(
      await prepareBpmnDefinitionMessageStart(this.boundRequest(request)),
    );
  }

  async start(
    request: DefinitionMessageStartDispatchRequest,
  ): Promise<DefinitionMessageStartResult> {
    return mapStart(
      await startBpmnDefinitionMessageStart({
        ...this.boundRequest(request),
        temporalClient: this.#temporalClient,
        expectedIntent: request.expectedIntent,
      }),
    );
  }

  async describe(
    request: DefinitionMessageStartDescribeRequest,
  ): Promise<DefinitionMessageStartDescriptionResult> {
    return mapDescription(
      await describeBpmnDefinitionMessageStart({
        temporalClient: this.#temporalClient,
        workflowId: request.workflowId,
        taskQueue: this.#taskQueue,
        expectedIntent: request.expectedIntent,
      }),
    );
  }

  private boundRequest(request: DefinitionMessageStartRequest) {
    return {
      bytes: request.bytes,
      sourceId: request.definition.source.id,
      expectedSha256: request.definition.source.sha256,
      expectedByteLength: request.definition.source.byteLength,
      semanticProfile: request.definition.semanticProfile,
      expectedProcessId: request.definition.processId,
      expectedStartCapabilities: request.definition.startCapabilities,
      expectedMessageStart: request.messageStart,
      processInstanceId: request.processInstanceId,
      commandId: request.commandId,
      workflowId: request.workflowId,
      taskQueue: this.#taskQueue,
      limits: this.#limits,
    };
  }
}

function mapPreparation(
  result: EngineDefinitionMessageStartPreparationResult,
): DefinitionMessageStartPreparationResult {
  switch (result.status) {
    case EngineDefinitionMessageStartStatus.Admitted:
      return { status: DefinitionMessageStartStatus.Admitted, intent: result.intent };
    case EngineDefinitionMessageStartStatus.Rejected:
      return { status: DefinitionMessageStartStatus.Rejected, evidence: result.failure.evidence };
    case EngineDefinitionMessageStartStatus.IntegrityFailure:
      return { status: DefinitionMessageStartStatus.IntegrityFailure, evidence: result.failure.evidence };
  }
}

function mapStart(
  result: EngineDefinitionMessageStartResult,
): DefinitionMessageStartResult {
  switch (result.status) {
    case EngineDefinitionMessageStartStatus.Started:
      return { status: DefinitionMessageStartStatus.Started };
    case EngineDefinitionMessageStartStatus.Rejected:
      return { status: DefinitionMessageStartStatus.Rejected, evidence: result.failure.evidence };
    case EngineDefinitionMessageStartStatus.IntegrityFailure:
      return { status: DefinitionMessageStartStatus.IntegrityFailure, evidence: result.failure.evidence };
  }
}

function mapDescription(
  result: EngineDefinitionMessageStartDescriptionResult,
): DefinitionMessageStartDescriptionResult {
  switch (result.status) {
    case EngineDefinitionMessageStartDescriptionStatus.Matching:
      return { status: DefinitionMessageStartDescriptionStatus.Matching };
    case EngineDefinitionMessageStartDescriptionStatus.Missing:
      return { status: DefinitionMessageStartDescriptionStatus.Missing };
    case EngineDefinitionMessageStartDescriptionStatus.Divergent:
      return { status: DefinitionMessageStartDescriptionStatus.Divergent };
    case EngineDefinitionMessageStartDescriptionStatus.Unavailable:
      return { status: DefinitionMessageStartDescriptionStatus.Unavailable };
  }
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
