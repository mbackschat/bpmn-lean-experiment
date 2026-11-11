/**
 * Timer-start occurrences of a registered definition version: the due instants of its selected root Timer start,
 * counted from the deploy time the population recorded for the version's deployment
 * ([population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md), CIB-INT-0029). They are the
 * kernel's (`timerOccurrences`), as is the identity of the instance an occurrence starts (`timerInstanceId`); the engine
 * API only reads them, and every request recompiles the stored bytes and checks the selected Timer start first.
 */
import { decodeProgram, deploymentSummary, timerInstanceId, timerOccurrences } from "@bpmn-lean/kernel";
import type { DeploymentAnswer } from "@bpmn-lean/temporal-host/host";

import {
  requireWireString,
  sameJson,
  snapshotOverlay,
  snapshotProfile,
  type EngineFailure,
  type EngineLimits,
  type EngineProfile,
  type EngineSourceOverlaySelection,
} from "./common.js";
import type { EngineStartCapability, EngineTimerSchedule } from "./definition-capabilities.js";
import { atVersion, compileProgram, engineHostRefusal, type CompiledDefinition } from "./definition.js";
import { engineDefinitionNotDeployedCode, engineDeployment } from "./definition-deployment.js";
import type { EngineHost } from "./host.js";

/** An instant no occurrence of the selected Timer start is due at (the kernel's `timerStart` refusal). */
export const engineTimerOccurrenceUnknownCode = "timer-occurrence-unknown";
/** The most occurrences one listing returns. */
export const engineTimerOccurrenceListLimit = 100;

export enum EngineDefinitionScheduleIntegrityCode {
  CompilationRejected = "definitionCompilationRejected",
  IdentityDrift = "definitionIdentityDrift",
  CapabilityDrift = "definitionStartCapabilityDrift",
  ScheduleDrift = "temporalScheduleDrift",
  InvalidSchedulePhase = "temporalSchedulePhaseInvalid",
  ScheduleMissing = "temporalScheduleMissing",
  /** A started action's firing Workflow is not retained, or closed without the population's answer. */
  FiringUnanswered = "timerFiringUnanswered",
  /** The population answered the firing with a resolution no `timerStart` produces. */
  FiringAnswerInvalid = "timerFiringAnswerInvalid",
}

export type EngineTimerStartSelection = Readonly<{ startEventId: string; schedule: EngineTimerSchedule }>;

/** The stored definition version and the Timer start selected on it, as the platform stored them. */
export type EngineTimerStartDefinitionRequest = Readonly<{
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
  limits: EngineLimits;
}>;

/** One occurrence: its due instant and the semantic identity of the instance it starts when it commits. */
export type EngineTimerStartOccurrence = Readonly<{ dueAtEpochMs: number; processInstanceId: string }>;

export type EngineTimerStartOccurrencesRequest = EngineTimerStartDefinitionRequest & Readonly<{
  /** The first instant a listed occurrence may be due at. */
  fromEpochMs: number;
  /** At most `engineTimerOccurrenceListLimit`. */
  limit: number;
}>;

