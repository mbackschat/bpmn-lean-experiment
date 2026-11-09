/**
 * Committed publication through an opaque locator: execution and flow-node-occurrence batches from the host's
 * journal-derived pages, only for the definition and instance the caller expects.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionStartStatus,
  EnginePublicationStatus,
  engineProcessLocatorForCanonicalProcess,
  observeEngineProcessExecution,
  observeEngineProcessFlowNodeOccurrences,
  observeOpenWork,
  completeWork,
  startBpmnDefinitionVersion,
  type EngineDefinitionIdentity,
} from "@bpmn-lean/engine-api";

import { limits, scenarioBytes, sha256, standardProfile, testHost, type TestHost } from "./support.ts";

const locator = engineProcessLocatorForCanonicalProcess("published");

async function started(): Promise<Readonly<{ host: TestHost; definition: EngineDefinitionIdentity }>> {
  const host = testHost();
  const bytes = await scenarioBytes("user-task-preserved-notation/process.bpmn");
  const start = await startBpmnDefinitionVersion({
    host, bytes, sourceId: "approval", expectedSha256: await sha256(bytes), profile: standardProfile,
    expectedProcessId: "Process_SequentialUserTask", version: 4, processInstanceId: "published", initialVariables: [], limits,
  });
  if (start.status !== EngineDefinitionStartStatus.Started) throw new Error("not started");
  assert.equal(start.definition.ref.version, 4);
  return { host, definition: start.definition };
}

test("the start's journal is one execution batch and one occurrence batch from revision 0", async () => {
  const { host, definition } = await started();
  const execution = await observeEngineProcessExecution({ host, locator, definition, processInstanceId: "published", afterRevision: 0 });
  assert.equal(execution.status, EnginePublicationStatus.Available);
  if (execution.status !== EnginePublicationStatus.Available) return;
  assert.equal(execution.batches.length, 1);
  assert.equal(execution.batches[0]?.commandId, "start:published");
  assert.equal(execution.batches[0]?.fromRevision, 0);
  assert.equal(execution.headRevision, execution.batches[0]?.throughRevision);
  const occurrences = await observeEngineProcessFlowNodeOccurrences({
    host, locator, definition, processInstanceId: "published", afterRevision: 0 });
  assert.equal(occurrences.status, EnginePublicationStatus.Available);
  if (occurrences.status !== EnginePublicationStatus.Available) return;
  assert.ok(occurrences.batches[0]?.transitions.some((transition) =>
    transition.started.some((fact) => fact.occurrence.elementId === "UserTask_Approve")));
  const after = await observeEngineProcessExecution({
    host, locator, definition, processInstanceId: "published", afterRevision: execution.headRevision });
  assert.equal(after.status, EnginePublicationStatus.Available);
  if (after.status !== EnginePublicationStatus.Available) return;
  assert.deepEqual([after.headRevision, after.batches], [execution.headRevision, []]);
});

test("a page that reaches the head carries the committed state at the head; an earlier page carries none", async () => {
  const { host, definition } = await started();
  const work = { host, locator, hostingProcessInstanceId: "published" };
  const [task] = (await observeOpenWork(work) as Extract<Awaited<ReturnType<typeof observeOpenWork>>, { openUserTasks: unknown }>)
    .openUserTasks;
  if (task === undefined) throw new Error("no open task");
  await completeWork({ ...work, completion: { commandId: "complete", taskId: task.id, values: [] } });
  const request = { host, locator, definition, processInstanceId: "published", afterRevision: 0 };
  const first = await observeEngineProcessExecution({ ...request, limit: 1 });
  assert.equal(first.status, EnginePublicationStatus.Available);
  if (first.status !== EnginePublicationStatus.Available) return;
  assert.equal(first.current, null);
  const rest = await observeEngineProcessExecution({ ...request, afterRevision: first.batches[0]!.throughRevision });
  assert.equal(rest.status, EnginePublicationStatus.Available);
  if (rest.status !== EnginePublicationStatus.Available) return;
  assert.equal(rest.current?.revision, rest.headRevision);
  assert.equal(rest.current?.state.status, "completed");
  assert.equal(rest.current?.state.instanceId, "published");
});

test("a chain running another definition or instance is an integrity failure; an unknown one is unknown", async () => {
  const { host, definition } = await started();
  const otherProfile = await observeEngineProcessExecution({
    host, locator, definition: { ...definition, profile: "other" }, processInstanceId: "published", afterRevision: 0 });
  assert.equal(otherProfile.status, EnginePublicationStatus.IntegrityFailure);
  const otherInstance = await observeEngineProcessExecution({
    host, locator, definition, processInstanceId: "other", afterRevision: 0 });
  assert.equal(otherInstance.status, EnginePublicationStatus.IntegrityFailure);
  const unknown = await observeEngineProcessExecution({
    host, locator: engineProcessLocatorForCanonicalProcess("nobody"), definition, processInstanceId: "nobody", afterRevision: 0 });
  assert.deepEqual(unknown, { status: EnginePublicationStatus.Unknown });
});
