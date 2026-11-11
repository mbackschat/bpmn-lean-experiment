/**
 * Timer Start Schedules: one Temporal Schedule per platform Schedule fires one occurrence of the selected root Timer
 * start of a registered definition version through the population, whose kernel decides whether it starts an instance
 * ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)). The occurrence is named by its
 * due instant, which must be one of the kernel's occurrences counted from the deployment's deploy time
 * (`timer-occurrence-unknown`). Every operation recompiles the stored bytes and checks the selected Timer start, so the
 * stored Schedule is compared with what the definition produces now; its memo carries the firing's intent.
 *
 * A Schedule whose action ran reports the firing's verdict: the instance it started under the kernel-derived identity,
 * or the kernel's refusal (a redeploy supersedes the deployment, `timer-start-superseded`; another firing consumed the
 * occurrence, `timer-start-occurrence-consumed`). Until the firing answers, the Schedule is `firing`.
 */
import {
  SchedulePhase,
  ScheduleCreation,
  assessSchedule,
  canonicalJson,
  timerFiringWorkflowId,
  timerFiringWorkflowType,
  type CommandAnswer,
  type ExpectedSchedule,
  type TimerFiringArgs,
} from "@bpmn-lean/temporal-host/host";

import { member, requireWireString, sha256Hex, type EngineFailure, type JsonValue } from "./common.js";
import {
  EngineDefinitionScheduleIntegrityCode,
  occurrenceAt,
  prepareTimerStart,
  type EngineTimerStartDefinitionRequest,
  type TimerStartRefusal,
} from "./definition-timer-occurrences.js";
import { engineHostConfig, type EngineHost } from "./host.js";
import { engineProcessLocatorForCanonicalProcess, type EngineProcessLocator } from "./process-locator.js";

export const engineTimerStartProtocol = "bpmn-kernel-timer-start";

export enum EngineDefinitionScheduleStatus {
  Pending = "pending",
  /** The action ran and its firing has not been answered yet. */
  Firing = "firing",
  Started = "started",
  /** The action ran and the population refused the occurrence with the kernel's code; no instance started. */
  Refused = "refused",
  Missed = "missed",
  Rejected = "rejected",
  IntegrityFailure = "integrityFailure",
}

export type EngineDefinitionScheduleBindingRequest = EngineTimerStartDefinitionRequest & Readonly<{
  scheduleId: string;
  /** The occurrence's due instant: one of the selected Timer start's occurrences (`listEngineTimerStartOccurrences`). */
  dueAtEpochMs: number;
}>;

