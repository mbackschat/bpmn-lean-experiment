import assert from "node:assert/strict";
import type { WorkflowClient } from "@temporalio/client";
import proto from "@temporalio/proto";

const { TaskQueueType } = proto.temporal.api.enums.v1;
const { DescribeTaskQueueResponse, DescribeWorkerDeploymentVersionResponse } = proto.temporal.api.workflowservice.v1;
const version = { deploymentName: "bpmn-lean", buildId: "a".repeat(64) };

export type EnrollmentFixtureOptions = Readonly<{
  absentCurrent?: "workflow" | "activity";
  missingActivityRegistration?: boolean;
  failure?: Error;
  calls?: string[];
}>;

export function enrollmentFixture(taskQueue: string, options: EnrollmentFixtureOptions = {}) {
  const workflowService = {
    async describeTaskQueue(request) {
      assert.equal(request.namespace, "creation-enrollment");
      assert.equal(request.taskQueue?.name, taskQueue);
      const kind = request.taskQueueType === TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY ? "activity" : "workflow";
      options.calls?.push(`current:${kind}`);
      if (options.failure !== undefined) throw options.failure;
      return DescribeTaskQueueResponse.create({
        versioningInfo: options.absentCurrent === kind ? {} : { currentDeploymentVersion: version },
      });
    },
    async describeWorkerDeploymentVersion(request) {
      assert.equal(request.namespace, "creation-enrollment");
      assert.deepEqual(request.deploymentVersion, version);
      options.calls?.push("registration");
      return DescribeWorkerDeploymentVersionResponse.create({
        workerDeploymentVersionInfo: { deploymentVersion: version },
        versionTaskQueues: [
          { name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW },
          ...(options.missingActivityRegistration ? [] : [{ name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY }]),
        ],
      });
    },
  } satisfies Pick<WorkflowClient["workflowService"], "describeTaskQueue" | "describeWorkerDeploymentVersion">;
  return {
    options: { namespace: "creation-enrollment" },
    workflowService,
    connection: {
      async withDeadline<T>(deadline: number | Date, operation: () => Promise<T>): Promise<T> {
        assert.ok(Number(deadline) <= Date.now() + 5_000);
        return operation();
      },
    },
  };
}
