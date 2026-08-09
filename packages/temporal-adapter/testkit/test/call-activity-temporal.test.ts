/** Durable address-separation, replacement, mutation, and replay evidence for bounded Call Activity. */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";

import {
  CommandOutcome,
  ProcessStatus,
  SemanticOperationKind,
  StimulusKind,
  deriveCalledProcessInstanceId,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  Scenario,
  SemanticProcessProgram,
  StartProcessStimulus,
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
  bpmnOpenUserTasksQueryName,
  bpmnSemanticTaskQueue,
  contentBoundUpdateId,
  createCachedLocalEnvironment,
  isCompletedProcessReceipt,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  startBpmnProcess,
  submitUserTaskCompletion,
  submitUserTaskCompletionAtWorkflowId,
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

const profile = "bpmn-2.0.2-called-process-call-activity-draft";
const callerProcessId = "CallerProcess";
const callElementId = "Call_CalledProcess";
const calledTaskElementId = "CalledTask";
const callerTaskElementId = "CallerTask";
const ordinaryInstanceId = "CallActivityInstance_1";
const operationDeadlineMs = 10_000;
const ordinaryWorkerIdentity = "bpmn-lean-call-activity-replacement";
const mutationWorkerIdentity = "bpmn-lean-call-activity-mutation";
const mutationTaskQueue = "bpmn-call-activity-mutation";
const bpmnUrl = new URL(
  "../../../../scenarios/called-process-call-activity/process.bpmn",
  import.meta.url,
);
const scenarioUrl = new URL(
  "../../../../scenarios/called-process-call-activity/scenario.json",
  import.meta.url,
);
const mutationWorkflowsPath = fileURLToPath(new URL(
  "../dist/call-activity-mutation-workflows.js",
  import.meta.url,
));

describe("bounded Call Activity Temporal refinement", { concurrency: false }, () => {
  let environment: TestWorkflowEnvironment;
  let ordinaryBundle: WorkflowBundleWithSourceMap;
  let mutationBundle: WorkflowBundleWithSourceMap;
  let program: SemanticProcessProgram;
  let scenario: Scenario;

  before(async () => {
    scenario = await loadJson<Scenario>(scenarioUrl);
    ({ semanticProcess: program } = await compileExecutionInput(
      scenario,
      bpmnUrl,
    ));
    assertCallProgram(program);
    [environment, ordinaryBundle, mutationBundle] = await Promise.all([
      withDeadline(
        createCachedLocalEnvironment({
          identity: ordinaryWorkerIdentity,
          downloadDirectory: temporalCacheDirectory,
        }),
        40_000,
        "Call Activity Temporal environment startup",
      ),
      loadBpmnWorkflowBundle(),
      bundleWorkflowCode({
        workflowsPath: mutationWorkflowsPath,
        logger: new DefaultLogger("ERROR"),
      }),
    ]);
  });

  after(async () => {
    await withDeadline(
      environment.teardown(),
      operationDeadlineMs,
      "Call Activity Temporal environment teardown",
    );
  });

  test("keeps the root Workflow address while the called semantic completion survives Worker replacement", async () => {
    let worker: WorkerLease | undefined;
    const start = requiredAt(scenario.stimuli, 0, "Call Activity stimuli");
    if (start.kind !== StimulusKind.StartProcess) {
      throw new TypeError("Call Activity scenario has no start");
    }
    const calledInstanceId = deriveCalledProcessInstanceId(
      ordinaryInstanceId,
      callElementId,
      1,
    );
    const calledCompletion = scenarioCompletion(scenario, 1);
    const callerCompletion = scenarioCompletion(scenario, 2);
    const wrongCalledCompletion = completion(
      ordinaryInstanceId,
      calledTaskElementId,
      "reject-caller-owned-called-task",
    );
    assert.equal(calledCompletion.taskId.processInstanceId, calledInstanceId);
    assert.equal(callerCompletion.taskId.processInstanceId, ordinaryInstanceId);

    try {
      worker = await startBpmnTestWorker(
        environment,
        ordinaryBundle,
        ordinaryWorkerIdentity,
      );
      const started = await startBpmnProcess(
        environment.client.workflow,
        start,
        program,
        { taskQueue: bpmnSemanticTaskQueue },
      );
      assert.equal(started.kind, BpmnProcessStartResultKind.Started);
      if (started.kind !== BpmnProcessStartResultKind.Started) {
        throw new Error("Call Activity Workflow was rejected");
      }
      const handle = started.handle;
      assert.equal(handle.workflowId, processWorkflowId(ordinaryInstanceId));
      assert.deepEqual(
        await waitForOpenUserTaskIds(handle, [calledTaskElementId]),
        [{
          id: {
            processInstanceId: calledInstanceId,
            elementId: calledTaskElementId,
            activation: 1,
          },
          name: "Called task",
          state: "active",
        }],
      );

      assert.deepEqual(
        await submitUserTaskCompletion(
          environment.client.workflow,
          ordinaryInstanceId,
          wrongCalledCompletion,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: wrongCalledCompletion.commandId,
          outcome: CommandOutcome.Rejected,
        },
      );
      assert.deepEqual(
        await waitForOpenUserTaskIds(handle, [calledTaskElementId]),
        [{
          id: {
            processInstanceId: calledInstanceId,
            elementId: calledTaskElementId,
            activation: 1,
          },
          name: "Called task",
          state: "active",
        }],
      );

      assert.deepEqual(
        await submitUserTaskCompletion(
          environment.client.workflow,
          ordinaryInstanceId,
          calledCompletion,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: calledCompletion.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
      const callerTasksBeforeReplacement = await waitForOpenUserTaskIds(
        handle,
        [callerTaskElementId],
      );

      await stopBpmnTestWorker(worker);
      worker = undefined;
      worker = await startBpmnTestWorker(
        environment,
        ordinaryBundle,
        ordinaryWorkerIdentity,
      );
      assert.deepEqual(
        await submitUserTaskCompletion(
          environment.client.workflow,
          ordinaryInstanceId,
          calledCompletion,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: calledCompletion.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
      assert.equal(
        await handle.getUpdateHandle(
          contentBoundUpdateId(calledCompletion),
        ).result(),
        CommandOutcome.Committed,
      );
      const callerTasksAfterReplacement = await waitForOpenUserTaskIds(
        handle,
        [callerTaskElementId],
      );
      assert.deepEqual(
        callerTasksAfterReplacement,
        callerTasksBeforeReplacement,
      );
      assert.deepEqual(
        callerTasksAfterReplacement.map(({ id }) => id.processInstanceId),
        [ordinaryInstanceId],
      );

      assert.deepEqual(
        await submitUserTaskCompletion(
          environment.client.workflow,
          ordinaryInstanceId,
          callerCompletion,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: callerCompletion.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
      const receipt = await withDeadline(
        handle.result(),
        operationDeadlineMs,
        "Call Activity completed receipt",
      );
      assert.equal(isCompletedProcessReceipt(receipt), true);
      assert.equal(receipt.processId, callerProcessId);
      assert.equal(receipt.processInstanceId, ordinaryInstanceId);
      assert.equal(receipt.finalState.status, ProcessStatus.Completed);
      assert.deepEqual(receipt.finalState.openUserTasks, []);
      assert.deepEqual(receipt.finalState.activeWaits, []);
      assert.deepEqual(receipt.finalState.enabledInteractions, []);

      const history = await withDeadline(
        handle.fetchHistory(),
        operationDeadlineMs,
        "Call Activity history fetch",
      );
      assert.deepEqual(
        acceptedCompletionOrder(history as TemporalHistory),
        [
          wrongCalledCompletion.commandId,
          calledCompletion.commandId,
          callerCompletion.commandId,
        ],
      );
      assertUpdatesCompleteBeforeWorkflow(history as TemporalHistory, 3);
      assertNoNonUpdateBpmnHostEvents(
        history as TemporalHistory,
        "Call Activity",
      );

      await stopBpmnTestWorker(worker);
      worker = undefined;
      await withDeadline(
        replayBpmnHistory(ordinaryBundle, history, handle.workflowId),
        operationDeadlineMs,
        "Call Activity history replay",
      );
    } finally {
      if (worker !== undefined) {
        await stopBpmnTestWorker(worker);
      }
    }
  });

  test("early-return mutation exposes called and caller tasks together", async () => {
    const worker = await startMutationWorker();
    const earlyStart = callStart("CallEarlyReturn_1", "start-early-return");
    let earlyHandle: WorkflowHandle<BpmnProcessWorkflow> | undefined;
    try {
      earlyHandle = await startMutation(
        "runBpmnProcessCallActivityEarlyReturnMutation",
        earlyStart,
      );
      const earlyTasks = await waitForTaskCount(earlyHandle, 2);
      assert.deepEqual(
        earlyTasks.map(({ id }) => id.elementId).sort(),
        [calledTaskElementId, callerTaskElementId].sort(),
      );
      assert.notDeepEqual(
        earlyTasks.map(({ id }) => id.elementId),
        [calledTaskElementId],
      );
      assert.deepEqual(
        new Set(earlyTasks.map(({ id }) => id.processInstanceId)),
        new Set([
          earlyStart.instanceId,
          deriveCalledProcessInstanceId(
            earlyStart.instanceId,
            callElementId,
            1,
          ),
        ]),
      );
    } finally {
      if (earlyHandle !== undefined) {
        await earlyHandle.terminate("Call early-return mutation observed");
      }
      await stopBpmnTestWorker(worker);
    }
  });

  test("identity-erasure mutation changes Query identity and completion acceptance", async () => {
    const worker = await startMutationWorker();
    const erasedStart = callStart("CallIdentityErasure_1", "start-erasure");
    let erasedHandle: WorkflowHandle<BpmnProcessWorkflow> | undefined;
    try {
      erasedHandle = await startMutation(
        "runBpmnProcessCallActivityIdentityErasureMutation",
        erasedStart,
      );
      const expectedCalledIdentity = deriveCalledProcessInstanceId(
        erasedStart.instanceId,
        callElementId,
        1,
      );
      const erasedTasks = await waitForTaskCount(erasedHandle, 1);
      assert.equal(erasedTasks[0]?.id.elementId, calledTaskElementId);
      assert.equal(
        erasedTasks[0]?.id.processInstanceId,
        erasedStart.instanceId,
      );
      assert.notEqual(
        erasedTasks[0]?.id.processInstanceId,
        expectedCalledIdentity,
      );

      const correctIdentity = completion(
        expectedCalledIdentity,
        calledTaskElementId,
        "complete-correct-called-identity",
      );
      assert.deepEqual(
        await submitUserTaskCompletionAtWorkflowId(
          environment.client.workflow,
          erasedHandle.workflowId,
          erasedStart.instanceId,
          correctIdentity,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: correctIdentity.commandId,
          outcome: CommandOutcome.Rejected,
        },
      );
      const erasedIdentity = completion(
        erasedStart.instanceId,
        calledTaskElementId,
        "complete-erased-called-identity",
      );
      assert.deepEqual(
        await submitUserTaskCompletionAtWorkflowId(
          environment.client.workflow,
          erasedHandle.workflowId,
          erasedStart.instanceId,
          erasedIdentity,
        ),
        {
          kind: ProcessCommandResultKind.Semantic,
          commandId: erasedIdentity.commandId,
          outcome: CommandOutcome.Committed,
        },
      );
      assert.deepEqual(
        (await waitForTaskCount(erasedHandle, 1)).map(({ id }) => ({
          processInstanceId: id.processInstanceId,
          elementId: id.elementId,
        })),
        [{
          processInstanceId: erasedStart.instanceId,
          elementId: callerTaskElementId,
        }],
      );
    } finally {
      if (erasedHandle !== undefined) {
        await erasedHandle.terminate("Call identity-erasure mutation observed");
      }
      await stopBpmnTestWorker(worker);
    }
  });

  function startMutation(
    workflowType: string,
    start: StartProcessStimulus,
  ): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
    return environment.client.workflow.start<BpmnProcessWorkflow>(
      workflowType,
      {
        taskQueue: mutationTaskQueue,
        workflowId: processWorkflowId(start.instanceId),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [start, program],
      },
    );
  }

  async function startMutationWorker(): Promise<WorkerLease> {
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      identity: mutationWorkerIdentity,
      taskQueue: mutationTaskQueue,
      workflowBundle: mutationBundle,
    });
    let failure: unknown;
    const completion = worker.run().catch((error: unknown) => {
      failure = error;
    });
    return { worker, completion, failure: () => failure };
  }
});

function assertCallProgram(program: SemanticProcessProgram): void {
  assert.equal(program.identity.semanticProfile, profile);
  assert.equal(
    program.operations.filter(
      ({ kind }) => kind === SemanticOperationKind.InvokeProcess,
    ).length,
    1,
  );
}

function callStart(instanceId: string, commandId: string): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId,
    processId: callerProcessId,
    instanceId,
    initialVariables: [],
  };
}

function completion(
  processInstanceId: string,
  elementId: string,
  commandId: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: { processInstanceId, elementId, activation: 1 },
    submittedValues: [],
  };
}

function scenarioCompletion(
  scenario: Scenario,
  index: number,
): CompleteUserTaskInstanceStimulus {
  const stimulus = requiredAt(scenario.stimuli, index, "Call Activity stimuli");
  if (stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    throw new TypeError(`Call Activity stimulus ${index} is not a completion`);
  }
  return stimulus;
}

async function waitForTaskCount(
  handle: WorkflowHandle,
  expectedCount: number,
): Promise<ReadonlyArray<OpenUserTask>> {
  let latest: ReadonlyArray<OpenUserTask> = [];
  for (let attempt = 0; attempt < 100; attempt += 1) {
    latest = await withDeadline(
      handle.query<ReadonlyArray<OpenUserTask>>(bpmnOpenUserTasksQueryName),
      1_000,
      "Call mutation open-task Query",
    );
    if (latest.length === expectedCount) {
      return latest;
    }
  }
  throw new Error(
    `Call mutation exposed ${latest.length} tasks instead of ${expectedCount}`,
  );
}
