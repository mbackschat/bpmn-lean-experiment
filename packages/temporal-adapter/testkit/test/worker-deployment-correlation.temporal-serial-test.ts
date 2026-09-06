import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WorkflowClient } from "@temporalio/client";
import type { WorkflowHandle } from "@temporalio/client";
import { DefaultLogger, Worker, bundleWorkflowCode } from "@temporalio/worker";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { publishBpmnDefinitionCorrelatedMessage } from "@bpmn-lean/engine-api";
import type { TemporalCorrelatedMessageClient } from "@bpmn-lean/temporal-client/correlation-publication";
import {
  CanonicalObservationKind, CommandOutcome, CorrelatedMessageInteractionKind,
  compareCanonicalStrings, runEnginePopulationScenario,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, EnginePopulationScenario, StateObservation } from "@bpmn-lean/semantic-core";
import {
  bpmnWorkerDeploymentName, requireWorkerDeploymentEnrollment, requireWorkerDeploymentRegistration,
  startBpmnProcess, submitMessageDelivery,
} from "@bpmn-lean/temporal-client";
import {
  bpmnDeliverCorrelatedMessageUpdateName, bpmnResolveCorrelationCandidateScanActivityName,
  bpmnResolveCorrelationTargetDeliveryActivityName, bpmnTraceQueryName,
  correlationIngressWorkflowId, processWorkflowId, requireCorrelationTargetDeliveryActivityRequest,
} from "@bpmn-lean/temporal-protocol";
import type { BpmnProcessWorkflow, CorrelationCandidateScanActivityRequest, CorrelationTargetDeliveryActivityRequest } from "@bpmn-lean/temporal-protocol";
import {
  ExternalTemporalRuntime, boundEffectActivities, createCorrelationCandidateScanActivities,
  createCorrelationRegistrationActivities, createCorrelationTargetDeliveryActivities,
  loadBpmnWorkflowBundle, workflowBundleBuildId,
} from "@bpmn-lean/temporal-worker";
import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-testkit";
import { loadJson, temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory } from "./temporal-worker-test-support.ts";
import { waitForMessageState } from "./message-temporal-test-support.ts";
import { eventually, requirePinned, selectCurrent } from "./native-worker-deployment-live-test-support.ts";

