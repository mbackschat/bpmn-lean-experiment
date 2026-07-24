import { mkdir } from "node:fs/promises";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type {
  CanonicalObservation,
  Scenario,
  ScenarioResult,
  SequentialUserTaskExecutableIr,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import {
  bpmnScenarioWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnStimulusSignalName,
  bpmnTraceQueryName,
} from "./contracts.js";
import type {
  BpmnScenarioWorkflow,
  TemporalHistory,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
  TemporalScenarioRunnerOptions,
} from "./contracts.js";

const workflowsPath = fileURLToPath(new URL("./workflows.js", import.meta.url));

const operationDeadlineMs = 5_000;
const environmentStartupDeadlineMs = 40_000;
const workerStartupDeadlineMs = 20_000;
const workflowResultDeadlineMs = 10_000;
const waitTraceDeadlineMs = 10_000;
const replayDeadlineMs = 10_000;
const shutdownDeadlineMs = 10_000;

export class TemporalScenarioRunner {
  private workerError: unknown;
  private shutdownStarted = false;

  private constructor(
    private readonly environment: TestWorkflowEnvironment,
    private readonly worker: Worker,
    private readonly workerRun: Promise<void>,
  ) {}

  static async create(
    options: TemporalScenarioRunnerOptions,
  ): Promise<TemporalScenarioRunner> {
    await withDeadline(
      mkdir(options.downloadDirectory, { recursive: true }),
      operationDeadlineMs,
      "Temporal CLI cache creation",
    );
    const environment = await withDeadline(
      TestWorkflowEnvironment.createLocal({
        server: {
          executable: {
            type: "cached-download",
            version: options.cliVersion,
            downloadDir: options.downloadDirectory,
          },
        },
      }),
      environmentStartupDeadlineMs,
      "Temporal environment startup",
    );

    try {
      const worker = await withDeadline(
        Worker.create({
          connection: environment.nativeConnection,
          taskQueue: bpmnSemanticTaskQueue,
          workflowsPath,
        }),
        workerStartupDeadlineMs,
        "Temporal Worker startup",
      );
      let runner: TemporalScenarioRunner;
      const workerRun = worker.run().catch((error: unknown) => {
        runner.workerError = error;
      });
      runner = new TemporalScenarioRunner(environment, worker, workerRun);
      await delay(0);
      runner.assertWorkerHealthy();
      return runner;
    } catch (error: unknown) {
      await withDeadline(
        environment.teardown(),
        shutdownDeadlineMs,
        "Temporal environment cleanup",
      );
      throw error;
    }
  }

  async runScenario(
    scenario: Scenario,
    executableIr: SequentialUserTaskExecutableIr,
    options: TemporalScenarioExecutionOptions,
  ): Promise<TemporalScenarioExecution> {
    this.assertAvailable();
    const handle = await withDeadline(
      this.environment.client.workflow.start<BpmnScenarioWorkflow>(
        bpmnScenarioWorkflowType,
        {
          taskQueue: bpmnSemanticTaskQueue,
          workflowId: options.workflowId,
          args: [scenario, executableIr],
        },
      ),
      operationDeadlineMs,
      "Workflow start",
    );

    const waitTrace = await withDeadline(
      this.waitForTrace(handle, 3),
      waitTraceDeadlineMs,
      "Workflow wait-state observation",
    );

    for (const stimulus of scenario.stimuli.slice(1)) {
      this.assertWorkerHealthy();
      await withDeadline(
        handle.signal(bpmnStimulusSignalName, stimulus),
        operationDeadlineMs,
        `Workflow Signal ${stimulus.commandId}`,
      );
    }

    const result = await withDeadline(
      handle.result(),
      workflowResultDeadlineMs,
      "Workflow result",
    );
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "Workflow history fetch",
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError("Temporal history did not contain an events array");
    }

    this.assertWorkerHealthy();
    return {
      waitTrace,
      result,
      history: history as TemporalHistory,
    };
  }

  async replayHistory(history: unknown, workflowId: string): Promise<void> {
    this.assertAvailable();
    await withDeadline(
      Worker.runReplayHistory({ workflowsPath }, history, workflowId),
      replayDeadlineMs,
      "Workflow history replay",
    );
  }

  async shutdown(): Promise<void> {
    if (this.shutdownStarted) {
      return;
    }
    this.shutdownStarted = true;
    this.worker.shutdown();

    let shutdownError: unknown;
    try {
      await withDeadline(
        this.workerRun,
        shutdownDeadlineMs,
        "Temporal Worker shutdown",
      );
      if (this.workerError !== undefined) {
        shutdownError = this.workerError;
      }
    } finally {
      await withDeadline(
        this.environment.teardown(),
        shutdownDeadlineMs,
        "Temporal environment shutdown",
      );
    }

    if (shutdownError !== undefined) {
      throw normalizeError(shutdownError, "Temporal Worker failed");
    }
  }

  private async waitForTrace(
    handle: WorkflowHandle<BpmnScenarioWorkflow>,
    minimumLength: number,
  ): Promise<ReadonlyArray<CanonicalObservation>> {
    let latestError: unknown;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      this.assertWorkerHealthy();
      try {
        const trace = await withDeadline(
          handle.query<ReadonlyArray<CanonicalObservation>>(
            bpmnTraceQueryName,
          ),
          operationDeadlineMs,
          "Workflow trace Query",
        );
        if (trace.length >= minimumLength) {
          return trace;
        }
      } catch (error: unknown) {
        latestError = error;
      }
      await delay(50);
    }
    throw normalizeError(
      latestError,
      `Workflow trace did not reach ${minimumLength} observations`,
    );
  }

  private assertAvailable(): void {
    if (this.shutdownStarted) {
      throw new Error("Temporal scenario runner is already shut down");
    }
    this.assertWorkerHealthy();
  }

  private assertWorkerHealthy(): void {
    if (this.workerError !== undefined) {
      throw normalizeError(this.workerError, "Temporal Worker failed");
    }
  }
}

function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${operation} exceeded ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

function normalizeError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}
