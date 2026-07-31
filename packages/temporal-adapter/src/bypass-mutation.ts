/**
 * Retained mutation runners proving that canonical agreement requires the intended Temporal
 * timer or Activity mechanism rather than a Workflow-local semantic shortcut.
 */
import { fileURLToPath } from "node:url";

import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticProcessProgram,
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
  bpmnTraceQueryName,
  TemporalCompletionDelivery,
  TemporalExecutionSchedule,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  TemporalEffectBypassMutationExecution,
  TemporalBranchBypassMutationExecution,
  TemporalHistory,
  TemporalTimerBypassMutationExecution,
} from "./contracts.js";
import {
  EffectExecutionSchedule,
} from "./effect-probe.js";
import {
  reconcileHarnessTraceEvidence,
} from "./harness-evidence.js";
import {
  requireCompletedProcessReceipt,
  requireCompletionStimuli,
  requireOptionalEffectExecution,
  requireOptionalTimerStimulus,
  requireSemanticOutcome,
  requireStartStimulus,
  scenarioResultFromTrace,
} from "./runner-support.js";
import {
  normalizeError,
  withDeadline,
} from "./async-boundary.js";
import {
  submitUserTaskCompletionAtWorkflowId,
} from "./process-client.js";

const timerConfiguration = {
  taskQueue: "bpmn-timer-bypass-mutation",
  workflowType: "runBpmnProcessTimerBypassMutation",
  workflowsPath: fileURLToPath(
    new URL("./timer-bypass-mutation-workflows.js", import.meta.url),
  ),
  description: "timer-bypass mutation",
} as const;
const effectConfiguration = {
  taskQueue: "bpmn-effect-bypass-mutation",
  workflowType: "runBpmnProcessEffectBypassMutation",
  workflowsPath: fileURLToPath(
    new URL("./effect-bypass-mutation-workflows.js", import.meta.url),
  ),
  description: "effect-bypass mutation",
} as const;
const branchConfiguration = {
  taskQueue: "bpmn-branch-bypass-mutation",
  workflowType: "runBpmnProcessBranchBypassMutation",
  workflowsPath: fileURLToPath(
    new URL("./branch-bypass-mutation-workflows.js", import.meta.url),
  ),
  description: "branch-bypass mutation",
} as const;
const temporalTestIdentity = "bpmn-lean-test-runtime";
const operationDeadlineMs = 5_000;
const workerStartupDeadlineMs = 20_000;
const workflowResultDeadlineMs = 10_000;
const shutdownDeadlineMs = 10_000;

type BypassMutationConfiguration =
  | typeof timerConfiguration
  | typeof effectConfiguration;

export async function runTimerBypassMutation(
  environment: TestWorkflowEnvironment,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForUserTask: WaitForUserTask,
): Promise<TemporalTimerBypassMutationExecution> {
  if (requireOptionalTimerStimulus(scenario) === undefined) {
    throw new TypeError(
      "Timer-bypass mutation requires one Fire Timer stimulus",
    );
  }
  return runBypassMutation(
    environment,
    scenario,
    semanticProcess,
    workflowId,
    timerConfiguration,
    waitForUserTask,
  );
}

export async function runEffectBypassMutation(
  environment: TestWorkflowEnvironment,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForUserTask: WaitForUserTask,
): Promise<TemporalEffectBypassMutationExecution> {
  requireOptionalEffectExecution(scenario, semanticProcess, {
    workflowId,
    completionDelivery: TemporalCompletionDelivery.Ordered,
    executionSchedule: TemporalExecutionSchedule.Normal,
    effectExecutionSchedule: EffectExecutionSchedule.PlainSuccess,
  });
  return runBypassMutation(
    environment,
    scenario,
    semanticProcess,
    workflowId,
    effectConfiguration,
    waitForUserTask,
  );
}

type WaitForUserTask = (
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  completion: CompleteUserTaskInstanceStimulus,
) => Promise<void>;

type WaitForTrace = (
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  minimumLength: number,
) => Promise<ReadonlyArray<CanonicalObservation>>;

