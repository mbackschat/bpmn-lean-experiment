import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeCanonicalWorkAuditTimestamp,
  decodePublicApiErrorResponse,
  decodePublicTaskDetail,
  decodeWorkAuditPage,
  decodeWorkClaimRequest,
  decodeWorkClaimResult,
  decodeWorkCompletionRequest,
  decodeWorkCompletionResult,
  decodeWorkReleaseResult,
  decodeWorkTaskSnapshot,
  PublicApiErrorCode,
  WorkApiErrorCodes,
} from "@bpmn-lean/platform-contracts";

const definition = {
  processId: "approval-process",
  version: 1,
  source: {
    kind: "bpmnSource",
    id: "approval.bpmn",
    sha256: "a".repeat(64),
    byteLength: 123,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  },
  semanticProfile: "cib-seven-2.2.0:user-task-assignment-form-metadata",
  startCapabilities: { messageStarts: [], timerStarts: [] },
} as const;

const workTask = {
  task: {
    id: {
      processInstanceId: "process-child",
      elementId: "Task_Review",
      activation: 1,
    },
    name: "Review request",
    state: "active",
    metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: "approved", type: "boolean" }] },
    },
  },
  hostingInstance: {
    processInstanceId: "process-root",
    definition,
  },
  claimGeneration: 0,
  claim: null,
  claimableByCurrentActor: true,
} as const;

test("rejects private host addressing recursively from a Work snapshot", () => {
  assert.throws(
    () => decodeWorkTaskSnapshot({
      tasks: [{ ...workTask, workflowId: "private-workflow-address" }],
    }),
    /public fields/u,
  );
});

test("decodes a complete Work snapshot and enforces canonical occurrence order", () => {
  const laterTask = {
    ...workTask,
    task: {
      ...workTask.task,
      id: { ...workTask.task.id, activation: 2 },
    },
  };
  const input = { tasks: [workTask, laterTask] };

  assert.deepEqual(decodeWorkTaskSnapshot(input), input);
  assert.throws(
    () => decodeWorkTaskSnapshot({ tasks: [laterTask, workTask] }),
    /canonical strict ascending order/u,
  );
  assert.throws(
    () => decodeWorkTaskSnapshot({
      tasks: [{
        ...workTask,
        task: {
          ...workTask.task,
          id: { ...workTask.task.id, activation: Number.MAX_SAFE_INTEGER + 1 },
        },
      }],
    }),
    /positive safe integer/u,
  );
});

test("rejects a Boolean field whose current string value is called compatible", () => {
  assert.throws(
    () => decodePublicTaskDetail({
      workTask,
      form: {
        fields: [{
          key: "approved",
          type: "boolean",
          currentValue: { kind: "string", value: "false" },
          compatibility: "compatible",
        }],
      },
    }),
    /compatibility/u,
  );
});

test("preserves absent, null, false, and string false without coercion", () => {
  const details = [
    {
      workTask,
      form: {
        fields: [{
          key: "approved",
          type: "boolean",
          currentValue: { kind: "absent" },
          compatibility: "compatible",
        }],
      },
    },
    {
      workTask,
      form: {
        fields: [{
          key: "approved",
          type: "boolean",
          currentValue: { kind: "null" },
          compatibility: "compatible",
        }],
      },
    },
    {
      workTask,
      form: {
        fields: [{
          key: "approved",
          type: "boolean",
          currentValue: { kind: "boolean", value: false },
          compatibility: "compatible",
        }],
      },
    },
    {
      workTask,
      form: {
        fields: [{
          key: "approved",
          type: "boolean",
          currentValue: { kind: "string", value: "false" },
          compatibility: "incompatible",
        }],
      },
    },
  ] as const;

  for (const detail of details) {
    assert.deepEqual(decodePublicTaskDetail(detail), detail);
  }
  assert.throws(
    () => decodePublicTaskDetail({
      workTask,
      form: {
        fields: [{
          key: "other-key",
          type: "boolean",
          currentValue: { kind: "null" },
          compatibility: "compatible",
        }],
      },
    }),
    /must match the published metadata field/u,
  );
});

test("keeps absent metadata distinct from null and refuses private nested fields", () => {
  const metadataFreeTask = {
    ...workTask,
    task: {
      id: workTask.task.id,
      name: workTask.task.name,
      state: workTask.task.state,
    },
  };
  const input = { workTask: metadataFreeTask, form: null };

  assert.deepEqual(decodePublicTaskDetail(input), input);
  assert.throws(
    () => decodePublicTaskDetail({
      workTask: {
        ...metadataFreeTask,
        task: { ...metadataFreeTask.task, metadata: null },
      },
      form: null,
    }),
    /metadata must be an object/u,
  );
  assert.throws(
    () => decodePublicTaskDetail({
      ...input,
      form: { fields: [], locator: "private" },
    }),
    /must be null without published form metadata/u,
  );
});

