import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import {
  TestWorkflowEnvironment,
} from "@temporalio/testing";
import {
  createCachedLocalEnvironment,
  createCachedTimeSkippingEnvironment,
  temporalCliVersion,
} from "./ephemeral-server.js";
import {
  bpmnOpenUserTasksQueryName,
  bpmnTraceQueryName,
  TemporalExecutionSchedule,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  CompletedProcessReceipt,
  TemporalHistory,
  TemporalReplayItem,
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
  TemporalScenarioRunnerOptions,
  TemporalTimeSkippingRunnerOptions,
} from "./contracts.js";
import {
  deliverCompletions,
} from "./completion-delivery.js";
import {
  EffectProbeActivityRegistry,
  EffectProbeStore,
} from "./effect-probe.js";
import {
  runEffectScenario,
} from "./effect-scenario-execution.js";
import {
  requireDurableTimerHistory,
  reconcileHarnessTraceEvidence,
} from "./harness-evidence.js";
import {
  completedState,
  openEffectsInTrace,
  openTimersInTrace,
  requireCompletedProcessReceipt,
  requireCompletionStimuli,
  requireOptionalEffectExecution,
  requireOptionalTimerStimulus,
  requireStartStimulus,
  scenarioResultFromTrace,
  validateExecutionOptions,
} from "./runner-support.js";
import {
  normalizeError,
  withDeadline,
} from "./async-boundary.js";
import {
  TemporalWorkerHost,
} from "./temporal-worker-host.js";
import {
  deliverScenarioMessages,
} from "./runner-message-delivery.js";
import {
  startScenarioWorkflow,
} from "./runner-workflow-start.js";
import {
  requiresHostProgressBeforeCompletion,
} from "./scenario-stimulus-sequencing.js";
import {
  loadBpmnWorkflowBundle,
} from "./workflow-bundle.js";
import {
  waitForOpenUserTask,
  waitForTraceLength,
} from "./runner-query-waits.js";
import {
  TemporalMutationProbes,
} from "./mutation-probes.js";

const temporalTestIdentity = "bpmn-lean-test-runtime";
const operationDeadlineMs = 5_000;
const environmentStartupDeadlineMs = 40_000;
const workflowResultDeadlineMs = 10_000;
const waitTraceDeadlineMs = 10_000;
const shutdownDeadlineMs = 10_000;

export class TemporalScenarioRunner {
  private shutdownStarted = false;

  /** Bypass-mutation and failure probes over this runner's live runtime. */
  readonly probes: TemporalMutationProbes;

  private constructor(
    private readonly environment: TestWorkflowEnvironment,
    private readonly effectProbeRegistry: EffectProbeActivityRegistry,
    private readonly workerHost: TemporalWorkerHost,
  ) {
    this.probes = new TemporalMutationProbes({
      assertAvailable: () => this.assertAvailable(),
      assertHealthy: () => this.workerHost.assertHealthy(),
      environment: this.environment,
      effectProbeRegistry: this.effectProbeRegistry,
      runRegisteredScenario: (scenario, semanticProcess, options, store) =>
        this.runRegisteredScenario(scenario, semanticProcess, options, store),
    });
  }

  static async create(
    options: TemporalScenarioRunnerOptions,
  ): Promise<TemporalScenarioRunner> {
    const environment = await withDeadline(
      createCachedLocalEnvironment({
        identity: temporalTestIdentity,
        downloadDirectory: options.downloadDirectory,
        cliVersion: options.cliVersion ?? temporalCliVersion,
      }),
      environmentStartupDeadlineMs,
      "Temporal environment startup",
    );
    return this.createWithEnvironment(environment);
  }

