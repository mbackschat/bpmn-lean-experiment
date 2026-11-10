/**
 * The in-process `ProcessHost`: the client-visible verdicts of a chain (start once per Workflow ID, Update verdicts,
 * ended chains) over the TypeScript kernel, without a Temporal server.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { kernelProfileOptions, readKernelProgram } from "@bpmn-lean/bpmn-source";

import type { JsonValue } from "../src/port.ts";
import type { HostConfig } from "../src/protocol.ts";

const { createMemoryProcessHost } = await import(new URL("../dist/memory-host.js", import.meta.url).href) as
  typeof import("../src/memory-host.ts");
const { Scheduling } = await import(new URL("../dist/protocol.js", import.meta.url).href) as
  typeof import("../src/protocol.ts");
const { PageKind } = await import(new URL("../dist/publication.js", import.meta.url).href) as
  typeof import("../src/publication.ts");

const durable: HostConfig = { scheduling: Scheduling.Durable, effectStartToCloseMs: 1_000, historyEventBudget: null };

async function userTaskProgram(): Promise<JsonValue> {
  const read = await readKernelProgram({
    bytes: await readFile(new URL("../../../scenarios/user-task-preserved-notation/process.bpmn", import.meta.url)),
    overlay: null,
    profile: "test-profile",
    limits: { maxBytes: 1_048_576, parserDeadlineMs: 1_000 },
  }, kernelProfileOptions([]));
  if (read.kind !== "read") throw new Error(`reader refused ${read.code}`);
  return JSON.parse(JSON.stringify(read.program)) as JsonValue;
}

const start = { kind: "start", commandId: "start", instanceId: "I", variables: [] };
const complete = {
  kind: "command",
  commandId: "complete",
  occurrence: { processInstanceId: "I", elementId: "UserTask_Approve", activation: 1 },
  action: { kind: "completeUserTask", values: [] },
};

test("a start commits once per Workflow ID and keeps the caller's memo for describe", async () => {
  const host = createMemoryProcessHost({ taskQueue: "queue", now: () => 5_000 });
  const program = await userTaskProgram();
  const first = await host.start({ workflowId: "W", program, config: durable, start, memo: { tag: "x" } });
  assert.equal(first.outcome, "committed");
  assert.deepEqual(await host.start({ workflowId: "W", program, config: durable, start }),
    { outcome: "rejected", code: "workflow-already-started", revision: null });
  assert.deepEqual(await host.describe("W"),
    { workflowId: "W", workflowType: "runProcess", taskQueue: "queue", running: true, memo: { tag: "x" } });
  assert.equal(await host.describe("absent"), null);
});

test("a command commits through the kernel and publishes its journal; the ended chain refuses further Updates", async () => {
  const host = createMemoryProcessHost({ taskQueue: "queue", now: () => 5_000 });
  await host.start({ workflowId: "W", program: await userTaskProgram(), config: durable, start });
  const before = await host.hostView("W");
  assert.equal(before.view?.openWaits[0]?.id.elementId, "UserTask_Approve");
  const completed = await host.command("W", complete);
  assert.equal(completed.outcome, "committed");
  assert.ok((completed.revision ?? 0) > before.revision);
  assert.equal((await host.describe("W"))?.running, false);
  const page = await host.publication("W", 0);
  assert.equal(page.kind, PageKind.Available);
  assert.deepEqual(await host.command("W", complete), { outcome: "rejected", code: "workflow-closed", revision: null });
});

// One input's journal grows with its closure: a 2,000-step automatic loop published 2.2 MB of it, beyond Temporal's
// 2 MB query blob limit (PR #69, 2026-11-10). The publication pages carry those facts in bounded pages instead.
test("a host snapshot carries the open state without the last input's journal", async () => {
  const host = createMemoryProcessHost({ taskQueue: "queue" });
  await host.start({ workflowId: "W", program: await userTaskProgram(), config: durable, start });
  const snapshot = await host.hostView("W");
  assert.equal(snapshot.view?.openWaits[0]?.id.elementId, "UserTask_Approve");
  assert.equal(Object.hasOwn(snapshot.view ?? {}, "journal"), false);
});

test("under durable scheduling the host owns logical time: a stated time is refused, an absent one is stamped", async () => {
  const host = createMemoryProcessHost({ taskQueue: "queue", now: () => 7_000 });
  const program = await userTaskProgram();
  assert.deepEqual(await host.start({ workflowId: "W", program, config: durable, start: { ...start, at: 1 } }),
    { outcome: "rejected", code: "host-owns-logical-time", revision: null });
  await host.start({ workflowId: "V", program, config: durable, start });
  const observed = await host.observation("V") as { readonly logicalTimeMs: number };
  assert.equal(observed.logicalTimeMs, 7_000);
});

test("a stale command is rejected without a revision and changes nothing", async () => {
  const host = createMemoryProcessHost({ taskQueue: "queue" });
  await host.start({ workflowId: "W", program: await userTaskProgram(), config: durable, start });
  const head = (await host.hostView("W")).revision;
  const stale = await host.command("W", { ...complete, occurrence: { ...complete.occurrence, activation: 9 } });
  assert.equal(stale.outcome, "rejected");
  assert.equal(stale.revision, null);
  assert.equal((await host.hostView("W")).revision, head);
});