test("one A ingress scans both native versions and recovers delivery to B without rematching", async () => {
  const bundle = await loadBpmnWorkflowBundle();
  const candidateBundle = await bundleWorkflowCode({
    workflowsPath: fileURLToPath(import.meta.resolve("@bpmn-lean/temporal-workflow/workflows")),
    workflowInterceptorModules: [fileURLToPath(new URL("./worker-deployment-query-mutant-workflows.ts", import.meta.url))],
    logger: new DefaultLogger("ERROR"),
  });
  const version = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(bundle) };
  const candidateVersion = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(candidateBundle) };
  assert.notEqual(version.buildId, candidateVersion.buildId);
  for (const kind of ["unique", "ambiguous"] as const) {
    const scenario = await loadJson<EnginePopulationScenario>(new URL(`../../../../scenarios/message-key-correlation/${kind}.population-scenario.json`, import.meta.url));
    const definition = scenario.definitions[0];
    assert.ok(definition !== undefined);
    assert.equal(scenario.definitions.length, 1);
    const compiled = await compileBpmnToSemanticProcess({
      bytes: await readFile(new URL(`../../../../${definition.relativePath}`, import.meta.url)),
      sourceId: definition.id, expectedSha256: definition.sha256, sourceOverlay: null,
      semanticProfile: scenario.profile, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
    });
    assert.ok(compiled.status === BpmnCompilationStatus.Accepted);
    const program = compiled.semanticProcess;
    const expected = runEnginePopulationScenario(scenario, new Map([[definition.id, program]]));
    assert.ok(expected !== null);
    const namespace = `native-correlation-${kind}`;
    const taskQueue = "native-correlation";
    const environment = await withDeadline(createCachedLocalEnvironment({
      identity: `native-correlation-${kind}-server`, downloadDirectory: temporalCacheDirectory,
    }), 40_000, "native correlation server startup");
    let initializer: ExternalTemporalRuntime | undefined;
    let candidate: ExternalTemporalRuntime | undefined;
    let worker: Worker | undefined;
    let workerCompletion: Promise<void> | undefined;
    try {
      initializer = await ExternalTemporalRuntime.initializeFreshNamespace({
        address: environment.address, namespace, taskQueue, identity: "native-correlation-initializer",
      }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, 86_400, bundle);
      await initializer.shutdown();
      initializer = undefined;
      const client = new WorkflowClient({ connection: environment.nativeConnection, namespace });
      const deliveryAttempts: CorrelationTargetDeliveryActivityRequest[] = [];
      const scannedPopulations: string[][] = [];
      const scans = createCorrelationCandidateScanActivities(client);
      const deliveries = createCorrelationTargetDeliveryActivities(client);
      worker = await Worker.create({
        connection: environment.nativeConnection, namespace, taskQueue, identity: "native-correlation-a-response-loss",
        workflowBundle: bundle,
        workerDeploymentOptions: { version, useWorkerVersioning: true, defaultVersioningBehavior: "PINNED" },
        activities: {
          ...boundEffectActivities({ executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }),
          ...createCorrelationRegistrationActivities(client, taskQueue),
          [bpmnResolveCorrelationCandidateScanActivityName]: async (value: CorrelationCandidateScanActivityRequest) => {
            const result = await scans[bpmnResolveCorrelationCandidateScanActivityName](value);
            scannedPopulations.push(result.candidates.map((item) => item.processInstanceId).sort(compareCanonicalStrings));
            return result;
          },
          [bpmnResolveCorrelationTargetDeliveryActivityName]: async (value: unknown) => {
            const request = requireCorrelationTargetDeliveryActivityRequest(value);
            deliveryAttempts.push(request);
            const result = await deliveries[bpmnResolveCorrelationTargetDeliveryActivityName](request);
            if (deliveryAttempts.length === 1) throw new Error("injected post-commit Activity response loss");
            return result;
          },
        },
      });
      workerCompletion = worker.run();
      const publication = scenario.publications[0];
      assert.ok(publication !== undefined);
      const ingressId = correlationIngressWorkflowId(publication.address);
      const ingress = client.getHandle(ingressId);
      const processes: WorkflowHandle<BpmnProcessWorkflow>[] = [];
      // DEPLOY-PROTOCOL-01 requires the unique match to enroll under B after A creates the shared ingress.
      const instanceA = scenario.instances[1];
      const instanceB = scenario.instances[0];
      assert.ok(instanceA !== undefined && instanceB !== undefined);
      for (const [index, instance] of [instanceA, instanceB].entries()) {
        if (index === 1) {
          await requirePinned(ingress, version);
          candidate = await ExternalTemporalRuntime.connectBundle({
            address: environment.address, namespace, taskQueue, identity: "native-correlation-b",
          }, { executeBpmnEffect: async () => ({ kind: "technicalFailure" }) }, candidateBundle);
          await eventually(() => requireWorkerDeploymentRegistration(client, taskQueue, candidateVersion));
          assert.deepEqual(await requireWorkerDeploymentEnrollment(client, taskQueue), version);
          await selectCurrent(client, taskQueue, candidateVersion, version);
        }
        const [start, opening] = instance.stimuli;
        assert.equal((await startBpmnProcess(client, start, program, { taskQueue })).kind, "started");
        const process = client.getHandle<BpmnProcessWorkflow>(processWorkflowId(start.instanceId));
        processes.push(process);
        await waitForMessageState(process, (state) => state.openMessageSubscriptions.some(({ id }) => id.elementId === opening.subscriptionId.elementId));
        assert.deepEqual(await submitMessageDelivery(client, start.instanceId, opening), {
          kind: "semantic", commandId: opening.commandId, outcome: CommandOutcome.Committed,
        });
        await waitForMessageState(process, (state) => state.enabledInteractions.some((interaction) =>
          interaction.kind === CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage));
        await requirePinned(process, index === 0 ? version : candidateVersion);
      }
      await requirePinned(ingress, version);
      const resolution = await publishBpmnDefinitionCorrelatedMessage({
        temporalClient: client as unknown as TemporalCorrelatedMessageClient,
        commandId: publication.commandId, address: publication.address, payload: publication.payload, taskQueue,
      });
      assert.ok(resolution.kind === "semantic");
      const processStates = await Promise.all(processes.map(latestState));
      processStates.sort((left, right) => compareCanonicalStrings(left.instanceId, right.instanceId));
      assert.deepEqual({
        kind: "enginePopulationResult", scenarioId: scenario.id,
        publicationResults: [{ commandId: resolution.commandId, ingressOrdinal: resolution.ingressOrdinal, outcome: resolution.outcome }],
        ingressOrdinals: [{ commandId: resolution.commandId, ingressOrdinal: resolution.ingressOrdinal }], processStates,
      }, expected);
      assert.deepEqual(scannedPopulations, [[instanceA.stimuli[0].instanceId, instanceB.stimuli[0].instanceId].sort(compareCanonicalStrings)]);
      assert.equal(deliveryAttempts.length, kind === "unique" ? 2 : 0);
      if (kind === "unique") {
        assert.deepEqual(deliveryAttempts[1], deliveryAttempts[0]);
        assert.equal(deliveryAttempts[0]?.target.processInstanceId, instanceB.stimuli[0].instanceId);
      }
      assert.deepEqual(await publishBpmnDefinitionCorrelatedMessage({
        temporalClient: client as unknown as TemporalCorrelatedMessageClient,
        commandId: publication.commandId, address: publication.address, payload: publication.payload, taskQueue,
      }), resolution);
      assert.equal(scannedPopulations.length, 1);
      assert.equal(deliveryAttempts.length, kind === "unique" ? 2 : 0);
      for (const [index, process] of processes.entries()) {
        const history = await process.fetchHistory();
        const deliveriesInHistory = history.events?.filter((event) =>
          event.workflowExecutionUpdateAcceptedEventAttributes?.acceptedRequest?.input?.name === bpmnDeliverCorrelatedMessageUpdateName);
        assert.equal(deliveriesInHistory?.length, kind === "unique" && index === 1 ? 1 : 0);
        await replayBpmnHistory(index === 0 ? bundle : candidateBundle, history, process.workflowId);
      }
      await requirePinned(ingress, version);
      await replayBpmnHistory(bundle, await ingress.fetchHistory(), ingressId);
    } finally {
      await candidate?.shutdown();
      worker?.shutdown();
      await workerCompletion;
      await initializer?.shutdown();
      await environment.teardown();
    }
  }
});

async function latestState(process: WorkflowHandle<BpmnProcessWorkflow>): Promise<StateObservation> {
  const trace = await process.query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName);
  const state = trace.findLast((observation): observation is StateObservation => observation.kind === CanonicalObservationKind.State);
  assert.ok(state !== undefined);
  return state;
}
