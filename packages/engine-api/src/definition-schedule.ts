import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  AcceptedBpmnCompilation,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";
import {
  StimulusKind,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  DeepReadonly,
  TriggerTimerStartStimulus,
} from "@bpmn-lean/semantic-core";
import {
  TemporalDefinitionScheduleCreateResultKind,
  createTemporalDefinitionSchedule,
  deleteTemporalDefinitionSchedule,
  describeTemporalDefinitionSchedule,
  pauseTemporalDefinitionSchedule,
} from "@bpmn-lean/temporal-client/definition-schedule";
import type {
  TemporalDefinitionScheduleClient,
} from "@bpmn-lean/temporal-client/definition-schedule";

import {
  engineDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import type {
  EngineDefinitionStartCapabilities,
  EngineTimerStartCapability,
} from "./definition-capabilities.js";
import {
  assessDefinitionScheduleDescription,
} from "./definition-schedule-description.js";
import {
  engineProcessLocatorForScheduleExecution,
} from "./process-locator.js";
import type {
  EngineProcessLocator,
} from "./process-locator.js";

export const EngineDefinitionScheduleStatus = {
  Pending: "pending",
  Started: "started",
  Missed: "missed",
  Rejected: "rejected",
  IntegrityFailure: "integrityFailure",
} as const;

export type EngineDefinitionScheduleStatus =
  typeof EngineDefinitionScheduleStatus[
    keyof typeof EngineDefinitionScheduleStatus
  ];

export const EngineDefinitionScheduleIntegrityCode = {
  CompilationRejected: "definitionCompilationRejected",
  IdentityDrift: "definitionIdentityDrift",
  CapabilityDrift: "definitionStartCapabilityDrift",
  ScheduleDrift: "temporalScheduleDrift",
  InvalidSchedulePhase: "temporalSchedulePhaseInvalid",
} as const;

export type EngineDefinitionScheduleIntegrityCode =
  typeof EngineDefinitionScheduleIntegrityCode[
    keyof typeof EngineDefinitionScheduleIntegrityCode
  ];

export type EngineDefinitionScheduleBindingRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  expectedByteLength: number;
  semanticProfile: string;
  expectedProcessId: string;
  expectedStartCapabilities: EngineDefinitionStartCapabilities;
  expectedTimerStart: EngineTimerStartCapability;
  processInstanceId: string;
  scheduleId: string;
  configuredWorkflowId: string;
  activationAtEpochMs: number;
  dueAtEpochMs: number;
  limits: BpmnSourceLimits;
  temporalClient: TemporalDefinitionScheduleClient;
  taskQueue: string;
}>;

export type EngineDefinitionScheduleFailure = DeepReadonly<{
  code: string;
  evidence: string;
}>;

export type EngineDefinitionScheduleResult =
  | Readonly<{
      status: typeof EngineDefinitionScheduleStatus.Pending;
      paused: boolean;
    }>
  | Readonly<{
      status: typeof EngineDefinitionScheduleStatus.Started;
      paused: boolean;
      locator: EngineProcessLocator;
    }>
  | Readonly<{
      status: typeof EngineDefinitionScheduleStatus.Missed;
      paused: boolean;
    }>
  | Readonly<{
      status: typeof EngineDefinitionScheduleStatus.Rejected;
      failure: EngineDefinitionScheduleFailure;
    }>
  | Readonly<{
      status: typeof EngineDefinitionScheduleStatus.IntegrityFailure;
      failure: EngineDefinitionScheduleFailure;
    }>;

export type EngineDefinitionScheduleAddressRequest = Readonly<{
  scheduleId: string;
  temporalClient: TemporalDefinitionScheduleClient;
}>;

