import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  OpenUserTask,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  bpmnProcessWorkflowType,
  bpmnOpenUserTasksQueryName,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  TemporalCompletionDelivery,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  CompletedProcessReceipt,
  TemporalHistory,
  TemporalEffectBypassMutationExecution,
  TemporalEffectFailureExecution,
  TemporalReplayItem,
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
  TemporalScenarioRunnerOptions,
  TemporalTimerBypassMutationExecution,
  TemporalSharedEffectExecutions,
  TemporalTimeSkippingRunnerOptions,
} from "./contracts.js";
import {
  runEffectBypassMutation,
  runTimerBypassMutation,
} from "./bypass-mutation.js";
import {
  deliverCompletions,
} from "./completion-delivery.js";
import {
  EffectProbeActivityRegistry,
  EffectProbeStore,
} from "./effect-probe.js";
import {
  runEffectExhaustion,
  runEffectScenario,
  runEffectScenariosWithSharedStore,
} from "./effect-scenario-execution.js";
import {
  requireDurableTimerHistory,
  reconcileHarnessTraceEvidence,
} from "./harness-evidence.js";
import {
  completedState,
  isCompletedProcessReceipt,
  normalizeError,
  openEffectsInTrace,
  openTimersInTrace,
  requireCompletedProcessReceipt,
  requireCompletionStimuli,
  requireOptionalEffectExecution,
  requireOptionalTimerStimulus,
  requireStartStimulus,
  scenarioResultFromTrace,
  validateExecutionOptions,
  withDeadline,
} from "./runner-support.js";
import {
  TemporalWorkerHost,
} from "./temporal-worker-host.js";

export { isCompletedProcessReceipt } from "./runner-support.js";
export {
  startBpmnProcess,
  submitUserTaskCompletion,
} from "./process-client.js";

const temporalTestIdentity = "bpmn-lean-test-runtime";
const operationDeadlineMs = 5_000;
const environmentStartupDeadlineMs = 40_000;
const workflowResultDeadlineMs = 10_000;
const waitTraceDeadlineMs = 10_000;
const shutdownDeadlineMs = 10_000;

export class TemporalScenarioRunner {
  private shutdownStarted = false;

  private constructor(
    private readonly environment: TestWorkflowEnvironment,
    private readonly effectProbeRegistry: EffectProbeActivityRegistry,
    private readonly workerHost: TemporalWorkerHost,
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
      const effectProbeRegistry = new EffectProbeActivityRegistry();
      const workerHost = await TemporalWorkerHost.create(
        environment,
        effectProbeRegistry,
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
    const openEffectsAtWait = openEffectsInTrace(waitTrace);
    if (options.workerDownAtEffectPending === true) {
      if (effectProbeStore === undefined) {
        throw new TypeError(
          "Worker-down effect scheduling has no probe store",
        );
      }
      await this.workerHost.restartDuringEffect(handle, effectProbeStore);
    }
    const completions = requireCompletionStimuli(scenario);
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
      if (options.workerDownAtTimerDue === true) {
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
    if (options.effectExecutionSchedule !== undefined) {
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

  async runTimerBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalTimerBypassMutationExecution> {
    this.assertAvailable();
    return runTimerBypassMutation(
      this.environment,
      scenario,
      semanticProcess,
      workflowId,
    );
  }

  async runEffectBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalEffectBypassMutationExecution> {
    return runEffectBypassMutation(
      this.environment,
      scenario,
      semanticProcess,
      workflowId,
    );
  }

  async runEffectExhaustion(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalEffectFailureExecution> {
    this.assertAvailable();
    return runEffectExhaustion(
      this.environment,
      this.effectProbeRegistry,
      scenario,
      semanticProcess,
      workflowId,
      (handle, minimumLength) => this.waitForTrace(handle, minimumLength),
    );
  }

  async runEffectScenariosWithSharedStore(
    items: ReadonlyArray<TemporalScenarioBatchItem>,
  ): Promise<TemporalSharedEffectExecutions> {
    this.assertAvailable();
    return runEffectScenariosWithSharedStore(
      this.effectProbeRegistry,
      items,
      (scenario, semanticProcess, options, store) =>
        this.runRegisteredScenario(
          scenario,
          semanticProcess,
          options,
          store,
        ),
    );
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
    let latestError: unknown;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      this.workerHost.assertHealthy();
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
    this.workerHost.assertHealthy();
  }
}
