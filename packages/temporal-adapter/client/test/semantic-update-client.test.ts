/** Content-bound semantic Updates share one retained-result and closed-Process lifecycle. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { WorkflowNotFoundError } from "@temporalio/client";

import {
  resolveSemanticUpdate,
} from "../dist/semantic-update-client.js";

test("resolves a missing execution through the retained Update before the completed receipt", async () => {
  const calls: string[] = [];
  const result = await resolveSemanticUpdate({
    commandId: "retry-1",
    processInstanceId: "Instance_1",
    updateId: "update-1",
    execute: async () => {
      calls.push("execute");
      throw notFound();
    },
    retained: async () => {
      calls.push("retained");
      return "committed";
    },
    completedReceipt: async () => {
      calls.push("receipt");
      throw new Error("receipt must not be consulted");
    },
  });

  assert.deepEqual(result, {
    kind: "semantic",
    commandId: "retry-1",
    outcome: "committed",
  });
  assert.deepEqual(calls, ["execute", "retained"]);
});

test("distinguishes a matching closed Process from an unknown one", async () => {
  const closed = await resolveSemanticUpdate({
    commandId: "retry-closed",
    processInstanceId: "Instance_1",
    updateId: "update-closed",
    execute: missing,
    retained: missing,
    completedReceipt: async () => receipt("Instance_1"),
  });
  const unknown = await resolveSemanticUpdate({
    commandId: "retry-unknown",
    processInstanceId: "Instance_1",
    updateId: "update-unknown",
    execute: missing,
    retained: missing,
    completedReceipt: missing,
  });

  assert.equal(closed.kind, "processClosed");
  assert.deepEqual(unknown, {
    kind: "processUnknown",
    commandId: "retry-unknown",
    processInstanceId: "Instance_1",
  });
});

test("classifies a strict cancelled receipt as retained Process closure", async () => {
  const closed = await resolveSemanticUpdate({
    commandId: "after-cancellation",
    processInstanceId: "Instance_1",
    updateId: "after-cancellation-update",
    execute: missing,
    retained: missing,
    completedReceipt: async () => receipt("Instance_1", "cancelled"),
  });
  assert.equal(closed.kind, "processClosed");
  assert.equal(
    closed.kind === "processClosed" && closed.receipt.finalState.status,
    "cancelled",
  );
});

async function missing(): Promise<never> {
  throw notFound();
}

function notFound(): WorkflowNotFoundError {
  return new WorkflowNotFoundError("not found", "workflow", undefined);
}

function receipt(processInstanceId: string, status = "completed") {
  return {
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "profile",
      sourceId: "source",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
    },
    processId: "Process_1",
    processInstanceId,
    finalState: {
      kind: "state",
      instanceId: processInstanceId,
      status,
      activeWaits: [],
      openUserTasks: [],
      openMessageSubscriptions: [],
      openTimers: [],
      openEffects: [],
      openIncidents: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    },
    messageDeliveryRecords: [],
  };
}
