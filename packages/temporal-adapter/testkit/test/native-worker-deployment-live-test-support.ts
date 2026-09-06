import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { WorkflowClient, WorkflowHandle } from "@temporalio/client";
import proto from "@temporalio/proto";
import { requireWorkerDeploymentEnrollment } from "@bpmn-lean/temporal-client";

type NativeVersion = Readonly<{ deploymentName: string; buildId: string }>;

export async function requirePinned(handle: WorkflowHandle, version: NativeVersion): Promise<void> {
  const described = await handle.describe();
  const pinned = described.raw.workflowExecutionInfo?.versioningInfo;
  assert.equal(pinned?.behavior, proto.temporal.api.enums.v1.VersioningBehavior.VERSIONING_BEHAVIOR_PINNED);
  assert.deepEqual(pinned?.deploymentVersion && {
    deploymentName: pinned.deploymentVersion.deploymentName, buildId: pinned.deploymentVersion.buildId,
  }, version);
  assert.equal(pinned?.versioningOverride ?? null, null);
  assert.equal(pinned?.versionTransition ?? null, null);
}

export async function selectCurrent(client: WorkflowClient, taskQueue: string, version: NativeVersion, previous: NativeVersion): Promise<void> {
  const namespace = client.options.namespace;
  const described = await client.connection.withDeadline(Date.now() + 5_000, () => client.workflowService.describeWorkerDeployment({
    namespace, deploymentName: version.deploymentName,
  }));
  const current = described.workerDeploymentInfo?.routingConfig?.currentDeploymentVersion;
  assert.deepEqual(current && { deploymentName: current.deploymentName, buildId: current.buildId }, previous);
  await client.connection.withDeadline(Date.now() + 5_000, () => client.workflowService.setWorkerDeploymentCurrentVersion({
    namespace, deploymentName: version.deploymentName, buildId: version.buildId,
    conflictToken: described.conflictToken, identity: "native-pinning-promoter",
  }));
  await eventually(async () => assert.deepEqual(await requireWorkerDeploymentEnrollment(client, taskQueue), version));
}

export async function eventually(operation: () => Promise<void>): Promise<void> {
  const deadline = Date.now() + 10_000;
  let failure: unknown;
  do {
    try { await operation(); return; } catch (error: unknown) { failure = error; }
    await delay(50);
  } while (Date.now() < deadline);
  throw failure;
}