export async function createBpmnDefinitionSchedule(
  request: EngineDefinitionScheduleBindingRequest,
): Promise<EngineDefinitionScheduleResult> {
  const prepared = await prepareBoundSchedule(request);
  if ("status" in prepared) {
    return prepared;
  }
  const created = await createTemporalDefinitionSchedule(
    prepared.snapshot.temporalClient,
    prepared.expected,
  );
  switch (created.kind) {
    case TemporalDefinitionScheduleCreateResultKind.Created:
    case TemporalDefinitionScheduleCreateResultKind.AlreadyExists:
      return inspectPreparedSchedule(prepared, false);
    case TemporalDefinitionScheduleCreateResultKind.Rejected:
      return {
        status: EngineDefinitionScheduleStatus.Rejected,
        failure: created.failure,
      };
    default:
      return assertNever(created);
  }
}

export async function inspectBpmnDefinitionSchedule(
  request: EngineDefinitionScheduleBindingRequest,
): Promise<EngineDefinitionScheduleResult> {
  const prepared = await prepareBoundSchedule(request);
  return "status" in prepared
    ? prepared
    : inspectPreparedSchedule(prepared, false);
}

export async function pauseBpmnDefinitionSchedule(
  request: EngineDefinitionScheduleBindingRequest,
): Promise<EngineDefinitionScheduleResult> {
  const prepared = await prepareBoundSchedule(request);
  if ("status" in prepared) {
    return prepared;
  }
  await pauseTemporalDefinitionSchedule(
    prepared.snapshot.temporalClient,
    prepared.snapshot.scheduleId,
  );
  return inspectPreparedSchedule(prepared, true);
}

export function deleteBpmnDefinitionSchedule(
  request: EngineDefinitionScheduleAddressRequest,
): Promise<void> {
  requireNonemptyWireString(request.scheduleId, "scheduleId");
  return deleteTemporalDefinitionSchedule(
    request.temporalClient,
    request.scheduleId,
  );
}

type ScheduleSnapshot = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  expectedSha256: string;
  expectedByteLength: number;
  semanticProfile: string;
  expectedProcessId: string;
  expectedStartCapabilities: EngineDefinitionStartCapabilities;
  expectedTimerStart: EngineTimerStartCapability;
  processInstanceId: string;
  scheduleId: string;
  configuredWorkflowId: string;
  activationAtEpochMs: number;
  dueAtEpochMs: number;
  limits: BpmnSourceLimits;
  temporalClient: TemporalDefinitionScheduleClient;
  taskQueue: string;
}>;

type PreparedSchedule = Readonly<{
  snapshot: ScheduleSnapshot;
  expected: Readonly<{
    scheduleId: string;
    dueAtEpochMs: number;
    start: TriggerTimerStartStimulus;
    semanticProcess: AcceptedBpmnCompilation["semanticProcess"];
    configuredWorkflowId: string;
    taskQueue: string;
  }>;
}>;

async function prepareBoundSchedule(
  request: EngineDefinitionScheduleBindingRequest,
): Promise<PreparedSchedule | EngineDefinitionScheduleResult> {
  const snapshot = snapshotRequest(request);
  const compilation = await compileBpmnToSemanticProcess({
    bytes: snapshot.bytes,
    sourceId: snapshot.sourceId,
    expectedSha256: snapshot.expectedSha256,
    semanticProfile: snapshot.semanticProfile,
    sourceOverlay: null,
    limits: snapshot.limits,
  });
  if (compilation.status === BpmnCompilationStatus.Rejected) {
    return integrityFailure(
      EngineDefinitionScheduleIntegrityCode.CompilationRejected,
      compilation.diagnostics[0]?.evidence ??
        "Stored definition recompilation was rejected.",
    );
  }
  if (!compiledIdentityMatches(compilation, snapshot)) {
    return integrityFailure(
      EngineDefinitionScheduleIntegrityCode.IdentityDrift,
      "Compiled source and definition identity did not match the stored definition version.",
    );
  }
  const capabilities = engineDefinitionStartCapabilities(
    compilation.semanticProcess,
  );
  if (
    !sameStartCapabilities(
      capabilities,
      snapshot.expectedStartCapabilities,
    ) ||
    capabilities.timerStarts.length !== 1 ||
    capabilities.timerStarts[0]?.startEventId !==
      snapshot.expectedTimerStart.startEventId ||
    capabilities.timerStarts[0]?.durationMs !==
      snapshot.expectedTimerStart.durationMs
  ) {
    return integrityFailure(
      EngineDefinitionScheduleIntegrityCode.CapabilityDrift,
      "Compiled Timer Start capability did not match the stored definition version.",
    );
  }
  const start = timerStartStimulus(snapshot);
  return {
    snapshot,
    expected: {
      scheduleId: snapshot.scheduleId,
      dueAtEpochMs: snapshot.dueAtEpochMs,
      start,
      semanticProcess: compilation.semanticProcess,
      configuredWorkflowId: snapshot.configuredWorkflowId,
      taskQueue: snapshot.taskQueue,
    },
  };
}

