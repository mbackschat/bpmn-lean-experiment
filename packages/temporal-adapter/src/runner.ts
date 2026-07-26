import { mkdir } from "node:fs/promises";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  OpenTimer,
  OpenUserTask,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  CanonicalObservationKind,
  ProcessStatus,
  ScenarioOutcomeKind,
  SemanticProcessCompilerId,
  StimulusKind,
  isWellFormedStimulus,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowNotFoundError,
  WorkflowUpdateStage,
} from "@temporalio/client";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

import {
  bpmnProcessWorkflowType,
  bpmnCompleteUserTaskUpdateName,
  bpmnOpenUserTasksQueryName,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  TemporalCompletionDelivery,
  ProcessCommandResultKind,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  CompletedProcessReceipt,
  ProcessCommandResult,
  TemporalHistory,
  TemporalReplayItem,
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
  TemporalScenarioRunnerOptions,
  TemporalTimerBypassMutationExecution,
  TemporalTimeSkippingRunnerOptions,
  TemporalInteractionEvidence,
} from "./contracts.js";
import {
  contentBoundUpdateId,
} from "./command-identity.js";
import {
  requireDurableTimerHistory,
  reconcileHarnessTraceEvidence,
} from "./harness-evidence.js";
import {
  processWorkflowId,
} from "./process-address.js";
import {
  timerFiringCommandId,
} from "./timer-command.js";

const workflowsPath = fileURLToPath(new URL("./workflows.js", import.meta.url));
const timerBypassMutationWorkflowsPath = fileURLToPath(
  new URL("./timer-bypass-mutation-workflows.js", import.meta.url),
);

const temporalTestIdentity = "bpmn-lean-test-runtime";
const timerBypassMutationTaskQueue = "bpmn-timer-bypass-mutation";
const timerBypassMutationWorkflowType =
  "runBpmnProcessTimerBypassMutation";
const operationDeadlineMs = 5_000;
const environmentStartupDeadlineMs = 40_000;
const workerStartupDeadlineMs = 20_000;
const workflowResultDeadlineMs = 10_000;
const waitTraceDeadlineMs = 10_000;
const replayDeadlineMs = 10_000;
const shutdownDeadlineMs = 10_000;

type CompletionDeliveryEvidence = Omit<
  TemporalInteractionEvidence,
  "openUserTasksAtWait" | "openTimersAtWait"
> & Readonly<{
  completedReceipt?: CompletedProcessReceipt;
}>;

export class TemporalScenarioRunner {
  private workerError: unknown;
  private shutdownStarted = false;
  private worker: Worker;
  private workerRun: Promise<void>;

