import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type PublicWorkTaskId,
  type WorkClaimRequest,
} from "@bpmn-lean/platform-contracts";

import {
  WorkHttpRoutes,
  WorkSnapshotUnavailableError,
} from "@bpmn-lean/platform-work";

const taskId = {
  processInstanceId: "process-1",
  elementId: "Review",
  activation: 1,
};

test("serves the strict task snapshot and refuses a GET body before service entry", async () => {
  let calls = 0;
  let reconciliations = 0;
  const routes = createRoutes({
    listTasks: async () => {
      calls += 1;
      return { tasks: [] };
    },
  }, async () => { reconciliations += 1; });

  const success = await routes.handle(new Request("http://platform.test/api/v1/work-tasks"));
  assert.equal(success?.status, 200);
  assert.deepEqual(await success?.json(), { tasks: [] });
  const invalid = await routes.handle(new Request("http://platform.test/api/v1/work-tasks", {
    method: "GET",
    headers: { "content-type": "application/json" },
  }));
  assert.equal(invalid?.status, 400);
  assert.equal(calls, 1);
  assert.equal(reconciliations, 2);
});

test("maps uniform hidden task and snapshot availability without private evidence", async () => {
  const routes = createRoutes({
    getTaskDetail: async () => null,
    listTasks: async () => { throw new WorkSnapshotUnavailableError(); },
  });

  const missing = await routes.handle(new Request(taskUrl()));
  assert.equal(missing?.status, 404);
  const unavailable = await routes.handle(new Request("http://platform.test/api/v1/work-tasks"));
  assert.equal(unavailable?.status, 503);
  assert.deepEqual(await unavailable?.json(), {
    error: {
      code: "workSnapshotUnavailable",
      message: "The current Work snapshot is unavailable.",
    },
  });
});

test("decodes claim JSON within the byte limit and maps the exact result status", async () => {
  let request: unknown;
  const routes = createRoutes({
    claimTask: async (
      _taskId: PublicWorkTaskId,
      value: WorkClaimRequest,
    ) => {
      request = value;
      return {
        kind: "claimed",
        result: { taskId, claim: { actorId: "demo-user", generation: 1 } },
      };
    },
  });

  const response = await routes.handle(new Request(`${taskUrl()}/claim`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ actionId: "claim-1", expectedGeneration: 0 }),
  }));

  assert.equal(response?.status, 201);
  assert.deepEqual(request, { actionId: "claim-1", expectedGeneration: 0 });
  assert.deepEqual(await response?.json(), {
    taskId,
    claim: { actorId: "demo-user", generation: 1 },
  });
});

test("rejects escaped-equivalent duplicate claim keys before service entry", async () => {
  let calls = 0;
  const routes = createRoutes({
    claimTask: async () => {
      calls += 1;
      return {
        kind: "claimed",
        result: { taskId, claim: { actorId: "demo-user", generation: 1 } },
      };
    },
  });

  const response = await routes.handle(new Request(`${taskUrl()}/claim`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: '{"actionId":"wrong","\\u0061ctionId":"claim-1","expectedGeneration":0}',
  }));

  assert.equal(response?.status, 400);
  assert.equal(calls, 0);
});

test("distinguishes unsupported media type and oversized mutation payload", async () => {
  const routes = createRoutes({});
  const unsupported = await routes.handle(new Request(`${taskUrl()}/claim`, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: "not json",
  }));
  assert.equal(unsupported?.status, 415);
  const oversized = await routes.handle(new Request(`${taskUrl()}/claim`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "content-length": "4097",
    },
    body: "{}",
  }));
  assert.equal(oversized?.status, 413);
});

