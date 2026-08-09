/**
 * Owns the disposable Temporal Worker's lifecycle, replacement schedules, and history replay.
 *
 * Scenario interpretation and command delivery remain outside this host boundary.
 */
import { setTimeout as delay } from "node:timers/promises";

import type {
  FireTimerStimulus,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import type {
  TestWorkflowEnvironment,
} from "@temporalio/testing";
import {
  Worker,
} from "@temporalio/worker";

import {
  bpmnSemanticTaskQueue,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  TemporalReplayItem,
} from "./contracts.js";
import type {
  EffectProbeActivityRegistry,
  EffectProbeStore,
} from "./contracts.js";
import {
  normalizeError,
  withDeadline,
} from "./contracts.js";
import {
  isRecord,
} from "./runner-support.js";
import type {
  BpmnWorkflowBundle,
} from "@bpmn-lean/temporal-worker";

const temporalTestIdentity = "bpmn-lean-test-runtime";
const operationDeadlineMs = 5_000;
const workerStartupDeadlineMs = 20_000;
const workflowResultDeadlineMs = 10_000;
const replayDeadlineMs = 10_000;
const shutdownDeadlineMs = 10_000;

export class TemporalWorkerHost {
  private workerError: unknown;

  private constructor(
    private readonly environment: TestWorkflowEnvironment,
    private readonly effectProbeRegistry: EffectProbeActivityRegistry,
    private readonly workflowBundle: BpmnWorkflowBundle,
    private worker: Worker,
    private workerRun: Promise<void>,
  ) {}

  static async create(
    environment: TestWorkflowEnvironment,
    effectProbeRegistry: EffectProbeActivityRegistry,
    workflowBundle: BpmnWorkflowBundle,
  ): Promise<TemporalWorkerHost> {
    const worker = await createWorker(
      environment,
      effectProbeRegistry,
      workflowBundle,
    );
    let host: TemporalWorkerHost;
    const workerRun = worker.run().catch((error: unknown) => {
      host.workerError = error;
    });
    host = new TemporalWorkerHost(
      environment,
      effectProbeRegistry,
      workflowBundle,
      worker,
      workerRun,
    );
    await delay(0);
    host.assertHealthy();
    return host;
  }

  assertHealthy(): void {
    if (this.workerError !== undefined) {
      throw normalizeError(this.workerError, "Temporal Worker failed");
    }
  }

  async restartAfterTimerDue(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    timer: FireTimerStimulus,
  ): Promise<void> {
    await withDeadline(
      waitForTimerStarted(handle),
      operationDeadlineMs,
      "durable timer start",
    );
    this.worker.shutdown();
    await withDeadline(
      this.workerRun,
      shutdownDeadlineMs,
      "pre-due Temporal Worker shutdown",
    );
    this.assertHealthy();

    // The Service owns timer firing while no Worker polls. Waiting beyond the admitted duration
    // makes Worker absence at the due boundary an explicit harness scheduling input.
    await delay(timer.logicalTimeMs + 100);
    await this.startReplacement("replacement Temporal Worker startup");
  }

  async restartDuringEffect(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    store: EffectProbeStore,
  ): Promise<void> {
    await withDeadline(
      waitForEffectAttemptStart(handle, store),
      operationDeadlineMs,
      "effect Activity start",
    );
    this.worker.shutdown();
    await withDeadline(
      this.workerRun,
      workflowResultDeadlineMs,
      "in-flight effect Worker shutdown",
    );
    this.assertHealthy();
    await this.startReplacement("replacement effect Worker startup");
  }

  async replayHistories(
    items: ReadonlyArray<TemporalReplayItem>,
  ): Promise<void> {
    await withDeadline(
      replayHistoryBatch(this.workflowBundle, items),
      replayDeadlineMs,
      "Workflow history batch replay",
    );
  }

  async shutdown(): Promise<void> {
    this.worker.shutdown();
    await withDeadline(
      this.workerRun,
      shutdownDeadlineMs,
      "Temporal Worker shutdown",
    );
    this.assertHealthy();
  }

  private async startReplacement(operation: string): Promise<void> {
    const replacement = await createWorker(
      this.environment,
      this.effectProbeRegistry,
      this.workflowBundle,
      operation,
    );
    this.worker = replacement;
    this.workerError = undefined;
    this.workerRun = replacement.run().catch((error: unknown) => {
      this.workerError = error;
    });
    await delay(0);
    this.assertHealthy();
  }
}

async function createWorker(
  environment: TestWorkflowEnvironment,
  effectProbeRegistry: EffectProbeActivityRegistry,
  workflowBundle: BpmnWorkflowBundle,
  operation = "Temporal Worker startup",
): Promise<Worker> {
  return withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity: temporalTestIdentity,
      taskQueue: bpmnSemanticTaskQueue,
      workflowBundle,
      activities: effectProbeRegistry.activities,
    }),
    workerStartupDeadlineMs,
    operation,
  );
}

async function waitForEffectAttemptStart(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  store: EffectProbeStore,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const history = await handle.fetchHistory();
    if (
      history.events?.some((event) =>
        isRecord(event) &&
        isRecord(event.activityTaskScheduledEventAttributes) &&
        Object.keys(event.activityTaskScheduledEventAttributes).length > 0
      ) === true &&
      store.evidence().invocations === 1 &&
      store.evidence().mutations === 1
    ) {
      return;
    }
    await delay(25);
  }
  throw new Error(
    "Workflow history did not record an effect Activity start",
  );
}

async function waitForTimerStarted(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const history = await handle.fetchHistory();
    if (
      history.events?.some((event) =>
        isRecord(event) &&
        isRecord(event.timerStartedEventAttributes) &&
        Object.keys(event.timerStartedEventAttributes).length > 0
      ) === true
    ) {
      return;
    }
    await delay(25);
  }
  throw new Error("Workflow history did not record a durable timer start");
}

async function replayHistoryBatch(
  workflowBundle: BpmnWorkflowBundle,
  items: ReadonlyArray<TemporalReplayItem>,
): Promise<void> {
  let replayed = 0;
  for await (const result of Worker.runReplayHistories(
    { workflowBundle },
    items,
  )) {
    const expected = items[replayed];
    if (expected === undefined) {
      throw new Error("Temporal replay returned an unexpected extra result");
    }
    if (result.workflowId !== expected.workflowId) {
      throw new Error(
        `Temporal replay returned ${result.workflowId}; expected ${expected.workflowId}`,
      );
    }
    if (result.error !== undefined) {
      throw result.error;
    }
    replayed += 1;
  }
  if (replayed !== items.length) {
    throw new Error(
      `Temporal replay returned ${replayed} results for ${items.length} histories`,
    );
  }
}
