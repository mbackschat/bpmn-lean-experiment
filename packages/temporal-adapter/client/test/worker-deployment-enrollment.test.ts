import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkflowClient } from "@temporalio/client";
import proto from "@temporalio/proto";
import type { temporal } from "@temporalio/proto";
import {
  bpmnWorkerDeploymentName,
  requireWorkerDeploymentEnrollment,
  requireWorkerDeploymentRegistration,
  WorkerDeploymentNotReady,
} from "@bpmn-lean/temporal-client";

const { TaskQueueType } = proto.temporal.api.enums.v1;
const { DescribeTaskQueueResponse, DescribeWorkerDeploymentVersionResponse } = proto.temporal.api.workflowservice.v1;
const namespace = "enrollment-nondefault";
const taskQueue = "enrollment-queue";
const versionA = { deploymentName: "bpmn-lean", buildId: "a".repeat(64) };
const versionB = { deploymentName: "bpmn-lean", buildId: "b".repeat(64) };
type VersioningInfo = temporal.api.taskqueue.v1.ITaskQueueVersioningInfo;
type Registration = temporal.api.workflowservice.v1.IDescribeWorkerDeploymentVersionResponse;

function registeredVersion(): Registration {
  return {
    workerDeploymentVersionInfo: { deploymentVersion: versionA },
    versionTaskQueues: [
      { name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY },
      { name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW },
    ],
  };
}

function fixture(options: {
  workflow?: VersioningInfo | null;
  activity?: VersioningInfo | null;
  registration?: Registration;
  omitVersionTaskQueues?: boolean;
  failureAt?: "queue" | "registration";
} = {}) {
  const requests: unknown[] = [];
  const deadlines: number[] = [];
  const deadlineScopes: boolean[] = [];
  const transportFailure = new Error("native service unavailable");
  let inDeadline = false;
  const service = {
    async describeTaskQueue(request) {
      requests.push(request);
      deadlineScopes.push(inDeadline);
      if (options.failureAt === "queue") throw transportFailure;
      const key = request.taskQueueType === TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY ? "activity" : "workflow";
      return DescribeTaskQueueResponse.create({
        versioningInfo: Object.hasOwn(options, key) ? options[key] ?? null : { currentDeploymentVersion: versionA },
      });
    },
    async describeWorkerDeploymentVersion(request) {
      requests.push(request);
      deadlineScopes.push(inDeadline);
      if (options.failureAt === "registration") throw transportFailure;
      const response = DescribeWorkerDeploymentVersionResponse.create(options.registration ?? registeredVersion());
      if (options.omitVersionTaskQueues) {
        Object.defineProperty(response, "versionTaskQueues", { value: undefined });
      }
      return response;
    },
  } satisfies Pick<WorkflowClient["workflowService"], "describeTaskQueue" | "describeWorkerDeploymentVersion">;
  const connection = {
    workflowService: service,
    async withDeadline<T>(deadline: number | Date, operation: () => Promise<T>): Promise<T> {
      deadlines.push(Number(deadline));
      inDeadline = true;
      try {
        return await operation();
      } finally {
        inDeadline = false;
      }
    },
  };
  const client = new WorkflowClient({
    namespace,
    connection: connection as WorkflowClient["connection"],
  });
  return { client, requests, deadlines, deadlineScopes, transportFailure };
}

test("enrollment verifies both default queue types and exact registration under one native deadline", async () => {
  const f = fixture();
  const before = Date.now();
  assert.deepEqual(await requireWorkerDeploymentEnrollment(f.client, taskQueue), versionA);
  const after = Date.now();
  assert.equal(bpmnWorkerDeploymentName, "bpmn-lean");
  assert.deepEqual(f.requests, [
    { namespace, taskQueue: { name: taskQueue }, taskQueueType: TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW },
    { namespace, taskQueue: { name: taskQueue }, taskQueueType: TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY },
    { namespace, deploymentVersion: versionA },
  ]);
  assert.equal(f.deadlines.length, 1);
  assert.ok(f.deadlines[0]! >= before + 5_000 && f.deadlines[0]! <= after + 5_000);
  assert.deepEqual(f.deadlineScopes, [true, true, true]);
});

for (const [label, info] of [
  ["absent versioning", null],
  ["unversioned Current", { currentDeploymentVersion: null }],
  ["deprecated Current string only", { currentVersion: `bpmn-lean.${versionA.buildId}` }],
  ["wrong deployment", { currentDeploymentVersion: { ...versionA, deploymentName: "other" } }],
  ["short digest", { currentDeploymentVersion: { ...versionA, buildId: "a" } }],
  ["uppercase digest", { currentDeploymentVersion: { ...versionA, buildId: "A".repeat(64) } }],
  ["nonhex digest", { currentDeploymentVersion: { ...versionA, buildId: "g".repeat(64) } }],
  ["digest with trailing newline", { currentDeploymentVersion: { ...versionA, buildId: `${"a".repeat(64)}\n` } }],
  ["ramp toward unversioned", { currentDeploymentVersion: versionA, rampingDeploymentVersion: null, rampingVersionPercentage: 1 }],
  ["configured zero-percent ramp", { currentDeploymentVersion: versionA, rampingDeploymentVersion: versionB, rampingVersionPercentage: 0 }],
  ["malformed percentage", { currentDeploymentVersion: versionA, rampingVersionPercentage: Number.NaN }],
] satisfies Array<[string, VersioningInfo | null]>) {
  for (const queueType of ["workflow", "activity"] as const) {
    test(`enrollment refuses ${queueType} ${label}`, async () => {
      const f = fixture({ [queueType]: info });
      await assert.rejects(requireWorkerDeploymentEnrollment(f.client, taskQueue), /Worker deployment enrollment/);
    });
  }
}