test("maps release, completion, and self-audit closed results", async () => {
  const routes = createRoutes({
    releaseTask: async () => ({
      kind: "released",
      result: { taskId, claimGeneration: 2, released: true },
    }),
    completeTask: async () => ({
      kind: "result",
      result: { state: "indeterminate", actionId: "complete-1", taskId },
    }),
  });
  const release = await routes.handle(new Request(
    `${taskUrl()}/claim?actionId=release-1&generation=1`,
    { method: "DELETE" },
  ));
  assert.equal(release?.status, 200);
  const completion = await routes.handle(new Request(
    "http://platform.test/api/v1/work-task-completions/complete-1",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId,
        expectedClaimGeneration: 1,
        submittedValues: [{
          key: "approved",
          value: { kind: "boolean", value: false },
        }],
      }),
    },
  ));
  assert.equal(completion?.status, 202);
  const audit = await routes.handle(new Request(
    "http://platform.test/api/v1/work-audit?actionKind=claim",
  ));
  assert.equal(audit?.status, 200);
  assert.deepEqual(await audit?.json(), { events: [], nextCursor: null });
});

test("maps structured validation issues to the closed 422 Work error", async () => {
  const routes = createRoutes({
    completeTask: async () => ({
      kind: "formValidationFailed",
      issues: [{
        code: "requiredFieldMissing",
        target: { kind: "field", key: "resolutionReason" },
      }],
    }),
  });
  const response = await routes.handle(structuredCompletionRequest(
    '{"riskFlags":[]}',
  ));
  assert.equal(response?.status, 422);
  assert.deepEqual(await response?.json(), {
    error: {
      code: "formValidationFailed",
      message: "The structured Work form submission is invalid.",
      issues: [{
        code: "requiredFieldMissing",
        target: { kind: "field", key: "resolutionReason" },
      }],
    },
  });
});

test("rejects duplicate structured field keys before completion service entry", async () => {
  let calls = 0;
  const routes = createRoutes({
    completeTask: async () => {
      calls += 1;
      return { kind: "notFound" };
    },
  });
  const response = await routes.handle(structuredCompletionRequest(
    '{"riskFlags":["low"],"riskFlags":["high"]}',
  ));
  assert.equal(response?.status, 400);
  assert.equal(calls, 0);
});

test("keeps the M3 completion ceiling while allowing the structured 32768-byte ceiling", async () => {
  let structuredCalls = 0;
  const routes = createRoutes({
    completeTask: async () => {
      structuredCalls += 1;
      return { kind: "notFound" };
    },
  });
  const legacy = await routes.handle(new Request(
    "http://platform.test/api/v1/work-task-completions/legacy-large",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId,
        expectedClaimGeneration: 1,
        submittedValues: [{
          key: "approved",
          value: { kind: "string", value: "x".repeat(4_096) },
        }],
      }),
    },
  ));
  assert.equal(legacy?.status, 413);

  const structured = await routes.handle(structuredCompletionRequest(
    JSON.stringify({ note: "x".repeat(5_000) }),
  ));
  assert.equal(structured?.status, 404);
  assert.equal(structuredCalls, 1);

  const oversized = await routes.handle(structuredCompletionRequest(
    JSON.stringify({ note: "x".repeat(33_000) }),
  ));
  assert.equal(oversized?.status, 413);
  assert.equal(structuredCalls, 1);
});

function createRoutes(
  overrides: Record<string, unknown>,
  reconcileAll: () => Promise<void> = async () => undefined,
): WorkHttpRoutes {
  return new WorkHttpRoutes({
    tasks: {
      listTasks: async () => ({ tasks: [] }),
      ...overrides,
    } as never,
    audit: { search: async () => ({ events: [], nextCursor: null }) },
    outbox: { reconcileAll },
  });
}

function taskUrl(): string {
  return "http://platform.test/api/v1/work-tasks/process-1/Review/1";
}

function structuredCompletionRequest(fieldsJson: string): Request {
  return new Request("http://platform.test/api/v1/work-task-completions/structured-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: `{"schemaVersion":"bpmn-lean-structured-work-completion/v1","taskId":{"processInstanceId":"process-1","elementId":"Review","activation":1},"expectedClaimGeneration":1,"resolutionActionId":"approve","fields":${fieldsJson}}`,
  });
}
