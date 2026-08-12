import assert from "node:assert/strict";
import { test } from "node:test";

import {
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

function clientReturning(body: unknown): WorkApiClient {
  return new WorkApiClient("https://platform.example", async () => new Response(
    JSON.stringify(body),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
}
