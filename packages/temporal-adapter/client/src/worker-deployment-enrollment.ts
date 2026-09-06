import type { WorkflowClient } from "@temporalio/client";
import proto from "@temporalio/proto";

export const bpmnWorkerDeploymentName = "bpmn-lean";

const { TaskQueueType } = proto.temporal.api.enums.v1;
type BundleVersion = Readonly<{ deploymentName: string; buildId: string }>;

export class WorkerDeploymentNotReady extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerDeploymentNotReady";
  }
}

/** Checks native enrollment snapshots under DEPLOY-ENROLL-01; this does not reserve a future dispatch version. */
export async function requireWorkerDeploymentEnrollment(
  client: WorkflowClient,
  taskQueue: string,
  deadline = Date.now() + 5_000,
): Promise<BundleVersion> {
  return client.connection.withDeadline(Math.min(Date.now() + 5_000, deadline), async () => {
    const workflowVersion = await requireQueueCurrent(client, taskQueue, TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW);
    const activityVersion = await requireQueueCurrent(client, taskQueue, TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY);
    if (!sameVersion(workflowVersion, activityVersion)) {
      throw new WorkerDeploymentNotReady("Worker deployment enrollment: Workflow and Activity Current versions disagree");
    }
    await requireRegistration(client, taskQueue, workflowVersion);
    return workflowVersion;
  });
}

/** Checks DEPLOY-PIN-01 registration before native Current selection; membership does not establish poller liveness. */
export async function requireWorkerDeploymentRegistration(
  client: WorkflowClient,
  taskQueue: string,
  version: BundleVersion,
  deadline = Date.now() + 5_000,
): Promise<void> {
  if (!isBundleVersion(version)) {
    throw new TypeError("Worker deployment registration: expected bpmn-lean version with a lowercase SHA-256 Build ID");
  }
  const expected = { deploymentName: version.deploymentName, buildId: version.buildId };
  await client.connection.withDeadline(Math.min(Date.now() + 5_000, deadline), () => requireRegistration(client, taskQueue, expected));
}

async function requireQueueCurrent(
  client: WorkflowClient,
  taskQueue: string,
  taskQueueType: proto.temporal.api.enums.v1.TaskQueueType,
): Promise<BundleVersion> {
  const response = await client.workflowService.describeTaskQueue({
    namespace: client.options.namespace,
    taskQueue: { name: taskQueue },
    taskQueueType,
  });
  const info = response.versioningInfo;
  const version = info?.currentDeploymentVersion;
  if (!isBundleVersion(version)) {
    throw new WorkerDeploymentNotReady(`Worker deployment enrollment: queue ${taskQueue} type ${taskQueueType} requires bpmn-lean Current with a lowercase SHA-256 Build ID`);
  }
  if (info?.rampingDeploymentVersion != null || (info?.rampingVersionPercentage ?? 0) !== 0) {
    throw new WorkerDeploymentNotReady(`Worker deployment enrollment: queue ${taskQueue} type ${taskQueueType} has a ramp configured`);
  }
  return { deploymentName: version.deploymentName, buildId: version.buildId };
}

async function requireRegistration(
  client: WorkflowClient,
  taskQueue: string,
  version: BundleVersion,
): Promise<void> {
  const response = await client.workflowService.describeWorkerDeploymentVersion({
    namespace: client.options.namespace,
    deploymentVersion: version,
  });
  const actual = response.workerDeploymentVersionInfo?.deploymentVersion;
  if (!isBundleVersion(actual) || !sameVersion(actual, version)) {
    throw new WorkerDeploymentNotReady("Worker deployment registration: described version does not match the expected bundle version");
  }
  for (const type of [TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW, TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY]) {
    if (!(response.versionTaskQueues ?? []).some((queue) => queue.name === taskQueue && queue.type === type)) {
      throw new WorkerDeploymentNotReady(`Worker deployment registration: queue ${taskQueue} type ${type} is absent from the expected bundle version`);
    }
  }
}

function isBundleVersion(value: unknown): value is BundleVersion {
  return typeof value === "object" && value !== null
    && "deploymentName" in value && value.deploymentName === bpmnWorkerDeploymentName
    && "buildId" in value && typeof value.buildId === "string" && /^[0-9a-f]{64}$/.test(value.buildId);
}

function sameVersion(left: BundleVersion, right: BundleVersion): boolean {
  return left.deploymentName === right.deploymentName && left.buildId === right.buildId;
}
