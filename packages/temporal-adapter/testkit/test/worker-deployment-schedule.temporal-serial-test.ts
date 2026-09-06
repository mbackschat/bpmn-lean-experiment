import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WorkflowClient, WorkflowNotFoundError } from "@temporalio/client";
import { DefaultLogger, bundleWorkflowCode } from "@temporalio/worker";
import { CommandOutcome, StimulusKind, runScenario } from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  bpmnWorkerDeploymentName,
  requireWorkerDeploymentEnrollment, requireWorkerDeploymentRegistration,
} from "@bpmn-lean/temporal-client";
import { createLazyTemporalClientRuntime } from "@bpmn-lean/temporal-client/definition-start";
import { createTemporalDefinitionSchedule, describeTemporalDefinitionSchedule } from "@bpmn-lean/temporal-client/definition-schedule";
import {
  bpmnCompleteUserTaskUpdateName, bpmnTraceQueryName, contentBoundUpdateId,
  processWorkflowId, productionBpmnWorkflowInitialHostInput,
} from "@bpmn-lean/temporal-protocol";
import { ExternalTemporalRuntime, loadBpmnWorkflowBundle, workflowBundleBuildId } from "@bpmn-lean/temporal-worker";
import { createCachedLocalEnvironment, readTestProcessTerminalResult } from "@bpmn-lean/temporal-testkit";
import { compileExecutionInput, loadJson, temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, waitForOpenUserTaskIds } from "./temporal-worker-test-support.ts";
import { eventually, requirePinned, selectCurrent } from "./native-worker-deployment-live-test-support.ts";
import { decodeJsonPayload } from "./temporal-history-facts.ts";

test("an A-created one-shot Schedule enrolls under B at dispatch with exact definition and Timer input", async () => {
  const scenario = await loadJson<Scenario>(new URL("../../../../scenarios/timer-start-event/scenario.json", import.meta.url));
  const { semanticProcess } = await compileExecutionInput(scenario, new URL("../../../../scenarios/timer-start-event/process.bpmn", import.meta.url));
  const [start, completion] = scenario.stimuli;
  assert.ok(start?.kind === StimulusKind.TriggerTimerStart);
  assert.ok(completion?.kind === StimulusKind.CompleteUserTaskInstance);
  const expected = runScenario(scenario, semanticProcess);
  const bundle = await loadBpmnWorkflowBundle();
  const candidateBundle = await bundleWorkflowCode({
    workflowsPath: fileURLToPath(import.meta.resolve("@bpmn-lean/temporal-workflow/workflows")),
    workflowInterceptorModules: [fileURLToPath(new URL("./worker-deployment-query-mutant-workflows.ts", import.meta.url))],
    logger: new DefaultLogger("ERROR"),
  });
  const version = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(bundle) };
  const candidateVersion = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(candidateBundle) };
  assert.notEqual(version.buildId, candidateVersion.buildId);
  const namespace = "native-schedule-fresh";
  const taskQueue = "native-schedule";
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "native-schedule-server", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "native Schedule server startup");
  let runtime: ExternalTemporalRuntime | undefined;
  let candidate: ExternalTemporalRuntime | undefined;
  const scheduleClient = createLazyTemporalClientRuntime({ address: environment.address, namespace, connectTimeoutMs: 5_000 });
  try {
    runtime = await ExternalTemporalRuntime.initializeFreshNamespace({
      address: environment.address, namespace, taskQueue, identity: "native-schedule-a",
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, 86_400, bundle);
    const client = new WorkflowClient({ connection: environment.nativeConnection, namespace });
    candidate = await ExternalTemporalRuntime.connectBundle({
      address: environment.address, namespace, taskQueue, identity: "native-schedule-b",
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, candidateBundle);
    await eventually(() => requireWorkerDeploymentRegistration(client, taskQueue, candidateVersion));
    assert.deepEqual(await requireWorkerDeploymentEnrollment(client, taskQueue), version);
    const scheduleId = "native-schedule-created-under-a";
    const configuredWorkflowId = processWorkflowId(start.instanceId);
    const dueAtEpochMs = Math.ceil(Date.now() / 1_000) * 1_000 + 8_000;
    assert.deepEqual(await createTemporalDefinitionSchedule(scheduleClient.client, {
      scheduleId, dueAtEpochMs, start, semanticProcess, configuredWorkflowId, taskQueue,
    }), { kind: "created" });
    const before = await describeTemporalDefinitionSchedule(scheduleClient.client, scheduleId);
    assert.deepEqual(before.action.args, [start, semanticProcess, productionBpmnWorkflowInitialHostInput()]);
    assert.equal(before.info.numActionsTaken, 0);
    await selectCurrent(client, taskQueue, candidateVersion, version);
    assert.ok(Date.now() < dueAtEpochMs, "promotion must finish before the selected future action");
    await eventually(async () => {
      const current = await describeTemporalDefinitionSchedule(scheduleClient.client, scheduleId);
      assert.equal(current.info.numActionsTaken, 1);
    });
    const taken = await describeTemporalDefinitionSchedule(scheduleClient.client, scheduleId);
    assert.deepEqual(taken.action, before.action);
    assert.deepEqual(taken.spec, before.spec);
    assert.equal(taken.info.recentActions.length, 1);
    const action = taken.info.recentActions[0];
    assert.ok(action !== undefined);
    assert.equal(action.scheduledAtEpochMs, dueAtEpochMs);
    assert.equal(action.action.type, "startWorkflow");
    const { workflowId, firstExecutionRunId } = action.action.workflow;
    assert.notEqual(workflowId, configuredWorkflowId);
    assert.notEqual(firstExecutionRunId, "");
    await assert.rejects(client.getHandle(configuredWorkflowId).describe(), WorkflowNotFoundError);
    const handle = client.getHandle(workflowId, firstExecutionRunId);
    await waitForOpenUserTaskIds(handle, [completion.taskId.elementId]);
    await requirePinned(handle, candidateVersion);
    await assert.rejects(requirePinned(handle, version), assert.AssertionError);
    const outcome = await client.connection.withDeadline(Date.now() + 5_000, () => handle.executeUpdate(
      bpmnCompleteUserTaskUpdateName, { args: [completion], updateId: contentBoundUpdateId(completion) },
    ));
    assert.equal(outcome, CommandOutcome.Committed);
    const terminal = await readTestProcessTerminalResult(handle);
    assert.deepEqual(terminal.receipt.finalState, expected.trace.at(-1));
    assert.deepEqual(await handle.query(bpmnTraceQueryName), expected.trace);
    const history = await handle.fetchHistory();
    const starts = history.events?.filter((event) => event.workflowExecutionStartedEventAttributes !== undefined && event.workflowExecutionStartedEventAttributes !== null);
    assert.equal(starts?.length, 1);
    assert.deepEqual(starts?.[0]?.workflowExecutionStartedEventAttributes?.input?.payloads?.map(decodeJsonPayload), before.action.args);
    await replayBpmnHistory(candidateBundle, history, workflowId);
    await eventually(async () => {
      const exhausted = await describeTemporalDefinitionSchedule(scheduleClient.client, scheduleId);
      assert.equal(exhausted.state.remainingActions, 0);
      assert.equal(exhausted.info.numActionsTaken, 1);
      assert.deepEqual(exhausted.info.nextActionEpochMs, []);
      assert.deepEqual(exhausted.info.runningActions, []);
    });
  } finally {
    await scheduleClient.close();
    await candidate?.shutdown();
    await runtime?.shutdown();
    await environment.teardown();
  }
});
