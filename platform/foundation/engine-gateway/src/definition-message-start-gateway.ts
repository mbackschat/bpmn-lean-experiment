/** Product 2's representation-free Message start host. */
import {
  EngineDefinitionMessageStartStatus,
  EngineStartDescriptionStatus,
  describeBpmnDefinitionMessageStart,
  prepareBpmnDefinitionMessageStart,
  startBpmnDefinitionMessageStart,
  type EngineDefinitionMessageStartPreparationRequest,
  type EngineDefinitionMessageStartPreparationResult,
  type EngineDefinitionMessageStartResult,
  type EngineIntent,
  type EngineSourceOverlaySelection,
} from "@bpmn-lean/engine-api";

import type { DefinitionMessageStartCapability } from "./definition-capabilities.js";
import { storedProfile, type GatewayContext } from "./gateway-context.js";
import { recompileStoredDefinition, type StoredDefinitionVersion } from "./stored-definition.js";

export type DefinitionMessageStartIntent = EngineIntent;

export type DefinitionMessageStartRequest = Readonly<{
  bytes: Uint8Array;
  sourceOverlay?: EngineSourceOverlaySelection | null;
  definition: StoredDefinitionVersion;
  messageStart: DefinitionMessageStartCapability;
  processInstanceId: string;
  commandId: string;
  workflowId: string;
}>;

export type DefinitionMessageStartDispatchRequest = DefinitionMessageStartRequest & Readonly<{
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
  | Readonly<{ status: DefinitionMessageStartStatus.Admitted; intent: DefinitionMessageStartIntent }>
  | Readonly<{ status: DefinitionMessageStartStatus.Rejected; evidence: string }>
  | Readonly<{ status: DefinitionMessageStartStatus.IntegrityFailure; evidence: string }>;

export type DefinitionMessageStartResult =
  | Readonly<{ status: DefinitionMessageStartStatus.Started }>
  | Exclude<DefinitionMessageStartPreparationResult, { status: DefinitionMessageStartStatus.Admitted }>;

export const DefinitionMessageStartDescriptionStatus = EngineStartDescriptionStatus;

export type DefinitionMessageStartDescriptionResult = Readonly<{ status: EngineStartDescriptionStatus }>;

export interface DefinitionMessageStartHost {
  prepare(request: DefinitionMessageStartRequest): Promise<DefinitionMessageStartPreparationResult>;
  start(request: DefinitionMessageStartDispatchRequest): Promise<DefinitionMessageStartResult>;
  describe(request: DefinitionMessageStartDescribeRequest): Promise<DefinitionMessageStartDescriptionResult>;
}

export class BpmnDefinitionMessageStartGateway implements DefinitionMessageStartHost {
  readonly #context: GatewayContext;

  constructor(context: GatewayContext) {
    this.#context = context;
  }

  async prepare(request: DefinitionMessageStartRequest): Promise<DefinitionMessageStartPreparationResult> {
    const bound = await this.#bound(request);
    return "evidence" in bound ? bound : mapPreparation(await prepareBpmnDefinitionMessageStart(bound));
  }

  async start(request: DefinitionMessageStartDispatchRequest): Promise<DefinitionMessageStartResult> {
    const bound = await this.#bound(request);
    if ("evidence" in bound) return bound;
    return mapStart(await startBpmnDefinitionMessageStart({ ...bound, expectedIntent: request.expectedIntent }));
  }

  async describe(request: DefinitionMessageStartDescribeRequest): Promise<DefinitionMessageStartDescriptionResult> {
    return {
      status: await describeBpmnDefinitionMessageStart({
        host: this.#context.host,
        workflowId: request.workflowId,
        expectedIntent: request.expectedIntent,
      }),
    };
  }

  async #bound(
    request: DefinitionMessageStartRequest,
  ): Promise<EngineDefinitionMessageStartPreparationRequest | Readonly<{
    status: DefinitionMessageStartStatus.IntegrityFailure;
    evidence: string;
  }>> {
    const overlay = request.sourceOverlay ?? null;
    const resolved = await recompileStoredDefinition(this.#context, request.bytes, overlay, request.definition);
    if (resolved.kind === "integrityFailure") {
      return { status: DefinitionMessageStartStatus.IntegrityFailure, evidence: resolved.evidence };
    }
    const definition = request.definition;
    return {
      host: this.#context.host,
      bytes: request.bytes,
      sourceOverlay: overlay,
      sourceId: definition.source.id,
      expectedSha256: definition.source.sha256,
      expectedByteLength: definition.source.byteLength,
      profile: storedProfile(this.#context, definition.semanticProfile),
      expectedProcessId: definition.processId,
      version: definition.version,
      expectedStarts: resolved.compilation.capabilities.starts,
      messageStart: { startEventId: request.messageStart.startEventId, channel: { ...request.messageStart.channel } },
      processInstanceId: request.processInstanceId,
      commandId: request.commandId,
      workflowId: request.workflowId,
      limits: this.#context.limits,
    };
  }
}

function mapPreparation(result: EngineDefinitionMessageStartPreparationResult): DefinitionMessageStartPreparationResult {
  switch (result.status) {
    case EngineDefinitionMessageStartStatus.Admitted:
      return { status: DefinitionMessageStartStatus.Admitted, intent: result.intent };
    case EngineDefinitionMessageStartStatus.Rejected:
      return { status: DefinitionMessageStartStatus.Rejected, evidence: result.failure.evidence };
    case EngineDefinitionMessageStartStatus.IntegrityFailure:
      return { status: DefinitionMessageStartStatus.IntegrityFailure, evidence: result.failure.evidence };
  }
}

function mapStart(result: EngineDefinitionMessageStartResult): DefinitionMessageStartResult {
  switch (result.status) {
    case EngineDefinitionMessageStartStatus.Started:
      return { status: DefinitionMessageStartStatus.Started };
    case EngineDefinitionMessageStartStatus.Rejected:
      return { status: DefinitionMessageStartStatus.Rejected, evidence: result.failure.evidence };
    case EngineDefinitionMessageStartStatus.IntegrityFailure:
      return { status: DefinitionMessageStartStatus.IntegrityFailure, evidence: result.failure.evidence };
  }
}