async function inspectPreparedSchedule(
  prepared: PreparedSchedule,
  expectedPaused: boolean,
): Promise<EngineDefinitionScheduleResult> {
  const description = await describeTemporalDefinitionSchedule(
    prepared.snapshot.temporalClient,
    prepared.snapshot.scheduleId,
  );
  const assessment = assessDefinitionScheduleDescription(
    description,
    prepared.expected,
  );
  switch (assessment.kind) {
    case "pending":
      return assessment.paused === expectedPaused
        ? {
            status: EngineDefinitionScheduleStatus.Pending,
            paused: assessment.paused,
          }
        : unexpectedPauseState(expectedPaused);
    case "started":
      return assessment.paused === expectedPaused
        ? {
            status: EngineDefinitionScheduleStatus.Started,
            paused: assessment.paused,
            locator: engineProcessLocatorForScheduleExecution(
              assessment.workflowId,
            ),
          }
        : unexpectedPauseState(expectedPaused);
    case "missed":
      return assessment.paused === expectedPaused
        ? {
            status: EngineDefinitionScheduleStatus.Missed,
            paused: assessment.paused,
          }
        : unexpectedPauseState(expectedPaused);
    case "drift":
      return integrityFailure(
        EngineDefinitionScheduleIntegrityCode.ScheduleDrift,
        assessment.evidence,
      );
    case "invalidPhase":
      return integrityFailure(
        EngineDefinitionScheduleIntegrityCode.InvalidSchedulePhase,
        assessment.evidence,
      );
    default:
      return assertNever(assessment);
  }
}

function unexpectedPauseState(
  expectedPaused: boolean,
): EngineDefinitionScheduleResult {
  return integrityFailure(
    EngineDefinitionScheduleIntegrityCode.InvalidSchedulePhase,
    `Temporal Schedule paused state did not equal ${String(expectedPaused)}.`,
  );
}

function snapshotRequest(
  request: EngineDefinitionScheduleBindingRequest,
): ScheduleSnapshot {
  if (!(request.bytes instanceof Uint8Array)) {
    throw new TypeError("bytes must be a Uint8Array");
  }
  requireNonemptyWireString(request.sourceId, "sourceId");
  requireNonemptyWireString(request.semanticProfile, "semanticProfile");
  requireNonemptyWireString(request.expectedProcessId, "expectedProcessId");
  requireNonemptyWireString(
    request.expectedTimerStart.startEventId,
    "expectedTimerStart.startEventId",
  );
  requireNonemptyWireString(request.processInstanceId, "processInstanceId");
  requireNonemptyWireString(request.scheduleId, "scheduleId");
  requireNonemptyWireString(
    request.configuredWorkflowId,
    "configuredWorkflowId",
  );
  requireNonemptyWireString(request.taskQueue, "taskQueue");
  requirePositiveSafeInteger(request.expectedByteLength, "expectedByteLength");
  requirePositiveSafeInteger(
    request.expectedTimerStart.durationMs,
    "expectedTimerStart.durationMs",
  );
  requireWholeUtcSecond(request.activationAtEpochMs, "activationAtEpochMs");
  requireWholeUtcSecond(request.dueAtEpochMs, "dueAtEpochMs");
  if (
    request.activationAtEpochMs + request.expectedTimerStart.durationMs !==
    request.dueAtEpochMs
  ) {
    throw new RangeError(
      "dueAtEpochMs must equal activationAtEpochMs plus the Timer Start duration",
    );
  }
  return {
    bytes: Uint8Array.from(request.bytes),
    sourceId: request.sourceId,
    expectedSha256: request.expectedSha256,
    expectedByteLength: request.expectedByteLength,
    semanticProfile: request.semanticProfile,
    expectedProcessId: request.expectedProcessId,
    expectedStartCapabilities: {
      messageStarts: request.expectedStartCapabilities.messageStarts.map(
        ({ startEventId, channel }) => ({
          startEventId,
          channel: { ...channel },
        }),
      ),
      timerStarts: request.expectedStartCapabilities.timerStarts.map(
        ({ startEventId, durationMs }) => ({ startEventId, durationMs }),
      ),
    },
    expectedTimerStart: { ...request.expectedTimerStart },
    processInstanceId: request.processInstanceId,
    scheduleId: request.scheduleId,
    configuredWorkflowId: request.configuredWorkflowId,
    activationAtEpochMs: request.activationAtEpochMs,
    dueAtEpochMs: request.dueAtEpochMs,
    limits: { ...request.limits },
    temporalClient: request.temporalClient,
    taskQueue: request.taskQueue,
  };
}

