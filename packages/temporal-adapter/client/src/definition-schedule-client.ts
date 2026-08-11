/** Handle-free concrete Schedule operations used only by exact definition scheduling. */
import type {
  SemanticProcessProgram,
  TriggerTimerStartStimulus,
} from "@bpmn-lean/semantic-core";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";
import type {
  CalendarSpec,
  Client,
  ScheduleDescription,
} from "@temporalio/client";

import {
  bpmnProcessWorkflowType,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";

import {
  BpmnProcessAdmissionResultKind,
  assessBpmnProcessAdmission,
} from "./process-client.js";
import type {
  TemporalDefinitionStartClient,
} from "./definition-start-client.js";

const operationDeadlineMs = 5_000;

export type TemporalDefinitionScheduleClient = TemporalDefinitionStartClient;

export type TemporalDefinitionScheduleCreateRequest = Readonly<{
  scheduleId: string;
  dueAtEpochMs: number;
  start: TriggerTimerStartStimulus;
  semanticProcess: SemanticProcessProgram;
  configuredWorkflowId: string;
  taskQueue: string;
}>;

export const TemporalDefinitionScheduleCreateResultKind = {
  Created: "created",
  AlreadyExists: "alreadyExists",
  Rejected: "rejected",
} as const;

export type TemporalDefinitionScheduleCreateResultKind =
  typeof TemporalDefinitionScheduleCreateResultKind[
    keyof typeof TemporalDefinitionScheduleCreateResultKind
  ];

export type TemporalDefinitionScheduleCreateResult =
  | Readonly<{
      kind: typeof TemporalDefinitionScheduleCreateResultKind.Created;
    }>
  | Readonly<{
      kind: typeof TemporalDefinitionScheduleCreateResultKind.AlreadyExists;
    }>
  | Readonly<{
      kind: typeof TemporalDefinitionScheduleCreateResultKind.Rejected;
      failure: Readonly<{ code: string; evidence: string }>;
    }>;

export type TemporalDefinitionScheduleRange<Unit> = Readonly<{
  start: Unit;
  end: Unit;
  step: number;
}>;

export type TemporalDefinitionScheduleCalendar = Readonly<{
  second: readonly TemporalDefinitionScheduleRange<number>[];
  minute: readonly TemporalDefinitionScheduleRange<number>[];
  hour: readonly TemporalDefinitionScheduleRange<number>[];
  dayOfMonth: readonly TemporalDefinitionScheduleRange<number>[];
  month: readonly TemporalDefinitionScheduleRange<string>[];
  year: readonly TemporalDefinitionScheduleRange<number>[];
  dayOfWeek: readonly TemporalDefinitionScheduleRange<string>[];
  comment: string | undefined;
}>;

export type TemporalDefinitionScheduleExecutionAction = Readonly<{
  type: string;
  workflow: Readonly<{
    workflowId: string;
    firstExecutionRunId: string;
  }>;
}>;

/** Stable client-owned projection of Schedule state. No SDK description type crosses this subpath. */
export type TemporalDefinitionScheduleDescription = Readonly<{
  scheduleId: string;
  spec: Readonly<{
    calendars: readonly TemporalDefinitionScheduleCalendar[];
    intervalsCount: number;
    skippedCalendarsCount: number;
    startAtEpochMs: number | undefined;
    endAtEpochMs: number | undefined;
    jitterMs: number | undefined;
    timezone: string | undefined;
  }>;
  action: Readonly<{
    type: string;
    workflowType: string;
    taskQueue: string;
    workflowId: string;
    args: readonly unknown[];
    retry: Readonly<{
      maximumAttempts: unknown;
      initialIntervalMs: unknown;
      maximumIntervalMs: unknown;
      backoffCoefficient: unknown;
      nonRetryableErrorTypes: unknown;
    }> | undefined;
    workflowExecutionTimeoutMs: unknown;
    workflowRunTimeoutMs: unknown;
    workflowTaskTimeoutMs: unknown;
    memoKeys: readonly string[];
    searchAttributeKeys: readonly string[];
    typedSearchAttributeCount: number;
    staticSummary: unknown;
    staticDetails: unknown;
    priorityConfigured: boolean;
  }>;
  policies: Readonly<{
    overlap: string | undefined;
    catchupWindowMs: number;
    pauseOnFailure: boolean;
  }>;
  state: Readonly<{
    paused: boolean;
    remainingActions: number | undefined;
  }>;
  info: Readonly<{
    recentActions: readonly Readonly<{
      scheduledAtEpochMs: number;
      takenAtEpochMs: number;
      action: TemporalDefinitionScheduleExecutionAction;
    }>[];
    nextActionEpochMs: readonly number[];
    numActionsTaken: number;
    numActionsMissedCatchupWindow: number;
    numActionsSkippedOverlap: number;
    runningActions: readonly TemporalDefinitionScheduleExecutionAction[];
  }>;
}>;

export const temporalDefinitionScheduleWorkflowType =
  bpmnProcessWorkflowType;

export async function createTemporalDefinitionSchedule(
  client: TemporalDefinitionScheduleClient,
  request: TemporalDefinitionScheduleCreateRequest,
): Promise<TemporalDefinitionScheduleCreateResult> {
  requireCreateRequest(request);
  const admission = assessBpmnProcessAdmission(
    request.start,
    request.semanticProcess,
  );
  switch (admission.kind) {
    case BpmnProcessAdmissionResultKind.Rejected:
      return {
        kind: TemporalDefinitionScheduleCreateResultKind.Rejected,
        failure: admission.failure,
      };
    case BpmnProcessAdmissionResultKind.Admitted:
      break;
  }

  const dueAt = new Date(request.dueAtEpochMs);
  try {
    await withDeadline(
      scheduleClientOf(client).schedule.create({
        scheduleId: request.scheduleId,
        spec: {
          calendars: [utcCalendarAt(dueAt)],
          startAt: dueAt,
          endAt: dueAt,
          timezone: "UTC",
        },
        action: {
          type: "startWorkflow",
          workflowType: temporalDefinitionScheduleWorkflowType,
          taskQueue: request.taskQueue,
          workflowId: request.configuredWorkflowId,
          args: [request.start, request.semanticProcess],
          retry: {
            maximumAttempts: 1,
            initialInterval: 1_000,
            maximumInterval: 100_000,
            backoffCoefficient: 2,
            nonRetryableErrorTypes: [],
          },
        },
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
          catchupWindow: 60_000,
          pauseOnFailure: true,
        },
        state: { remainingActions: 1 },
      }),
      operationDeadlineMs,
      "Timer Start Schedule creation",
    );
    return { kind: TemporalDefinitionScheduleCreateResultKind.Created };
  } catch (error: unknown) {
    if (error instanceof ScheduleAlreadyRunning) {
      return {
        kind: TemporalDefinitionScheduleCreateResultKind.AlreadyExists,
      };
    }
    throw error;
  }
}

