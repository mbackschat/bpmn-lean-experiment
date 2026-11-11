/**
 * Timer Start Schedules: one Temporal Schedule per platform Schedule fires the selected Timer start once at its due
 * instant. Every operation recompiles the stored bytes and checks the selected Timer start, so the stored Schedule is
 * compared with what the definition produces now; its memo carries the start's intent, which the started process
 * inherits.
 *
 * The caller computes the due instant from the Timer start's resolved schedule (`EngineTimerSchedule`); the engine API
 * checks that the selected start and its schedule are what the definition compiles to now.
 */
import {
  SchedulePhase,
  ScheduleCreation,
  assessSchedule,
  type ExpectedSchedule,
} from "@bpmn-lean/temporal-host/host";

import {
  requireWireString,
  sameJson,
  snapshotOverlay,
  snapshotProfile,
  type EngineFailure,
  type EngineLimits,
  type EngineProfile,
  type EngineSourceOverlaySelection,
  type JsonValue,
} from "./common.js";
import type { EngineStartCapability, EngineTimerSchedule } from "./definition-capabilities.js";
import { atVersion, compileProgram, type CompiledDefinition } from "./definition.js";
import { engineCorrelationScope, engineHostConfig, type EngineHost } from "./host.js";
import { engineProcessLocatorForWorkflowId, type EngineProcessLocator } from "./process-locator.js";
import { prepareStart, startMemo, type PreparedStart } from "./start-dispatch.js";

export const engineTimerStartProtocol = "bpmn-kernel-timer-start";