  static async createTimeSkipping(
    options: TemporalTimeSkippingRunnerOptions,
  ): Promise<TemporalScenarioRunner> {
    const environment = await withDeadline(
      createCachedTimeSkippingEnvironment({
        identity: temporalTestIdentity,
        downloadDirectory: options.downloadDirectory,
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
      const effectProbeRegistry = new EffectProbeActivityRegistry();
      const workflowBundle = await loadBpmnWorkflowBundle();
      const workerHost = await TemporalWorkerHost.create(
        environment,
        effectProbeRegistry,
        workflowBundle,
      );
      return new TemporalScenarioRunner(
        environment,
        effectProbeRegistry,
        workerHost,
      );
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
    const effectExecution = requireOptionalEffectExecution(
      scenario,
      semanticProcess,
      options,
    );
    if (effectExecution === undefined) {
      return this.runRegisteredScenario(
        scenario,
        semanticProcess,
        options,
      );
    }
    return runEffectScenario(
      this.effectProbeRegistry,
      effectExecution,
      scenario,
      semanticProcess,
      options,
      (registeredScenario, registeredProcess, registeredOptions, store) =>
        this.runRegisteredScenario(
          registeredScenario,
          registeredProcess,
          registeredOptions,
          store,
        ),
    );
  }

  private async runRegisteredScenario(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    options: TemporalScenarioExecutionOptions,
    effectProbeStore?: EffectProbeStore,
  ): Promise<TemporalScenarioExecution> {
    this.assertAvailable();
    validateExecutionOptions(scenario, options);
    const start = requireStartStimulus(scenario);
    const handle = await startScenarioWorkflow(
      this.environment.client.workflow,
      start,
      semanticProcess,
      options.workflowId,
      operationDeadlineMs,
    );

    const waitTrace = await withDeadline(
      this.waitForTrace(handle, 3),
      waitTraceDeadlineMs,
      "Workflow wait-state observation",
    );

    await deliverScenarioMessages(
      this.environment.client.workflow,
      handle.workflowId,
      start.instanceId,
      scenario,
      operationDeadlineMs,
    );
    const completions = requireCompletionStimuli(scenario);
    const firstCompletion = completions[0];
    if (
      firstCompletion !== undefined &&
      requiresHostProgressBeforeCompletion(scenario, firstCompletion)
    ) {
      await this.waitForOpenUserTask(handle, firstCompletion);
    }
    const openUserTasksAtWait = await withDeadline(
      handle.query<ReadonlyArray<OpenUserTask>>(
        bpmnOpenUserTasksQueryName,
      ),
      operationDeadlineMs,
      "Workflow open User Tasks Query",
    );
    const openTimersAtWait = openTimersInTrace(waitTrace);
    const openEffectsAtWait = openEffectsInTrace(waitTrace);
    if (
      options.executionSchedule ===
        TemporalExecutionSchedule.WorkerDownAtEffectPending
    ) {
      if (effectProbeStore === undefined) {
        throw new TypeError(
          "Worker-down effect scheduling has no probe store",
        );
      }
      await this.workerHost.restartDuringEffect(handle, effectProbeStore);
    }
    const delivery = await deliverCompletions(
      this.environment.client.workflow,
      handle,
      start.instanceId,
      completions,
      options,
      () => this.workerHost.assertHealthy(),
    );
    const {
      completedReceipt,
      ...interaction
    } = delivery;
    const timerStimulus = requireOptionalTimerStimulus(scenario);
    let timerReceipt: CompletedProcessReceipt | undefined;
    if (timerStimulus !== undefined) {
      if (
        options.executionSchedule ===
          TemporalExecutionSchedule.WorkerDownAtTimerDue
      ) {
        await this.workerHost.restartAfterTimerDue(handle, timerStimulus);
      }
      timerReceipt = requireCompletedProcessReceipt(
        await withDeadline(
          handle.result(),
          workflowResultDeadlineMs,
          "timer Workflow completed receipt",
        ),
      );
    }
    let effectReceipt: CompletedProcessReceipt | undefined;
    if (options.effectExecutionSchedule !== null) {
      effectReceipt = requireCompletedProcessReceipt(
        await withDeadline(
          handle.result(),
          workflowResultDeadlineMs,
          "effect Workflow completed receipt",
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
    const receipt = completedReceipt ?? timerReceipt ?? effectReceipt ??
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

    this.workerHost.assertHealthy();
    return {
      waitTrace,
      interactionEvidence: {
        openUserTasksAtWait,
        openTimersAtWait,
        openEffectsAtWait,
        ...interaction,
      },
      result,
      receipt,
      history: history as TemporalHistory,
      effectProbeEvidence: null,
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
    await this.workerHost.replayHistories(items);
  }

  async shutdown(): Promise<void> {
    if (this.shutdownStarted) {
      return;
    }
    this.shutdownStarted = true;

    let shutdownError: unknown;
    try {
      await this.workerHost.shutdown();
    } catch (error: unknown) {
      shutdownError = error;
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
    return waitForTraceLength(
      handle,
      minimumLength,
      () => this.workerHost.assertHealthy(),
    );
  }

  private async waitForOpenUserTask(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    completion: CompleteUserTaskInstanceStimulus,
  ): Promise<void> {
    return waitForOpenUserTask(
      handle,
      completion,
      () => this.workerHost.assertHealthy(),
    );
  }

  private assertAvailable(): void {
    if (this.shutdownStarted) {
      throw new Error("Temporal scenario runner is already shut down");
    }
    this.workerHost.assertHealthy();
  }
}