export async function describeTemporalDefinitionSchedule(
  client: TemporalDefinitionScheduleClient,
  scheduleId: string,
): Promise<TemporalDefinitionScheduleDescription> {
  requireNonempty(scheduleId, "scheduleId");
  const description = await withDeadline(
    scheduleClientOf(client).schedule.getHandle(scheduleId).describe(),
    operationDeadlineMs,
    "Timer Start Schedule description",
  );
  return projectDescription(description);
}

export function pauseTemporalDefinitionSchedule(
  client: TemporalDefinitionScheduleClient,
  scheduleId: string,
): Promise<void> {
  requireNonempty(scheduleId, "scheduleId");
  return withDeadline(
    scheduleClientOf(client).schedule.getHandle(scheduleId).pause(
      "Paused by BPM platform cancellation reconciliation",
    ),
    operationDeadlineMs,
    "Timer Start Schedule pause",
  );
}

export function deleteTemporalDefinitionSchedule(
  client: TemporalDefinitionScheduleClient,
  scheduleId: string,
): Promise<void> {
  requireNonempty(scheduleId, "scheduleId");
  return withDeadline(
    scheduleClientOf(client).schedule.getHandle(scheduleId).delete(),
    operationDeadlineMs,
    "Timer Start Schedule deletion",
  );
}

function scheduleClientOf(
  client: TemporalDefinitionScheduleClient,
): Pick<Client, "schedule"> {
  return client as unknown as Pick<Client, "schedule">;
}