test("decodes exact claim, release, and completion requests and results", () => {
  const taskId = workTask.task.id;
  const claimRequest = { actionId: "claim-1", expectedGeneration: 0 };
  const claimResult = {
    taskId,
    claim: { actorId: "demo-user", generation: 1 },
  };
  const releaseResult = {
    taskId,
    claimGeneration: 2,
    released: true,
  };
  const completionRequest = {
    taskId,
    expectedClaimGeneration: 1,
    submittedValues: [{ key: "approved", value: { kind: "boolean", value: false } }],
  };

  assert.deepEqual(decodeWorkClaimRequest(claimRequest), claimRequest);
  assert.deepEqual(decodeWorkClaimResult(claimResult), claimResult);
  assert.deepEqual(decodeWorkReleaseResult(releaseResult), releaseResult);
  assert.deepEqual(decodeWorkCompletionRequest(completionRequest), completionRequest);
  assert.throws(
    () => decodeWorkCompletionRequest({
      ...completionRequest,
      submittedValues: [{
        key: "approved",
        value: { kind: "string", value: "false", privateType: "boolean" },
      }],
    }),
    /public fields/u,
  );
  assert.throws(
    () => decodeWorkClaimRequest({ ...claimRequest, actorId: "caller-chosen" }),
    /public fields/u,
  );
});

test("decodes every closed completion result without inventing engine success", () => {
  const taskId = workTask.task.id;
  const results = [
    { state: "committed", actionId: "complete-1", taskId },
    {
      state: "rejected",
      actionId: "complete-2",
      taskId,
      engineResult: { kind: "semantic", outcome: "rolledBack" },
    },
    {
      state: "rejected",
      actionId: "complete-3",
      taskId,
      engineResult: { kind: "processClosed" },
    },
    { state: "indeterminate", actionId: "complete-4", taskId },
  ] as const;

  for (const result of results) {
    assert.deepEqual(decodeWorkCompletionResult(result), result);
  }
  assert.throws(
    () => decodeWorkCompletionResult({
      state: "rejected",
      actionId: "complete-5",
      taskId,
      engineResult: { kind: "semantic", outcome: "committed" },
    }),
    /outcome is not public/u,
  );
});

test("decodes exact audit events, actions, cursors, and canonical timestamps", () => {
  const baseEvent = {
    eventId: "event-1",
    actorId: "demo-user",
    recordedAt: "2026-08-12T12:34:56.789Z",
    hostingProcessInstanceId: "process-root",
    taskId: workTask.task.id,
  } as const;
  const events = [
    { ...baseEvent, action: { kind: "claim", actionId: "claim-1", outcome: "claimed" } },
    {
      ...baseEvent,
      eventId: "event-2",
      action: { kind: "release", actionId: "release-1", outcome: "idempotent" },
    },
    {
      ...baseEvent,
      eventId: "event-3",
      action: { kind: "completion", actionId: "complete-1", outcome: "indeterminate" },
    },
  ] as const;
  const page = { events, nextCursor: "v1.b3JkaW5hbC0z" };

  assert.deepEqual(decodeWorkAuditPage(page), page);
  assert.equal(
    decodeCanonicalWorkAuditTimestamp(baseEvent.recordedAt),
    baseEvent.recordedAt,
  );
  for (const invalid of [
    "2026-08-12T12:34:56Z",
    "2026-08-12T14:34:56.789+02:00",
    "2026-02-30T12:34:56.789Z",
  ]) {
    assert.throws(
      () => decodeWorkAuditPage({
        events: [{ ...events[0], recordedAt: invalid }],
        nextCursor: null,
      }),
      /canonical millisecond UTC instant/u,
    );
  }
  assert.throws(
    () => decodeWorkAuditPage({ events, nextCursor: "v1.padded=" }),
    /unpadded v1 base64url cursor/u,
  );
  assert.throws(
    () => decodeWorkAuditPage({ events: [events[0], events[0]], nextCursor: null }),
    /must not repeat an event identity/u,
  );
});

test("Work errors accept the exact extended code set and reject private fields", () => {
  assert.deepEqual(WorkApiErrorCodes, Object.values(PublicApiErrorCode));
  for (const code of WorkApiErrorCodes) {
    const input = { error: { code, message: `${code} response` } };
    assert.deepEqual(
      decodePublicApiErrorResponse(input, WorkApiErrorCodes),
      input,
    );
  }
  assert.throws(
    () => decodePublicApiErrorResponse(
      {
        error: {
          code: PublicApiErrorCode.WorkSnapshotUnavailable,
          message: "Snapshot unavailable.",
          locator: "private",
        },
      },
      WorkApiErrorCodes,
    ),
    /public fields/u,
  );
});
