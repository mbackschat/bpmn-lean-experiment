/** Durable containing-scope termination, replacement, replay, and global-cancellation evidence. */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  StimulusKind,
  runScenario,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import type {
  TestWorkflowEnvironment,
} from "@temporalio/testing";
import {
  DefaultLogger,
  Worker,
  bundleWorkflowCode,
} from "@temporalio/worker";
import type {
  WorkflowBundleWithSourceMap,
} from "@temporalio/worker";

import {
  BpmnProcessStartResultKind,
  ProcessCommandResultKind,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  readBpmnProcessTrace,
  startBpmnProcess,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  acceptedCompletionOrder,
  assertNoNonUpdateBpmnHostEvents,
  assertUpdatesCompleteBeforeWorkflow,
} from "./temporal-history-facts.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type {
  WorkerLease,
} from "./temporal-worker-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/terminate-end-event/trigger-first.scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/terminate-end-event/process.bpmn",
  import.meta.url,
);
const mutationWorkflowsPath = fileURLToPath(new URL(
  "./terminate-end-mutation-workflows.ts",
  import.meta.url,
));
const operationDeadlineMs = 10_000;
const ordinaryIdentity = "bpmn-lean-terminate-end-replacement";
const mutationIdentity = "bpmn-lean-terminate-end-global-mutation";
const mutationTaskQueue = "bpmn-terminate-end-global-mutation";
const exactHistoryEventCount = 20;

