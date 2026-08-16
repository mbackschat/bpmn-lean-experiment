import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WorkApiError,
  WorkApiClient,
  WorkProtocolError,
} from "../src/work-tasks-api.ts";

const taskId = {
  processInstanceId: "process-1",
  elementId: "Review",
  activation: 1,
};

test("refuses a completion response with a different action or task identity", async () => {
  const client = clientReturning({
    state: "committed",
    actionId: "different-action",
    taskId,
  });

  await assert.rejects(
    client.complete("complete-1", {
      taskId,
      expectedClaimGeneration: 1,
      submittedValues: [{
        key: "approved",
        value: { kind: "boolean", value: false },
      }],
    }),
    WorkProtocolError,
  );
});

test("rejects escaped-equivalent duplicate keys in a Work response", async () => {
  const client = new WorkApiClient(
    "https://platform.example",
    async () => new Response('{"tasks":[],"\\u0074asks":[]}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  await assert.rejects(client.listTasks(), WorkProtocolError);
});

test("refuses Boolean stringification in strict task detail", async () => {
  const client = clientReturning({
    workTask: {
      task: {
        id: taskId,
        name: "Review",
        state: "active",
        metadata: {
          assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
          form: { fields: [{ key: "approved", type: "boolean" }] },
        },
      },
      hostingInstance: {
        processInstanceId: "host-1",
        definition: {
          processId: "Review_Process",
          version: 1,
          source: {
            kind: "bpmnSource",
            id: "review.bpmn",
            sha256: "a".repeat(64),
            byteLength: 42,
            declaredEncoding: null,
            decodedAs: "UTF-8",
          },
          semanticProfile: "profile-1",
          startCapabilities: { messageStarts: [], timerStarts: [] },
        },
      },
      claimGeneration: 1,
      claim: { actorId: "demo-user", generation: 1 },
      claimableByCurrentActor: false,
    },
    form: {
      fields: [{
        key: "approved",
        type: "boolean",
        currentValue: { kind: "string", value: "false" },
        compatibility: "compatible",
      }],
    },
  });

  await assert.rejects(client.getTask(taskId), WorkProtocolError);
});

test("preserves ordered structured-form validation issues from the Work API", async () => {
  const client = new WorkApiClient(
    "https://platform.example",
    async () => new Response(JSON.stringify({
      error: {
        code: "formValidationFailed",
        message: "Structured form validation failed.",
        issues: [{
          code: "requiredFieldNull",
          target: { kind: "field", key: "resolutionReason" },
        }],
      },
    }), {
      status: 422,
      headers: { "content-type": "application/json" },
    }),
  );

  await assert.rejects(
    client.complete("complete-structured", {
      schemaVersion: "bpmn-lean-structured-work-completion/v1",
      taskId,
      expectedClaimGeneration: 1,
      resolutionActionId: "abort",
      fields: { resolutionReason: null },
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkApiError);
      assert.equal(error.code, "formValidationFailed");
      assert.deepEqual(error.issues, [{
        code: "requiredFieldNull",
        target: { kind: "field", key: "resolutionReason" },
      }]);
      return true;
    },
  );
});

function clientReturning(body: unknown): WorkApiClient {
  return new WorkApiClient("https://platform.example", async () => new Response(
    JSON.stringify(body),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
}
