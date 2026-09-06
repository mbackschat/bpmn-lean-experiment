import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CommandOutcome, MessageChannelKind, SemanticProcessCompilerId, StimulusKind, VariableValueKind, runScenario } from "@bpmn-lean/semantic-core";
import type { CompleteUserTaskInstanceStimulus, CorrelatedMessageAddress, Scenario, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { WorkflowClient } from "@temporalio/client";
import type { WorkflowHandle } from "@temporalio/client";
import { DefaultLogger, Worker, bundleWorkflowCode } from "@temporalio/worker";
import proto from "@temporalio/proto";
import {
  bpmnWorkerDeploymentName,
  requireWorkerDeploymentEnrollment,
  requireWorkerDeploymentRegistration,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-client";
import {
  bpmnProcessWorkflowType,
  bpmnCorrelationIngressWorkflowType,
  bpmnCorrelationIngressConfigurationQueryName,
  bpmnPrepareCorrelationCandidateUpdateName,
  bpmnFinalizeCorrelationCandidateUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnExecutionPublicationQueryName,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowPublicationSegmentQueryName,
  buildWorkflowChainRecoveryRequest,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowPublicationSegmentSelectionQueryName,
  bpmnWorkflowPublicationSegmentsV1,
  ExecutionPublicationResultKind,
  processWorkflowId,
  correlationIngressWorkflowId,
  createCorrelationIngressEcho,
  requireCorrelationIngressEcho,
  productionCorrelationIngressConfiguration,
  prepareCorrelationCandidateRegistrationUpdateId,
  finalizeCorrelationCandidateRegistrationUpdateId,
  CorrelationCandidateRegistrationResultKind,
  productionBpmnWorkflowInitialHostInput,
  requireExecutionPublicationResult,
  requireFlowNodeOccurrencePublicationResult,
  requireWorkflowChainCommandRecoveryResponse,
  requireWorkflowPublicationSegmentQueryResultV1,
  requireWorkflowPublicationSegmentSelectionResultV1,
  WorkflowPublicationSegmentSelectionResultKind,
  WorkflowPublicationSegmentQueryResultKind,
  WorkflowChainCommandRecoveryResponseKind,
} from "@bpmn-lean/temporal-protocol";
import type { BpmnProcessWorkflow, CorrelationCandidateRegistrationRequest, CorrelationCandidateRegistrationResult, ExecutionPublicationResult } from "@bpmn-lean/temporal-protocol";
import {
  ExternalTemporalRuntime,
  loadBpmnWorkflowBundle,
  workflowBundleBuildId,
} from "@bpmn-lean/temporal-worker";
import { createCachedLocalEnvironment, readTestProcessTerminalResult } from "@bpmn-lean/temporal-testkit";

import { compileExecutionInput, loadJson, temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, waitForOpenUserTaskIds } from "./temporal-worker-test-support.ts";
import { eventually, requirePinned, selectCurrent } from "./native-worker-deployment-live-test-support.ts";

const { VersioningBehavior, RoutingConfigUpdateState } = proto.temporal.api.enums.v1;
const namespace = "native-pinning-fresh";
const taskQueue = "native-pinning";

test("native pinning preserves retained A Queries while a replay-compatible Query mutant B is Current", async () => {
  const scenario = await loadJson<Scenario>(new URL("../../../../scenarios/user-task-cycle/scenario.json", import.meta.url));
  const { semanticProcess } = await compileExecutionInput(scenario, new URL("../../../../scenarios/user-task-cycle/process.bpmn", import.meta.url));
  const original = scenario.stimuli[0];
  assert.ok(original?.kind === StimulusKind.StartProcess);
  const start = { ...original, instanceId: "NativePinning_A" };
  const bundle = await loadBpmnWorkflowBundle();
  const version = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(bundle) };
  const candidateBundle = await bundleWorkflowCode({
    workflowsPath: fileURLToPath(import.meta.resolve("@bpmn-lean/temporal-workflow/workflows")),
    workflowInterceptorModules: [fileURLToPath(new URL("./worker-deployment-query-mutant-workflows.ts", import.meta.url))],
    logger: new DefaultLogger("ERROR"),
  });
  const candidateVersion = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(candidateBundle) };
  assert.notEqual(candidateVersion.buildId, version.buildId);
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "native-pinning-server", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "native pinning server startup");
  let runtime: ExternalTemporalRuntime | undefined;
  let candidate: ExternalTemporalRuntime | undefined;
  try {
    runtime = await ExternalTemporalRuntime.initializeFreshNamespace({
      address: environment.address, namespace, taskQueue, identity: "native-a",
      expectedBundleSha256: version.buildId,
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, 86_400, bundle);
    const client = new WorkflowClient({ connection: environment.nativeConnection, namespace });
    await eventually(() => requireWorkerDeploymentRegistration(client, taskQueue, version));
    await eventually(async () => {
      assert.deepEqual(await requireWorkerDeploymentEnrollment(client, taskQueue), version);
      const described = await client.connection.withDeadline(Date.now() + 5_000, () => client.workflowService.describeWorkerDeployment({
        namespace, deploymentName: bpmnWorkerDeploymentName,
      }));
      assert.equal(described.workerDeploymentInfo?.routingConfigUpdateState, RoutingConfigUpdateState.ROUTING_CONFIG_UPDATE_STATE_COMPLETED);
    });
    const handle = await client.start<BpmnProcessWorkflow>(bpmnProcessWorkflowType, {
      args: [start, semanticProcess, productionBpmnWorkflowInitialHostInput()],
      taskQueue, workflowId: processWorkflowId(start.instanceId), workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    await waitForOpenUserTaskIds(handle, ["Review"]);
    await requirePinned(handle, version);
    const completed = await startCycle(client, scenario, semanticProcess, "NativePinning_Completed_A");
    await completeCycle(client, completed, scenario, semanticProcess);
    const failed = await startCycle(client, scenario, semanticProcess, "NativePinning_Failed_A");
    await completeTask(client, cycleCompletion(scenario, 1, failed.instanceId));
    await failed.handle.signal(bpmnDeliverMessageSignalName, {
      kind: StimulusKind.DeliverMessage,
      commandId: "x".repeat(300 * 1024),
      subscriptionId: { processInstanceId: failed.instanceId, elementId: "AbsentCatch", activation: 1 },
      channel: { kind: MessageChannelKind.OperationMessage, interfaceId: "Interface", interfaceOperationId: "Operation", messageId: "Message" },
    });
    await assert.rejects(failed.handle.result(), (error: unknown) =>
      error instanceof Error && "cause" in error && error.cause instanceof Error &&
      "type" in error.cause && error.cause.type === bpmnWorkflowChainCapacityExhaustedFailureType);
    const continued = await startCycle(client, scenario, semanticProcess, "NativePinning_Continued_A", true);
    const firstContinuedRun = (await continued.handle.describe()).runId;

    const completedHistory = await completed.handle.fetchHistory();
    await replayBpmnHistory(candidateBundle, completedHistory, completed.handle.workflowId);
    candidate = await ExternalTemporalRuntime.connectBundle({
      address: environment.address, namespace, taskQueue, identity: "native-b",
      expectedBundleSha256: candidateVersion.buildId,
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, candidateBundle);
    await eventually(() => requireWorkerDeploymentRegistration(client, taskQueue, candidateVersion));
    assert.deepEqual(await requireWorkerDeploymentEnrollment(client, taskQueue), version, "candidate registration must not promote itself");
    await selectCurrent(client, taskQueue, candidateVersion, version);

    const runningCompletion = cycleCompletion(scenario, 1, start.instanceId);
    await completeTask(client, runningCompletion);
    await waitForOpenUserTaskIds(handle, ["Review"]);
    await requirePinned(handle, version);
    const continuedCompletion = cycleCompletion(scenario, 1, continued.instanceId);
    await completeTask(client, continuedCompletion);
    await eventually(async () => assert.notEqual((await continued.handle.describe()).runId, firstContinuedRun));
    await waitForOpenUserTaskIds(continued.handle, ["Review"]);
    await requirePinned(continued.handle, version);
    const oldContinued = client.getHandle(continued.handle.workflowId, firstContinuedRun);
    await requirePinned(oldContinued, version);

    const retained = [];
    for (const [current, instanceId] of [
      [handle, start.instanceId],
      [completed.handle, completed.instanceId],
      [failed.handle, failed.instanceId],
      [oldContinued, continued.instanceId],
      [continued.handle, continued.instanceId],
    ] as const) {
      const exact = client.getHandle(current.workflowId, (await current.describe()).runId);
      await requirePinned(exact, version);
      const publication = await queryPublication(client, exact, semanticProcess, instanceId);
      assert.equal(hasCandidateProjection(publication.execution), false);
      const recoveryRequest = buildWorkflowChainRecoveryRequest(instanceId, cycleCompletion(scenario, 1, instanceId));
      const recovery = requireWorkflowChainCommandRecoveryResponse(
        await client.connection.withDeadline(Date.now() + 5_000, () => exact.query(bpmnWorkflowChainCommandRecoveryQueryName, recoveryRequest)), recoveryRequest,
      );
      assert.ok(recovery.kind === WorkflowChainCommandRecoveryResponseKind.Resolved);
      assert.equal(recovery.outcome, CommandOutcome.Committed);
      retained.push({ handle: exact, instanceId, request: publication.request, recoveryRequest, bytes: JSON.stringify({ publication, recovery }) });
    }
    const newCandidate = await startCycle(client, scenario, semanticProcess, "NativePinning_B");
    await requirePinned(newCandidate.handle, candidateVersion);
    assert.equal(hasCandidateProjection((await queryPublication(client, newCandidate.handle, semanticProcess, newCandidate.instanceId)).execution), true);
    await completeCycle(client, newCandidate, scenario, semanticProcess);

    await runtime.shutdown();
    runtime = undefined;
    for (const retainedRun of retained) {
      await assert.rejects(client.connection.withDeadline(Date.now() + 400, () =>
        retainedRun.handle.query(bpmnWorkflowPublicationSegmentQueryName, retainedRun.request)));
      await assert.rejects(client.connection.withDeadline(Date.now() + 400, () =>
        retainedRun.handle.query(bpmnWorkflowChainCommandRecoveryQueryName, retainedRun.recoveryRequest)));
    }
    runtime = await ExternalTemporalRuntime.connectBundle({
      address: environment.address, namespace, taskQueue, identity: "native-a-restored",
      expectedBundleSha256: version.buildId,
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, bundle);
    for (const retainedRun of retained) {
      const publication = await queryPublication(client, retainedRun.handle, semanticProcess, retainedRun.instanceId);
      const recovery = requireWorkflowChainCommandRecoveryResponse(
        await client.connection.withDeadline(Date.now() + 5_000, () => retainedRun.handle.query(bpmnWorkflowChainCommandRecoveryQueryName, retainedRun.recoveryRequest)), retainedRun.recoveryRequest,
      );
      assert.equal(JSON.stringify({ publication, recovery }), retainedRun.bytes);
      await replayBpmnHistory(bundle, await retainedRun.handle.fetchHistory(), retainedRun.handle.workflowId);
    }
    await replayBpmnHistory(candidateBundle, await newCandidate.handle.fetchHistory(), newCandidate.handle.workflowId);
  } finally {
    await candidate?.shutdown();
    await runtime?.shutdown();
    await environment.teardown();
  }
});

test("native ingress continuation preserves its A pin and pending registration after B becomes Current", async () => {
  const workflowsPath = fileURLToPath(new URL("./worker-deployment-continuation-workflows.ts", import.meta.url));
  const bundle = await bundleWorkflowCode({ workflowsPath, logger: new DefaultLogger("ERROR") });
  const candidateBundle = await bundleWorkflowCode({
    workflowsPath,
    workflowInterceptorModules: [fileURLToPath(new URL("./worker-deployment-query-mutant-workflows.ts", import.meta.url))],
    logger: new DefaultLogger("ERROR"),
  });
  const version = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(bundle) };
  const candidateVersion = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(candidateBundle) };
  assert.notEqual(version.buildId, candidateVersion.buildId);
  const address: CorrelatedMessageAddress = {
    definition: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "message-key-correlation-checkpoint",
      sourceId: "settlement-confirmation-native-pinning",
      sourceSha256: "a".repeat(64), sourceOverlay: null,
    },
    processId: "Process_SettlementConfirmation",
    channel: {
      kind: MessageChannelKind.OperationMessage,
      interfaceId: "Interface_Settlement",
      interfaceOperationId: "Operation_ConfirmSettlement",
      messageId: "Message_SettlementConfirmed",
    },
    correlationKeyId: "CorrelationKey_Settlement",
  };
  const registration: CorrelationCandidateRegistrationRequest = {
    transactionId: "Registration_Native_A",
    candidate: {
      address, processInstanceId: "ProcessInstance_1",
      subscriptionId: { processInstanceId: "ProcessInstance_1", elementId: "Catch_SettlementConfirmed", activation: 1 },
      correlationPropertyId: "CorrelationProperty_SettlementReference",
      processPropertyId: "Property_SettlementReference",
      key: { kind: VariableValueKind.String, value: "settlement-42" },
    },
    processLocator: { workflowId: "bpmn-process-sha256:test-process" },
  };
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "native-ingress-pinning-server", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "native ingress pinning server startup");
  let runtime: ExternalTemporalRuntime | undefined;
  let candidate: ExternalTemporalRuntime | undefined;
  try {
    runtime = await ExternalTemporalRuntime.initializeFreshNamespace({
      address: environment.address, namespace, taskQueue, identity: "native-ingress-a",
      expectedBundleSha256: version.buildId,
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, 86_400, bundle);
    const client = new WorkflowClient({ connection: environment.nativeConnection, namespace });
    const handle = await client.start(bpmnCorrelationIngressWorkflowType, {
      args: [address, productionCorrelationIngressConfiguration],
      taskQueue, workflowId: correlationIngressWorkflowId(address), workflowIdReusePolicy: "REJECT_DUPLICATE",
    });
    const expectedEcho = createCorrelationIngressEcho(address, productionCorrelationIngressConfiguration);
    await eventually(async () => assert.deepEqual(requireCorrelationIngressEcho(
      await client.connection.withDeadline(Date.now() + 5_000, () => handle.query(bpmnCorrelationIngressConfigurationQueryName)),
    ), expectedEcho));
    await requirePinned(handle, version);
    const firstRunId = (await handle.describe()).runId;
    candidate = await ExternalTemporalRuntime.connectBundle({
      address: environment.address, namespace, taskQueue, identity: "native-ingress-b",
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, candidateBundle);
    await eventually(() => requireWorkerDeploymentRegistration(client, taskQueue, candidateVersion));
    assert.deepEqual(await requireWorkerDeploymentEnrollment(client, taskQueue), version);
    await selectCurrent(client, taskQueue, candidateVersion, version);
    const prepared = await client.connection.withDeadline(Date.now() + 5_000, () => handle.executeUpdate<CorrelationCandidateRegistrationResult, [CorrelationCandidateRegistrationRequest]>(
      bpmnPrepareCorrelationCandidateUpdateName,
      { args: [registration], updateId: prepareCorrelationCandidateRegistrationUpdateId(registration) },
    ));
    assert.equal(prepared.kind, CorrelationCandidateRegistrationResultKind.Prepared);
    await eventually(async () => assert.notEqual((await handle.describe()).runId, firstRunId));
    const successor = client.getHandle(handle.workflowId, (await handle.describe()).runId);
    const original = client.getHandle(handle.workflowId, firstRunId);
    for (const retained of [original, successor]) {
      await requirePinned(retained, version);
      const description = await retained.describe();
      assert.equal(description.type, bpmnCorrelationIngressWorkflowType);
      assert.equal(description.taskQueue, taskQueue);
      assert.deepEqual(requireCorrelationIngressEcho(await retained.query(bpmnCorrelationIngressConfigurationQueryName)), expectedEcho);
    }
    const finalized = await client.connection.withDeadline(Date.now() + 5_000, () => successor.executeUpdate<CorrelationCandidateRegistrationResult, [CorrelationCandidateRegistrationRequest]>(
      bpmnFinalizeCorrelationCandidateUpdateName,
      { args: [registration], updateId: finalizeCorrelationCandidateRegistrationUpdateId(registration) },
    ));
    assert.equal(finalized.kind, CorrelationCandidateRegistrationResultKind.Finalized);
    for (const retained of [original, successor]) {
      await replayBpmnHistory(bundle, await retained.fetchHistory(), retained.workflowId);
    }
    await runtime.shutdown();
    runtime = undefined;
    for (const retained of [original, successor]) {
      await assert.rejects(client.connection.withDeadline(Date.now() + 400, () => retained.query(bpmnCorrelationIngressConfigurationQueryName)));
    }
    runtime = await ExternalTemporalRuntime.connectBundle({
      address: environment.address, namespace, taskQueue, identity: "native-ingress-a-restored",
      expectedBundleSha256: version.buildId,
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, bundle);
    for (const retained of [original, successor]) {
      assert.deepEqual(requireCorrelationIngressEcho(await retained.query(bpmnCorrelationIngressConfigurationQueryName)), expectedEcho);
      await requirePinned(retained, version);
    }
  } finally {
    await candidate?.shutdown();
    await runtime?.shutdown();
    await environment.teardown();
  }
});

test("candidate registration preserves legacy unversioned history and its pending Schedule", async () => {
  const scenario = await loadJson<Scenario>(new URL("../../../../scenarios/user-task-cycle/scenario.json", import.meta.url));
  const { semanticProcess } = await compileExecutionInput(scenario, new URL("../../../../scenarios/user-task-cycle/process.bpmn", import.meta.url));
  const start = scenario.stimuli[0];
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const bundle = await loadBpmnWorkflowBundle();
  const candidateBundle = await bundleWorkflowCode({
    workflowsPath: fileURLToPath(import.meta.resolve("@bpmn-lean/temporal-workflow/workflows")),
    workflowInterceptorModules: [fileURLToPath(new URL("./worker-deployment-query-mutant-workflows.ts", import.meta.url))],
    logger: new DefaultLogger("ERROR"),
  });
  const environment = await withDeadline(createCachedLocalEnvironment({
    identity: "native-pinning-legacy-server", downloadDirectory: temporalCacheDirectory,
  }), 40_000, "legacy control server startup");
  let legacy: Worker | undefined;
  let completion: Promise<void> | undefined;
  let candidate: ExternalTemporalRuntime | undefined;
  try {
    legacy = await Worker.create({
      connection: environment.nativeConnection, taskQueue, workflowBundle: bundle,
      identity: "legacy-unversioned-a",
    });
    completion = legacy.run();
    const client = environment.client.workflow;
    const handle = await client.start(bpmnProcessWorkflowType, {
      args: [start, semanticProcess], taskQueue, workflowId: processWorkflowId(start.instanceId),
    });
    await waitForOpenUserTaskIds(handle, ["Review"]);
    const before = await handle.describe();
    assert.equal(before.raw.workflowExecutionInfo?.versioningInfo?.behavior ?? VersioningBehavior.VERSIONING_BEHAVIOR_UNSPECIFIED,
      VersioningBehavior.VERSIONING_BEHAVIOR_UNSPECIFIED);
    const publication = await handle.query(bpmnExecutionPublicationQueryName, { afterRevision: 0 });
    const schedule = await environment.client.schedule.create({
      scheduleId: "legacy-pending-action",
      spec: { calendars: [{ year: 2099, month: "JANUARY", dayOfMonth: 1, hour: 0, minute: 0, second: 0 }] },
      action: {
        type: "startWorkflow", workflowType: bpmnProcessWorkflowType, taskQueue,
        workflowId: "legacy-future-process", args: [{ ...start, instanceId: "LegacyFuture" }, semanticProcess],
      },
      state: { paused: true, remainingActions: 1 },
    });
    const scheduledBefore = await schedule.describe();
    const legacyNamespace = client.options.namespace;
    await assert.rejects(ExternalTemporalRuntime.initializeFreshNamespace({
      address: environment.address, namespace: legacyNamespace, taskQueue, identity: "legacy-init-refusal",
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, 86_400, candidateBundle), /already exists/iu);
    candidate = await ExternalTemporalRuntime.connectBundle({
      address: environment.address, namespace: legacyNamespace, taskQueue, identity: "legacy-candidate-b",
    }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, candidateBundle);
    await eventually(() => requireWorkerDeploymentRegistration(client, taskQueue, {
      deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(candidateBundle),
    }));
    await assert.rejects(requireWorkerDeploymentEnrollment(client, taskQueue));
    const deployment = await client.workflowService.describeWorkerDeployment({
      namespace: legacyNamespace, deploymentName: bpmnWorkerDeploymentName,
    });
    assert.equal(deployment.workerDeploymentInfo?.routingConfig?.currentDeploymentVersion ?? null, null);
    const after = await handle.describe();
    assert.equal(after.runId, before.runId);
    assert.equal(after.status.name, "RUNNING");
    assert.deepEqual(after.raw.workflowExecutionInfo?.versioningInfo, before.raw.workflowExecutionInfo?.versioningInfo);
    assert.deepEqual(await handle.query(bpmnExecutionPublicationQueryName, { afterRevision: 0 }), publication);
    const scheduledAfter = await schedule.describe();
    assert.deepEqual(scheduledAfter.action, scheduledBefore.action);
    assert.deepEqual(scheduledAfter.spec, scheduledBefore.spec);
    assert.deepEqual(scheduledAfter.state, scheduledBefore.state);
    assert.equal(scheduledAfter.info.numActionsTaken, 0);
  } finally {
    await candidate?.shutdown();
    legacy?.shutdown();
    await completion;
    await environment.teardown();
  }
});

async function startCycle(client: WorkflowClient, scenario: Scenario, program: SemanticProcessProgram, instanceId: string, forceContinuation = false) {
  const original = scenario.stimuli[0];
  assert.ok(original?.kind === StimulusKind.StartProcess);
  const start = { ...original, instanceId, commandId: `start-${instanceId}` };
  const hostInput = productionBpmnWorkflowInitialHostInput();
  const handle = await client.start<BpmnProcessWorkflow>(bpmnProcessWorkflowType, {
    args: [start, program, forceContinuation ? { ...hostInput, eventHistoryEventLimit: 4 } : hostInput],
    taskQueue, workflowId: processWorkflowId(instanceId), workflowIdReusePolicy: "REJECT_DUPLICATE",
  });
  await waitForOpenUserTaskIds(handle, ["Review"]);
  return { handle, instanceId, start };
}

function cycleCompletion(scenario: Scenario, index: number, instanceId: string): CompleteUserTaskInstanceStimulus {
  const original = scenario.stimuli[index];
  assert.ok(original?.kind === StimulusKind.CompleteUserTaskInstance);
  return { ...original, commandId: `${original.commandId}-${instanceId}`, taskId: { ...original.taskId, processInstanceId: instanceId } };
}

async function completeCycle(client: WorkflowClient, execution: Awaited<ReturnType<typeof startCycle>>, scenario: Scenario, program: SemanticProcessProgram): Promise<void> {
  const completions = [1, 2, 3].map((index) => cycleCompletion(scenario, index, execution.instanceId));
  for (const completion of completions) {
    await waitForOpenUserTaskIds(execution.handle, ["Review"]);
    await completeTask(client, completion);
  }
  const terminal = await readTestProcessTerminalResult(execution.handle);
  const expected = runScenario({ ...scenario, stimuli: [execution.start, ...completions] }, program);
  assert.deepEqual(terminal.receipt.finalState, expected.trace.at(-1));
}

async function completeTask(client: WorkflowClient, completion: CompleteUserTaskInstanceStimulus): Promise<void> {
  const result = await submitUserTaskCompletion(client, completion.taskId.processInstanceId, completion);
  assert.equal(result.kind, "semantic");
  assert.ok(result.kind === "semantic");
  assert.equal(result.outcome, CommandOutcome.Committed);
}

async function queryPublication(client: WorkflowClient, handle: WorkflowHandle, program: SemanticProcessProgram, instanceId: string) {
  const request = { protocol: bpmnWorkflowPublicationSegmentsV1, processInstanceId: instanceId, afterRevision: 0 };
  const selection = requireWorkflowPublicationSegmentSelectionResultV1(
    await client.connection.withDeadline(Date.now() + 5_000, () => handle.query(bpmnWorkflowPublicationSegmentSelectionQueryName, request)), request,
  );
  assert.ok(selection.kind === WorkflowPublicationSegmentSelectionResultKind.Available);
  const afterRevision = selection.currentRun.fromRevision;
  const segmentRequest = { ...request, afterRevision, descriptor: selection.currentRun, snapshot: selection.snapshot };
  const response = requireWorkflowPublicationSegmentQueryResultV1(
    await client.connection.withDeadline(Date.now() + 5_000, () => handle.query(bpmnWorkflowPublicationSegmentQueryName, segmentRequest)), segmentRequest,
  );
  assert.ok(response.kind === WorkflowPublicationSegmentQueryResultKind.Available);
  const execution = requireExecutionPublicationResult(response.execution, { program, processInstanceId: instanceId, afterRevision });
  assert.ok(execution.kind === ExecutionPublicationResultKind.Available);
  const flowNodeOccurrences = requireFlowNodeOccurrencePublicationResult(response.flowNodeOccurrences, {
    program, processInstanceId: instanceId, executionPublication: execution.page, afterRevision,
  });
  return { request: segmentRequest, execution, flowNodeOccurrences };
}

function hasCandidateProjection(publication: ExecutionPublicationResult): boolean {
  return publication.kind === ExecutionPublicationResultKind.Available && publication.page.current?.state.variables.some(({ name }) => name === "zzNativeQueryProjection") === true;
}
