/** Product 2's representation-free Timer start Schedule host. */
import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionScheduleStatus,
  compileBpmnDefinition,
  createBpmnDefinitionSchedule,
  deleteBpmnDefinitionSchedule,
  inspectBpmnDefinitionSchedule,
  pauseBpmnDefinitionSchedule,
  serializeEngineProcessLocator,
  type EngineDefinitionScheduleBindingRequest,
  type EngineDefinitionScheduleResult,
  type EngineSourceOverlayIdentity,
  type EngineSourceOverlaySelection,
} from "@bpmn-lean/engine-api";
import type { ExactPublicSourceIdentity } from "@bpmn-lean/platform-contracts";

import {
  engineTimerSchedule,
  mapDefinitionStartCapabilities,
  type DefinitionStartCapabilities,
  type DefinitionTimerStartCapability,
} from "./definition-capabilities.js";
import { platformSource, resolveProfile, storedProfile, type GatewayContext } from "./gateway-context.js";
import { recompileStoredDefinition, type StoredDefinitionVersion } from "./stored-definition.js";

export type DefinitionScheduleValidationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
  sourceOverlay?: EngineSourceOverlaySelection | null;
}>;

export type DefinitionScheduleValidationResult =
  | Readonly<{
      status: "accepted";
      source: ExactPublicSourceIdentity;
      processId: string;
      semanticProfile: string;
      startCapabilities: DefinitionStartCapabilities;
      sourceOverlay: EngineSourceOverlayIdentity | null;
    }>
  | Readonly<{ status: "rejected"; evidence: string }>;

export type DefinitionScheduleHostRequest = Readonly<{
  bytes: Uint8Array;
  sourceOverlay?: EngineSourceOverlaySelection | null;
  definition: StoredDefinitionVersion;
  timerStart: DefinitionTimerStartCapability;
  /** When the platform activated the Schedule; the due instant is never before it. */
  activationAt: string;
  dueAt: string;
  processInstanceId: string;
  hostScheduleId: string;
  configuredWorkflowIdBase: string;
}>;

export const DefinitionScheduleHostPhase = {
  Pending: "pending",
  Started: "started",
  Missed: "missed",
  IntegrityFailure: "integrityFailure",
} as const;

export type DefinitionScheduleHostResult =
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.Pending; paused: boolean }>
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.Started; processLocator: string }>
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.Missed }>
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.IntegrityFailure; evidence: string }>;

export interface DefinitionScheduleHost {
  validateDefinition(request: DefinitionScheduleValidationRequest): Promise<DefinitionScheduleValidationResult>;
  createOrCompare(request: DefinitionScheduleHostRequest): Promise<DefinitionScheduleHostResult>;
  inspect(request: DefinitionScheduleHostRequest): Promise<DefinitionScheduleHostResult>;
  pause(request: DefinitionScheduleHostRequest): Promise<DefinitionScheduleHostResult>;
  delete(request: DefinitionScheduleHostRequest): Promise<void>;
}

type ScheduleOperation = (request: EngineDefinitionScheduleBindingRequest) => Promise<EngineDefinitionScheduleResult>;

export class BpmnDefinitionScheduleGateway implements DefinitionScheduleHost {
  readonly #context: GatewayContext;

  constructor(context: GatewayContext) {
    this.#context = context;
  }