describe("bounded Terminate End Temporal refinement", { concurrency: false }, () => {
  let environment: TestWorkflowEnvironment | undefined;
  let ordinaryBundle: WorkflowBundleWithSourceMap;
  let mutationBundle: WorkflowBundleWithSourceMap;
  let semanticProcess: SemanticProcessProgram;
  let scenario: Scenario;

  before(async () => {
    mutationBundle = await bundleWorkflowCode({
      workflowsPath: mutationWorkflowsPath,
      logger: new DefaultLogger("ERROR"),
    });
    scenario = await loadJson<Scenario>(scenarioUrl);
    ({ semanticProcess } = await compileExecutionInput(scenario, bpmnUrl));
    ordinaryBundle = await loadBpmnWorkflowBundle();
    environment = await withDeadline(
      createCachedLocalEnvironment({
        identity: ordinaryIdentity,
        downloadDirectory: temporalCacheDirectory,
      }),
      40_000,
      "Terminate End Temporal environment startup",
    );
  });

  after(async () => {
    if (environment !== undefined) {
      await withDeadline(
        environment.teardown(),
        operationDeadlineMs,
        "Terminate End Temporal environment teardown",
      );
    }
  });

  test("regional termination survives Worker replacement and rejects the canceled sibling", async (context) => {
    const runtime = requireEnvironment(environment);
    const start = startAt(scenario);
    const trigger = completionAt(scenario, 1);
    const outer = completionAt(scenario, 2);
    const expected = runScenario(scenario, semanticProcess);
    let worker: WorkerLease | undefined;

    try {
      worker = await startBpmnTestWorker(
        runtime,
        ordinaryBundle,
        ordinaryIdentity,
      );
      const started = await startBpmnProcess(
        runtime.client.workflow,
        start,
        semanticProcess,
        { taskQueue: bpmnSemanticTaskQueue },
      );
      assert.equal(started.kind, BpmnProcessStartResultKind.Started);
      if (started.kind !== BpmnProcessStartResultKind.Started) {
        throw new Error("Terminate End Workflow was rejected");
      }
      const handle = getTestProcessHandle(
        runtime.client.workflow,
        started.processInstanceId,
      );
      const initialTasks = await waitForOpenUserTaskIds(
        handle,
        ["UserTask_Sibling", "UserTask_Trigger"],
      );
      const sibling = initialTasks[0];
      assert.equal(sibling?.id.elementId, "UserTask_Sibling");

      assert.deepEqual(
        await submitUserTaskCompletion(
          runtime.client.workflow,
          start.instanceId,
          trigger,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: trigger.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
      await stopBpmnTestWorker(worker);
      worker = undefined;

      worker = await startBpmnTestWorker(
        runtime,
        ordinaryBundle,
        ordinaryIdentity,
      );
      assert.equal(
        await handle.getUpdateHandle(contentBoundUpdateId(trigger)).result(),
        CommandOutcome.Committed,
      );
      await waitForOpenUserTaskIds(handle, ["UserTask_Outer"]);
      const beforeStale = await readBpmnProcessTrace(
        runtime.client.workflow,
        start.instanceId,
      );
      assert.deepEqual(beforeStale, expected.trace.slice(0, 5));

      const stale = staleSiblingCompletion(start.instanceId, sibling.id.activation);
      assert.deepEqual(
        await submitUserTaskCompletion(
          runtime.client.workflow,
          start.instanceId,
          stale,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: stale.commandId,
          outcome: CommandOutcome.Rejected,
        },
      );
      await waitForOpenUserTaskIds(handle, ["UserTask_Outer"]);
      const afterStale = await readBpmnProcessTrace(
        runtime.client.workflow,
        start.instanceId,
      );
      assert.deepEqual(afterStale.at(-1), beforeStale.at(-1));

      assert.deepEqual(
        await submitUserTaskCompletion(
          runtime.client.workflow,
          start.instanceId,
          outer,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: outer.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
      const receipt = await withDeadline(
        handle.result(),
        operationDeadlineMs,
        "Terminate End completed receipt",
      );
      assert.equal(isCompletedProcessReceipt(receipt), true);
      assert.deepEqual(receipt.finalState, expected.trace.at(-1));

      const history = await withDeadline(
        handle.fetchHistory(),
        operationDeadlineMs,
        "Terminate End history fetch",
      );
      const typedHistory = history as TemporalHistory;
      assert.equal(typedHistory.events.length, exactHistoryEventCount);
      assert.deepEqual(
        acceptedCompletionOrder(typedHistory),
        [trigger.commandId, stale.commandId, outer.commandId],
      );
      assertUpdatesCompleteBeforeWorkflow(typedHistory, 3);
      assertNoNonUpdateBpmnHostEvents(typedHistory, "Terminate End");
      const description = await handle.describe();
      assert.equal(description.historyLength, typedHistory.events.length);
      const historySize = description.historySize;
      assert.equal(
        typeof historySize === "number" &&
          Number.isSafeInteger(historySize) &&
          historySize > 0,
        true,
      );
      context.diagnostic(
        `exact Terminate End history: ${typedHistory.events.length} events, ${historySize} bytes`,
      );

      await stopBpmnTestWorker(worker);
      worker = undefined;
      await replayBpmnHistory(ordinaryBundle, history, handle.workflowId);
    } finally {
      if (worker !== undefined) {
        await stopBpmnTestWorker(worker);
      }
    }
  });

  test("global-cancellation mutation durably completes the root instead of publishing Outer", async () => {
    const runtime = requireEnvironment(environment);
    const start = startForInstance(
      startAt(scenario),
      "TerminateEndInstance_GlobalMutation",
    );
    const trigger = completionForInstance(
      completionAt(scenario, 1),
      start.instanceId,
    );
    const expected = runScenario(
      { ...scenario, stimuli: [start, trigger] },
      semanticProcess,
    );
    let worker: WorkerLease | undefined = await startMutationWorker(
      runtime,
      mutationBundle,
    );
    let handle: WorkflowHandle<BpmnProcessWorkflow> | undefined;

    try {
      handle = await runtime.client.workflow.start<BpmnProcessWorkflow>(
        "runBpmnProcessGlobalTerminationMutation",
        {
          taskQueue: mutationTaskQueue,
          workflowId: processWorkflowId(start.instanceId),
          workflowIdReusePolicy: "REJECT_DUPLICATE",
          args: [start, semanticProcess],
        },
      );
      await waitForOpenUserTaskIds(
        handle,
        ["UserTask_Sibling", "UserTask_Trigger"],
      );
      assert.deepEqual(
        await submitUserTaskCompletion(
          runtime.client.workflow,
          start.instanceId,
          trigger,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: trigger.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
      const receipt = await withDeadline(
        handle.result(),
        operationDeadlineMs,
        "Terminate End mutation receipt",
      );
      assert.equal(isCompletedProcessReceipt(receipt), true);
      assert.equal(receipt.finalState.status, ProcessStatus.Completed);
      const correctAfterTrigger = expected.trace.at(-1);
      assert.equal(correctAfterTrigger?.kind, CanonicalObservationKind.State);
      assert.equal(
        (correctAfterTrigger as StateObservation).status,
        ProcessStatus.Running,
      );
      assert.deepEqual(
        (correctAfterTrigger as StateObservation).openUserTasks.map(
          ({ id }) => id.elementId,
        ),
        ["UserTask_Outer"],
      );
      assert.notDeepEqual(receipt.finalState, correctAfterTrigger);

      const history = await handle.fetchHistory();
      assertUpdatesCompleteBeforeWorkflow(history as TemporalHistory, 1);
      assertNoNonUpdateBpmnHostEvents(
        history as TemporalHistory,
        "Terminate End mutation",
      );
      await stopBpmnTestWorker(worker);
      worker = undefined;
      await replayBpmnHistory(mutationBundle, history, handle.workflowId);
    } finally {
      if (handle !== undefined) {
        const description = await handle.describe().catch(() => undefined);
        if (description?.status.name === "RUNNING") {
          await handle.terminate("Terminate End mutation cleanup");
        }
      }
      if (worker !== undefined) {
        await stopBpmnTestWorker(worker);
      }
    }
  });
});

function startAt(scenario: Scenario): StartProcessStimulus {
  const stimulus = requiredAt(scenario.stimuli, 0, "Terminate End stimuli");
  if (stimulus.kind !== StimulusKind.StartProcess) {
    throw new TypeError("Terminate End scenario has no start");
  }
  return stimulus;
}

function completionAt(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "Terminate End stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`Terminate End stimulus ${index} is not a completion`);
  }
  return stimulus;
}

function staleSiblingCompletion(
  processInstanceId: string,
  activation: number,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "refuse-stale-sibling-after-termination",
    taskId: {
      processInstanceId,
      elementId: "UserTask_Sibling",
      activation,
    },
    submittedValues: [],
  };
}

function startForInstance(
  start: StartProcessStimulus,
  instanceId: string,
): StartProcessStimulus {
  return { ...start, commandId: "start-global-mutation", instanceId };
}

function completionForInstance(
  completion: CompleteUserTaskInstanceStimulus,
  processInstanceId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    ...completion,
    commandId: "complete-trigger-global-mutation",
    taskId: { ...completion.taskId, processInstanceId },
  };
}

function requireEnvironment(
  environment: TestWorkflowEnvironment | undefined,
): TestWorkflowEnvironment {
  if (environment === undefined) {
    throw new TypeError("Terminate End Temporal environment is unavailable");
  }
  return environment;
}

async function startMutationWorker(
  environment: TestWorkflowEnvironment,
  workflowBundle: WorkflowBundleWithSourceMap,
): Promise<WorkerLease> {
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    identity: mutationIdentity,
    taskQueue: mutationTaskQueue,
    workflowBundle,
  });
  let failure: unknown;
  const completion = worker.run().catch((error: unknown) => {
    failure = error;
  });
  return { worker, completion, failure: () => failure };
}