export enum EngineTimerStartOccurrencesStatus {
  Listed = "listed",
  /** The version is not registered, or the deployment does not serve what it requires. */
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export type EngineTimerStartOccurrencesResult =
  | Readonly<{ status: EngineTimerStartOccurrencesStatus.Listed; occurrences: readonly EngineTimerStartOccurrence[] }>
  | Readonly<{
      status: EngineTimerStartOccurrencesStatus.Rejected | EngineTimerStartOccurrencesStatus.IntegrityFailure;
      failure: EngineFailure;
    }>;

/** A Timer start checked against the stored version and the deployment its registration answered. */
export type PreparedTimerStart = Readonly<{
  compiled: CompiledDefinition;
  population: string;
  deployment: Extract<DeploymentAnswer, { readonly deploymentId: number }>;
  startEventId: string;
  /** The occurrences due at or after `fromMs`, at most `limit` of them. */
  occurrences: (fromMs: number, limit: number) => readonly EngineTimerStartOccurrence[];
}>;

/** Why a Timer start cannot be prepared; each caller reports it under its own status. */
export type TimerStartRefusal = Readonly<{ refusal: "rejected" | "integrityFailure"; failure: EngineFailure }>;

/** The occurrences of the selected Timer start due at or after `fromEpochMs`, in due order. */
export async function listEngineTimerStartOccurrences(
  request: EngineTimerStartOccurrencesRequest,
): Promise<EngineTimerStartOccurrencesResult> {
  if (!Number.isSafeInteger(request.fromEpochMs) || request.fromEpochMs < 0) {
    throw new RangeError("fromEpochMs must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(request.limit) || request.limit <= 0 || request.limit > engineTimerOccurrenceListLimit) {
    throw new RangeError(`limit must be an integer from 1 to ${String(engineTimerOccurrenceListLimit)}`);
  }
  const prepared = await prepareTimerStart(request);
  if ("refusal" in prepared) {
    return {
      status: prepared.refusal === "rejected"
        ? EngineTimerStartOccurrencesStatus.Rejected
        : EngineTimerStartOccurrencesStatus.IntegrityFailure,
      failure: prepared.failure,
    };
  }
  return { status: EngineTimerStartOccurrencesStatus.Listed, occurrences: prepared.occurrences(request.fromEpochMs, request.limit) };
}

/** The occurrence due at `dueAtEpochMs`, or `timer-occurrence-unknown` when none is. */
export function occurrenceAt(prepared: PreparedTimerStart, dueAtEpochMs: number): EngineTimerStartOccurrence | EngineFailure {
  const [first] = prepared.occurrences(dueAtEpochMs, 1);
  return first?.dueAtEpochMs === dueAtEpochMs ? first : {
    code: engineTimerOccurrenceUnknownCode,
    evidence: "No occurrence of the selected Timer start is due at the instant, counted from the deployment's deploy time.",
  };
}

/**
 * Recompiles the stored version and checks its identity and its selected Timer start, then reads the deployment its
 * registration answered: an unregistered version is `definition-not-deployed`.
 */
export async function prepareTimerStart(request: EngineTimerStartDefinitionRequest): Promise<PreparedTimerStart | TimerStartRefusal> {
  if (!(request.bytes instanceof Uint8Array)) throw new TypeError("bytes must be a Uint8Array");
  const sourceId = requireWireString(request.sourceId, "sourceId");
  const expectedSha256 = requireWireString(request.expectedSha256, "expectedSha256");
  const profile = snapshotProfile(request.profile);
  const expectedProcessId = requireWireString(request.expectedProcessId, "expectedProcessId");
  const timerStart = structuredClone(request.timerStart);
  const read = await compileProgram({
    bytes: Uint8Array.from(request.bytes), sourceId, expectedSha256, profile, sourceOverlay: snapshotOverlay(request.sourceOverlay),
    limits: { maxBytes: request.limits.maxBytes, parserDeadlineMs: request.limits.parserDeadlineMs },
  });
  if (!("program" in read)) return integrityFailure(EngineDefinitionScheduleIntegrityCode.CompilationRejected, read.diagnostics[0].evidence);
  const compiled = atVersion(read, request.version);
  const { source, definition } = compiled.compilation;
  if (source.id !== sourceId || source.sha256 !== expectedSha256 || source.byteLength !== request.expectedByteLength ||
      definition.ref.definitionKey !== expectedProcessId || definition.profile !== profile.id) {
    return integrityFailure(EngineDefinitionScheduleIntegrityCode.IdentityDrift,
      "Compiled source and definition identity did not match the stored definition version.");
  }
  const starts = compiled.compilation.capabilities.starts;
  const selected = starts.filter((start) =>
    start.startEventId === timerStart.startEventId && start.schedule !== null && sameJson(start.schedule, timerStart.schedule));
  if (!sameJson(starts, request.expectedStarts) || selected.length !== 1) {
    return integrityFailure(EngineDefinitionScheduleIntegrityCode.CapabilityDrift,
      "The compiled Timer start did not match the stored definition version.");
  }
  const refusal = engineHostRefusal(compiled.compilation.hostRequirements, request.host.served);
  if (refusal !== null) {
    return rejected({ code: refusal, evidence: `The deployment does not serve what the definition requires (${refusal}).` });
  }
  const deployment = await engineDeployment(request.host, definition);
  if (deployment === null) {
    return rejected({ code: engineDefinitionNotDeployedCode, evidence: "No population registration holds the definition version." });
  }
  const program = decodeProgram(compiled.program);
  if (!program.ok) throw new TypeError(`a compiled program decodes: ${program.refusal}`);
  // The summary the population keeps of the registered deployment, whose deploy time is the occurrences' origin.
  const summary = {
    ...deploymentSummary({ ...program.value, identity: { ...program.value.identity, deployment: deployment.deploymentId } }),
    versions: deployment.versions,
    deployedAtMs: deployment.deployedAtMs,
  };
  const startEventId = timerStart.startEventId;
  return {
    compiled,
    population: request.host.population.population,
    deployment,
    startEventId,
    occurrences: (fromMs, limit) => (timerOccurrences(summary, startEventId, fromMs, limit) ?? []).map((dueAtEpochMs) =>
      ({ dueAtEpochMs, processInstanceId: timerInstanceId(deployment.deploymentId, startEventId, dueAtEpochMs) })),
  };
}

function rejected(failure: EngineFailure): TimerStartRefusal {
  return { refusal: "rejected", failure };
}

function integrityFailure(code: EngineDefinitionScheduleIntegrityCode, evidence: string): TimerStartRefusal {
  return { refusal: "integrityFailure", failure: { code, evidence } };
}
