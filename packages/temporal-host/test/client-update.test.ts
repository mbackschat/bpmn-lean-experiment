/**
 * The client's verdict when Temporal answers an Update with `WorkflowNotFoundError`, which SDK 1.21.0 raises both for
 * an address it never held or no longer retains and for a Workflow that has closed. The client tells them apart by
 * describing the address. The Temporal client here is a stub of exactly those two calls, so this runs without a server;
 * the hosted witness in `host.temporal-test.ts` holds the same verdicts against a real server.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { WorkflowNotFoundError, type Client } from "@temporalio/client";

const { ProcessClient } = await import(new URL("../dist/client.js", import.meta.url).href) as
  typeof import("../src/client.ts");

type Description = Readonly<{ status: Readonly<{ name: string }> }> | "not found" | Error;

/** A Temporal client whose every Update finds no Workflow to take it and whose `describe` answers `description`. */
function clientDescribing(description: Description): Client {
  const notFound = (workflowId: string) => new WorkflowNotFoundError("workflow not found", workflowId, undefined);
  const handle = (workflowId: string) => ({
    executeUpdate: () => Promise.reject(notFound(workflowId)),
    describe: () => description === "not found" ? Promise.reject(notFound(workflowId))
      : description instanceof Error ? Promise.reject(description)
      : Promise.resolve({ workflowId, type: "process", taskQueue: "queue", memo: undefined, ...description }),
  });
  return { workflow: { getHandle: handle } } as unknown as Client;
}

const stimulus = { kind: "command", commandId: "c" };

test("an Update to an address Temporal cannot describe is workflow-unknown", async () => {
  const client = new ProcessClient(clientDescribing("not found"), "queue");
  assert.deepEqual(await client.command("W", stimulus), { outcome: "rejected", code: "workflow-unknown", revision: null });
});

test("an Update to a Workflow Temporal still describes as closed is workflow-closed", async () => {
  const client = new ProcessClient(clientDescribing({ status: { name: "COMPLETED" } }), "queue");
  assert.deepEqual(await client.command("W", stimulus), { outcome: "rejected", code: "workflow-closed", revision: null });
});

test("a describe that fails otherwise, or finds the address running, propagates instead of choosing a verdict", async () => {
  const unavailable = new Error("connection refused");
  await assert.rejects(new ProcessClient(clientDescribing(unavailable), "queue").command("W", stimulus), unavailable);
  await assert.rejects(new ProcessClient(clientDescribing({ status: { name: "RUNNING" } }), "queue").command("W", stimulus),
    /running/u);
});
