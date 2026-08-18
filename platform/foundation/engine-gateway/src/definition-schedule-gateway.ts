/** Product 2's cohesive, representation-free definition Schedule host collaborator. */
import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionScheduleStatus,
  compileBpmnDefinition,
  createBpmnDefinitionSchedule,
  deleteBpmnDefinitionSchedule,
  inspectBpmnDefinitionSchedule,
  pauseBpmnDefinitionSchedule,
  serializeEngineProcessLocator,
} from "@bpmn-lean/engine-api";
import type {
  EngineDefinitionCompilationResult,
  EngineDefinitionScheduleResult,
} from "@bpmn-lean/engine-api";
import type {
  TemporalDefinitionScheduleClient,
} from "@bpmn-lean/temporal-client/definition-schedule";

import {
  mapDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import type {
  DefinitionStartCapabilities,
  DefinitionTimerStartCapability,
} from "./definition-capabilities.js";

export type DefinitionScheduleValidationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  semanticProfile: string;
  expectedProcessId: string;
}>;

type AcceptedCompilation = Extract<
  EngineDefinitionCompilationResult,
  { status: "accepted" }
>;

export type DefinitionScheduleValidationResult =
  | Readonly<{
      status: "accepted";
      source: AcceptedCompilation["source"];
      processId: string;
      semanticProfile: string;
      startCapabilities: DefinitionStartCapabilities;
    }>
  | Readonly<{ status: "rejected"; evidence: string }>;

export type DefinitionScheduleHostRequest = Readonly<{
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
  timerStart: DefinitionTimerStartCapability;
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
  | Readonly<{
      phase: typeof DefinitionScheduleHostPhase.Pending;
      paused: boolean;
    }>
  | Readonly<{
      phase: typeof DefinitionScheduleHostPhase.Started;
      processLocator: string;
    }>
  | Readonly<{ phase: typeof DefinitionScheduleHostPhase.Missed }>
  | Readonly<{
      phase: typeof DefinitionScheduleHostPhase.IntegrityFailure;
      evidence: string;
    }>;

export interface DefinitionScheduleHost {
  validateDefinition(
    request: DefinitionScheduleValidationRequest,
  ): Promise<DefinitionScheduleValidationResult>;
  createOrCompare(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult>;
  inspect(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult>;
  pause(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult>;
  delete(request: DefinitionScheduleHostRequest): Promise<void>;
}

export type BpmnDefinitionScheduleGatewayOptions = Readonly<{
  maxSourceBytes: number;
  parserDeadlineMs: number;
  temporalClient: TemporalDefinitionScheduleClient;
  temporalTaskQueue: string;
}>;

export class BpmnDefinitionScheduleGateway implements DefinitionScheduleHost {
  readonly #limits: Readonly<{
    maxBytes: number;
    parserDeadlineMs: number;
  }>;
  readonly #temporalClient: TemporalDefinitionScheduleClient;
  readonly #taskQueue: string;

  constructor(options: BpmnDefinitionScheduleGatewayOptions) {
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

  async validateDefinition(
    request: DefinitionScheduleValidationRequest,
  ): Promise<DefinitionScheduleValidationResult> {
    const result = await compileBpmnDefinition({
      ...request,
      limits: this.#limits,
    });
    switch (result.status) {
      case EngineDefinitionCompilationStatus.Accepted:
        if (result.definition.processId !== request.expectedProcessId) {
          return {
            status: "rejected",
            evidence: "Compiled Process identity did not match the stored definition.",
          };
        }
        return {
          status: "accepted",
          source: result.source,
          processId: result.definition.processId,
          semanticProfile: result.definition.semanticProfile,
          startCapabilities: mapDefinitionStartCapabilities(
            result.startCapabilities,
          ),
        };
      case EngineDefinitionCompilationStatus.Rejected:
        return {
          status: "rejected",
          evidence: result.diagnostics[0]?.evidence ??
            "Stored definition recompilation was rejected.",
        };
      default:
        return assertNever(result);
    }
  }

  async createOrCompare(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult> {
    return mapHostResult(
      await createBpmnDefinitionSchedule(this.boundRequest(request)),
    );
  }

  async inspect(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult> {
    return mapHostResult(
      await inspectBpmnDefinitionSchedule(this.boundRequest(request)),
    );
  }

  async pause(
    request: DefinitionScheduleHostRequest,
  ): Promise<DefinitionScheduleHostResult> {
    return mapHostResult(
      await pauseBpmnDefinitionSchedule(this.boundRequest(request)),
    );
  }

  delete(request: DefinitionScheduleHostRequest): Promise<void> {
    return deleteBpmnDefinitionSchedule({
      scheduleId: request.hostScheduleId,
      temporalClient: this.#temporalClient,
    });
  }

  private boundRequest(request: DefinitionScheduleHostRequest) {
    return {
      bytes: request.bytes,
      sourceId: request.definition.source.id,
      expectedSha256: request.definition.source.sha256,
      expectedByteLength: request.definition.source.byteLength,
      semanticProfile: request.definition.semanticProfile,
      expectedProcessId: request.definition.processId,
      expectedStartCapabilities: request.definition.startCapabilities,
      expectedTimerStart: request.timerStart,
      processInstanceId: request.processInstanceId,
      scheduleId: request.hostScheduleId,
      configuredWorkflowId: request.configuredWorkflowIdBase,
      activationAtEpochMs: parseUtcInstant(request.activationAt, "activationAt"),
      dueAtEpochMs: parseUtcInstant(request.dueAt, "dueAt"),
      limits: this.#limits,
      temporalClient: this.#temporalClient,
      taskQueue: this.#taskQueue,
    };
  }
}

function mapHostResult(
  result: EngineDefinitionScheduleResult,
): DefinitionScheduleHostResult {
  switch (result.status) {
    case EngineDefinitionScheduleStatus.Pending:
      return {
        phase: DefinitionScheduleHostPhase.Pending,
        paused: result.paused,
      };
    case EngineDefinitionScheduleStatus.Started:
      return {
        phase: DefinitionScheduleHostPhase.Started,
        processLocator: serializeEngineProcessLocator(result.locator),
      };
    case EngineDefinitionScheduleStatus.Missed:
      return { phase: DefinitionScheduleHostPhase.Missed };
    case EngineDefinitionScheduleStatus.Rejected:
    case EngineDefinitionScheduleStatus.IntegrityFailure:
      return {
        phase: DefinitionScheduleHostPhase.IntegrityFailure,
        evidence: result.failure.evidence,
      };
    default:
      return assertNever(result);
  }
}

function parseUtcInstant(value: string, name: string): number {
  const epochMs = Date.parse(value);
  if (!Number.isSafeInteger(epochMs)) {
    throw new TypeError(`${name} must be a valid UTC instant`);
  }
  return epochMs;
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

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition Schedule gateway result: ${String(value)}`);
}
