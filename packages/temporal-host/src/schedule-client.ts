/**
 * The Temporal realization of `ScheduleHost`: one-shot Schedules created, described, paused and deleted through the
 * SDK, each firing one Timer-start occurrence, and the outcome of a firing Workflow read back by its ID.
 */
import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
  WorkflowNotFoundError,
  type Client,
  type ScheduleDescription,
} from "@temporalio/client";

import { timerFiringWorkflowId } from "./population-address.js";
import { timerFiringWorkflowType, type CommandAnswer, type TimerFiringArgs } from "./population-contract.js";
import type { JsonValue } from "./port.js";
import {
  ScheduleCreation,
  scheduleActionAtMs,
  scheduleCatchupWindowMs,
  type OneShotScheduleRequest,
  type ScheduleHost,
  type StoredSchedule,
  type TimerFiringOutcome,
} from "./schedules.js";

export class ScheduleClient implements ScheduleHost {
  constructor(private readonly client: Client, private readonly taskQueue: string) {}

  async create(request: OneShotScheduleRequest): Promise<ScheduleCreation> {
    const { firing } = request;
    const due = new Date(scheduleActionAtMs(firing.dueMs));
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
          workflowType: timerFiringWorkflowType,
          taskQueue: this.taskQueue,
          workflowId: timerFiringWorkflowId(firing.population, firing.deploymentId, firing.startEvent, firing.dueMs),
          args: [firing satisfies TimerFiringArgs],
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

  async firing(workflowId: string): Promise<TimerFiringOutcome | null> {
    const handle = this.client.workflow.getHandle<(args: TimerFiringArgs) => Promise<CommandAnswer>>(workflowId);
    let status: string;
    try {
      status = (await handle.describe()).status.name;
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) return null;
      throw error;
    }
    switch (status) {
      case "RUNNING":
        return { kind: "running" };
      case "COMPLETED":
        return { kind: "answered", answer: await handle.result() };
      default:
        return { kind: "failed", evidence: `The firing Workflow closed as ${status}.` };
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
