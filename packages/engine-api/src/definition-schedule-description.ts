import type {
  SemanticProcessProgram,
  TriggerTimerStartStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  TemporalDefinitionScheduleDescription,
} from "@bpmn-lean/temporal-client/definition-schedule";
import {
  temporalDefinitionScheduleWorkflowType,
} from "@bpmn-lean/temporal-client/definition-schedule";

export type ExpectedDefinitionSchedule = Readonly<{
  scheduleId: string;
  dueAtEpochMs: number;
  start: TriggerTimerStartStimulus;
  semanticProcess: SemanticProcessProgram;
  configuredWorkflowId: string;
  taskQueue: string;
}>;

export type DefinitionScheduleDescriptionAssessment =
  | Readonly<{ kind: "pending"; paused: boolean }>
  | Readonly<{
      kind: "started";
      paused: boolean;
      workflowId: string;
      firstExecutionRunId: string;
    }>
  | Readonly<{ kind: "missed"; paused: boolean }>
  | Readonly<{ kind: "drift"; evidence: string }>
  | Readonly<{ kind: "invalidPhase"; evidence: string }>;

/** Separates immutable stored-Schedule integrity from its mutable one-action phase. */
export function assessDefinitionScheduleDescription(
  description: TemporalDefinitionScheduleDescription,
  expected: ExpectedDefinitionSchedule,
): DefinitionScheduleDescriptionAssessment {
  const drift = immutableDrift(description, expected);
  if (drift !== undefined) {
    return { kind: "drift", evidence: drift };
  }
  return classifyPhase(description, expected.dueAtEpochMs);
}

function immutableDrift(
  description: TemporalDefinitionScheduleDescription,
  expected: ExpectedDefinitionSchedule,
): string | undefined {
  if (description.scheduleId !== expected.scheduleId) {
    return "Temporal Schedule identity drifted.";
  }
  if (!sameOneOccurrenceSpec(description.spec, expected.dueAtEpochMs)) {
    return "Temporal Schedule occurrence specification drifted.";
  }
  if (
    description.policies.overlap !== "SKIP" ||
    description.policies.catchupWindowMs !== 60_000 ||
    description.policies.pauseOnFailure !== true
  ) {
    return "Temporal Schedule policy drifted.";
  }
  const action = description.action;
  if (
    action.type !== "startWorkflow" ||
    action.workflowType !== temporalDefinitionScheduleWorkflowType ||
    action.taskQueue !== expected.taskQueue ||
    action.workflowId !== expected.configuredWorkflowId ||
    !sameJsonValue(action.args, [expected.start, expected.semanticProcess]) ||
    !sameRetryPolicy(action.retry)
  ) {
    return "Temporal Schedule Workflow action drifted.";
  }
  if (
    action.workflowExecutionTimeoutMs !== undefined ||
    action.workflowRunTimeoutMs !== undefined ||
    action.workflowTaskTimeoutMs !== undefined ||
    action.memoKeys.length !== 0 ||
    action.searchAttributeKeys.length !== 0 ||
    action.typedSearchAttributeCount !== 0 ||
    action.staticSummary !== undefined ||
    action.staticDetails !== undefined ||
    action.priorityConfigured
  ) {
    return "Temporal Schedule Workflow timeout policy drifted.";
  }
  return undefined;
}

function sameOneOccurrenceSpec(
  spec: TemporalDefinitionScheduleDescription["spec"],
  dueAtEpochMs: number,
): boolean {
  const dueAt = new Date(dueAtEpochMs);
  const calendar = spec.calendars[0];
  return (
    spec.calendars.length === 1 &&
    calendar !== undefined &&
    sameRange(calendar.second, dueAt.getUTCSeconds()) &&
    sameRange(calendar.minute, dueAt.getUTCMinutes()) &&
    sameRange(calendar.hour, dueAt.getUTCHours()) &&
    sameRange(calendar.dayOfMonth, dueAt.getUTCDate()) &&
    sameRange(calendar.month, utcMonths[dueAt.getUTCMonth()]) &&
    sameRange(calendar.year, dueAt.getUTCFullYear()) &&
    sameRange(calendar.dayOfWeek, "SUNDAY", "SATURDAY") &&
    calendar.comment === undefined &&
    spec.intervalsCount === 0 &&
    spec.skippedCalendarsCount === 0 &&
    spec.startAtEpochMs === dueAtEpochMs &&
    spec.endAtEpochMs === dueAtEpochMs &&
    (spec.jitterMs === undefined || spec.jitterMs === 0) &&
    spec.timezone === "UTC"
  );
}

function sameRange<Unit>(
  ranges: ReadonlyArray<Readonly<{ start: Unit; end: Unit; step: number }>>,
  start: Unit | undefined,
  end: Unit | undefined = start,
): boolean {
  const range = ranges[0];
  return (
    start !== undefined &&
    end !== undefined &&
    ranges.length === 1 &&
    range?.start === start &&
    range.end === end &&
    range.step === 1
  );
}

