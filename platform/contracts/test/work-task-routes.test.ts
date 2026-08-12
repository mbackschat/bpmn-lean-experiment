import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeWorkAuditRequest,
  matchWorkAuditPath,
  matchWorkTaskClaimPath,
  matchWorkTaskCompletionPath,
  matchWorkTaskPath,
  matchWorkTaskReleasePath,
  matchWorkTasksPath,
  requireWorkRequestBodyLength,
  WorkAuditDefaultLimit,
  workAuditPath,
  WorkMutationBodyByteLimit,
  workTaskClaimPath,
  workTaskCompletionPath,
  workTaskPath,
  workTaskReleasePath,
  workTasksPath,
} from "@bpmn-lean/platform-contracts";

const taskId = {
  processInstanceId: "process/root 🚀",
  elementId: "Task/review ?",
  activation: 7,
} as const;

test("builds and matches every closed Work task route with percent-encoded identities", () => {
  assert.equal(workTasksPath(), "/api/v1/work-tasks");
  assert.equal(matchWorkTasksPath(workTasksPath()), true);

  const detail = workTaskPath(taskId);
  assert.equal(
    detail,
    "/api/v1/work-tasks/process%2Froot%20%F0%9F%9A%80/Task%2Freview%20%3F/7",
  );
  assert.deepEqual(matchWorkTaskPath(detail), taskId);

  const claim = workTaskClaimPath(taskId);
  assert.equal(claim, `${detail}/claim`);
  assert.deepEqual(matchWorkTaskClaimPath(claim), taskId);

  const release = workTaskReleasePath(taskId, {
    actionId: "release/id ?",
    generation: 7,
  });
  assert.equal(
    release,
    `${claim}?actionId=release%2Fid%20%3F&generation=7`,
  );
  assert.deepEqual(matchWorkTaskReleasePath(release), {
    taskId,
    request: { actionId: "release/id ?", generation: 7 },
  });

  const completion = workTaskCompletionPath("completion/id ?");
  assert.equal(
    completion,
    "/api/v1/work-task-completions/completion%2Fid%20%3F",
  );
  assert.equal(matchWorkTaskCompletionPath(completion), "completion/id ?");
});

test("rejects malformed paths, unsafe activations, fragments, and non-release queries", () => {
  assert.throws(
    () => matchWorkTaskPath("/api/v1/work-tasks/%ZZ/Task/1"),
    /malformed URI encoding/u,
  );
  assert.throws(
    () => matchWorkTaskPath("/api/v1/work-tasks/process/Task/01"),
    /canonical positive safe integer/u,
  );
  assert.throws(
    () => matchWorkTaskClaimPath(
      `/api/v1/work-tasks/process/Task/${Number.MAX_SAFE_INTEGER + 1}/claim`,
    ),
    /canonical positive safe integer/u,
  );
  assert.throws(
    () => matchWorkTasksPath("/api/v1/work-tasks?private=value"),
    /must not contain a query/u,
  );
  assert.throws(
    () => matchWorkTaskCompletionPath(
      "/api/v1/work-task-completions/action#private",
    ),
    /must not contain a fragment/u,
  );
});

test("rejects duplicate, unknown, missing, and malformed release query fields", () => {
  const claim = workTaskClaimPath(taskId);
  for (const path of [
    `${claim}?actionId=one&actionId=two&generation=7`,
    `${claim}?actionId=one&generation=7&actorId=private`,
    `${claim}?actionId=one`,
    `${claim}?actionId=one&generation=07`,
    `${claim}?actionId=%ZZ&generation=7`,
  ]) {
    assert.throws(() => matchWorkTaskReleasePath(path));
  }
});

test("builds and matches exact audit filters with an opaque exclusive cursor", () => {
  const request = {
    actorId: "demo/user",
    taskProcessInstanceId: "child ?",
    hostingProcessInstanceId: "root ?",
    actionKind: "completion",
    cursor: "v1.b3JkaW5hbC0z",
    limit: 100,
  } as const;
  const path = workAuditPath(request);

  assert.equal(
    path,
    "/api/v1/work-audit?actorId=demo%2Fuser&taskProcessInstanceId=child%20%3F&hostingProcessInstanceId=root%20%3F&actionKind=completion&cursor=v1.b3JkaW5hbC0z&limit=100",
  );
  assert.deepEqual(matchWorkAuditPath(path), request);
  assert.deepEqual(matchWorkAuditPath("/api/v1/work-audit"), {
    limit: WorkAuditDefaultLimit,
  });
  assert.deepEqual(decodeWorkAuditRequest({ cursor: request.cursor }), {
    cursor: request.cursor,
  });
});

test("rejects audit query drift and preserves the limit contract", () => {
  for (const path of [
    "/api/v1/work-audit?",
    "/api/v1/work-audit?actorId=one&actorId=two",
    "/api/v1/work-audit?private=value",
    "/api/v1/work-audit?cursor=v1.padded%3D",
    "/api/v1/work-audit?limit=0",
    "/api/v1/work-audit?limit=101",
    "/api/v1/work-audit?limit=01",
  ]) {
    assert.throws(() => matchWorkAuditPath(path));
  }
  assert.throws(
    () => decodeWorkAuditRequest({ actorId: "demo-user", workflowId: "private" }),
    /unknown field/u,
  );
});

test("enforces bodyless reads and deletes plus the 4096-byte mutation ceiling", () => {
  requireWorkRequestBodyLength("GET", 0);
  requireWorkRequestBodyLength("DELETE", 0);
  requireWorkRequestBodyLength("PUT", 1);
  requireWorkRequestBodyLength("PUT", WorkMutationBodyByteLimit);

  assert.throws(() => requireWorkRequestBodyLength("GET", 1), /must not contain a body/u);
  assert.throws(() => requireWorkRequestBodyLength("DELETE", 1), /must not contain a body/u);
  assert.throws(() => requireWorkRequestBodyLength("PUT", 0), /must contain one JSON body/u);
  assert.throws(
    () => requireWorkRequestBodyLength("PUT", WorkMutationBodyByteLimit + 1),
    /exceeds 4096/u,
  );
  assert.throws(() => requireWorkRequestBodyLength("POST", 1), /must be GET, DELETE, or PUT/u);
});