function projectDescription(
  description: ScheduleDescription,
): TemporalDefinitionScheduleDescription {
  return {
    scheduleId: description.scheduleId,
    spec: {
      calendars: (description.spec.calendars ?? []).map((calendar) => ({
        second: calendar.second,
        minute: calendar.minute,
        hour: calendar.hour,
        dayOfMonth: calendar.dayOfMonth,
        month: calendar.month,
        year: calendar.year,
        dayOfWeek: calendar.dayOfWeek,
        comment: calendar.comment,
      })),
      intervalsCount: description.spec.intervals?.length ?? 0,
      skippedCalendarsCount: description.spec.skip?.length ?? 0,
      startAtEpochMs: description.spec.startAt?.getTime(),
      endAtEpochMs: description.spec.endAt?.getTime(),
      jitterMs: description.spec.jitter,
      timezone: description.spec.timezone,
    },
    action: {
      type: description.action.type,
      workflowType: description.action.workflowType,
      taskQueue: description.action.taskQueue,
      workflowId: description.action.workflowId,
      args: description.action.args ?? [],
      retry: description.action.retry === undefined
        ? undefined
        : {
            maximumAttempts: description.action.retry.maximumAttempts,
            initialIntervalMs: description.action.retry.initialInterval,
            maximumIntervalMs: description.action.retry.maximumInterval,
            backoffCoefficient: description.action.retry.backoffCoefficient,
            nonRetryableErrorTypes:
              description.action.retry.nonRetryableErrorTypes,
          },
      workflowExecutionTimeoutMs:
        description.action.workflowExecutionTimeout,
      workflowRunTimeoutMs: description.action.workflowRunTimeout,
      workflowTaskTimeoutMs: description.action.workflowTaskTimeout,
      memoKeys: Object.keys(description.action.memo ?? {}).sort(),
      searchAttributeKeys: Object.keys(
        description.action.searchAttributes ?? {},
      ).sort(),
      typedSearchAttributeCount: countTypedSearchAttributes(
        description.action.typedSearchAttributes,
      ),
      staticSummary: description.action.staticSummary,
      staticDetails: description.action.staticDetails,
      priorityConfigured:
        description.action.priority?.priorityKey !== undefined ||
        description.action.priority?.fairnessKey !== undefined ||
        description.action.priority?.fairnessWeight !== undefined,
    },
    policies: {
      overlap: description.policies.overlap,
      catchupWindowMs: description.policies.catchupWindow,
      pauseOnFailure: description.policies.pauseOnFailure,
    },
    state: {
      paused: description.state.paused,
      remainingActions: description.state.remainingActions,
    },
    info: {
      recentActions: description.info.recentActions.map((action) => ({
        scheduledAtEpochMs: action.scheduledAt.getTime(),
        takenAtEpochMs: action.takenAt.getTime(),
        action: projectExecutionAction(action.action),
      })),
      nextActionEpochMs: description.info.nextActionTimes.map((time) =>
        time.getTime()
      ),
      numActionsTaken: description.info.numActionsTaken,
      numActionsMissedCatchupWindow:
        description.info.numActionsMissedCatchupWindow,
      numActionsSkippedOverlap: description.info.numActionsSkippedOverlap,
      runningActions: description.info.runningActions.map(
        projectExecutionAction,
      ),
    },
  };
}

function countTypedSearchAttributes(
  value: ScheduleDescription["action"]["typedSearchAttributes"],
): number {
  if (value === undefined || Array.isArray(value)) {
    return value?.length ?? 0;
  }
  return value.getAll().length;
}

function projectExecutionAction(
  action: ScheduleDescription["info"]["runningActions"][number],
): TemporalDefinitionScheduleExecutionAction {
  return {
    type: action.type,
    workflow: {
      workflowId: action.workflow.workflowId,
      firstExecutionRunId: action.workflow.firstExecutionRunId,
    },
  };
}

function requireCreateRequest(
  request: TemporalDefinitionScheduleCreateRequest,
): void {
  requireNonempty(request.scheduleId, "scheduleId");
  requireNonempty(request.configuredWorkflowId, "configuredWorkflowId");
  requireNonempty(request.taskQueue, "taskQueue");
  if (
    !Number.isSafeInteger(request.dueAtEpochMs) ||
    request.dueAtEpochMs <= 0 ||
    request.dueAtEpochMs % 1_000 !== 0
  ) {
    throw new RangeError("dueAtEpochMs must be a positive whole UTC second");
  }
}

function utcCalendarAt(dueAt: Date): CalendarSpec {
  const month = utcMonths[dueAt.getUTCMonth()];
  if (month === undefined) {
    throw new RangeError("dueAtEpochMs is outside the UTC calendar domain");
  }
  return {
    second: dueAt.getUTCSeconds(),
    minute: dueAt.getUTCMinutes(),
    hour: dueAt.getUTCHours(),
    dayOfMonth: dueAt.getUTCDate(),
    month,
    year: dueAt.getUTCFullYear(),
  };
}

function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
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
