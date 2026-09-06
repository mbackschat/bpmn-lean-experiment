import assert from "node:assert/strict";

/** Supplies native transport responses without importing engine-internal test fixtures. */
export function enrollmentFixture(taskQueue: string) {
  const version = { deploymentName: "bpmn-lean", buildId: "a".repeat(64) };
  return {
    options: { namespace: "gateway-test" },
    connection: {
      async withDeadline<T>(deadline: number | Date, invoke: () => Promise<T>): Promise<T> {
        assert.ok(Number(deadline) > Date.now());
        return invoke();
      },
    },
    workflowService: {
      async describeTaskQueue(request: { namespace: string; taskQueue: { name: string }; taskQueueType: number }) {
        assert.equal(request.namespace, "gateway-test");
        assert.equal(request.taskQueue.name, taskQueue);
        assert.ok(request.taskQueueType === 1 || request.taskQueueType === 2);
        return { versioningInfo: { currentDeploymentVersion: version } };
      },
      async describeWorkerDeploymentVersion(request: { namespace: string; deploymentVersion: unknown }) {
        assert.equal(request.namespace, "gateway-test");
        assert.deepEqual(request.deploymentVersion, version);
        return {
          workerDeploymentVersionInfo: { deploymentVersion: version },
          versionTaskQueues: [{ name: taskQueue, type: 1 }, { name: taskQueue, type: 2 }],
        };
      },
    },
  };
}
