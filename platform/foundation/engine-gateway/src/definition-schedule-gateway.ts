/**
 * Product 2's representation-free Timer start Schedule host: a Schedule fires one occurrence of a stored version's
 * Timer start, named by its canonical UTC due instant, which must be one of the engine's occurrences
 * (`timer-occurrence-unknown`); the instance it starts takes the engine's identity, which `occurrences` reports.
 */
import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionScheduleStatus,
  EngineTimerStartOccurrencesStatus,
  compileBpmnDefinition,
  createBpmnDefinitionSchedule,
  deleteBpmnDefinitionSchedule,
  inspectBpmnDefinitionSchedule,
  listEngineTimerStartOccurrences,
  pauseBpmnDefinitionSchedule,
  serializeEngineProcessLocator,
  type EngineDefinitionScheduleBindingRequest,
  type EngineDefinitionScheduleResult,
  type EngineSourceOverlayIdentity,
  type EngineSourceOverlaySelection,
  type EngineTimerStartDefinitionRequest,
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

/** A stored version and the Timer start selected on it. */
export type DefinitionTimerStartRequest = Readonly<{
  bytes: Uint8Array;
  sourceOverlay?: EngineSourceOverlaySelection | null;
  definition: StoredDefinitionVersion;
  timerStart: DefinitionTimerStartCapability;
}>;

export type DefinitionScheduleHostRequest = DefinitionTimerStartRequest & Readonly<{
  /** The occurrence the Schedule fires, a canonical UTC instant. */
  dueAt: string;
  /** The engine's identity of the instance the occurrence starts, as `occurrences` reported it. */
  processInstanceId: string;
  hostScheduleId: string;
}>;

export type DefinitionTimerOccurrencesRequest = DefinitionTimerStartRequest & Readonly<{
  /** The first canonical UTC instant a listed occurrence may be due at. */
  from: string;
  /** At most `engineTimerOccurrenceListLimit`. */
  limit: number;
}>;

/** One occurrence: its canonical UTC due instant and the engine's identity of the instance it starts. */
export type DefinitionTimerOccurrence = Readonly<{ dueAt: string; processInstanceId: string }>;

export type DefinitionTimerOccurrencesResult =
  | Readonly<{ kind: "listed"; occurrences: readonly DefinitionTimerOccurrence[] }>
  /** The engine refused the version: it is not registered, or the deployment does not serve it. */
  | Readonly<{ kind: "refused"; code: string; evidence: string }>
  | Readonly<{ kind: "integrityFailure"; evidence: string }>;

export const DefinitionScheduleHostPhase = {
  Pending: "pending",
  /** The action ran and the engine has not answered its firing yet. */
  Firing: "firing",
  Started: "started",
  /** The action ran and the engine refused the occurrence, such as after a redeploy superseded the version. */
  Refused: "refused",
  Missed: "missed",
  IntegrityFailure: "integrityFailure",
} as const;

export type DefinitionScheduleHostResult =
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.Pending | typeof DefinitionScheduleHostPhase.Firing; paused: boolean }>
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.Started; processInstanceId: string; processLocator: string }>
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.Refused; code: string }>
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.Missed }>
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.IntegrityFailure; evidence: string }>;

export interface DefinitionScheduleHost {
  validateDefinition(request: DefinitionScheduleValidationRequest): Promise<DefinitionScheduleValidationResult>;
  occurrences(request: DefinitionTimerOccurrencesRequest): Promise<DefinitionTimerOccurrencesResult>;
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

  async occurrences(request: DefinitionTimerOccurrencesRequest): Promise<DefinitionTimerOccurrencesResult> {
    const fromEpochMs = parseUtcInstant(request.from, "from");
    const selected = await this.#selected(request);
    if ("evidence" in selected) return { kind: "integrityFailure", evidence: selected.evidence };
    const result = await listEngineTimerStartOccurrences({ ...selected, fromEpochMs, limit: request.limit });
    switch (result.status) {
      case EngineTimerStartOccurrencesStatus.Listed:
        return {
          kind: "listed",
          occurrences: result.occurrences.map((occurrence) =>
            ({ dueAt: new Date(occurrence.dueAtEpochMs).toISOString(), processInstanceId: occurrence.processInstanceId })),
        };
      case EngineTimerStartOccurrencesStatus.Rejected:
        return { kind: "refused", code: result.failure.code, evidence: result.failure.evidence };
      case EngineTimerStartOccurrencesStatus.IntegrityFailure:
        return { kind: "integrityFailure", evidence: result.failure.evidence };
    }
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
    const dueAtEpochMs = parseUtcInstant(request.dueAt, "dueAt");
    const selected = await this.#selected(request);
    if ("evidence" in selected) return { phase: DefinitionScheduleHostPhase.IntegrityFailure, evidence: selected.evidence };
    const result = mapHostResult(await operation({ ...selected, scheduleId: request.hostScheduleId, dueAtEpochMs }));
    if (result.phase === DefinitionScheduleHostPhase.Started && result.processInstanceId !== request.processInstanceId) {
      return {
        phase: DefinitionScheduleHostPhase.IntegrityFailure,
        evidence: "The engine started another instance identity than the occurrence names.",
      };
    }
    return result;
  }

  /** The engine request for the stored version and its selected Timer start, after the stored bytes recompile. */
  async #selected(request: DefinitionTimerStartRequest): Promise<EngineTimerStartDefinitionRequest | Readonly<{ evidence: string }>> {
    const overlay = request.sourceOverlay ?? null;
    const resolved = await recompileStoredDefinition(this.#context, request.bytes, overlay, request.definition);
    if (resolved.kind === "integrityFailure") return { evidence: resolved.evidence };
    const definition = request.definition;
    const timer = engineTimerSchedule(resolved.compilation.capabilities, request.timerStart.startEventId);
    if (timer === null) return { evidence: "The definition publishes no Timer start with the selected identity." };
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
      timerStart: { startEventId: request.timerStart.startEventId, schedule: timer },
      limits: this.#context.limits,
    };
  }
}

function mapHostResult(result: EngineDefinitionScheduleResult): DefinitionScheduleHostResult {
  switch (result.status) {
    case EngineDefinitionScheduleStatus.Pending:
      return { phase: DefinitionScheduleHostPhase.Pending, paused: result.paused };
    case EngineDefinitionScheduleStatus.Firing:
      return { phase: DefinitionScheduleHostPhase.Firing, paused: result.paused };
    case EngineDefinitionScheduleStatus.Started:
      return {
        phase: DefinitionScheduleHostPhase.Started,
        processInstanceId: result.processInstanceId,
        processLocator: serializeEngineProcessLocator(result.locator),
      };
    case EngineDefinitionScheduleStatus.Refused:
      return { phase: DefinitionScheduleHostPhase.Refused, code: result.failure.code };
    case EngineDefinitionScheduleStatus.Missed:
      return { phase: DefinitionScheduleHostPhase.Missed };
    case EngineDefinitionScheduleStatus.Rejected:
    case EngineDefinitionScheduleStatus.IntegrityFailure:
      return { phase: DefinitionScheduleHostPhase.IntegrityFailure, evidence: result.failure.evidence };
  }
}

/** A canonical UTC instant, as `Date.prototype.toISOString` renders it. */
function parseUtcInstant(value: string, name: string): number {
  const epochMs = Date.parse(value);
  if (!Number.isSafeInteger(epochMs) || epochMs < 0 || new Date(epochMs).toISOString() !== value) {
    throw new TypeError(`${name} must be a canonical UTC instant`);
  }
  return epochMs;
}
