/** Direct start through the gateway, then the started process's Work: open tasks, detail and completion. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BpmnEngineGateway,
  BpmnProcessWorkGateway,
  DefinitionStartDescriptionStatus,
  processWorkTask,
  DefinitionStartStatus,
  ProcessWorkDetailStatus,
  ProcessWorkObservationStatus,
  type DefinitionVersionStartRequest,
} from "@bpmn-lean/platform-engine-gateway";

import { limits, profileRelations, register, scenarioBytes, sha256, standardProfile, testHost } from "./support.ts";

const processInstanceId = "work-instance";
const taskId = { processInstanceId, elementId: "UserTask_Approve", activation: 1 };

async function request(): Promise<DefinitionVersionStartRequest> {
  const bytes = await scenarioBytes("user-task-preserved-notation/process.bpmn");
  return {
    bytes,
    sourceId: "approval",
    expectedSha256: await sha256(bytes),
    semanticProfile: standardProfile,
    expectedProcessId: "Process_SequentialUserTask",
    version: 1,
    processInstanceId,
    initialVariables: [{ name: "requester", value: { kind: "string", value: "ada" } }],
  };
}

test("a prepared start yields a serialized locator, starts once, and recovery finds it matching", async () => {
  const host = testHost();
  const gateway = new BpmnEngineGateway({ ...limits, host, profileRelations });
  await register(gateway, await request());
  const prepared = await gateway.prepareDefinitionVersion(await request());
  assert.equal(prepared.status, DefinitionStartStatus.Admitted);
  if (prepared.status !== DefinitionStartStatus.Admitted) return;
  assert.equal(typeof prepared.locator, "string");
  assert.equal(prepared.definition.processId, "Process_SequentialUserTask");
  const started = await gateway.startPreparedDefinitionVersion({ ...await request(), expectedIntent: prepared.intent });
  assert.equal(started.status, DefinitionStartStatus.Started);
  const retried = await gateway.startDefinitionVersion(await request());
  assert.equal(retried.status, DefinitionStartStatus.Started);
  assert.deepEqual(await gateway.describeDefinitionVersionStart({ processInstanceId, expectedIntent: prepared.intent }),
    { status: DefinitionStartDescriptionStatus.Matching });
});

test("the started process's Work shows its task, reads its detail and completes it", async () => {
  const host = testHost();
  const gateway = new BpmnEngineGateway({ ...limits, host, profileRelations });
  await register(gateway, await request());
  assert.equal((await gateway.startDefinitionVersion(await request())).status, DefinitionStartStatus.Started);
  const work = new BpmnProcessWorkGateway(host);
  const locator = work.canonicalLocator(processInstanceId);
  const open = await work.observeOpenWork({ locator, hostingProcessInstanceId: processInstanceId });
  assert.deepEqual(open, {
    status: ProcessWorkObservationStatus.Open,
    openUserTasks: [{ id: taskId, name: "Approve", state: "active" }],
  });
  const detail = await work.readWorkDetail({
    locator, hostingProcessInstanceId: processInstanceId, taskId, inputVariableNames: ["requester"] });
  assert.equal(detail.status, ProcessWorkDetailStatus.Found);
  if (detail.status === ProcessWorkDetailStatus.Found) {
    assert.deepEqual(detail.detail.inputVariables, [{ name: "requester", value: { kind: "string", value: "ada" } }]);
  }
  const stimulus = { kind: "completeUserTaskInstance", commandId: "complete-1", taskId, submittedValues: [] } as const;
  assert.deepEqual(await work.completeWork({ locator, hostingProcessInstanceId: processInstanceId, stimulus }),
    { kind: "semantic", commandId: "complete-1", outcome: "committed", code: null });
  assert.deepEqual(await work.observeOpenWork({ locator, hostingProcessInstanceId: processInstanceId }),
    { status: ProcessWorkObservationStatus.Closed });
});

const userTask = {
  name: "Review",
  assignee: null,
  candidateUsers: [],
  candidateGroups: ["reviewers"],
  formKey: null,
  formFields: [{ key: "approved", type: "boolean" }],
};

function wait(detail: object) {
  return { id: taskId, definition: null, input: "completeUserTask", detail: { kind: "userTask", ...detail } } as const;
}

test("a User Task's one candidate group and one boolean form field become the Work task's assignment and form", () => {
  assert.deepEqual(processWorkTask(wait(userTask)), {
    id: taskId,
    name: "Review",
    state: "active",
    metadata: {
      assignment: { candidates: [{ kind: "group", id: "reviewers" }] },
      form: { fields: [{ key: "approved", type: "boolean" }] },
    },
  });
});

test("a User Task whose assignment or form Work cannot present is refused, not narrowed", () => {
  for (const detail of [
    { ...userTask, assignee: "ada" },
    { ...userTask, candidateUsers: ["ada"] },
    { ...userTask, candidateGroups: ["a", "b"] },
    { ...userTask, formKey: "embedded:app:forms/review.html" },
    { ...userTask, formFields: [{ key: "amount", type: "long" }] },
    { ...userTask, candidateGroups: [] },
  ]) {
    assert.throws(() => processWorkTask(wait(detail)), TypeError);
  }
});
