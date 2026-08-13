import assert from "node:assert/strict";
import test from "node:test";

import { StimulusKind } from "@bpmn-lean/semantic-core";
import {
  submitIncidentProcessCancellationAtWorkflowId,
} from "../dist/incident-client.js";

const processInstanceId = "Instance_1";
const cancellation = {
  kind: StimulusKind.CancelIncidentProcess,
  commandId: "cancel-incident-process",
  processInstanceId,
  incidentId: {
    effectId: {
      processInstanceId,
      elementId: "ServiceTask_Record",
      activation: 1,
    },
    generation: 1,
  },
} as const;

test("sends the exact content-bound cancellation Update", async () => {
  const calls: unknown[] = [];
  const client = {
    getHandle: (workflowId: string) => ({
      executeUpdate: async (name: string, options: unknown) => {
        calls.push({ workflowId, name, options });
        return "committed";
      },
      getUpdateHandle: () => ({ result: async () => "committed" }),
      result: async () => {
        throw new Error("receipt must not be read after Update success");
      },
    }),
  } as never;
  assert.deepEqual(
    await submitIncidentProcessCancellationAtWorkflowId(
      client,
      "workflow-address",
      processInstanceId,
      cancellation,
    ),
    {
      kind: "semantic",
      commandId: cancellation.commandId,
      outcome: "committed",
    },
  );
  assert.equal(JSON.stringify(calls).includes("bpmn-cancel-incident-process"), true);
  assert.equal(JSON.stringify(calls).includes(processInstanceId), true);
});

test("refuses extra fields and mismatched Process identities before host lookup", async () => {
  const client = {
    getHandle: () => {
      throw new Error("host lookup must not occur");
    },
  } as never;
  await assert.rejects(() =>
    submitIncidentProcessCancellationAtWorkflowId(
      client,
      "workflow-address",
      processInstanceId,
      { ...cancellation, owner: "caller-owned" } as never,
    )
  );
  await assert.rejects(() =>
    submitIncidentProcessCancellationAtWorkflowId(
      client,
      "workflow-address",
      processInstanceId,
      { ...cancellation, processInstanceId: "Instance_2" },
    )
  );
  await assert.rejects(() =>
    submitIncidentProcessCancellationAtWorkflowId(
      client,
      "workflow-address",
      processInstanceId,
      {
        ...cancellation,
        incidentId: {
          ...cancellation.incidentId,
          effectId: {
            ...cancellation.incidentId.effectId,
            processInstanceId: "Instance_2",
          },
        },
      },
    )
  );
});
