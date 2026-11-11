/**
 * One-shot Temporal Schedules whose single action fires one Timer-start occurrence through the population
 * (`runTimerStartFiring`).
 *
 * A Schedule is the host's realization of a root Timer start ([architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)):
 * the caller names an occurrence of a registered deployment by its due instant, and the host fires it once, durably,
 * at the first whole UTC second not before it, since a calendar spec has no finer unit. The kernel decides at the
 * firing whether the occurrence starts an instance. The stored Schedule is compared with what the caller expects
 * through a memo the caller owns, so drift in the action is found without decoding its arguments.
 */
import type { JsonValue } from "./port.js";
import { timerFiringWorkflowType, type CommandAnswer, type TimerFiringArgs } from "./population-contract.js";

/** A missed occurrence is taken late only within this window; later than that, the Schedule reports it missed. */
export const scheduleCatchupWindowMs = 60_000;

/** The instant a Schedule fires the occurrence due at `dueMs`: the first whole UTC second not before it. */
export function scheduleActionAtMs(dueMs: number): number {
  return Math.ceil(dueMs / 1_000) * 1_000;
}

export interface OneShotScheduleRequest {
  readonly scheduleId: string;
  /** The occurrence the action fires; its due instant decides when (`scheduleActionAtMs`). */
  readonly firing: TimerFiringArgs;
  /** Compared verbatim by `assessSchedule`; the caller's fingerprint of everything above. */
  readonly memo: Readonly<Record<string, JsonValue>>;
}

export enum ScheduleCreation {
  Created = "created",
  AlreadyExists = "alreadyExists",
}

export enum SchedulePhase {
  Pending = "pending",
  Started = "started",
  Missed = "missed",
  Drift = "drift",
  InvalidPhase = "invalidPhase",
}

export type ScheduleAssessment =
  | { readonly phase: SchedulePhase.Pending; readonly paused: boolean }
  | { readonly phase: SchedulePhase.Started; readonly paused: boolean; readonly workflowId: string }
  | { readonly phase: SchedulePhase.Missed; readonly paused: boolean }
  | { readonly phase: SchedulePhase.Drift | SchedulePhase.InvalidPhase; readonly evidence: string };

/** What `assessSchedule` reads of a stored Schedule; `ScheduleClient.describe` projects the SDK description onto it. */
export interface StoredSchedule {
  readonly scheduleId: string;
  readonly workflowType: string;
  readonly taskQueue: string;
  readonly workflowId: string;
  readonly memo: JsonValue;
  readonly startAtEpochMs: number | null;
  readonly endAtEpochMs: number | null;
  readonly overlapSkip: boolean;
  readonly catchupWindowMs: number;
  readonly paused: boolean;
  readonly remainingActions: number | null;
  readonly actionsTaken: number;
  readonly actionsMissed: number;
  readonly actionsSkipped: number;
  readonly nextActionEpochMs: readonly number[];
  /** Workflow IDs of the taken actions' firing Workflows, recent ones first-to-last, then running ones. */
  readonly recentWorkflowIds: readonly string[];
  readonly runningWorkflowIds: readonly string[];
}

export interface ExpectedSchedule {
  readonly scheduleId: string;
  readonly dueAtEpochMs: number;
  /** The firing Workflow's ID base (`timerFiringWorkflowId`). */
  readonly workflowIdBase: string;
  readonly taskQueue: string;
  readonly memo: Readonly<Record<string, JsonValue>>;
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameJson(value, right[index]));
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] &&
    sameJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

function immutableDrift(stored: StoredSchedule, expected: ExpectedSchedule): string | null {
  const actionAt = scheduleActionAtMs(expected.dueAtEpochMs);
  if (stored.scheduleId !== expected.scheduleId) return "Schedule identity drifted.";
  if (stored.startAtEpochMs !== actionAt || stored.endAtEpochMs !== actionAt) {
    return "Schedule occurrence drifted.";
  }
  if (!stored.overlapSkip || stored.catchupWindowMs !== scheduleCatchupWindowMs) return "Schedule policy drifted.";
  if (stored.workflowType !== timerFiringWorkflowType || stored.taskQueue !== expected.taskQueue ||
      stored.workflowId !== expected.workflowIdBase || !sameJson(stored.memo, expected.memo)) {
    return "Schedule action drifted.";
  }
  return null;
}

/**
 * Separates the immutable stored Schedule from its one-action phase: pending before the action instant, started once
 * its single action ran (naming the firing Workflow it started), missed when the catch-up window passed without it.
 */
export function assessSchedule(stored: StoredSchedule, expected: ExpectedSchedule): ScheduleAssessment {
  const drift = immutableDrift(stored, expected);
  if (drift !== null) return { phase: SchedulePhase.Drift, evidence: drift };
  const quiet = stored.actionsSkipped === 0;
  if (stored.remainingActions === 1 && stored.actionsTaken === 0 && stored.actionsMissed === 0 && quiet &&
      stored.recentWorkflowIds.length === 0 && stored.runningWorkflowIds.length === 0 &&
      stored.nextActionEpochMs.length === 1 && stored.nextActionEpochMs[0] === scheduleActionAtMs(expected.dueAtEpochMs)) {
    return { phase: SchedulePhase.Pending, paused: stored.paused };
  }
  if (stored.remainingActions === 0 && stored.actionsTaken === 1 && stored.actionsMissed === 0 && quiet &&
      stored.nextActionEpochMs.length === 0) {
    const started = new Set([...stored.recentWorkflowIds, ...stored.runningWorkflowIds]);
    const [workflowId] = started;
    if (started.size !== 1 || workflowId === undefined) {
      return { phase: SchedulePhase.InvalidPhase, evidence: "A started Schedule must name exactly one Workflow." };
    }
    return { phase: SchedulePhase.Started, paused: stored.paused, workflowId };
  }
  if (stored.remainingActions === 1 && stored.actionsTaken === 0 && stored.actionsMissed === 1 && quiet &&
      stored.recentWorkflowIds.length === 0 && stored.runningWorkflowIds.length === 0 &&
      stored.nextActionEpochMs.length === 0) {
    return { phase: SchedulePhase.Missed, paused: stored.paused };
  }
  return { phase: SchedulePhase.InvalidPhase, evidence: "Schedule counters describe neither pending, started nor missed." };
}

/**
 * What a started action's firing Workflow reached: still running, the population's answer to its `timerStart`, or a
 * failure before any answer (a refusal before acceptance, such as a configuration conflict).
 */
export type TimerFiringOutcome =
  | { readonly kind: "running" }
  | { readonly kind: "answered"; readonly answer: CommandAnswer }
  | { readonly kind: "failed"; readonly evidence: string };

/** The Schedule operations the engine API uses; `ScheduleClient` is the Temporal realization. */
export interface ScheduleHost {
  create(request: OneShotScheduleRequest): Promise<ScheduleCreation>;
  /** `null` when no Schedule has the identifier. */
  describe(scheduleId: string): Promise<StoredSchedule | null>;
  /** The outcome of the firing Workflow a started action names; `null` when no such Workflow is retained. */
  firing(workflowId: string): Promise<TimerFiringOutcome | null>;
  pause(scheduleId: string): Promise<void>;
  /** Deleting an absent Schedule succeeds: the caller's intent, no Schedule, holds. */
  delete(scheduleId: string): Promise<void>;
}