  async validateDefinition(request: DefinitionScheduleValidationRequest): Promise<DefinitionScheduleValidationResult> {
    const profile = resolveProfile(this.#context, request.semanticProfile);
    if (profile === null) return { status: "rejected", evidence: `The profile catalog does not hold ${request.semanticProfile}.` };
    const result = await compileBpmnDefinition({
      bytes: request.bytes,
      sourceId: request.sourceId,
      expectedSha256: request.expectedSha256,
      profile,
      sourceOverlay: request.sourceOverlay ?? null,
      limits: this.#context.limits,
    });
    if (result.status === EngineDefinitionCompilationStatus.Rejected) {
      return { status: "rejected", evidence: result.diagnostics[0].evidence };
    }
    if (result.definition.ref.definitionKey !== request.expectedProcessId) {
      return { status: "rejected", evidence: "Compiled Process identity did not match the stored definition." };
    }
    const mapped = mapDefinitionStartCapabilities(result.capabilities);
    if (mapped.kind === "refused") return { status: "rejected", evidence: mapped.evidence };
    return {
      status: "accepted",
      source: platformSource(result.source),
      processId: result.definition.ref.definitionKey,
      semanticProfile: result.definition.profile,
      startCapabilities: mapped.capabilities,
      sourceOverlay: result.definition.sourceOverlay,
    };
  }

  createOrCompare(request: DefinitionScheduleHostRequest): Promise<DefinitionScheduleHostResult> {
    return this.#bound(request, createBpmnDefinitionSchedule);
  }

  inspect(request: DefinitionScheduleHostRequest): Promise<DefinitionScheduleHostResult> {
    return this.#bound(request, inspectBpmnDefinitionSchedule);
  }

  pause(request: DefinitionScheduleHostRequest): Promise<DefinitionScheduleHostResult> {
    return this.#bound(request, pauseBpmnDefinitionSchedule);
  }

  delete(request: DefinitionScheduleHostRequest): Promise<void> {
    return deleteBpmnDefinitionSchedule({ host: this.#context.host, scheduleId: request.hostScheduleId });
  }

  async #bound(request: DefinitionScheduleHostRequest, operation: ScheduleOperation): Promise<DefinitionScheduleHostResult> {
    const activationAtEpochMs = parseUtcInstant(request.activationAt, "activationAt");
    const dueAtEpochMs = parseUtcInstant(request.dueAt, "dueAt");
    if (dueAtEpochMs < activationAtEpochMs) throw new RangeError("dueAt must not precede activationAt");
    const overlay = request.sourceOverlay ?? null;
    const resolved = await recompileStoredDefinition(this.#context, request.bytes, overlay, request.definition);
    if (resolved.kind === "integrityFailure") {
      return { phase: DefinitionScheduleHostPhase.IntegrityFailure, evidence: resolved.evidence };
    }
    const definition = request.definition;
    const timer = engineTimerSchedule(resolved.compilation.capabilities, request.timerStart.startEventId);
    if (timer === null) {
      return {
        phase: DefinitionScheduleHostPhase.IntegrityFailure,
        evidence: "The definition publishes no Timer start with the selected identity.",
      };
    }
    return mapHostResult(await operation({
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
      timerStart: { startEventId: request.timerStart.startEventId, schedule: timer },
      processInstanceId: request.processInstanceId,
      scheduleId: request.hostScheduleId,
      workflowIdBase: request.configuredWorkflowIdBase,
      dueAtEpochMs,
      limits: this.#context.limits,
    }));
  }
}

function mapHostResult(result: EngineDefinitionScheduleResult): DefinitionScheduleHostResult {
  switch (result.status) {
    case EngineDefinitionScheduleStatus.Pending:
      return { phase: DefinitionScheduleHostPhase.Pending, paused: result.paused };
    case EngineDefinitionScheduleStatus.Started:
      return { phase: DefinitionScheduleHostPhase.Started, processLocator: serializeEngineProcessLocator(result.locator) };
    case EngineDefinitionScheduleStatus.Missed:
      return { phase: DefinitionScheduleHostPhase.Missed };
    case EngineDefinitionScheduleStatus.Rejected:
    case EngineDefinitionScheduleStatus.IntegrityFailure:
      return { phase: DefinitionScheduleHostPhase.IntegrityFailure, evidence: result.failure.evidence };
  }
}

function parseUtcInstant(value: string, name: string): number {
  const epochMs = Date.parse(value);
  if (!Number.isSafeInteger(epochMs)) throw new TypeError(`${name} must be a valid UTC instant`);
  return epochMs;
}
