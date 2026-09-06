import assert from "node:assert/strict";
import { test } from "node:test";
import { status } from "@grpc/grpc-js";
import { WorkflowClient } from "@temporalio/client";
import proto from "@temporalio/proto";
import type { temporal } from "@temporalio/proto";
import {
  initializeWorkerDeploymentCurrent,
  registerFreshWorkflowNamespace,
} from "../src/workflow-deployment-initialization.ts";

const { TaskQueueType, RoutingConfigUpdateState } = proto.temporal.api.enums.v1;
const serviceMessages = proto.temporal.api.workflowservice.v1;
const namespace = "fresh-nondefault";
const taskQueue = "fresh-queue";
const version = { deploymentName: "bpmn-lean", buildId: "a".repeat(64) };
const otherVersion = { ...version, buildId: "b".repeat(64) };
const conflictToken = Uint8Array.of(1, 2, 3);
type Description = temporal.api.workflowservice.v1.IDescribeWorkerDeploymentResponse;
type Routing = temporal.api.deployment.v1.IRoutingConfig;
type Registration = temporal.api.workflowservice.v1.IDescribeWorkerDeploymentVersionResponse;

function deployment(routingConfig: Routing = {}, completed = true): Description {
  return {
    conflictToken,
    workerDeploymentInfo: {
      name: version.deploymentName,
      routingConfig,
      routingConfigUpdateState: completed
        ? RoutingConfigUpdateState.ROUTING_CONFIG_UPDATE_STATE_COMPLETED
        : RoutingConfigUpdateState.ROUTING_CONFIG_UPDATE_STATE_IN_PROGRESS,
    },
  };
}

function registration(): Registration {
  return {
    workerDeploymentVersionInfo: { deploymentVersion: version },
    versionTaskQueues: [
      { name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW },
      { name: taskQueue, type: TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY },
    ],
  };
}

function fixture(options: {
  namespace?: string;
  registrationError?: Error;
  initial?: Description;
  after?: Description;
  afterResponse?: () => Description;
  setError?: Error;
  versionResponse?: () => Registration;
  afterDescribe?: () => void;
  queueVersion?: typeof version;
} = {}) {
  const requests: Array<{ method: string; request: unknown; deadline: number | undefined }> = [];
  const deadlines: number[] = [];
  let deadline: number | undefined;
  let promoted = false;
  const record = (method: string, request: unknown) => requests.push({ method, request, deadline });
  const service = {
    async registerNamespace(request) {
      record("registerNamespace", request);
      if (options.registrationError) throw options.registrationError;
      return serviceMessages.RegisterNamespaceResponse.create();
    },
    async describeWorkerDeploymentVersion(request) {
      record("describeWorkerDeploymentVersion", request);
      return serviceMessages.DescribeWorkerDeploymentVersionResponse.create(options.versionResponse?.() ?? registration());
    },
    async describeWorkerDeployment(request) {
      record("describeWorkerDeployment", request);
      const response = promoted
        ? options.afterResponse?.() ?? options.after ?? deployment({ currentDeploymentVersion: version })
        : options.initial ?? deployment();
      if (promoted) options.afterDescribe?.();
      return serviceMessages.DescribeWorkerDeploymentResponse.create(response);
    },
    async setWorkerDeploymentCurrentVersion(request) {
      record("setWorkerDeploymentCurrentVersion", request);
      if (options.setError) throw options.setError;
      promoted = true;
      return serviceMessages.SetWorkerDeploymentCurrentVersionResponse.create();
    },
    async describeTaskQueue(request) {
      record("describeTaskQueue", request);
      return serviceMessages.DescribeTaskQueueResponse.create({ versioningInfo: { currentDeploymentVersion: options.queueVersion ?? version } });
    },
  } satisfies Pick<WorkflowClient["workflowService"],
    "registerNamespace" | "describeWorkerDeploymentVersion" | "describeWorkerDeployment"
    | "setWorkerDeploymentCurrentVersion" | "describeTaskQueue">;
  const connection = {
    workflowService: service,
    async withDeadline<T>(nextDeadline: number | Date, operation: () => Promise<T>): Promise<T> {
      const previous = deadline;
      deadline = Number(nextDeadline);
      deadlines.push(deadline);
      try {
        return await operation();
      } finally {
        deadline = previous;
      }
    },
  };
  const client = new WorkflowClient({
    namespace: options.namespace ?? namespace,
    identity: "fresh-initializer",
    connection: connection as WorkflowClient["connection"],
  });
  return { client, requests, deadlines };
}

test("fresh registration uses the explicit namespace and retention under a native five-second deadline", async () => {
  const f = fixture();
  const before = Date.now();
  await registerFreshWorkflowNamespace(f.client, 86_400);
  assert.deepEqual(f.requests.map(({ method }) => method), ["registerNamespace"]);
  const request = f.requests[0]!.request as temporal.api.workflowservice.v1.IRegisterNamespaceRequest;
  assert.equal(request.namespace, namespace);
  assert.equal(request.workflowExecutionRetentionPeriod?.seconds?.toString(), "86400");
  assert.deepEqual(Object.keys(request).sort(), ["namespace", "workflowExecutionRetentionPeriod"]);
  assert.equal(f.deadlines.length, 1);
  assert.ok(f.deadlines[0]! >= before + 5_000 && f.deadlines[0]! <= Date.now() + 5_000);
});

