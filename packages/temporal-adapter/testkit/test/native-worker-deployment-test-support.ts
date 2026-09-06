import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkerOptions, WorkflowBundleWithSourceMap } from "@temporalio/worker";
import {
  bpmnWorkerDeploymentName,
  requireWorkerDeploymentEnrollment,
  requireWorkerDeploymentRegistration,
} from "@bpmn-lean/temporal-client";
import { workflowBundleBuildId } from "@bpmn-lean/temporal-worker";

const initializedQueues = new WeakMap<TestWorkflowEnvironment, Set<string>>();

export function nativeTestWorkerDeploymentOptions(bundle: WorkflowBundleWithSourceMap): NonNullable<WorkerOptions["workerDeploymentOptions"]> {
  return {
    version: { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(bundle) },
    useWorkerVersioning: true,
    defaultVersioningBehavior: "PINNED",
  };
}

/** Test-owned fresh servers select their first Current before creating any fixture Workflow or Schedule. */
export async function initializeTestOwnedDeployment(
  environment: TestWorkflowEnvironment,
  taskQueue: string,
  bundle: WorkflowBundleWithSourceMap,
): Promise<void> {
  const client = environment.client.workflow;
  const queues = initializedQueues.get(environment) ?? new Set<string>();
  const firstWorker = !queues.has(taskQueue);
  queues.add(taskQueue);
  initializedQueues.set(environment, queues);
  const version = { deploymentName: bpmnWorkerDeploymentName, buildId: workflowBundleBuildId(bundle) };
  const deadline = Date.now() + 20_000;
  await waitFor(async () => requireWorkerDeploymentRegistration(client, taskQueue, version, deadline), deadline);
  const described = await client.connection.withDeadline(Math.min(Date.now() + 5_000, deadline), () => client.workflowService.describeWorkerDeployment({
    namespace: client.options.namespace, deploymentName: bpmnWorkerDeploymentName,
  }));
  const routing = described.workerDeploymentInfo?.routingConfig;
  assert.equal(routing?.rampingDeploymentVersion ?? null, null);
  assert.equal(routing?.rampingVersion ?? "", "");
  assert.equal(routing?.rampingVersionPercentage ?? 0, 0);
  if (routing?.currentDeploymentVersion == null) {
    assert.ok(firstWorker, "a replacement test Worker must not initialize Current");
    assert.ok(!routing?.currentVersion || routing.currentVersion === "__unversioned__");
    assert.ok(described.conflictToken?.length);
    await client.connection.withDeadline(Math.min(Date.now() + 5_000, deadline), () => client.workflowService.setWorkerDeploymentCurrentVersion({
      namespace: client.options.namespace, deploymentName: version.deploymentName, buildId: version.buildId,
      conflictToken: described.conflictToken, identity: client.options.identity,
    }));
  }
  await waitFor(async () => { await requireWorkerDeploymentEnrollment(client, taskQueue, deadline); }, deadline);
}

async function waitFor(operation: () => Promise<void>, deadline: number): Promise<void> {
  let failure: unknown;
  do {
    try { await operation(); return; } catch (error: unknown) { failure = error; }
    await delay(Math.min(50, Math.max(0, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw failure;
}