function sameRetryPolicy(
  retry: TemporalDefinitionScheduleDescription["action"]["retry"],
): boolean {
  return (
    retry?.maximumAttempts === 1 &&
    retry.initialIntervalMs === 1_000 &&
    retry.maximumIntervalMs === 100_000 &&
    retry.backoffCoefficient === 2 &&
    Array.isArray(retry.nonRetryableErrorTypes) &&
    retry.nonRetryableErrorTypes.length === 0
  );
}

function classifyPhase(
  description: TemporalDefinitionScheduleDescription,
  dueAtEpochMs: number,
): DefinitionScheduleDescriptionAssessment {
  const { info, state } = description;
  if (
    state.remainingActions === 1 &&
    info.numActionsTaken === 0 &&
    info.numActionsMissedCatchupWindow === 0 &&
    info.numActionsSkippedOverlap === 0 &&
    info.recentActions.length === 0 &&
    info.runningActions.length === 0 &&
    info.nextActionEpochMs.length === 1 &&
    info.nextActionEpochMs[0] === dueAtEpochMs
  ) {
    return { kind: "pending", paused: state.paused };
  }
  if (
    state.remainingActions === 0 &&
    info.numActionsTaken === 1 &&
    info.numActionsMissedCatchupWindow === 0 &&
    info.numActionsSkippedOverlap === 0 &&
    info.nextActionEpochMs.length === 0
  ) {
    return startedPhase(description, dueAtEpochMs);
  }
  if (
    state.remainingActions === 1 &&
    info.numActionsTaken === 0 &&
    info.numActionsMissedCatchupWindow === 1 &&
    info.numActionsSkippedOverlap === 0 &&
    info.recentActions.length === 0 &&
    info.runningActions.length === 0 &&
    info.nextActionEpochMs.length === 0
  ) {
    return { kind: "missed", paused: state.paused };
  }
  return {
    kind: "invalidPhase",
    evidence: "Temporal Schedule counters do not describe pending, started, or missed.",
  };
}

function startedPhase(
  description: TemporalDefinitionScheduleDescription,
  dueAtEpochMs: number,
): DefinitionScheduleDescriptionAssessment {
  const recent = description.info.recentActions;
  const running = description.info.runningActions;
  if (recent.length > 1 || running.length > 1 || recent.length + running.length === 0) {
    return {
      kind: "invalidPhase",
      evidence: "Started Temporal Schedule must expose one recent or running action.",
    };
  }
  const recentIdentity = recent[0] === undefined
    ? undefined
    : executionIdentity(recent[0].action);
  if (
    recent[0] !== undefined &&
    (
      recent[0].scheduledAtEpochMs !== dueAtEpochMs ||
      recent[0].takenAtEpochMs < dueAtEpochMs ||
      recentIdentity === undefined
    )
  ) {
    return {
      kind: "invalidPhase",
      evidence: "Recent Temporal Schedule action does not match the due occurrence.",
    };
  }
  const runningIdentity = running[0] === undefined
    ? undefined
    : executionIdentity(running[0]);
  if (running[0] !== undefined && runningIdentity === undefined) {
    return {
      kind: "invalidPhase",
      evidence: "Running Temporal Schedule action has no execution identity.",
    };
  }
  if (
    recentIdentity !== undefined &&
    runningIdentity !== undefined &&
    !sameExecutionIdentity(recentIdentity, runningIdentity)
  ) {
    return {
      kind: "invalidPhase",
      evidence: "Recent and running Temporal Schedule identities disagree.",
    };
  }
  const identity = runningIdentity ?? recentIdentity;
  if (identity === undefined) {
    return {
      kind: "invalidPhase",
      evidence: "Started Temporal Schedule has no execution identity.",
    };
  }
  return { kind: "started", paused: description.state.paused, ...identity };
}

function executionIdentity(
  action: TemporalDefinitionScheduleDescription["info"]["runningActions"][number],
): Readonly<{ workflowId: string; firstExecutionRunId: string }> | undefined {
  if (
    action.type !== "startWorkflow" ||
    action.workflow.workflowId.length === 0 ||
    action.workflow.firstExecutionRunId.length === 0
  ) {
    return undefined;
  }
  return action.workflow;
}

function sameExecutionIdentity(
  left: Readonly<{ workflowId: string; firstExecutionRunId: string }>,
  right: Readonly<{ workflowId: string; firstExecutionRunId: string }>,
): boolean {
  return (
    left.workflowId === right.workflowId &&
    left.firstExecutionRunId === right.firstExecutionRunId
  );
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJsonValue(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) =>
      key === rightKeys[index] && sameJsonValue(left[key], right[key])
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const utcMonths = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
] as const;