for (const code of [status.ALREADY_EXISTS, status.DEADLINE_EXCEEDED, status.UNAVAILABLE]) {
  test(`fresh registration preserves native failure ${code} without retry or history inference`, async () => {
    const failure = Object.assign(new Error("native registration failure"), { code });
    const f = fixture({ registrationError: failure });
    await assert.rejects(registerFreshWorkflowNamespace(f.client, 86_400), (error) => error === failure);
    assert.deepEqual(f.requests.map(({ method }) => method), ["registerNamespace"]);
  });
}

for (const invalidNamespace of ["", " ", "padded ", "bad\nnamespace", "\ud800"]) {
  test(`fresh registration refuses malformed namespace ${JSON.stringify(invalidNamespace)} before I/O`, async () => {
    const f = fixture({ namespace: invalidNamespace });
    await assert.rejects(registerFreshWorkflowNamespace(f.client, 86_400), TypeError);
    assert.deepEqual(f.requests, []);
  });
}

for (const retention of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
  test(`fresh registration refuses invalid retention ${retention} before I/O`, async () => {
    const f = fixture();
    await assert.rejects(registerFreshWorkflowNamespace(f.client, retention), TypeError);
    assert.deepEqual(f.requests, []);
  });
}

test("native initialization orders exact dual registration, conflict-token CAS, completed routing and enrollment", async () => {
  const f = fixture();
  const before = Date.now();
  await initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId);
  assert.deepEqual(f.requests.map(({ method, request }) => ({ method, request })), [
    { method: "describeWorkerDeploymentVersion", request: { namespace, deploymentVersion: version } },
    { method: "describeWorkerDeployment", request: { namespace, deploymentName: version.deploymentName } },
    { method: "setWorkerDeploymentCurrentVersion", request: {
      namespace, deploymentName: version.deploymentName, buildId: version.buildId, conflictToken, identity: "fresh-initializer",
    } },
    { method: "describeWorkerDeployment", request: { namespace, deploymentName: version.deploymentName } },
    { method: "describeTaskQueue", request: { namespace, taskQueue: { name: taskQueue }, taskQueueType: TaskQueueType.TASK_QUEUE_TYPE_WORKFLOW } },
    { method: "describeTaskQueue", request: { namespace, taskQueue: { name: taskQueue }, taskQueueType: TaskQueueType.TASK_QUEUE_TYPE_ACTIVITY } },
    { method: "describeWorkerDeploymentVersion", request: { namespace, deploymentVersion: version } },
  ]);
  assert.ok(f.requests.every(({ deadline }) => deadline !== undefined && deadline >= before && deadline <= before + 20_000));
});

test("fresh native unversioned sentinel permits one conflict-token Current selection", async () => {
  const f = fixture({ initial: deployment({ currentVersion: "__unversioned__" }) });
  await initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId);
  assert.equal(f.requests.filter(({ method }) => method === "setWorkerDeploymentCurrentVersion").length, 1);
});

for (const buildId of ["label", "A".repeat(64), "g".repeat(64), `${version.buildId}\n`]) {
  test(`initialization refuses malformed Build ID ${JSON.stringify(buildId)} before I/O`, async () => {
    const f = fixture();
    await assert.rejects(initializeWorkerDeploymentCurrent(f.client, taskQueue, buildId), TypeError);
    assert.deepEqual(f.requests, []);
  });
}

for (const [label, initial] of [
  ["existing exact Current", deployment({ currentDeploymentVersion: version })],
  ["unexpected Current", deployment({ currentDeploymentVersion: otherVersion })],
  ["deprecated Current only", deployment({ currentVersion: `bpmn-lean.${version.buildId}` })],
  ["ramp toward unversioned", deployment({ rampingVersionPercentage: 1 })],
  ["zero-percent configured ramp", deployment({ rampingDeploymentVersion: otherVersion })],
  ["deprecated ramp", deployment({ rampingVersion: `bpmn-lean.${otherVersion.buildId}` })],
  ["unversioned deprecated ramp", deployment({ rampingVersion: "__unversioned__" })],
  ["malformed ramp percentage", deployment({ rampingVersionPercentage: Number.NaN })],
  ["wrong deployment name", { ...deployment(), workerDeploymentInfo: { name: "other" } }],
  ["absent deployment", {}],
  ["missing conflict token", { ...deployment(), conflictToken: null }],
  ["empty conflict token", { ...deployment(), conflictToken: new Uint8Array() }],
] satisfies Array<[string, Description]>) {
  test(`initialization refuses ${label} before Current mutation`, async () => {
    const f = fixture({ initial });
    await assert.rejects(initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId), /initialization/i);
    assert.equal(f.requests.some(({ method }) => method === "setWorkerDeploymentCurrentVersion"), false);
  });
}

