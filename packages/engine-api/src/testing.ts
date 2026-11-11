/**
 * Test support for the engine API's consumers: an `EngineHost` whose processes run in-process on the kernel through
 * the Temporal host's own pure core, and whose Schedules are kept in memory, so Product 2's tests exercise real engine
 * verdicts without a Temporal server.
 */
import {
  ScheduleCreation,
  type OneShotScheduleRequest,
  type ScheduleHost,
  type StoredSchedule,
} from "@bpmn-lean/temporal-host/host";
import { createMemoryProcessHost, type MemoryProcessHost } from "@bpmn-lean/temporal-host/memory-host";

import type { EngineServedRequirements } from "./definition.js";
import { engineHostConfig, type EngineHost } from "./host.js";

/** A Schedule host that keeps what it was asked to do; `stored` decides what `describe` reports. */
export interface MemoryScheduleHost extends ScheduleHost {
  readonly created: readonly OneShotScheduleRequest[];
  readonly paused: readonly string[];
  readonly deleted: readonly string[];
  stored: (request: OneShotScheduleRequest) => StoredSchedule | null;
}

export type MemoryEngineHost = EngineHost & {
  readonly processes: MemoryProcessHost;
  readonly schedules: MemoryScheduleHost;
};

export type MemoryEngineHostOptions = Readonly<{
  served?: EngineServedRequirements;
  taskQueue?: string;
  /** Workflow time in epoch milliseconds. */
  now?: () => number;
}>;

export const servesEverything: EngineServedRequirements = {
  timers: true,
  messages: true,
  effects: true,
  userTasks: true,
  calls: true,
};

/** A stored Schedule exactly as `request` created it, before its due instant. */
export function pendingSchedule(request: OneShotScheduleRequest, taskQueue: string, paused = false): StoredSchedule {
  return {
    scheduleId: request.scheduleId,
    workflowType: "runProcess",
    taskQueue,
    workflowId: request.workflowIdBase,
    memo: request.memo,
    startAtEpochMs: request.dueAtEpochMs,
    endAtEpochMs: request.dueAtEpochMs,
    overlapSkip: true,
    catchupWindowMs: 60_000,
    paused,
    remainingActions: 1,
    actionsTaken: 0,
    actionsMissed: 0,
    actionsSkipped: 0,
    nextActionEpochMs: [request.dueAtEpochMs],
    recentWorkflowIds: [],
    runningWorkflowIds: [],
  };
}

function memoryScheduleHost(taskQueue: string): MemoryScheduleHost {
  const created: OneShotScheduleRequest[] = [];
  const paused: string[] = [];
  const deleted: string[] = [];
  const host: MemoryScheduleHost = {
    created,
    paused,
    deleted,
    stored: (request) => pendingSchedule(request, taskQueue, paused.includes(request.scheduleId)),
    async create(request) {
      const exists = created.some((entry) => entry.scheduleId === request.scheduleId);
      if (!exists) created.push(request);
      return exists ? ScheduleCreation.AlreadyExists : ScheduleCreation.Created;
    },
    async describe(scheduleId) {
      const request = created.find((entry) => entry.scheduleId === scheduleId);
      return request === undefined || deleted.includes(scheduleId) ? null : host.stored(request);
    },
    async pause(scheduleId) {
      paused.push(scheduleId);
    },
    async delete(scheduleId) {
      deleted.push(scheduleId);
    },
  };
  return host;
}

export function createMemoryEngineHost(options: MemoryEngineHostOptions = {}): MemoryEngineHost {
  const taskQueue = options.taskQueue ?? "engine-memory";
  const processes = createMemoryProcessHost({ taskQueue, ...(options.now === undefined ? {} : { now: options.now }) });
  const effectStartToCloseMs = 1_000;
  return {
    processes,
    schedules: memoryScheduleHost(taskQueue),
    population: processes.population(taskQueue, engineHostConfig({ effectStartToCloseMs })),
    taskQueue,
    served: options.served ?? servesEverything,
    effectStartToCloseMs,
  };
}
