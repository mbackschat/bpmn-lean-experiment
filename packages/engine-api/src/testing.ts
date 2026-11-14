/**
 * Test support for the engine API's consumers: an `EngineHost` whose processes and population run in-process on the
 * kernel through the Temporal host's own pure core, and whose Schedules are kept in memory and fire through that
 * population, so Product 2's tests exercise real engine verdicts without a Temporal server.
 */
import {
  ScheduleCreation,
  scheduleActionAtMs,
  timerFiringWorkflowId,
  timerFiringWorkflowType,
  type CommandAnswer,
  type OneShotScheduleRequest,
  type PopulationHost,
  type ScheduleHost,
  type StoredSchedule,
} from "@bpmn-lean/temporal-host/host";
import { createMemoryProcessHost, type MemoryProcessHost } from "@bpmn-lean/temporal-host/memory-host";

import type { EngineServedRequirements } from "./definition.js";
import { engineHostConfig, type EngineHost } from "./host.js";

/**
 * A Schedule host that keeps what it was asked to do and fires an action only when its test says so (`fire`), through
 * the population as the firing Workflow does; `stored` decides what `describe` reports.
 */
export interface MemoryScheduleHost extends ScheduleHost {
  readonly created: readonly OneShotScheduleRequest[];
  readonly paused: readonly string[];
  readonly deleted: readonly string[];
  /**
   * Takes the Schedule's action at the host clock, which must have reached its action instant: the firing Workflow,
   * named as Temporal names it, submits the occurrence's `timerStart` and keeps the population's answer. A refusal
   * before acceptance fails it, as it fails the firing Workflow.
   */
  fire(scheduleId: string): Promise<CommandAnswer>;
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

/** A stored Schedule exactly as `request` created it, before its action instant. */
export function pendingSchedule(request: OneShotScheduleRequest, taskQueue: string, paused = false): StoredSchedule {
  const { firing } = request;
  const actionAt = scheduleActionAtMs(firing.dueMs);
  return {
    scheduleId: request.scheduleId,
    workflowType: timerFiringWorkflowType,
    taskQueue,
    workflowId: timerFiringWorkflowId(firing.population, firing.deploymentId, firing.startEvent, firing.dueMs),
    memo: request.memo,
    startAtEpochMs: actionAt,
    endAtEpochMs: actionAt,
    overlapSkip: true,
    catchupWindowMs: 60_000,
    paused,
    remainingActions: 1,
    actionsTaken: 0,
    actionsMissed: 0,
    actionsSkipped: 0,
    nextActionEpochMs: [actionAt],
    recentWorkflowIds: [],
    runningWorkflowIds: [],
  };
}

/** The Workflow ID Temporal gives the action of `request`: its base with the action instant appended. */
export function firingWorkflowId(request: OneShotScheduleRequest): string {
  const { firing } = request;
  const actionAt = new Date(scheduleActionAtMs(firing.dueMs)).toISOString().replace(".000Z", "Z");
  return `${timerFiringWorkflowId(firing.population, firing.deploymentId, firing.startEvent, firing.dueMs)}-${actionAt}`;
}

function memoryScheduleHost(taskQueue: string, population: PopulationHost, now: () => number): MemoryScheduleHost {
  const created: OneShotScheduleRequest[] = [];
  const paused: string[] = [];
  const deleted: string[] = [];
  const answers = new Map<string, CommandAnswer>();
  const host: MemoryScheduleHost = {
    created,
    paused,
    deleted,
    stored: (request) => {
      const pending = pendingSchedule(request, taskQueue, paused.includes(request.scheduleId));
      const workflowId = firingWorkflowId(request);
      return answers.has(workflowId)
        ? { ...pending, remainingActions: 0, actionsTaken: 1, nextActionEpochMs: [], recentWorkflowIds: [workflowId] }
        : pending;
    },
    async create(request) {
      const exists = created.some((entry) => entry.scheduleId === request.scheduleId);
      if (!exists) created.push(request);
      return exists ? ScheduleCreation.AlreadyExists : ScheduleCreation.Created;
    },
    async describe(scheduleId) {
      const request = created.find((entry) => entry.scheduleId === scheduleId);
      return request === undefined || deleted.includes(scheduleId) ? null : host.stored(request);
    },
    async firing(workflowId) {
      const answer = answers.get(workflowId);
      return answer === undefined ? null : { kind: "answered", answer };
    },
    async fire(scheduleId) {
      const request = created.find((entry) => entry.scheduleId === scheduleId);
      if (request === undefined || deleted.includes(scheduleId) || paused.includes(scheduleId)) {
        throw new Error(`no active Schedule ${scheduleId}`);
      }
      const { firing } = request;
      if (now() < scheduleActionAtMs(firing.dueMs)) throw new Error(`the action of ${scheduleId} is not due yet`);
      const workflowId = firingWorkflowId(request);
      const answer = await population.command("timerStart",
        { commandId: workflowId, deploymentId: firing.deploymentId, startEvent: firing.startEvent, dueMs: firing.dueMs });
      if ("refused" in answer) throw new Error(`the population refused the firing of ${scheduleId} (${answer.refused})`);
      answers.set(workflowId, answer);
      return answer;
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
  const now = options.now ?? Date.now;
  const processes = createMemoryProcessHost({ taskQueue, now });
  const effectStartToCloseMs = 1_000;
  const population = processes.population(taskQueue, engineHostConfig({ effectStartToCloseMs }));
  return {
    processes,
    schedules: memoryScheduleHost(taskQueue, population, now),
    population,
    taskQueue,
    served: options.served ?? servesEverything,
    effectStartToCloseMs,
  };
}
