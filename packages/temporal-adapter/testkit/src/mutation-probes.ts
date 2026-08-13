/**
 * Bypass-mutation and failure probes over a live Temporal scenario runtime.
 *
 * These are differential-evidence probes, not production execution: each one drives a Workflow
 * along a deliberately perturbed path so the pipeline can prove a seeded semantic mutation is
 * detected. They are separated from the scenario runner because they own no host lifecycle —
 * environment creation, Worker health, and shutdown remain the runner's responsibility, and this
 * owner reaches them only through the narrow {@link TemporalProbeHost} contract.
 */
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  runIncidentRetryFailure,
} from "./incident-scenario-execution.js";
import {
  runBranchBypassMutation,
  runCompletionDataBypassMutation,
  runEffectBypassMutation,
  runErrorPropagationBypassMutation,
  runScopeBypassMutation,
  runTimerBypassMutation,
} from "./bypass-mutation.js";
import {
  runEffectExhaustion,
  runEffectScenariosWithSharedStore,
} from "./effect-scenario-execution.js";
import {
  runUnhandledBpmnError,
} from "./mapped-boundary-error-scenario-execution.js";
import type {
  BpmnProcessWorkflow,
  TemporalBranchBypassMutationExecution,
  TemporalEffectBypassMutationExecution,
  TemporalEffectFailureExecution,
  TemporalIncidentRetryFailureExecution,
  TemporalErrorPropagationBypassMutationExecution,
  TemporalScenarioBatchItem,
  TemporalScenarioExecution,
  TemporalScenarioExecutionOptions,
  TemporalScopeBypassMutationExecution,
  TemporalSharedEffectExecutions,
  TemporalTimerBypassMutationExecution,
  TemporalUnhandledBpmnErrorExecution,
} from "./contracts.js";
import {
  EffectExecutionSchedule,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "./contracts.js";
import type {
  EffectProbeActivityRegistry,
  EffectProbeStore,
} from "./contracts.js";
import {
  waitForOpenUserTask,
  waitForTraceLength,
} from "./runner-query-waits.js";
import { requireOptionalEffectExecution } from "./runner-support.js";

/**
 * The runner-owned capabilities a probe needs, and nothing more.
 *
 * `assertAvailable` rejects a probe against a shut-down runner; `assertHealthy` is the per-poll
 * guard that stops a wait from hanging once the Worker has failed. The two are distinct because a
 * probe may start while the runner is live and outlive the Worker's health.
 */
export type TemporalProbeHost = Readonly<{
  assertAvailable(): void;
  assertHealthy(): void;
  environment: TestWorkflowEnvironment;
  effectProbeRegistry: EffectProbeActivityRegistry;
  runRegisteredScenario(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    options: TemporalScenarioExecutionOptions,
    effectProbeStore?: EffectProbeStore,
  ): Promise<TemporalScenarioExecution>;
}>;

export class TemporalMutationProbes {
  constructor(private readonly host: TemporalProbeHost) {}

  async runTimerBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalTimerBypassMutationExecution> {
    this.host.assertAvailable();
    return runTimerBypassMutation(
      this.host.environment,
      scenario,
      semanticProcess,
      workflowId,
      (handle, completion) => this.waitForOpenUserTask(handle, completion),
    );
  }

  async runBranchBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalBranchBypassMutationExecution> {
    this.host.assertAvailable();
    return runBranchBypassMutation(
      this.host.environment,
      scenario,
      semanticProcess,
      workflowId,
      (handle, minimumLength) => this.waitForTrace(handle, minimumLength),
    );
  }

  async runScopeBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalScopeBypassMutationExecution> {
    this.host.assertAvailable();
    return runScopeBypassMutation(
      this.host.environment,
      scenario,
      semanticProcess,
      workflowId,
      (handle, minimumLength) => this.waitForTrace(handle, minimumLength),
    );
  }

  async runErrorPropagationBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalErrorPropagationBypassMutationExecution> {
    this.host.assertAvailable();
    return runErrorPropagationBypassMutation(
      this.host.environment,
      scenario,
      semanticProcess,
      workflowId,
      (handle, minimumLength) => this.waitForTrace(handle, minimumLength),
    );
  }

  async runCompletionDataBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalTimerBypassMutationExecution> {
    this.host.assertAvailable();
    return runCompletionDataBypassMutation(
      this.host.environment,
      scenario,
      semanticProcess,
      workflowId,
      (handle, completion) => this.waitForOpenUserTask(handle, completion),
    );
  }

  async runEffectBypassMutation(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalEffectBypassMutationExecution> {
    this.host.assertAvailable();
    return runEffectBypassMutation(
      this.host.environment,
      scenario,
      semanticProcess,
      workflowId,
      (handle, completion) => this.waitForOpenUserTask(handle, completion),
    );
  }

  async runEffectExhaustion(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalEffectFailureExecution> {
    this.host.assertAvailable();
    return runEffectExhaustion(
      this.host.environment,
      this.host.effectProbeRegistry,
      scenario,
      semanticProcess,
      workflowId,
      (handle, minimumLength) => this.waitForTrace(handle, minimumLength),
    );
  }

  async runIncidentRetryFailure(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalIncidentRetryFailureExecution> {
    this.host.assertAvailable();
    const options: TemporalScenarioExecutionOptions = {
      workflowId,
      completionDelivery: TemporalCompletionDelivery.Ordered,
      executionSchedule: TemporalExecutionSchedule.Normal,
      effectExecutionSchedule: EffectExecutionSchedule.IncidentReportRetryFailure,
    };
    const effectExecution = requireOptionalEffectExecution(
      scenario,
      semanticProcess,
      options,
    );
    if (effectExecution === undefined) {
      throw new TypeError("Incident failure requires one effect execution");
    }
    return runIncidentRetryFailure(
      this.host.environment,
      this.host.effectProbeRegistry,
      effectExecution,
      scenario,
      semanticProcess,
      workflowId,
      (handle, minimumLength) => this.waitForTrace(handle, minimumLength),
    );
  }

  async runEffectScenariosWithSharedStore(
    items: ReadonlyArray<TemporalScenarioBatchItem>,
  ): Promise<TemporalSharedEffectExecutions> {
    this.host.assertAvailable();
    return runEffectScenariosWithSharedStore(
      this.host.effectProbeRegistry,
      items,
      (scenario, semanticProcess, options, store) =>
        this.host.runRegisteredScenario(
          scenario,
          semanticProcess,
          options,
          store,
        ),
    );
  }

  async runUnhandledBpmnError(
    scenario: Scenario,
    semanticProcess: SemanticProcessProgram,
    workflowId: string,
  ): Promise<TemporalUnhandledBpmnErrorExecution> {
    this.host.assertAvailable();
    return runUnhandledBpmnError(
      this.host.environment,
      this.host.effectProbeRegistry,
      scenario,
      semanticProcess,
      workflowId,
      (handle, minimumLength) => this.waitForTrace(handle, minimumLength),
    );
  }

  private async waitForTrace(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    minimumLength: number,
  ): Promise<ReadonlyArray<CanonicalObservation>> {
    return waitForTraceLength(handle, minimumLength, () =>
      this.host.assertHealthy(),
    );
  }

  private async waitForOpenUserTask(
    handle: WorkflowHandle<BpmnProcessWorkflow>,
    completion: CompleteUserTaskInstanceStimulus,
  ): Promise<void> {
    return waitForOpenUserTask(handle, completion, () =>
      this.host.assertHealthy(),
    );
  }
}