export enum EngineDefinitionScheduleStatus {
  Pending = "pending",
  Started = "started",
  Missed = "missed",
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export enum EngineDefinitionScheduleIntegrityCode {
  CompilationRejected = "definitionCompilationRejected",
  IdentityDrift = "definitionIdentityDrift",
  CapabilityDrift = "definitionStartCapabilityDrift",
  ScheduleDrift = "temporalScheduleDrift",
  InvalidSchedulePhase = "temporalSchedulePhaseInvalid",
  ScheduleMissing = "temporalScheduleMissing",
}

export type EngineTimerStartSelection = Readonly<{ startEventId: string; schedule: EngineTimerSchedule }>;

export type EngineDefinitionScheduleBindingRequest = Readonly<{
  host: EngineHost;
  bytes: Uint8Array;
  sourceOverlay?: EngineSourceOverlaySelection | null;
  sourceId: string;
  expectedSha256: string;
  expectedByteLength: number;
  profile: EngineProfile;
  expectedProcessId: string;
  /** The deployed version the platform stored the definition under. */
  version: number;
  expectedStarts: readonly EngineStartCapability[];
  timerStart: EngineTimerStartSelection;
  processInstanceId: string;
  scheduleId: string;
  workflowIdBase: string;
  /** A whole UTC second, the unit of a Schedule's calendar. */
  dueAtEpochMs: number;
  limits: EngineLimits;
}>;

export type EngineDefinitionScheduleResult =
  | Readonly<{ status: EngineDefinitionScheduleStatus.Pending; paused: boolean }>
  | Readonly<{ status: EngineDefinitionScheduleStatus.Started; paused: boolean; locator: EngineProcessLocator }>
  | Readonly<{ status: EngineDefinitionScheduleStatus.Missed; paused: boolean }>
  | Readonly<{
      status: EngineDefinitionScheduleStatus.Rejected | EngineDefinitionScheduleStatus.IntegrityFailure;
      failure: EngineFailure;
    }>;

export type EngineDefinitionScheduleAddressRequest = Readonly<{ host: EngineHost; scheduleId: string }>;

/** Creates the Schedule, or finds the one already created under its identifier, and reports its phase. */
export async function createBpmnDefinitionSchedule(
  request: EngineDefinitionScheduleBindingRequest,
): Promise<EngineDefinitionScheduleResult> {
  const prepared = await prepare(snapshot(request), request.host);
  if ("status" in prepared) return prepared;
  const created = await request.host.schedules.create({
    scheduleId: prepared.expected.scheduleId,
    dueAtEpochMs: prepared.expected.dueAtEpochMs,
    workflowIdBase: prepared.expected.workflowIdBase,
    program: prepared.start.compiled.program,
    config: engineHostConfig(request.host),
    start: prepared.start.stimulus,
    correlationScope: engineCorrelationScope(prepared.start.compiled.compilation.definition),
    memo: prepared.expected.memo,
  });
  switch (created) {
    case ScheduleCreation.Created:
    case ScheduleCreation.AlreadyExists:
      return inspect(request.host, prepared, false);
  }
}

export async function inspectBpmnDefinitionSchedule(
  request: EngineDefinitionScheduleBindingRequest,
): Promise<EngineDefinitionScheduleResult> {
  const prepared = await prepare(snapshot(request), request.host);
  return "status" in prepared ? prepared : inspect(request.host, prepared, false);
}

export async function pauseBpmnDefinitionSchedule(
  request: EngineDefinitionScheduleBindingRequest,
): Promise<EngineDefinitionScheduleResult> {
  const prepared = await prepare(snapshot(request), request.host);
  if ("status" in prepared) return prepared;
  await request.host.schedules.pause(prepared.expected.scheduleId);
  return inspect(request.host, prepared, true);
}

export function deleteBpmnDefinitionSchedule(request: EngineDefinitionScheduleAddressRequest): Promise<void> {
  return request.host.schedules.delete(requireWireString(request.scheduleId, "scheduleId"));
}

type Snapshot = Omit<EngineDefinitionScheduleBindingRequest, "host" | "sourceOverlay"> & Readonly<{
  sourceOverlay: EngineSourceOverlaySelection | null;
}>;

type PreparedSchedule = Readonly<{ start: PreparedStart; expected: ExpectedSchedule }>;

function snapshot(request: EngineDefinitionScheduleBindingRequest): Snapshot {
  if (!(request.bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
  if (!Number.isSafeInteger(request.dueAtEpochMs) || request.dueAtEpochMs <= 0 || request.dueAtEpochMs % 1_000 !== 0) {
    throw new RangeError("dueAtEpochMs must be a positive whole UTC second");
  }
  return {
    bytes: Uint8Array.from(request.bytes),
    sourceOverlay: snapshotOverlay(request.sourceOverlay),
    sourceId: requireWireString(request.sourceId, "sourceId"),
    expectedSha256: requireWireString(request.expectedSha256, "expectedSha256"),
    expectedByteLength: request.expectedByteLength,
    profile: snapshotProfile(request.profile),
    expectedProcessId: requireWireString(request.expectedProcessId, "expectedProcessId"),
    version: request.version,
    expectedStarts: structuredClone(request.expectedStarts),
    timerStart: structuredClone(request.timerStart),
    processInstanceId: requireWireString(request.processInstanceId, "processInstanceId"),
    scheduleId: requireWireString(request.scheduleId, "scheduleId"),
    workflowIdBase: requireWireString(request.workflowIdBase, "workflowIdBase"),
    dueAtEpochMs: request.dueAtEpochMs,
    limits: { maxBytes: request.limits.maxBytes, parserDeadlineMs: request.limits.parserDeadlineMs },
  };
}

async function prepare(snapshot: Snapshot, host: EngineHost): Promise<PreparedSchedule | EngineDefinitionScheduleResult> {
  const read = await compileProgram(snapshot);
  if (!("program" in read)) {
    return integrityFailure(EngineDefinitionScheduleIntegrityCode.CompilationRejected, read.diagnostics[0].evidence);
  }
  const compiled = atVersion(read, snapshot.version);
  if (!identityMatches(compiled, snapshot)) {
    return integrityFailure(EngineDefinitionScheduleIntegrityCode.IdentityDrift,
      "Compiled source and definition identity did not match the stored definition version.");
  }
  const starts = compiled.compilation.capabilities.starts;
  const selected = starts.filter((start) =>
    start.startEventId === snapshot.timerStart.startEventId && start.schedule !== null &&
    sameJson(start.schedule, snapshot.timerStart.schedule));
  if (!sameJson(starts, snapshot.expectedStarts) || selected.length !== 1) {
    return integrityFailure(EngineDefinitionScheduleIntegrityCode.CapabilityDrift,
      "The compiled Timer start did not match the stored definition version.");
  }
  const stimulus: JsonValue = {
    kind: "start",
    commandId: `timer-start:${snapshot.processInstanceId}`,
    instanceId: snapshot.processInstanceId,
    startEvent: snapshot.timerStart.startEventId,
    trigger: { kind: "timer", logicalTimeMs: snapshot.dueAtEpochMs },
    variables: [],
  };
  const start = prepareStart(host, engineTimerStartProtocol, compiled, snapshot.workflowIdBase, snapshot.processInstanceId,
    stimulus);
  if ("code" in start) return { status: EngineDefinitionScheduleStatus.Rejected, failure: start };
  return {
    start,
    expected: {
      scheduleId: snapshot.scheduleId,
      dueAtEpochMs: snapshot.dueAtEpochMs,
      workflowIdBase: snapshot.workflowIdBase,
      taskQueue: host.taskQueue,
      memo: startMemo(start) as unknown as Readonly<Record<string, JsonValue>>,
    },
  };
}

async function inspect(host: EngineHost, prepared: PreparedSchedule, expectedPaused: boolean): Promise<EngineDefinitionScheduleResult> {
  const stored = await host.schedules.describe(prepared.expected.scheduleId);
  if (stored === null) {
    return integrityFailure(EngineDefinitionScheduleIntegrityCode.ScheduleMissing, "No Temporal Schedule holds the identifier.");
  }
  const assessment = assessSchedule(stored, prepared.expected);
  switch (assessment.phase) {
    case SchedulePhase.Drift:
      return integrityFailure(EngineDefinitionScheduleIntegrityCode.ScheduleDrift, assessment.evidence);
    case SchedulePhase.InvalidPhase:
      return integrityFailure(EngineDefinitionScheduleIntegrityCode.InvalidSchedulePhase, assessment.evidence);
    case SchedulePhase.Pending:
    case SchedulePhase.Started:
    case SchedulePhase.Missed:
      break;
  }
  if (assessment.paused !== expectedPaused) {
    return integrityFailure(EngineDefinitionScheduleIntegrityCode.InvalidSchedulePhase,
      `The Schedule's paused state was not ${String(expectedPaused)}.`);
  }
  switch (assessment.phase) {
    case SchedulePhase.Pending:
      return { status: EngineDefinitionScheduleStatus.Pending, paused: assessment.paused };
    case SchedulePhase.Started:
      return {
        status: EngineDefinitionScheduleStatus.Started,
        paused: assessment.paused,
        locator: engineProcessLocatorForWorkflowId(assessment.workflowId),
      };
    case SchedulePhase.Missed:
      return { status: EngineDefinitionScheduleStatus.Missed, paused: assessment.paused };
  }
}

function identityMatches(compiled: CompiledDefinition, snapshot: Snapshot): boolean {
  const { source, definition } = compiled.compilation;
  return source.id === snapshot.sourceId && source.sha256 === snapshot.expectedSha256 &&
    source.byteLength === snapshot.expectedByteLength && definition.ref.definitionKey === snapshot.expectedProcessId &&
    definition.profile === snapshot.profile.id;
}

function integrityFailure(code: EngineDefinitionScheduleIntegrityCode, evidence: string): EngineDefinitionScheduleResult {
  return { status: EngineDefinitionScheduleStatus.IntegrityFailure, failure: { code, evidence } };
}