test("uncertain native Current CAS failure propagates unchanged without retry", async () => {
  const failure = Object.assign(new Error("lost CAS response"), { code: status.DEADLINE_EXCEEDED });
  const f = fixture({ setError: failure });
  await assert.rejects(initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId), (error) => error === failure);
  assert.equal(f.requests.filter(({ method }) => method === "setWorkerDeploymentCurrentVersion").length, 1);
  assert.equal(f.requests.filter(({ method }) => method === "describeWorkerDeployment").length, 1);
});

test("initial version NOT_FOUND is retried until native registration appears", async () => {
  let count = 0;
  const f = fixture({ versionResponse: () => {
    if (++count === 1) throw Object.assign(new Error("version registering"), { code: status.NOT_FOUND });
    return registration();
  } });
  await initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId);
  assert.equal(count, 3);
});

test("partial dual queue registration is retried before Current mutation", async () => {
  let count = 0;
  const f = fixture({ versionResponse: () => {
    const response = registration();
    if (++count === 1) response.versionTaskQueues = response.versionTaskQueues!.slice(0, 1);
    return response;
  } });
  await initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId);
  assert.equal(count, 3);
});

test("registration transport uncertainty fails without retry or Current mutation", async () => {
  const failure = Object.assign(new Error("transport unavailable"), { code: status.UNAVAILABLE });
  const f = fixture({ versionResponse: () => { throw failure; } });
  await assert.rejects(initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId), (error) => error === failure);
  assert.deepEqual(f.requests.map(({ method }) => method), ["describeWorkerDeploymentVersion"]);
});

test("routing still IN_PROGRESS at the overall deadline cannot claim enrollment readiness", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: 1_000 });
  const f = fixture({
    after: deployment({ currentDeploymentVersion: version }, false),
    afterDescribe: () => context.mock.timers.setTime(21_000),
  });
  await assert.rejects(initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId), /initialization.*deadline/i);
  assert.equal(f.requests.some(({ method }) => method === "describeTaskQueue"), false);
  assert.ok(f.deadlines.every((deadline) => deadline <= 21_000));
});

test("native enrollment deadlines shrink to the remaining overall initialization budget", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: 1_000 });
  const f = fixture({ afterDescribe: () => context.mock.timers.setTime(20_000) });
  await initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId);
  const enrollment = f.requests.filter(({ method }) => method === "describeTaskQueue");
  assert.equal(enrollment.length, 2);
  assert.ok(enrollment.every(({ deadline }) => deadline === 21_000));
  assert.ok(f.deadlines.every((deadline) => deadline <= 21_000));
});

test("expected post-CAS routing propagation is polled until COMPLETED before enrollment", async () => {
  let snapshots = 0;
  const f = fixture({ afterResponse: () => deployment({ currentDeploymentVersion: version }, ++snapshots > 1) });
  await initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId);
  assert.equal(snapshots, 2);
  assert.equal(f.requests.filter(({ method }) => method === "setWorkerDeploymentCurrentVersion").length, 1);
  const methods = f.requests.map(({ method }) => method);
  assert.ok(methods.lastIndexOf("describeWorkerDeployment") < methods.indexOf("describeTaskQueue"));
});

test("enrollment of a different native version cannot complete initialization", async () => {
  let registrations = 0;
  const f = fixture({ queueVersion: otherVersion, versionResponse: () => {
    const response = registration();
    if (++registrations > 1) response.workerDeploymentVersionInfo = { deploymentVersion: otherVersion };
    return response;
  } });
  await assert.rejects(initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId), /enrolled version differs/);
});

test("a post-CAS NOT_FOUND propagates without treating a vanished deployment as initial registration", async () => {
  const failure = Object.assign(new Error("deployment vanished"), { code: status.NOT_FOUND });
  const f = fixture({ afterResponse: () => { throw failure; } });
  await assert.rejects(initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId), (error) => error === failure);
  assert.equal(f.requests.filter(({ method }) => method === "describeWorkerDeployment").length, 2);
});

for (const [label, routing] of [
  ["different Current", { currentDeploymentVersion: otherVersion }],
  ["ramp toward unversioned", { currentDeploymentVersion: version, rampingVersionPercentage: 1 }],
  ["configured zero-percent ramp", { currentDeploymentVersion: version, rampingDeploymentVersion: otherVersion }],
] satisfies Array<[string, Routing]>) {
  test(`post-CAS ${label} fails immediately instead of polling an unexpected routing state`, async () => {
    const f = fixture({ after: deployment(routing) });
    await assert.rejects(initializeWorkerDeploymentCurrent(f.client, taskQueue, version.buildId), /initialization/i);
    assert.equal(f.requests.filter(({ method }) => method === "describeWorkerDeployment").length, 2);
    assert.equal(f.requests.some(({ method }) => method === "describeTaskQueue"), false);
  });
}