function sameStartCapabilities(
  left: EngineDefinitionStartCapabilities,
  right: EngineDefinitionStartCapabilities,
): boolean {
  return (
    left.messageStarts.length === right.messageStarts.length &&
    left.messageStarts.every((capability, index) => {
      const expected = right.messageStarts[index];
      return capability.startEventId === expected?.startEventId &&
        capability.channel.kind === expected.channel.kind &&
        capability.channel.interfaceId === expected.channel.interfaceId &&
        capability.channel.interfaceOperationId ===
          expected.channel.interfaceOperationId &&
        capability.channel.messageId === expected.channel.messageId;
    }) &&
    left.timerStarts.length === right.timerStarts.length &&
    left.timerStarts.every((capability, index) => {
      const expected = right.timerStarts[index];
      return (
        capability.startEventId === expected?.startEventId &&
        capability.durationMs === expected.durationMs
      );
    })
  );
}

function timerStartStimulus(
  snapshot: ScheduleSnapshot,
): TriggerTimerStartStimulus {
  return {
    kind: StimulusKind.TriggerTimerStart,
    commandId: `timer-start:${snapshot.processInstanceId}`,
    processId: snapshot.expectedProcessId,
    instanceId: snapshot.processInstanceId,
    startEventId: snapshot.expectedTimerStart.startEventId,
  };
}

function compiledIdentityMatches(
  compilation: AcceptedBpmnCompilation,
  snapshot: ScheduleSnapshot,
): boolean {
  return (
    compilation.source.id === snapshot.sourceId &&
    compilation.source.sha256 === snapshot.expectedSha256 &&
    compilation.source.byteLength === snapshot.expectedByteLength &&
    compilation.semanticProcess.identity.sourceId === snapshot.sourceId &&
    compilation.semanticProcess.identity.sourceSha256 === snapshot.expectedSha256 &&
    compilation.semanticProcess.identity.sourceOverlay === null &&
    compilation.semanticProcess.identity.semanticProfile ===
      snapshot.semanticProfile &&
    compilation.semanticProcess.processId === snapshot.expectedProcessId
  );
}

function integrityFailure(
  code: EngineDefinitionScheduleIntegrityCode,
  evidence: string,
): EngineDefinitionScheduleResult {
  return {
    status: EngineDefinitionScheduleStatus.IntegrityFailure,
    failure: { code, evidence },
  };
}

function requireNonemptyWireString(value: string, name: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !isWellFormedWireString(value)
  ) {
    throw new TypeError(`${name} must be a nonempty well-formed Unicode string`);
  }
}

function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function requireWholeUtcSecond(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value % 1_000 !== 0) {
    throw new RangeError(`${name} must be a positive whole UTC second`);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition Schedule result: ${String(value)}`);
}
