/** The Temporal realization of `ScheduleHost`: one-shot Schedules created, described, paused and deleted through the SDK. */
import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  type Client,
  type ScheduleDescription,
} from "@temporalio/client";

import { RunKind, workflowType } from "./host-contract.js";
import type { JsonValue } from "./port.js";
import {
  ScheduleCreation,
  scheduleCatchupWindowMs,
  type OneShotScheduleRequest,
  type ScheduleHost,
  type StoredSchedule,
} from "./schedules.js";

export class ScheduleClient implements ScheduleHost {
  constructor(private readonly client: Client, private readonly taskQueue: string) {}

  async create(request: OneShotScheduleRequest): Promise<ScheduleCreation> {
    const due = new Date(request.dueAtEpochMs);
    try {
      await this.client.schedule.create({
        scheduleId: request.scheduleId,
        spec: {
          calendars: [{
            second: due.getUTCSeconds(),
            minute: due.getUTCMinutes(),
            hour: due.getUTCHours(),
            dayOfMonth: due.getUTCDate(),
            month: monthNames[due.getUTCMonth()] ?? "JANUARY",
            year: due.getUTCFullYear(),
          }],
          startAt: due,
          endAt: due,
          timezone: "UTC",
        },
        action: {
          type: "startWorkflow",
          workflowType,
          taskQueue: this.taskQueue,
          workflowId: request.workflowIdBase,
          args: [{
            kind: RunKind.Start,
            program: request.program,
            config: request.config,
            correlationScope: request.correlationScope,
            population: null,
            start: request.start,
          }],
          memo: request.memo,
        },
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
          catchupWindow: scheduleCatchupWindowMs,
          pauseOnFailure: true,
        },
        state: { remainingActions: 1 },
      });
      return ScheduleCreation.Created;
    } catch (error) {
      if (error instanceof ScheduleAlreadyRunning) return ScheduleCreation.AlreadyExists;
      throw error;
    }
  }

  async describe(scheduleId: string): Promise<StoredSchedule | null> {
    try {
      return storedSchedule(await this.client.schedule.getHandle(scheduleId).describe());
    } catch (error) {
      if (error instanceof ScheduleNotFoundError) return null;
      throw error;
    }
  }

  async pause(scheduleId: string): Promise<void> {
    await this.client.schedule.getHandle(scheduleId).pause();
  }

  async delete(scheduleId: string): Promise<void> {
    try {
      await this.client.schedule.getHandle(scheduleId).delete();
    } catch (error) {
      if (error instanceof ScheduleNotFoundError) return;
      throw error;
    }
  }
}

const monthNames = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

function storedSchedule(description: ScheduleDescription): StoredSchedule {
  const { action, info, policies, spec, state } = description;
  return {
    scheduleId: description.scheduleId,
    workflowType: action.workflowType,
    taskQueue: action.taskQueue,
    workflowId: action.workflowId,
    memo: (action.memo ?? null) as JsonValue,
    startAtEpochMs: spec.startAt?.getTime() ?? null,
    endAtEpochMs: spec.endAt?.getTime() ?? null,
    overlapSkip: policies.overlap === ScheduleOverlapPolicy.SKIP,
    catchupWindowMs: policies.catchupWindow,
    paused: state.paused,
    remainingActions: state.remainingActions ?? null,
    actionsTaken: info.numActionsTaken,
    actionsMissed: info.numActionsMissedCatchupWindow,
    actionsSkipped: info.numActionsSkippedOverlap,
    nextActionEpochMs: info.nextActionTimes.map((time) => time.getTime()),
    recentWorkflowIds: info.recentActions.map((result) => result.action.workflow.workflowId),
    runningWorkflowIds: info.runningActions.map((result) => result.workflow.workflowId),
  };
}