export type EngineDefinitionScheduleResult =
  | Readonly<{ status: EngineDefinitionScheduleStatus.Pending | EngineDefinitionScheduleStatus.Firing; paused: boolean }>
  | Readonly<{
      status: EngineDefinitionScheduleStatus.Started;
      paused: boolean;
      /** The kernel's identity of the started instance (`timer:…`). */
      processInstanceId: string;
      locator: EngineProcessLocator;
    }>
  | Readonly<{ status: EngineDefinitionScheduleStatus.Refused; paused: boolean; failure: EngineFailure }>
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
  const prepared = await prepare(request);
  if ("status" in prepared) return prepared;
  const created = await request.host.schedules.create({
    scheduleId: prepared.expected.scheduleId,
    firing: prepared.firing,
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
  const prepared = await prepare(request);
  return "status" in prepared ? prepared : inspect(request.host, prepared, false);
}

export async function pauseBpmnDefinitionSchedule(
  request: EngineDefinitionScheduleBindingRequest,
): Promise<EngineDefinitionScheduleResult> {
  const prepared = await prepare(request);
  if ("status" in prepared) return prepared;
  await request.host.schedules.pause(prepared.expected.scheduleId);
  return inspect(request.host, prepared, true);
}

export function deleteBpmnDefinitionSchedule(request: EngineDefinitionScheduleAddressRequest): Promise<void> {
  return request.host.schedules.delete(requireWireString(request.scheduleId, "scheduleId"));
}

type PreparedSchedule = Readonly<{ firing: TimerFiringArgs; expected: ExpectedSchedule }>;

async function prepare(request: EngineDefinitionScheduleBindingRequest): Promise<PreparedSchedule | EngineDefinitionScheduleResult> {
  const scheduleId = requireWireString(request.scheduleId, "scheduleId");
  const dueAtEpochMs = request.dueAtEpochMs;
  if (!Number.isSafeInteger(dueAtEpochMs) || dueAtEpochMs < 0) throw new RangeError("dueAtEpochMs must be a non-negative safe integer");
  const prepared = await prepareTimerStart(request);
  if ("refusal" in prepared) return refused(prepared);
  const occurrence = occurrenceAt(prepared, dueAtEpochMs);
  if ("code" in occurrence) return { status: EngineDefinitionScheduleStatus.Rejected, failure: occurrence };
  const firing: TimerFiringArgs = {
    population: prepared.population,
    config: engineHostConfig(request.host),
    deploymentId: prepared.deployment.deploymentId,
    startEvent: prepared.startEventId,
    dueMs: dueAtEpochMs,
  };
  const workflowIdBase = timerFiringWorkflowId(firing.population, firing.deploymentId, firing.startEvent, firing.dueMs);
  const definition = prepared.compiled.compilation.definition;
  const content = {
    protocol: engineTimerStartProtocol,
    workflowIdBase,
    workflowType: timerFiringWorkflowType,
    taskQueue: request.host.taskQueue,
    definition,
    programSha256: sha256Hex(canonicalJson(prepared.compiled.program)),
    firing,
  };
  return {
    firing,
    expected: {
      scheduleId,
      dueAtEpochMs,
      workflowIdBase,
      taskQueue: request.host.taskQueue,
      memo: {
        intent: { protocol: engineTimerStartProtocol, intentSha256: sha256Hex(canonicalJson(content)) },
        definition: definition as unknown as JsonValue,
      },
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
  const paused = assessment.paused;
  switch (assessment.phase) {
    case SchedulePhase.Pending:
      return { status: EngineDefinitionScheduleStatus.Pending, paused };
    case SchedulePhase.Missed:
      return { status: EngineDefinitionScheduleStatus.Missed, paused };
    case SchedulePhase.Started: {
      const outcome = await host.schedules.firing(assessment.workflowId);
      if (outcome === null) {
        return integrityFailure(EngineDefinitionScheduleIntegrityCode.FiringUnanswered, "No firing Workflow of the action is retained.");
      }
      switch (outcome.kind) {
        case "running":
          return { status: EngineDefinitionScheduleStatus.Firing, paused };
        case "failed":
          return integrityFailure(EngineDefinitionScheduleIntegrityCode.FiringUnanswered, outcome.evidence);
        case "answered":
          return fired(host.population.population, outcome.answer, paused);
      }
    }
  }
}

/** The firing's verdict: the root start entry of a committed fan-out, its failure, or the command's rejection. */
function fired(population: string, answer: CommandAnswer, paused: boolean): EngineDefinitionScheduleResult {
  const resolution = answer.resolution;
  const code = (json: unknown): string | null => {
    const value = member(json, "code");
    return typeof value === "string" ? value : null;
  };
  switch (member(resolution, "kind")) {
    case "rejected": {
      const rejection = code(resolution);
      if (rejection === null) break;
      return { status: EngineDefinitionScheduleStatus.Refused, paused, failure: { code: rejection, evidence: "The population refused the occurrence." } };
    }
    case "fanOut": {
      const entries = member(resolution, "entries");
      const entry: unknown = Array.isArray(entries) ? entries[0] : undefined;
      const instanceId = member(entry, "instanceId");
      if (member(entry, "kind") === "started" && typeof instanceId === "string") {
        return {
          status: EngineDefinitionScheduleStatus.Started,
          paused,
          processInstanceId: instanceId,
          locator: engineProcessLocatorForCanonicalProcess(population, instanceId),
        };
      }
      const failure = code(entry);
      if (member(entry, "kind") === "failed" && failure !== null) {
        return { status: EngineDefinitionScheduleStatus.Refused, paused, failure: { code: failure, evidence: "The occurrence's start failed." } };
      }
      break;
    }
  }
  return integrityFailure(EngineDefinitionScheduleIntegrityCode.FiringAnswerInvalid, "The firing's answer is no Timer start resolution.");
}

function refused(prepared: TimerStartRefusal): EngineDefinitionScheduleResult {
  return {
    status: prepared.refusal === "rejected" ? EngineDefinitionScheduleStatus.Rejected : EngineDefinitionScheduleStatus.IntegrityFailure,
    failure: prepared.failure,
  };
}

function integrityFailure(code: EngineDefinitionScheduleIntegrityCode, evidence: string): EngineDefinitionScheduleResult {
  return { status: EngineDefinitionScheduleStatus.IntegrityFailure, failure: { code, evidence } };
}
