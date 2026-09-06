import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkflowUpdateRPCTimeoutOrCancelledError } from "@temporalio/client";
import { StimulusKind, runScenario } from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import { resolveSemanticUpdate } from "@bpmn-lean/temporal-client";
import {
  BpmnProcessStartResultKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnSemanticTaskQueue,
  createCachedLocalEnvironment,
  getTestProcessHandle,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  readTestProcessTerminalResult,
  startBpmnProcess,
} from "@bpmn-lean/temporal-testkit";
import {
  compileExecutionInput, loadJson, requiredAt, temporalCacheDirectory, withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker, waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

test("an absent Worker expires the native Update RPC and the same command commits once after replacement", async () => {
  const scenario = await loadJson<Scenario>(new URL(
    "../../../../scenarios/user-task-discovery-completion/scenario.json", import.meta.url,
  ));
  const { semanticProcess } = await compileExecutionInput(scenario, new URL(
    "../../../../scenarios/user-task-discovery-completion/process.bpmn", import.meta.url,
  ));
  const start = requiredAt(scenario.stimuli, 0, "deadline start");
  const stimulus = requiredAt(scenario.stimuli, 1, "deadline completion");
  assert.equal(start.kind, StimulusKind.StartProcess);
  assert.equal(stimulus.kind, StimulusKind.CompleteUserTaskInstance);
  if (start.kind !== StimulusKind.StartProcess || stimulus.kind !== StimulusKind.CompleteUserTaskInstance) {
    assert.fail("deadline witness requires the registered User Task scenario");
  }
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "bpmn-command-deadline", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "command deadline environment startup");
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "command-deadline");
    const started = await startBpmnProcess(environment.client.workflow, start, semanticProcess, {
      taskQueue: bpmnSemanticTaskQueue,
    });
    assert.equal(started.kind, BpmnProcessStartResultKind.Started);
    const handle = getTestProcessHandle(environment.client.workflow, start.instanceId);
    await waitForOpenUserTaskIds(handle, [stimulus.taskId.elementId]);
    await stopBpmnTestWorker(worker);
    worker = undefined;

    const resolution = {
      client: environment.client.workflow,
      workflowId: processWorkflowId(start.instanceId),
      processInstanceId: start.instanceId,
      stimulus,
      updateName: bpmnCompleteUserTaskUpdateName,
      operation: "completion while Worker absent",
    };
    await assert.rejects(resolveSemanticUpdate({ ...resolution, deadlineMs: 100 }),
      WorkflowUpdateRPCTimeoutOrCancelledError);

    worker = await startBpmnTestWorker(environment, bundle, "command-deadline-replacement");
    const result = await resolveSemanticUpdate(resolution);
    assert.deepEqual(result, { kind: "semantic", commandId: stimulus.commandId, outcome: "committed" });
    assert.deepEqual(await resolveSemanticUpdate(resolution), result);
    const terminal = await withDeadline(readTestProcessTerminalResult(handle), 15_000, "deadline terminal receipt");
    assert.deepEqual(terminal.receipt.finalState, runScenario(scenario, semanticProcess).trace.at(-1));
    assert.equal(terminal.recoveryEntries.filter(({ commandId }) => commandId === stimulus.commandId).length, 1);
    await replayBpmnHistory(bundle, await handle.fetchHistory(), resolution.workflowId);
  } finally {
    if (worker !== undefined) await stopBpmnTestWorker(worker);
    await environment.teardown();
  }
});
