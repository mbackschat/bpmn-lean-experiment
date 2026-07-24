import { mkdir } from "node:fs/promises";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  Scenario,
  ScenarioResult,
  SequentialUserTaskExecutableIr,
} from "@bpmn-lean/semantic-core";
import { StimulusKind } from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import {
  bpmnScenarioWorkflowType,
  bpmnCompleteUserTaskUpdateName,
  bpmnOpenUserTasksQueryName,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
} from "./contracts.js";
import type {
  BpmnScenarioWorkflow,
  TemporalHistory,
  TemporalReplayItem,
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
  TemporalScenarioRunnerOptions,
} from "./contracts.js";

const workflowsPath = fileURLToPath(new URL("./workflows.js", import.meta.url));

const temporalTestIdentity = "bpmn-lean-test-runtime";
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
        client: {
          identity: temporalTestIdentity,
        },
      }),
      environmentStartupDeadlineMs,
      "Temporal environment startup",
    );

    try {
      const worker = await withDeadline(
        Worker.create({
          connection: environment.nativeConnection,
          identity: temporalTestIdentity,
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
    validateExecutionOptions(scenario, options);
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

    const openUserTasksAtWait = await withDeadline(
      handle.query<ReadonlyArray<OpenUserTask>>(
        bpmnOpenUserTasksQueryName,
      ),
      operationDeadlineMs,
      "Workflow open User Tasks Query",
    );
    const completionOutcomes: CommandOutcome[] = [];
    let duplicateCompletionOutcome: CommandOutcome | null = null;
    let duplicatedFirstCompletion = false;

    for (const stimulus of scenario.stimuli.slice(1)) {
      this.assertWorkerHealthy();
      switch (stimulus.kind) {
        case StimulusKind.CompleteUserTaskInstance: {
          const outcome = await executeCompletionUpdate(
            handle,
            stimulus,
            stimulus.commandId,
          );
          completionOutcomes.push(outcome);
          if (
            !duplicatedFirstCompletion &&
            options.duplicateFirstCompletionUpdateId !== undefined
          ) {
            duplicateCompletionOutcome = await executeCompletionUpdate(
              handle,
              stimulus,
              options.duplicateFirstCompletionUpdateId,
            );
            duplicatedFirstCompletion = true;
          }
          break;
        }
        case StimulusKind.StartProcess:
          throw new TypeError(
            "Only the first scenario stimulus may start the Process",
          );
        default:
          assertNever(stimulus);
      }
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
      interactionEvidence: {
        openUserTasksAtWait,
        completionOutcomes,
        duplicateCompletionOutcome,
      },
      result,
      history: history as TemporalHistory,
    };
  }

  async runScenarios(
    items: ReadonlyArray<TemporalScenarioBatchItem>,
  ): Promise<ReadonlyArray<TemporalScenarioExecution>> {
    this.assertAvailable();
    const workflowIds = items.map(({ options }) => options.workflowId);
    if (workflowIds.some((workflowId) => workflowId.length === 0)) {
      throw new TypeError("Workflow IDs must be non-empty");
    }
    if (new Set(workflowIds).size !== workflowIds.length) {
      throw new TypeError("Workflow IDs must be unique within one batch");
    }
    const settled = await Promise.allSettled(
      items.map(({ scenario, executableIr, options }) =>
        this.runScenario(scenario, executableIr, options),
      ),
    );
    const failures = settled.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Temporal scenario batch did not complete",
      );
    }
    return settled.map((result) => {
      switch (result.status) {
        case "fulfilled":
          return result.value;
        case "rejected":
          throw new Error("Rejected batch result escaped failure handling");
      }
    });
  }

  async replayHistory(history: unknown, workflowId: string): Promise<void> {
    await this.replayHistories([{ history, workflowId }]);
  }

  async replayHistories(
    items: ReadonlyArray<TemporalReplayItem>,
  ): Promise<void> {
    this.assertAvailable();
    const workflowIds = items.map(({ workflowId }) => workflowId);
    if (workflowIds.some((workflowId) => workflowId.length === 0)) {
      throw new TypeError("Replay Workflow IDs must be non-empty");
    }
    if (new Set(workflowIds).size !== workflowIds.length) {
      throw new TypeError(
        "Replay Workflow IDs must be unique within one batch",
      );
    }
    await withDeadline(
      replayHistoryBatch(items),
      replayDeadlineMs,
      "Workflow history batch replay",
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

async function replayHistoryBatch(
  items: ReadonlyArray<TemporalReplayItem>,
): Promise<void> {
  let replayed = 0;
  for await (const result of Worker.runReplayHistories(
    { workflowsPath },
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

async function executeCompletionUpdate(
  handle: WorkflowHandle<BpmnScenarioWorkflow>,
  stimulus: CompleteUserTaskInstanceStimulus,
  updateId: string,
): Promise<CommandOutcome> {
  return withDeadline(
    handle.executeUpdate<
      CommandOutcome,
      [CompleteUserTaskInstanceStimulus]
    >(bpmnCompleteUserTaskUpdateName, {
      args: [stimulus],
      updateId,
    }),
    operationDeadlineMs,
    `Workflow Update ${updateId}`,
  );
}

function validateExecutionOptions(
  scenario: Scenario,
  options: TemporalScenarioExecutionOptions,
): void {
  const duplicateUpdateId = options.duplicateFirstCompletionUpdateId;
  if (duplicateUpdateId === undefined) {
    return;
  }
  if (duplicateUpdateId.length === 0) {
    throw new TypeError("Duplicate completion Update ID must be non-empty");
  }
  const firstCompletion = scenario.stimuli
    .slice(1)
    .find(
      (stimulus): stimulus is CompleteUserTaskInstanceStimulus =>
        stimulus.kind === StimulusKind.CompleteUserTaskInstance,
    );
  if (firstCompletion === undefined) {
    throw new TypeError(
      "Duplicate completion requires a task-instance completion stimulus",
    );
  }
  if (duplicateUpdateId === firstCompletion.commandId) {
    throw new TypeError(
      "Duplicate completion probe requires a distinct Temporal Update ID",
    );
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Temporal runner variant: ${String(value)}`);
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
