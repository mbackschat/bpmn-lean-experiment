/**
 * Human work through an opaque locator: the open User Task waits of a running process, one task's detail with the
 * requested instance variables, completion as the kernel's command, and the closed and unknown cases.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionStartStatus,
  EngineOpenWorkStatus,
  EngineWorkDetailStatus,
  completeWork,
  engineProcessLocatorForCanonicalProcess,
  observeOpenWork,
  readWorkDetail,
  startBpmnDefinitionVersion,
} from "@bpmn-lean/engine-api";

import { limits, scenarioBytes, sha256, standardProfile, testHost, type TestHost } from "./support.ts";

const taskId = { processInstanceId: "work-instance", elementId: "UserTask_Approve", activation: 1 };
const locator = engineProcessLocatorForCanonicalProcess("work-instance");

async function started(): Promise<TestHost> {
  const host = testHost();
  const bytes = await scenarioBytes("user-task-preserved-notation/process.bpmn");
  const start = await startBpmnDefinitionVersion({
    host,
    bytes,
    sourceId: "approval",
    expectedSha256: await sha256(bytes),
    profile: standardProfile,
    expectedProcessId: "Process_SequentialUserTask",
    version: 1,
    processInstanceId: "work-instance",
    initialVariables: [{ name: "requester", value: { kind: "string", value: "ada" } }],
    limits,
  });
  assert.equal(start.status, EngineDefinitionStartStatus.Started);
  return host;
}

test("a running process shows its open User Task with the kernel's task detail", async () => {
  const host = await started();
  const work = await observeOpenWork({ host, locator, hostingProcessInstanceId: "work-instance" });
  assert.equal(work.status, EngineOpenWorkStatus.Open);
  if (work.status !== EngineOpenWorkStatus.Open) return;
  assert.equal(work.openUserTasks.length, 1);
  assert.deepEqual(work.openUserTasks[0]?.id, taskId);
  assert.equal(work.openUserTasks[0]?.detail.kind, "userTask");
});

test("task detail carries the requested instance variables that exist, in the requested order", async () => {
  const host = await started();
  const detail = await readWorkDetail({
    host, locator, hostingProcessInstanceId: "work-instance", taskId, inputVariableNames: ["absent", "requester"] });
  assert.equal(detail.status, EngineWorkDetailStatus.Found);
  if (detail.status === EngineWorkDetailStatus.Found) {
    assert.deepEqual(detail.detail.inputVariables, [{ name: "requester", value: { kind: "string", value: "ada" } }]);
  }
  const other = await readWorkDetail({
    host, locator, hostingProcessInstanceId: "work-instance", taskId: { ...taskId, activation: 2 }, inputVariableNames: [] });
  assert.equal(other.status, EngineWorkDetailStatus.NotFound);
});

test("completion commits through the kernel; the ended process is closed to further work", async () => {
  const host = await started();
  const completion = { commandId: "complete-1", taskId, values: [] };
  assert.deepEqual(await completeWork({ host, locator, hostingProcessInstanceId: "work-instance", completion }),
    { kind: "semantic", commandId: "complete-1", outcome: "committed", code: null });
  assert.deepEqual(await observeOpenWork({ host, locator, hostingProcessInstanceId: "work-instance" }),
    { status: EngineOpenWorkStatus.Closed });
  assert.deepEqual(await completeWork({ host, locator, hostingProcessInstanceId: "work-instance", completion }),
    { kind: "processClosed", commandId: "complete-1", receipt: { processInstanceId: "work-instance", status: "completed" } });
});

test("a stale completion is the kernel's rejection with its code", async () => {
  const host = await started();
  const result = await completeWork({
    host, locator, hostingProcessInstanceId: "work-instance",
    completion: { commandId: "stale", taskId: { ...taskId, activation: 7 }, values: [] },
  });
  assert.equal(result.kind, "semantic");
  if (result.kind === "semantic") {
    assert.equal(result.outcome, "rejected");
    assert.notEqual(result.code, null);
  }
});

test("a locator the host does not know, or one minted for another instance, is unknown", async () => {
  const host = await started();
  assert.deepEqual(await observeOpenWork({
    host, locator: engineProcessLocatorForCanonicalProcess("nobody"), hostingProcessInstanceId: "nobody" }),
    { status: EngineOpenWorkStatus.Unknown });
  assert.deepEqual(await observeOpenWork({ host, locator, hostingProcessInstanceId: "someone-else" }),
    { status: EngineOpenWorkStatus.Unknown });
});