test("enrollment refuses Workflow Current A with Activity Current B", async () => {
  const f = fixture({ activity: { currentDeploymentVersion: versionB } });
  await assert.rejects(requireWorkerDeploymentEnrollment(f.client, taskQueue), /Worker deployment enrollment.*Current/);
});

for (const [label, registration] of [
  ["absent version identity", { versionTaskQueues: registeredVersion().versionTaskQueues ?? [] }],
  ["substituted version identity", { ...registeredVersion(), workerDeploymentVersionInfo: { deploymentVersion: versionB } }],
  ["deprecated version identity", { ...registeredVersion(), workerDeploymentVersionInfo: { version: `bpmn-lean.${versionA.buildId}` } }],
  ["Workflow-only registration", { ...registeredVersion(), versionTaskQueues: [{ name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW }] }],
  ["Activity-only registration", { ...registeredVersion(), versionTaskQueues: [{ name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY }] }],
  ["Activity on another queue", { ...registeredVersion(), versionTaskQueues: [
    { name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW },
    { name: "other", type: TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY },
  ] }],
  ["deprecated task queues only", { workerDeploymentVersionInfo: { deploymentVersion: versionA, taskQueueInfos: [
    { name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW },
    { name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY },
  ] } }],
] satisfies Array<[string, Registration]>) {
  test(`enrollment refuses ${label}`, async () => {
    const f = fixture({ registration });
    await assert.rejects(requireWorkerDeploymentEnrollment(f.client, taskQueue), /Worker deployment registration/);
  });
  test(`registration before Current refuses ${label}`, async () => {
    const f = fixture({ registration });
    await assert.rejects(requireWorkerDeploymentRegistration(f.client, taskQueue, versionA), /Worker deployment registration/);
  });
}

test("registration before Current verifies membership without claiming queue liveness or Current", async () => {
  const f = fixture({ workflow: null, activity: null });
  const before = Date.now();
  await requireWorkerDeploymentRegistration(f.client, taskQueue, versionA);
  assert.deepEqual(f.requests, [{ namespace, deploymentVersion: versionA }]);
  assert.equal(f.deadlines.length, 1);
  assert.ok(f.deadlines[0]! >= before + 5_000 && f.deadlines[0]! <= Date.now() + 5_000);
  assert.deepEqual(f.deadlineScopes, [true]);
});

test("registration refuses a malformed expected version before transport", async () => {
  for (const version of [{ ...versionA, buildId: "label" }, { ...versionA, deploymentName: "other" }]) {
    const f = fixture();
    await assert.rejects(requireWorkerDeploymentRegistration(f.client, taskQueue, version), {
      name: "TypeError",
      message: /Worker deployment registration/,
    });
    assert.deepEqual(f.requests, []);
  }
});

test("an unready native snapshot has a distinct retryable error class", async () => {
  const f = fixture({ workflow: null });
  await assert.rejects(requireWorkerDeploymentEnrollment(f.client, taskQueue), (error) =>
    error instanceof WorkerDeploymentNotReady && error.name === "WorkerDeploymentNotReady");
});

test("an omitted registration queue list is an unready snapshot", async () => {
  const f = fixture({ omitVersionTaskQueues: true });
  await assert.rejects(requireWorkerDeploymentRegistration(f.client, taskQueue, versionA), {
    name: "WorkerDeploymentNotReady",
    message: /Worker deployment registration/,
  });
});

for (const failureAt of ["queue", "registration"] as const) {
  test(`enrollment preserves the native ${failureAt} error as infrastructure`, async () => {
    const f = fixture({ failureAt });
    await assert.rejects(requireWorkerDeploymentEnrollment(f.client, taskQueue), (error) => error === f.transportFailure);
  });
}

test("registration preserves the native error as infrastructure", async () => {
  const f = fixture({ failureAt: "registration" });
  await assert.rejects(requireWorkerDeploymentRegistration(f.client, taskQueue, versionA), (error) => error === f.transportFailure);
});

test("a caller deadline caps every nested native registration and enrollment request", async () => {
  const deadline = Date.now() + 50;
  const enrollment = fixture();
  await requireWorkerDeploymentEnrollment(enrollment.client, taskQueue, deadline);
  assert.deepEqual(enrollment.deadlines, [deadline]);
  const registration = fixture();
  await requireWorkerDeploymentRegistration(registration.client, taskQueue, versionA, deadline);
  assert.deepEqual(registration.deadlines, [deadline]);
});