export async function runBranchBypassMutation(
  environment: TestWorkflowEnvironment,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: WaitForTrace,
): Promise<TemporalBranchBypassMutationExecution> {
  const start = requireStartStimulus(scenario);
  const mutationWorker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity: temporalTestIdentity,
      taskQueue: branchConfiguration.taskQueue,
      workflowsPath: branchConfiguration.workflowsPath,
    }),
    workerStartupDeadlineMs,
    `${branchConfiguration.description} Worker startup`,
  );
  let mutationWorkerError: unknown;
  const mutationWorkerRun = mutationWorker.run().catch((error: unknown) => {
    mutationWorkerError = error;
  });
  let handle: WorkflowHandle<BpmnProcessWorkflow> | undefined;

  try {
    handle = await withDeadline(
      environment.client.workflow.start(
        branchConfiguration.workflowType,
        {
          taskQueue: branchConfiguration.taskQueue,
          workflowId,
          workflowIdReusePolicy: "REJECT_DUPLICATE",
          args: [start, semanticProcess],
        },
      ),
      operationDeadlineMs,
      `${branchConfiguration.description} Workflow start`,
    );
    const waitTrace = await waitForTrace(handle, 3);
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      `${branchConfiguration.description} history fetch`,
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError(
        `${branchConfiguration.description} history did not contain an events array`,
      );
    }
    return {
      waitTrace: [...waitTrace],
      history: history as TemporalHistory,
    };
  } finally {
    if (handle !== undefined) {
      await withDeadline(
        handle.terminate("retained branch-bypass mutation"),
        operationDeadlineMs,
        `${branchConfiguration.description} Workflow cleanup`,
      );
    }
    mutationWorker.shutdown();
    await withDeadline(
      mutationWorkerRun,
      shutdownDeadlineMs,
      `${branchConfiguration.description} Worker shutdown`,
    );
    if (mutationWorkerError !== undefined) {
      throw normalizeError(
        mutationWorkerError,
        `${branchConfiguration.description} Worker failed`,
      );
    }
  }
}

async function runBypassMutation(
  environment: TestWorkflowEnvironment,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  configuration: BypassMutationConfiguration,
  waitForUserTask: WaitForUserTask,
): Promise<TemporalTimerBypassMutationExecution> {
  const start = requireStartStimulus(scenario);
  const mutationWorker = await withDeadline(
    Worker.create({
      connection: environment.nativeConnection,
      identity: temporalTestIdentity,
      taskQueue: configuration.taskQueue,
      workflowsPath: configuration.workflowsPath,
    }),
    workerStartupDeadlineMs,
    `${configuration.description} Worker startup`,
  );
  let mutationWorkerError: unknown;
  const mutationWorkerRun = mutationWorker.run().catch((error: unknown) => {
    mutationWorkerError = error;
  });

  try {
    const handle = await withDeadline(
      environment.client.workflow.start(
        configuration.workflowType,
        {
          taskQueue: configuration.taskQueue,
          workflowId,
          workflowIdReusePolicy: "REJECT_DUPLICATE",
          args: [start, semanticProcess],
        },
      ),
      operationDeadlineMs,
      `${configuration.description} Workflow start`,
    );
    await deliverCallerCompletions(
      environment,
      handle,
      start.instanceId,
      requireCompletionStimuli(scenario),
      waitForUserTask,
    );
    const receipt = requireCompletedProcessReceipt(
      await withDeadline(
        handle.result(),
        workflowResultDeadlineMs,
        `${configuration.description} Workflow result`,
      ),
    );
    const trace = await withDeadline(
      handle.query<ReadonlyArray<CanonicalObservation>>(
        bpmnTraceQueryName,
      ),
      operationDeadlineMs,
      `${configuration.description} trace Query`,
    );
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      `${configuration.description} history fetch`,
    );
    if (!Array.isArray(history.events)) {
      throw new TypeError(
        `${configuration.description} history did not contain an events array`,
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
      `${configuration.description} Worker shutdown`,
    );
    if (mutationWorkerError !== undefined) {
      throw normalizeError(
        mutationWorkerError,
        `${configuration.description} Worker failed`,
      );
    }
  }
}

async function deliverCallerCompletions(
  environment: TestWorkflowEnvironment,
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  processInstanceId: string,
  completions: ReadonlyArray<CompleteUserTaskInstanceStimulus>,
  waitForUserTask: WaitForUserTask,
): Promise<void> {
  for (const completion of completions) {
    await waitForUserTask(handle, completion);
    requireSemanticOutcome(
      await submitUserTaskCompletionAtWorkflowId(
        environment.client.workflow,
        handle.workflowId,
        processInstanceId,
        completion,
      ),
    );
  }
}
