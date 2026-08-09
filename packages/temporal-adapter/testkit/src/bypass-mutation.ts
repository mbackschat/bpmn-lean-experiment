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
  TemporalErrorPropagationBypassMutationExecution,
  TemporalBranchBypassMutationExecution,
  TemporalHistory,
  TemporalScopeBypassMutationExecution,
  TemporalTimerBypassMutationExecution,
} from "./contracts.js";
import {
  EffectExecutionSchedule,
  requireCompletedProcessReceipt,
} from "./contracts.js";
import {
  reconcileHarnessTraceEvidence,
} from "./harness-evidence.js";
import {
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
} from "./contracts.js";
import {
  submitUserTaskCompletionAtWorkflowId,
} from "@bpmn-lean/temporal-client";

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
const scopeConfiguration = {
  taskQueue: "bpmn-scope-bypass-mutation",
  workflowType: "runBpmnProcessScopeBypassMutation",
  workflowsPath: fileURLToPath(
    new URL("./scope-bypass-mutation-workflows.js", import.meta.url),
  ),
  description: "scope-bypass mutation",
} as const;
const errorPropagationConfiguration = {
  taskQueue: "bpmn-error-propagation-bypass-mutation",
  workflowType: "runBpmnProcessErrorPropagationBypassMutation",
  workflowsPath: fileURLToPath(
    new URL(
      "./error-propagation-bypass-mutation-workflows.js",
      import.meta.url,
    ),
  ),
  description: "Error propagation bypass mutation",
} as const;
const completionDataConfiguration = {
  taskQueue: "bpmn-completion-data-bypass-mutation",
  workflowType: "runBpmnProcessCompletionDataBypassMutation",
  workflowsPath: fileURLToPath(
    new URL(
      "./completion-data-bypass-mutation-workflows.js",
      import.meta.url,
    ),
  ),
  description: "completion-data-bypass mutation",
} as const;
const temporalTestIdentity = "bpmn-lean-test-runtime";
const operationDeadlineMs = 5_000;
const workerStartupDeadlineMs = 20_000;
const workflowResultDeadlineMs = 10_000;
const shutdownDeadlineMs = 10_000;

type BypassMutationConfiguration =
  | typeof timerConfiguration
  | typeof effectConfiguration
  | typeof completionDataConfiguration;

export async function runCompletionDataBypassMutation(
  environment: TestWorkflowEnvironment,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForUserTask: WaitForUserTask,
): Promise<TemporalTimerBypassMutationExecution> {
  return runBypassMutation(
    environment,
    scenario,
    semanticProcess,
    workflowId,
    completionDataConfiguration,
    waitForUserTask,
  );
}

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
  return runRetainedTraceMutation(
    environment,
    start,
    semanticProcess,
    workflowId,
    branchConfiguration,
    async (handle) => {
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
    },
  );
}

export async function runScopeBypassMutation(
  environment: TestWorkflowEnvironment,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: WaitForTrace,
): Promise<TemporalScopeBypassMutationExecution> {
  const completion = requireCompletionStimuli(scenario)[0];
  if (completion === undefined) {
    throw new TypeError("Scope-bypass mutation requires one child completion");
  }
  const start = requireStartStimulus(scenario);
  return runRetainedTraceMutation(
    environment,
    start,
    semanticProcess,
    workflowId,
    scopeConfiguration,
    async (handle) => {
      await waitForTrace(handle, 3);
      const completionResult = await submitUserTaskCompletionAtWorkflowId(
        environment.client.workflow,
        workflowId,
        start.instanceId,
        completion,
      );
      const completionOutcome = requireSemanticOutcome(completionResult);
      const trace = await waitForTrace(handle, 5);
      const history = await withDeadline(
        handle.fetchHistory(),
        operationDeadlineMs,
        `${scopeConfiguration.description} history fetch`,
      );
      if (!Array.isArray(history.events)) {
        throw new TypeError(
          `${scopeConfiguration.description} history did not contain an events array`,
        );
      }
      return {
        trace: [...trace],
        history: history as TemporalHistory,
        completionOutcome,
      };
    },
  );
}

export async function runErrorPropagationBypassMutation(
  environment: TestWorkflowEnvironment,
  scenario: Scenario,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  waitForTrace: WaitForTrace,
): Promise<TemporalErrorPropagationBypassMutationExecution> {
  const completions = requireCompletionStimuli(scenario);
  const completion = completions[0];
  const discriminator = completions[1];
  if (completion?.taskId.elementId !== "UserTask_TriggerError") {
    throw new TypeError(
      "Error propagation bypass requires Trigger Error first",
    );
  }
  if (
    completions.length !== 2 ||
    discriminator?.taskId.elementId !== "UserTask_SiblingWork"
  ) {
    throw new TypeError(
      "Error propagation bypass requires one stale Sibling Work discriminator",
    );
  }
  const start = requireStartStimulus(scenario);
  return runRetainedTraceMutation(
    environment,
    start,
    semanticProcess,
    workflowId,
    errorPropagationConfiguration,
    async (handle) => {
      await waitForTrace(handle, 3);
      const completionResult = await submitUserTaskCompletionAtWorkflowId(
        environment.client.workflow,
        workflowId,
        start.instanceId,
        completion,
      );
      const completionOutcome = requireSemanticOutcome(completionResult);
      await waitForTrace(handle, 5);
      const discriminatorResult = await submitUserTaskCompletionAtWorkflowId(
        environment.client.workflow,
        workflowId,
        start.instanceId,
        discriminator,
      );
      const discriminatorOutcome = requireSemanticOutcome(
        discriminatorResult,
      );
      const trace = await waitForTrace(handle, 7);
      const history = await withDeadline(
        handle.fetchHistory(),
        operationDeadlineMs,
        `${errorPropagationConfiguration.description} history fetch`,
      );
      if (!Array.isArray(history.events)) {
        throw new TypeError(
          `${errorPropagationConfiguration.description} history did not contain an events array`,
        );
      }
      return {
        trace: [...trace],
        history: history as TemporalHistory,
        completionOutcome,
        discriminatorOutcome,
      };
    },
  );
}

type RetainedTraceMutationConfiguration = Readonly<{
  taskQueue: string;
  workflowType: string;
  workflowsPath: string;
  description: string;
}>;

async function runRetainedTraceMutation<Result>(
  environment: TestWorkflowEnvironment,
  start: ReturnType<typeof requireStartStimulus>,
  semanticProcess: SemanticProcessProgram,
  workflowId: string,
  configuration: RetainedTraceMutationConfiguration,
  drive: (
    handle: WorkflowHandle<BpmnProcessWorkflow>,
  ) => Promise<Result>,
): Promise<Result> {
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
  let handle: WorkflowHandle<BpmnProcessWorkflow> | undefined;

  try {
    handle = await withDeadline(
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
    return await drive(handle);
  } finally {
    if (handle !== undefined) {
      await withDeadline(
        handle.terminate(`retained ${configuration.description}`),
        operationDeadlineMs,
        `${configuration.description} Workflow cleanup`,
      );
    }
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
