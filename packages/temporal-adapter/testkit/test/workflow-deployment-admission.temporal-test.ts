/** Stop-the-world Worker deployment, old-history compatibility, and wrong-bundle evidence. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CanonicalObservationKind,
  CommandOutcome,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  ProcessStartStimulus,
  Scenario,
} from "@bpmn-lean/semantic-core";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  DefaultLogger,
  Worker,
  bundleWorkflowCode,
} from "@temporalio/worker";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  WorkflowChainBudgetKind,
  WorkflowDeploymentPollerKind,
  admitWorkflowDeployment,
  bpmnProcessWorkflowType,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  readTestProcessTerminalResult,
  submitUserTaskCompletion,
  workflowBundleIdentity,
  workflowChainProductionLimit,
  workflowDeploymentPollerIdentity,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalHistory,
  WorkflowDeploymentPoller,
} from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import { historyEvents } from "./temporal-history-facts.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/user-task-cycle/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/user-task-cycle/process.bpmn",
  import.meta.url,
);
const oldWorkflowsPath = fileURLToPath(new URL(
  "./workflow-deployment-old-workflows.ts",
  import.meta.url,
));
const fixtureTaskQueue = "bpmn-workflow-deployment-v1-fixture";
const deploymentTaskQueue = "bpmn-workflow-deployment-admission";
const operationDeadlineMs = 20_000;

test("admits one replayed candidate bundle without mixed pollers or semantic drift", async () => {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const { semanticProcess } = await compileExecutionInput(scenario, bpmnUrl);
  const expected = runScenario(scenario, semanticProcess);
  const candidateBundle = await loadBpmnWorkflowBundle();
  const oldBundle = await bundleWorkflowCode({
    workflowsPath: oldWorkflowsPath,
    logger: new DefaultLogger("ERROR"),
  });
  const candidateBundleIdentity = workflowBundleIdentity(candidateBundle);
  const oldBundleIdentity = workflowBundleIdentity(oldBundle);
  const candidateWorkerIdentity = workflowDeploymentPollerIdentity(
    candidateBundleIdentity,
    "candidate-1",
  );
  const oldWorkerIdentity = workflowDeploymentPollerIdentity(
    oldBundleIdentity,
    "old-1",
  );
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-lean-workflow-deployment-admission",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Workflow deployment Temporal environment startup",
  );
  let activeWorker: RunningWorker | undefined;

  try {
    const v1Histories = await createV1ContinuationHistories(
      environment,
      candidateBundle,
      scenario,
      semanticProcess,
    );
    const continuedHistory = v1Histories.find(({ history }) =>
      historyEvents(
        history as TemporalHistory,
        "workflowExecutionContinuedAsNewEventAttributes",
      ).length === 1
    );
    if (continuedHistory === undefined) {
      assert.fail("v1 deployment fixture has no closed Continue-As-New Run");
    }
    await assert.rejects(
      replayBpmnHistory(
        oldBundle,
        continuedHistory.history,
        continuedHistory.workflowId,
      ),
    );

    const legacyStart = withInstance(requiredStart(scenario), "DeploymentLegacy_1");
    const legacyWorkflowId = processWorkflowId(legacyStart.instanceId);
    activeWorker = await startWorker(
      environment,
      oldBundle,
      deploymentTaskQueue,
      oldWorkerIdentity,
    );
    const legacyHandle = await environment.client.workflow.start(
      bpmnProcessWorkflowType,
      {
        args: [legacyStart, semanticProcess],
        taskQueue: deploymentTaskQueue,
        workflowId: legacyWorkflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );
    await waitForOpenUserTaskIds(legacyHandle, ["Review"]);
    const legacyHistory = await legacyHandle.fetchHistory();
    let ingressFenced = false;
    let inventoryIdentity: string | undefined = oldWorkerIdentity;

    const receipt = await admitWorkflowDeployment({
      taskQueue: deploymentTaskQueue,
      current: {
        bundle: oldBundle,
        bundleIdentity: oldBundleIdentity,
        workerIdentities: [oldWorkerIdentity],
      },
      candidate: {
        bundle: candidateBundle,
        bundleIdentity: candidateBundleIdentity,
        workerIdentities: [candidateWorkerIdentity],
      },
    }, {
      async fenceIngress() {
        assert.equal(ingressFenced, false);
        ingressFenced = true;
      },
      async stopCurrentWorkers() {
        assert.equal(ingressFenced, true);
        await stopWorker(requiredWorker(activeWorker));
        activeWorker = undefined;
        inventoryIdentity = undefined;
      },
      async readPollers() {
        return inventoryIdentity === undefined
          ? []
          : pollers(inventoryIdentity);
      },
      async replayCandidate() {
        assert.equal(ingressFenced, true);
        await replayBpmnHistory(
          candidateBundle,
          legacyHistory,
          legacyWorkflowId,
        );
        for (const item of v1Histories) {
          await replayBpmnHistory(
            candidateBundle,
            item.history,
            item.workflowId,
          );
        }
      },
      async startCandidateWorkers() {
        assert.equal(ingressFenced, true);
        activeWorker = await startWorker(
          environment,
          candidateBundle,
          deploymentTaskQueue,
          candidateWorkerIdentity,
        );
        inventoryIdentity = candidateWorkerIdentity;
        return {
          shutdown: async () => {
            await stopWorker(requiredWorker(activeWorker));
            activeWorker = undefined;
            inventoryIdentity = undefined;
          },
        };
      },
      async reopenIngress() {
        assert.equal(ingressFenced, true);
        assert.equal(inventoryIdentity, candidateWorkerIdentity);
        ingressFenced = false;
      },
    });

    assert.equal(ingressFenced, false);
    assert.equal(receipt.currentBundleIdentity, oldBundleIdentity);
    assert.equal(receipt.candidateBundleIdentity, candidateBundleIdentity);
    for (const completion of completionsFor(scenario, legacyStart.instanceId)) {
      await waitForOpenUserTaskIds(legacyHandle, [completion.taskId.elementId]);
      const result = await submitUserTaskCompletion(
        environment.client.workflow,
        legacyStart.instanceId,
        completion,
      );
      assert.equal(result.kind, "semantic");
      assert.equal(result.outcome, CommandOutcome.Committed);
    }
    const terminal = await withDeadline(
      readTestProcessTerminalResult(legacyHandle),
      operationDeadlineMs,
      "legacy Workflow terminal result after candidate deployment",
    );
    assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
    assert.equal(
      terminal.receipt.finalState.kind,
      CanonicalObservationKind.State,
    );
    assert.deepEqual(terminal.receipt.finalState, {
      ...expected.trace.at(-1),
      instanceId: legacyStart.instanceId,
    });

    let effects = 0;
    await assert.rejects(
      admitWorkflowDeployment({
        taskQueue: deploymentTaskQueue,
        current: {
          bundle: oldBundle,
          bundleIdentity: oldBundleIdentity,
          workerIdentities: [oldWorkerIdentity],
        },
        candidate: {
          bundle: oldBundle,
          bundleIdentity: candidateBundleIdentity,
          workerIdentities: [candidateWorkerIdentity],
        },
      }, inertOperations(() => effects += 1)),
      /candidate bundle identity does not match its exact code bytes/,
    );
    assert.equal(effects, 0);
  } finally {
    if (activeWorker !== undefined) await stopWorker(activeWorker);
    await environment.teardown();
  }
});

async function createV1ContinuationHistories(
  environment: TestWorkflowEnvironment,
  bundle: WorkflowBundleWithSourceMap,
  scenario: Scenario,
  semanticProcess: Awaited<ReturnType<typeof compileExecutionInput>>["semanticProcess"],
) {
  const start = withInstance(requiredStart(scenario), "DeploymentV1_1");
  const workflowId = processWorkflowId(start.instanceId);
  const completions = completionsFor(scenario, start.instanceId);
  const identity = workflowDeploymentPollerIdentity(
    workflowBundleIdentity(bundle),
    "fixture-1",
  );
  const worker = await startWorker(
    environment,
    bundle,
    fixtureTaskQueue,
    identity,
  );
  try {
    await environment.client.workflow.start(bpmnProcessWorkflowType, {
      args: [
        start,
        semanticProcess,
        {
          protocol: "bpmn-lean.workflow-continuation.v1",
          kind: "initial",
          eventHistoryEventLimit: 4,
          eventHistoryByteLimit: workflowChainProductionLimit(
            WorkflowChainBudgetKind.EventHistoryBytes,
          ),
        },
      ],
      taskQueue: fixtureTaskQueue,
      workflowId,
      workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    const handle = getTestProcessHandle(
      environment.client.workflow,
      start.instanceId,
    );
    for (const [index, completion] of completions.entries()) {
      await waitForOpenUserTaskIds(handle, [completion.taskId.elementId]);
      await submitUserTaskCompletion(
        environment.client.workflow,
        start.instanceId,
        completion,
      );
      if (index < completions.length - 1) {
        await waitForRunCount(environment, workflowId, index + 2);
      }
    }
    await withDeadline(
      readTestProcessTerminalResult(handle),
      operationDeadlineMs,
      "v1 deployment compatibility fixture completion",
    );
    const items = [];
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId !== workflowId) continue;
      const runHandle = environment.client.workflow.getHandle(
        workflowId,
        execution.runId,
      );
      items.push({
        workflowId,
        history: await runHandle.fetchHistory(),
      });
    }
    assert.equal(items.length, 3);
    return items;
  } finally {
    await stopWorker(worker);
  }
}

async function waitForRunCount(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let count = 0;
    for await (const execution of environment.client.workflow.list()) {
      if (execution.workflowId === workflowId) count += 1;
    }
    if (count === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Workflow ${workflowId} did not reach ${expected} Runs`);
}

type RunningWorker = Readonly<{
  worker: Worker;
  completion: Promise<void>;
  failure(): unknown;
}>;

async function startWorker(
  environment: TestWorkflowEnvironment,
  workflowBundle: WorkflowBundleWithSourceMap,
  taskQueue: string,
  identity: string,
): Promise<RunningWorker> {
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    identity,
    taskQueue,
    workflowBundle,
    activities: {
      executeBpmnEffect: async () => ({ kind: "technicalFailure" as const }),
    },
  });
  let failure: unknown;
  const completion = worker.run().catch((error: unknown) => {
    failure = error;
  });
  await Promise.resolve();
  if (failure !== undefined) throw failure;
  return { worker, completion, failure: () => failure };
}

async function stopWorker(worker: RunningWorker): Promise<void> {
  worker.worker.shutdown();
  await withDeadline(
    worker.completion,
    operationDeadlineMs,
    "deployment evidence Worker shutdown",
  );
  if (worker.failure() !== undefined) throw worker.failure();
}

function pollers(identity: string): ReadonlyArray<WorkflowDeploymentPoller> {
  return [
    { kind: WorkflowDeploymentPollerKind.Workflow, identity },
    { kind: WorkflowDeploymentPollerKind.Activity, identity },
  ];
}

function requiredWorker(worker: RunningWorker | undefined): RunningWorker {
  if (worker === undefined) throw new Error("deployment Worker is absent");
  return worker;
}

function requiredStart(scenario: Scenario): ProcessStartStimulus {
  const stimulus = requiredAt(scenario.stimuli, 0, "deployment stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("deployment scenario has no Process start");
  }
  return stimulus;
}

function requiredCompletion(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "deployment stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`deployment stimulus ${index} is not a completion`);
  }
  return stimulus;
}

function withInstance(
  start: ProcessStartStimulus,
  processInstanceId: string,
): ProcessStartStimulus {
  return {
    ...start,
    commandId: `${start.commandId}:${processInstanceId}`,
    instanceId: processInstanceId,
  };
}

function withProcessInstance(
  stimulus: CompleteUserTaskInstanceStimulus,
  processInstanceId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    ...stimulus,
    commandId: `${stimulus.commandId}:${processInstanceId}`,
    taskId: { ...stimulus.taskId, processInstanceId },
  };
}

function completionsFor(
  scenario: Scenario,
  processInstanceId: string,
): ReadonlyArray<CompleteUserTaskInstanceStimulus> {
  return [1, 2, 3].map((index) => withProcessInstance(
    requiredCompletion(scenario, index),
    processInstanceId,
  ));
}

function inertOperations(onEffect: () => void) {
  return {
    async fenceIngress() { onEffect(); },
    async stopCurrentWorkers() { onEffect(); },
    async readPollers() { onEffect(); return []; },
    async replayCandidate() { onEffect(); },
    async startCandidateWorkers() {
      onEffect();
      return { shutdown: async () => onEffect() };
    },
    async reopenIngress() { onEffect(); },
  };
}
