import { setTimeout as delay } from "node:timers/promises";
import { status } from "@grpc/grpc-js";
import {
  bpmnWorkerDeploymentName,
  requireWorkerDeploymentEnrollment,
  requireWorkerDeploymentRegistration,
  WorkerDeploymentNotReady,
  type TemporalWorkflowClient,
} from "@bpmn-lean/temporal-client";
import proto from "@temporalio/proto";

const { RoutingConfigUpdateState } = proto.temporal.api.enums.v1;
type DeploymentInfo = proto.temporal.api.deployment.v1.IWorkerDeploymentInfo;
type DeploymentVersion = proto.temporal.api.deployment.v1.IWorkerDeploymentVersion;

/** DEPLOY-ENROLL-01 admits initialization only after native registration proves this Namespace was newly created. */
export async function registerFreshWorkflowNamespace(
  client: TemporalWorkflowClient,
  retentionSeconds: number,
): Promise<void> {
  const namespace = client.options.namespace;
  if (typeof namespace !== "string" || namespace.length === 0 || namespace.trim() !== namespace
    || !namespace.isWellFormed() || /[\u0000-\u001f\u007f]/u.test(namespace)) {
    throw new TypeError("Worker deployment initialization: an explicit well-formed namespace is required");
  }
  if (!Number.isSafeInteger(retentionSeconds) || retentionSeconds <= 0) {
    throw new TypeError("Worker deployment initialization: retention seconds must be a safe positive integer");
  }
  await client.connection.withDeadline(Date.now() + 5_000, () => client.workflowService.registerNamespace({
    namespace,
    workflowExecutionRetentionPeriod: proto.google.protobuf.Duration.fromObject({ seconds: retentionSeconds }),
  }));
}

/** Internal fresh-Namespace composition only; DEPLOY-PIN-01 excludes candidate startup promotion. */
export async function initializeWorkerDeploymentCurrent(
  client: TemporalWorkflowClient,
  taskQueue: string,
  buildId: string,
): Promise<void> {
  if (typeof buildId !== "string" || !/^[0-9a-f]{64}$/u.test(buildId)) {
    throw new TypeError("Worker deployment initialization: a lowercase SHA-256 Build ID is required");
  }
  const deadline = Date.now() + 20_000;
  const version = { deploymentName: bpmnWorkerDeploymentName, buildId };
  await pollUntilReady(deadline, async () => {
    await requireWorkerDeploymentRegistration(client, taskQueue, version, deadline);
    return true;
  }, true);

  const initial = await describeDeployment(client, deadline);
  const initialInfo = requireDeploymentWithoutRamp(initial.workerDeploymentInfo);
  // Temporal v1.31.2 ExternalWorkerDeploymentVersionToStringV31 encodes nil as this legacy sentinel:
  // https://github.com/temporalio/temporal/blob/v1.31.2/common/worker_versioning/worker_versioning.go#L996-L1000
  const legacyCurrent = initialInfo.routingConfig?.currentVersion;
  if (initialInfo.routingConfig?.currentDeploymentVersion != null
    || (legacyCurrent && legacyCurrent !== "__unversioned__")) {
    throw new Error("Worker deployment initialization: Current is already configured");
  }
  if (!initial.conflictToken?.length) {
    throw new Error("Worker deployment initialization: native conflict token is required");
  }
  await client.connection.withDeadline(rpcDeadline(deadline), () => client.workflowService.setWorkerDeploymentCurrentVersion({
    namespace: client.options.namespace,
    deploymentName: version.deploymentName,
    buildId,
    conflictToken: initial.conflictToken,
    identity: client.options.identity,
  }));

  await pollUntilReady(deadline, async () => {
    const response = await describeDeployment(client, deadline);
    const info = requireDeploymentWithoutRamp(response.workerDeploymentInfo);
    const current = info.routingConfig?.currentDeploymentVersion;
    if (current != null && !isExpectedVersion(current, buildId)) {
      throw new Error("Worker deployment initialization: unexpected Current after native selection");
    }
    if (info.routingConfig?.currentVersion && info.routingConfig.currentVersion !== `${version.deploymentName}.${buildId}`) {
      throw new Error("Worker deployment initialization: unexpected deprecated Current after native selection");
    }
    if (current == null || info.routingConfigUpdateState !== RoutingConfigUpdateState.ROUTING_CONFIG_UPDATE_STATE_COMPLETED) {
      return false;
    }
    const enrolled = await requireWorkerDeploymentEnrollment(client, taskQueue, deadline);
    if (!isExpectedVersion(enrolled, buildId)) {
      throw new Error("Worker deployment initialization: enrolled version differs from selected Current");
    }
    return true;
  });
}

async function describeDeployment(client: TemporalWorkflowClient, deadline: number) {
  return client.connection.withDeadline(rpcDeadline(deadline), () => client.workflowService.describeWorkerDeployment({
    namespace: client.options.namespace,
    deploymentName: bpmnWorkerDeploymentName,
  }));
}

function requireDeploymentWithoutRamp(info: DeploymentInfo | null | undefined): DeploymentInfo {
  if (info?.name !== bpmnWorkerDeploymentName) {
    throw new Error("Worker deployment initialization: native deployment identity differs");
  }
  const routing = info.routingConfig;
  if (routing?.rampingDeploymentVersion != null || routing?.rampingVersion
    || (routing?.rampingVersionPercentage ?? 0) !== 0) {
    throw new Error("Worker deployment initialization: a ramp is configured");
  }
  return info;
}

function isExpectedVersion(version: DeploymentVersion, buildId: string): boolean {
  return version.deploymentName === bpmnWorkerDeploymentName && version.buildId === buildId;
}

async function pollUntilReady(deadline: number, operation: () => Promise<boolean>, initialRegistration = false): Promise<void> {
  while (true) {
    requireRemaining(deadline);
    try {
      if (await operation()) {
        requireRemaining(deadline);
        return;
      }
    } catch (error) {
      if (!(error instanceof WorkerDeploymentNotReady)
        && !(initialRegistration && typeof error === "object" && error !== null && "code" in error && error.code === status.NOT_FOUND)) {
        throw error;
      }
    }
    await delay(Math.min(100, requireRemaining(deadline)));
  }
}

function rpcDeadline(deadline: number): number {
  requireRemaining(deadline);
  return Math.min(Date.now() + 5_000, deadline);
}

function requireRemaining(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Worker deployment initialization: readiness deadline exceeded");
  return remaining;
}