  private constructor(
    private readonly environment: TestWorkflowEnvironment,
    worker: Worker,
    workerRun: Promise<void>,
  ) {
    this.worker = worker;
    this.workerRun = workerRun;
  }

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
    return this.createWithEnvironment(environment);
  }

  static async createTimeSkipping(
    options: TemporalTimeSkippingRunnerOptions,
  ): Promise<TemporalScenarioRunner> {
    await withDeadline(
      mkdir(options.downloadDirectory, { recursive: true }),
      operationDeadlineMs,
      "Temporal test-server cache creation",
    );
    const environment = await withDeadline(
      TestWorkflowEnvironment.createTimeSkipping({
        server: {
          executable: {
            type: "cached-download",
            version: "default",
            downloadDir: options.downloadDirectory,
          },
        },
        client: {
          identity: temporalTestIdentity,
        },
      }),
      environmentStartupDeadlineMs,
      "Temporal time-skipping environment startup",
    );
    return this.createWithEnvironment(environment);
  }

  private static async createWithEnvironment(
    environment: TestWorkflowEnvironment,
  ): Promise<TemporalScenarioRunner> {
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
    semanticProcess: SemanticProcessProgram,
    options: TemporalScenarioExecutionOptions,
  ): Promise<TemporalScenarioExecution> {
    this.assertAvailable();
    validateExecutionOptions(scenario, options);
    const start = requireStartStimulus(scenario);
    const handle = await withDeadline(
      this.environment.client.workflow.start<BpmnProcessWorkflow>(
        bpmnProcessWorkflowType,
        {
          taskQueue: bpmnSemanticTaskQueue,
          workflowId: options.workflowId,
          workflowIdReusePolicy: "REJECT_DUPLICATE",
          args: [start, semanticProcess],
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
    const openTimersAtWait = openTimersInTrace(waitTrace);
    const completions = requireCompletionStimuli(scenario);
    const delivery = await this.deliverCompletions(
      handle,
      start.instanceId,
      completions,
      options,
    );
    const {
      completedReceipt,
      ...interaction
    } = delivery;
    const timerStimulus = requireOptionalTimerStimulus(scenario);
    let timerReceipt: CompletedProcessReceipt | undefined;
    if (timerStimulus !== undefined) {
      if (options.workerDownAtTimerDue === true) {
        await this.restartWorkerAfterTimerDue(handle, timerStimulus);
      }
      timerReceipt = requireCompletedProcessReceipt(
        await withDeadline(
          handle.result(),
          workflowResultDeadlineMs,
          "timer Workflow completed receipt",
        ),
      );
    }

    const trace = await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(
        bpmnTraceQueryName,
      ),
      operationDeadlineMs,
      "Workflow final trace Query",
    );
    const result = scenarioResultFromTrace(trace);
    const receipt = completedReceipt ?? timerReceipt ??
      (completedState(trace)
        ? requireCompletedProcessReceipt(
          await withDeadline(
            handle.result(),
            workflowResultDeadlineMs,
            "Workflow completed receipt",
          ),
        )
        : null);
    if (receipt === null) {
      await withDeadline(
        handle.terminate("conformance scenario input exhausted"),
        operationDeadlineMs,
        "running conformance Workflow cleanup",
      );
    }
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "Workflow history fetch",
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError("Temporal history did not contain an events array");
    }
    reconcileHarnessTraceEvidence(
      trace,
      receipt,
      history as TemporalHistory,
    );
    if (timerStimulus !== undefined) {
      requireDurableTimerHistory(
        history as TemporalHistory,
        timerStimulus.logicalTimeMs,
      );
    }

    this.assertWorkerHealthy();
    return {
      waitTrace,
      interactionEvidence: {
        openUserTasksAtWait,
        openTimersAtWait,
        ...interaction,
      },
      result,
      receipt,
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
      items.map(({ scenario, semanticProcess, options }) =>
        this.runScenario(scenario, semanticProcess, options),
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

  async runTimerBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalTimerBypassMutationExecution> {
    this.assertAvailable();
    const start = requireStartStimulus(scenario);
    const timer = requireOptionalTimerStimulus(scenario);
    if (timer === undefined) {
      throw new TypeError(
        "Timer-bypass mutation requires one Fire Timer stimulus",
      );
    }
    const mutationWorker = await withDeadline(
      Worker.create({
        connection: this.environment.nativeConnection,
        identity: temporalTestIdentity,
        taskQueue: timerBypassMutationTaskQueue,
        workflowsPath: timerBypassMutationWorkflowsPath,
      }),
      workerStartupDeadlineMs,
      "timer-bypass mutation Worker startup",
    );
    let mutationWorkerError: unknown;
    const mutationWorkerRun = mutationWorker.run().catch((error: unknown) => {
      mutationWorkerError = error;
    });

    try {
      const handle = await withDeadline(
        this.environment.client.workflow.start(
          timerBypassMutationWorkflowType,
          {
            taskQueue: timerBypassMutationTaskQueue,
            workflowId,
            workflowIdReusePolicy: "REJECT_DUPLICATE",
            args: [start, semanticProcess],
          },
        ),
        operationDeadlineMs,
        "timer-bypass mutation Workflow start",
      );
      const receipt = requireCompletedProcessReceipt(
        await withDeadline(
          handle.result(),
          workflowResultDeadlineMs,
          "timer-bypass mutation Workflow result",
        ),
      );
      const trace = await withDeadline(
        handle.query<ReadonlyArray<CanonicalObservation>>(
          bpmnTraceQueryName,
        ),
        operationDeadlineMs,
        "timer-bypass mutation trace Query",
      );
      const history = await withDeadline(
        handle.fetchHistory(),
        operationDeadlineMs,
        "timer-bypass mutation history fetch",
      );
      if (!Array.isArray(history.events)) {
        throw new TypeError(
          "Timer-bypass mutation history did not contain an events array",
        );
      }
      reconcileHarnessTraceEvidence(
        trace,
        receipt,
        history as TemporalHistory,
      );
      return {
        result: scenarioResultFromTrace(trace),
        receipt,
        history: history as TemporalHistory,
      };
    } finally {
      mutationWorker.shutdown();
      await withDeadline(
        mutationWorkerRun,
        shutdownDeadlineMs,
        "timer-bypass mutation Worker shutdown",
      );
      if (mutationWorkerError !== undefined) {
        throw normalizeError(
          mutationWorkerError,
          "Timer-bypass mutation Worker failed",
        );
      }
    }
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
    handle: WorkflowHandle<BpmnProcessWorkflow>,
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

  private async restartWorkerAfterTimerDue(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    timer: FireTimerStimulus,
  ): Promise<void> {
    await withDeadline(
      this.waitForTimerStarted(handle),
      operationDeadlineMs,
      "durable timer start",
    );
    this.worker.shutdown();
    await withDeadline(
      this.workerRun,
      shutdownDeadlineMs,
      "pre-due Temporal Worker shutdown",
    );
    this.assertWorkerHealthy();

    // The Service owns timer firing while no Worker polls. Waiting beyond the admitted duration
    // makes Worker absence at the due boundary an explicit harness scheduling input.
    await delay(timer.logicalTimeMs + 100);

    const replacement = await withDeadline(
      Worker.create({
        connection: this.environment.nativeConnection,
        identity: temporalTestIdentity,
        taskQueue: bpmnSemanticTaskQueue,
        workflowsPath,
      }),
      workerStartupDeadlineMs,
      "replacement Temporal Worker startup",
    );
    this.worker = replacement;
    this.workerError = undefined;
    this.workerRun = replacement.run().catch((error: unknown) => {
      this.workerError = error;
    });
    await delay(0);
    this.assertWorkerHealthy();
  }

  private async waitForTimerStarted(
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

  private async deliverCompletions(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    processInstanceId: string,
    completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
    options: TemporalScenarioExecutionOptions,
  ): Promise<CompletionDeliveryEvidence> {
    switch (options.completionDelivery) {
      case TemporalCompletionDelivery.Ordered:
        return this.deliverOrderedCompletions(
          handle,
          processInstanceId,
          completions,
          options.duplicateFirstCompletion === true,
        );
      case TemporalCompletionDelivery.PostTerminal:
        return this.deliverPostTerminalCompletion(
          handle,
          processInstanceId,
          completions,
          options.duplicateFirstCompletion === true,
        );
      case TemporalCompletionDelivery.AcceptedBatch:
        return this.deliverAcceptedBatch(
          handle,
          processInstanceId,
          completions,
          options.duplicateFirstCompletion === true,
        );
      case TemporalCompletionDelivery.Concurrent:
        return this.deliverConcurrentCompletions(
          processInstanceId,
          completions,
          options.workflowId,
        );
      default:
        return assertNever(options.completionDelivery);
    }
  }

  private async deliverOrderedCompletions(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    processInstanceId: string,
    completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
    duplicateFirstCompletion: boolean,
  ): Promise<CompletionDeliveryEvidence> {
    const completionOutcomes: CommandOutcome[] = [];
    const openUserTasksAfterCompletions:
      Array<ReadonlyArray<OpenUserTask>> = [];
    let duplicateCompletionOutcome: CommandOutcome | null = null;

    for (const [index, stimulus] of completions.entries()) {
      this.assertWorkerHealthy();
      completionOutcomes.push(
        requireSemanticOutcome(
          await submitUserTaskCompletionAtWorkflowId(
            this.environment.client.workflow,
            handle.workflowId,
            processInstanceId,
            stimulus,
          ),
        ),
      );
      if (
        index === 0 &&
        duplicateFirstCompletion
      ) {
        duplicateCompletionOutcome = requireSemanticOutcome(
          await submitUserTaskCompletionAtWorkflowId(
            this.environment.client.workflow,
            handle.workflowId,
            processInstanceId,
            stimulus,
          ),
        );
      }
      if (index < completions.length - 1) {
        openUserTasksAfterCompletions.push(
          await withDeadline(
            handle.query<ReadonlyArray<OpenUserTask>>(
              bpmnOpenUserTasksQueryName,
            ),
            operationDeadlineMs,
            "Workflow intermediate open User Tasks Query",
          ),
        );
      }
    }

    return {
      openUserTasksAfterCompletions,
      completionOutcomes,
      duplicateCompletionOutcome,
      postTerminalResult: null,
    };
  }

  private async deliverPostTerminalCompletion(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    processInstanceId: string,
    completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
    duplicateFirstCompletion: boolean,
  ): Promise<CompletionDeliveryEvidence> {
    const postTerminalStimulus = completions.at(-1);
    if (postTerminalStimulus === undefined) {
      throw new TypeError(
        "Post-terminal delivery requires one command after semantic completion",
      );
    }
    const semanticCompletions = completions.slice(0, -1);
    const delivered = await this.deliverOrderedCompletions(
      handle,
      processInstanceId,
      semanticCompletions,
      duplicateFirstCompletion,
    );
    const completedReceipt = requireCompletedProcessReceipt(
      await withDeadline(
        handle.result(),
        workflowResultDeadlineMs,
        "Workflow completed receipt before post-terminal command",
      ),
    );
    const postTerminalResult = await submitUserTaskCompletionAtWorkflowId(
      this.environment.client.workflow,
      handle.workflowId,
      processInstanceId,
      postTerminalStimulus,
    );
    if (
      postTerminalResult.kind !==
        ProcessCommandResultKind.ProcessClosed ||
      !isDeepStrictEqual(
        postTerminalResult.receipt,
        completedReceipt,
      )
    ) {
      throw new Error(
        `Post-terminal command ${postTerminalStimulus.commandId} did not resolve against the completed Process receipt`,
      );
    }
    return {
      ...delivered,
      openUserTasksAfterCompletions: [
        ...delivered.openUserTasksAfterCompletions,
        completedReceipt.finalState.openUserTasks,
      ],
      postTerminalResult,
      completedReceipt,
    };
  }

  private async deliverAcceptedBatch(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    processInstanceId: string,
    completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
    duplicateFirstCompletion: boolean,
  ): Promise<CompletionDeliveryEvidence> {
    // Every request is in flight before an acceptance response is awaited. Temporal may receive these concurrent requests in a different order, so this is an acceptance-race discriminator rather than an ordering guarantee.
    const updateHandlePromises = completions.map((stimulus) =>
      handle.startUpdate<
        CommandOutcome,
        [CompleteUserTaskInstanceStimulus]
      >(bpmnCompleteUserTaskUpdateName, {
        args: [stimulus],
        updateId: contentBoundUpdateId(stimulus),
        waitForStage: WorkflowUpdateStage.ACCEPTED,
      })
    );
    const updateHandles = await Promise.all(updateHandlePromises);
    const completionOutcomes = await Promise.all(
      updateHandles.map((updateHandle) =>
        withDeadline(
          updateHandle.result(),
          operationDeadlineMs,
          `Workflow accepted Update ${updateHandle.updateId}`,
        )
      ),
    );
    let duplicateCompletionOutcome: CommandOutcome | null = null;
    const first = completions[0];
    if (duplicateFirstCompletion && first !== undefined) {
      duplicateCompletionOutcome = requireSemanticOutcome(
        await submitUserTaskCompletionAtWorkflowId(
          this.environment.client.workflow,
          handle.workflowId,
          processInstanceId,
          first,
        ),
      );
    }
    return {
      openUserTasksAfterCompletions: [],
      completionOutcomes,
      duplicateCompletionOutcome,
      postTerminalResult: null,
    };
  }

  private async deliverConcurrentCompletions(
    processInstanceId: string,
    completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
    workflowId: string,
  ): Promise<CompletionDeliveryEvidence> {
    const completionOutcomes = await Promise.all(
      completions.map((stimulus) => {
        this.assertWorkerHealthy();
        return submitUserTaskCompletionAtWorkflowId(
          this.environment.client.workflow,
          workflowId,
          processInstanceId,
          stimulus,
        ).then(
          requireSemanticOutcome,
        );
      }),
    );
    return {
      openUserTasksAfterCompletions: [],
      completionOutcomes,
      duplicateCompletionOutcome: null,
      postTerminalResult: null,
    };
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

export async function startBpmnProcess(
  client: WorkflowClient,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  if (!supportsSemanticProcessExecution(start, semanticProcess)) {
    throw new TypeError(
      "Workflow start requires one admitted Semantic Process execution",
    );
  }
  return withDeadline(
    client.start<BpmnProcessWorkflow>(
      bpmnProcessWorkflowType,
      {
        taskQueue: bpmnSemanticTaskQueue,
        workflowId: processWorkflowId(start.instanceId),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [start, semanticProcess],
      },
    ),
    operationDeadlineMs,
    "Process Workflow start",
  );
}

export async function submitUserTaskCompletion(
  client: WorkflowClient,
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  return submitUserTaskCompletionAtWorkflowId(
    client,
    processWorkflowId(processInstanceId),
    processInstanceId,
    stimulus,
  );
}

async function submitUserTaskCompletionAtWorkflowId(
  client: WorkflowClient,
  workflowId: string,
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  if (
    !isWellFormedStimulus(stimulus) ||
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance ||
    stimulus.taskId.processInstanceId !== processInstanceId
  ) {
    throw new TypeError(
      "Completion command must be well-formed and address the named Process instance",
    );
  }
  const updateId = contentBoundUpdateId(stimulus);
  const handle = client.getHandle<BpmnProcessWorkflow>(workflowId);
  try {
    const outcome = await withDeadline(
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
    return semanticCommandResult(stimulus.commandId, outcome);
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
  }

  try {
    const retainedOutcome = await withDeadline(
      handle.getUpdateHandle<CommandOutcome>(updateId).result(),
      operationDeadlineMs,
      `retained Workflow Update ${updateId}`,
    );
    return semanticCommandResult(stimulus.commandId, retainedOutcome);
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
  }

  try {
    const receipt = requireCompletedProcessReceipt(
      await withDeadline(
        handle.result(),
        operationDeadlineMs,
        "retained completed Process receipt",
      ),
    );
    if (receipt.processInstanceId !== processInstanceId) {
      throw new TypeError(
        "Temporal Workflow receipt does not match the addressed Process instance",
      );
    }
    return {
      kind: ProcessCommandResultKind.ProcessClosed,
      commandId: stimulus.commandId,
      receipt,
    };
  } catch (error: unknown) {
    if (error instanceof WorkflowNotFoundError) {
      return {
        kind: ProcessCommandResultKind.ProcessUnknown,
        commandId: stimulus.commandId,
        processInstanceId,
      };
    }
    throw error;
  }
}

function semanticCommandResult(
  commandId: string,
  outcome: CommandOutcome,
): ProcessCommandResult {
  return {
    kind: ProcessCommandResultKind.Semantic,
    commandId,
    outcome,
  };
}

function requireSemanticOutcome(
  result: ProcessCommandResult,
): CommandOutcome {
  if (result.kind !== ProcessCommandResultKind.Semantic) {
    throw new Error(
      `Conformance command ${result.commandId} was not accepted before Process closure`,
    );
  }
  return result.outcome;
}

function validateExecutionOptions(
  scenario: Scenario,
  options: TemporalScenarioExecutionOptions,
): void {
  const timer = requireOptionalTimerStimulus(scenario);
  if (timer !== undefined) {
    if (
      options.completionDelivery !== TemporalCompletionDelivery.Ordered ||
      options.duplicateFirstCompletion === true
    ) {
      throw new TypeError(
        "Timer scenarios use internally derived ordered firing without caller duplication",
      );
    }
  } else if (options.workerDownAtTimerDue === true) {
    throw new TypeError(
      "Worker-down-at-due scheduling requires one timer stimulus",
    );
  }
  switch (options.completionDelivery) {
    case TemporalCompletionDelivery.Ordered:
    case TemporalCompletionDelivery.AcceptedBatch:
      break;
    case TemporalCompletionDelivery.PostTerminal:
      if (requireCompletionStimuli(scenario).length < 2) {
        throw new TypeError(
          "Post-terminal delivery requires a semantic completion followed by a distinct command",
        );
      }
      break;
    case TemporalCompletionDelivery.Concurrent:
      if (options.duplicateFirstCompletion === true) {
        throw new TypeError(
          "Concurrent completion delivery cannot also duplicate one completion",
        );
      }
      break;
    default:
      throw new TypeError(
        `Unsupported completion delivery: ${String(options.completionDelivery)}`,
      );
  }
  if (options.duplicateFirstCompletion !== true) {
    return;
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
}

function requireCompletionStimuli(
  scenario: Scenario,
): ReadonlyArray<CompleteUserTaskInstanceStimulus> {
  return scenario.stimuli.slice(1).flatMap((stimulus) => {
    switch (stimulus.kind) {
      case StimulusKind.CompleteUserTaskInstance:
        return [stimulus];
      case StimulusKind.FireTimer:
        return [];
      case StimulusKind.CompleteEffect:
        return [];
      case StimulusKind.StartProcess:
        throw new TypeError(
          "Only the first scenario stimulus may start the Process",
        );
      default:
        return assertNever(stimulus);
    }
  });
}

function requireOptionalTimerStimulus(
  scenario: Scenario,
): FireTimerStimulus | undefined {
  let timer: FireTimerStimulus | undefined;
  for (const stimulus of scenario.stimuli.slice(1)) {
    switch (stimulus.kind) {
      case StimulusKind.CompleteUserTaskInstance:
      case StimulusKind.CompleteEffect:
        break;
      case StimulusKind.FireTimer:
        if (timer !== undefined) {
          throw new TypeError(
            "The admitted Temporal capsule supports exactly one timer firing",
          );
        }
        if (
          stimulus.commandId !==
            timerFiringCommandId(
              stimulus.timerId,
              stimulus.logicalTimeMs,
            )
        ) {
          throw new TypeError(
            "Timer command ID is not bound to its occurrence and logical deadline",
          );
        }
        timer = stimulus;
        break;
      case StimulusKind.StartProcess:
        throw new TypeError(
          "Only the first scenario stimulus may start the Process",
        );
      default:
        assertNever(stimulus);
    }
  }
  return timer;
}

function requireStartStimulus(scenario: Scenario): StartProcessStimulus {
  const start = scenario.stimuli[0];
  if (
    start === undefined ||
    start.kind !== StimulusKind.StartProcess
  ) {
    throw new TypeError(
      "Temporal Process execution requires one explicit start stimulus",
    );
  }
  return start;
}

function scenarioResultFromTrace(
  trace: ReadonlyArray<CanonicalObservation>,
): ScenarioResult {
  const finalCommand = trace.findLast(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command,
  );
  if (
    finalCommand === undefined ||
    finalCommand.kind !== CanonicalObservationKind.Command
  ) {
    throw new Error(
      "Workflow trace has no semantic command result",
    );
  }
  return {
    outcome: {
      kind: ScenarioOutcomeKind.Semantic,
      outcome: finalCommand.outcome,
    },
    trace,
  };
}

function completedState(
  trace: ReadonlyArray<CanonicalObservation>,
): boolean {
  return trace.some(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Completed,
  );
}

function openTimersInTrace(
  trace: ReadonlyArray<CanonicalObservation>,
): ReadonlyArray<OpenTimer> {
  const waiting = trace.findLast(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.status === ProcessStatus.Running,
  );
  return waiting?.kind === CanonicalObservationKind.State
    ? waiting.openTimers
    : [];
}

export function isCompletedProcessReceipt(
  value: unknown,
): value is CompletedProcessReceipt {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "definition",
    "processId",
    "processInstanceId",
    "finalState",
  ])) {
    return false;
  }
  const definition = value.definition;
  const finalState = value.finalState;
  return (
    isRecord(definition) &&
    hasOnlyKeys(definition, [
      "compiler",
      "semanticProfile",
      "sourceId",
      "sourceSha256",
    ]) &&
    definition.compiler ===
      SemanticProcessCompilerId.BpmnSourceSemanticProcess &&
    isNonEmptyString(definition.semanticProfile) &&
    isNonEmptyString(definition.sourceId) &&
    typeof definition.sourceSha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(definition.sourceSha256) &&
    isNonEmptyString(value.processId) &&
    isNonEmptyString(value.processInstanceId) &&
    isRecord(finalState) &&
    hasOnlyKeys(finalState, [
      "kind",
      "instanceId",
      "status",
      "activeWaits",
      "openUserTasks",
      "openTimers",
      "openEffects",
      "enabledInteractions",
      "logicalTimeMs",
    ]) &&
    finalState.kind === CanonicalObservationKind.State &&
    finalState.instanceId === value.processInstanceId &&
    finalState.status === ProcessStatus.Completed &&
    Array.isArray(finalState.activeWaits) &&
    finalState.activeWaits.length === 0 &&
    Array.isArray(finalState.openUserTasks) &&
    finalState.openUserTasks.length === 0 &&
    Array.isArray(finalState.openTimers) &&
    finalState.openTimers.length === 0 &&
    Array.isArray(finalState.openEffects) &&
    finalState.openEffects.length === 0 &&
    Array.isArray(finalState.enabledInteractions) &&
    finalState.enabledInteractions.length === 0 &&
    Number.isSafeInteger(finalState.logicalTimeMs) &&
    Number(finalState.logicalTimeMs) >= 0
  );
}

function requireCompletedProcessReceipt(
  value: unknown,
): CompletedProcessReceipt {
  if (!isCompletedProcessReceipt(value)) {
    throw new TypeError(
      "Temporal Workflow returned a malformed completed Process receipt",
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return (
    Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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
