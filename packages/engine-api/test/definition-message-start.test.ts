/**
 * Message Start: the selected published Message start dispatches once under the caller's Workflow ID, a repeated
 * publication reuses that address and is the same start, and a selection the definition does not publish is refused.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  EngineDefinitionMessageStartFailureCode,
  EngineDefinitionMessageStartStatus,
  EngineStartDescriptionStatus,
  compileBpmnDefinition,
  describeBpmnDefinitionMessageStart,
  engineDefinitionMessageStartWorkflowId,
  observeOpenWork,
  engineProcessLocatorForCanonicalProcess,
  prepareBpmnDefinitionMessageStart,
  startBpmnDefinitionMessageStart,
  EngineOpenWorkStatus,
  type EngineDefinitionMessageStartPreparationRequest,
} from "@bpmn-lean/engine-api";

import { deployed, limits, scenarioBytes, sha256, standardProfile, testHost, testPopulation, type TestHost } from "./support.ts";

const channel = {
  kind: "operationMessage",
  interfaceId: "Interface_ProcessMessages",
  interfaceOperationId: "Operation_ReceiveApprovalRequest",
  messageId: "Message_ApprovalRequest",
} as const;

async function request(host: TestHost): Promise<EngineDefinitionMessageStartPreparationRequest> {
  const bytes = await scenarioBytes("message-start-event/process.bpmn");
  const compiled = await compileBpmnDefinition({ bytes, sourceId: "m", profile: standardProfile, limits });
  if (compiled.status !== EngineDefinitionCompilationStatus.Accepted) throw new Error("not admitted");
  return deployed({
    host,
    bytes,
    sourceId: "m",
    expectedSha256: await sha256(bytes),
    expectedByteLength: bytes.byteLength,
    profile: standardProfile,
    expectedProcessId: compiled.definition.ref.definitionKey,
    version: 2,
    expectedStarts: compiled.capabilities.starts,
    messageStart: { startEventId: "MessageStart_ApprovalRequest", channel },
    processInstanceId: "message-instance",
    commandId: "publication-command",
    workflowId: engineDefinitionMessageStartWorkflowId(testPopulation, "message-instance"),
    limits,
  });
}

test("the selected Message start runs once under its address, opening the model's User Task", async () => {
  const host = testHost();
  const prepared = await prepareBpmnDefinitionMessageStart(await request(host));
  assert.equal(prepared.status, EngineDefinitionMessageStartStatus.Admitted);
  if (prepared.status !== EngineDefinitionMessageStartStatus.Admitted) return;
  const started = await startBpmnDefinitionMessageStart({ ...await request(host), expectedIntent: prepared.intent });
  assert.deepEqual(started, { status: EngineDefinitionMessageStartStatus.Started });
  assert.deepEqual(await startBpmnDefinitionMessageStart({ ...await request(host), expectedIntent: prepared.intent }), started);
  const work = await observeOpenWork({
    host,
    locator: engineProcessLocatorForCanonicalProcess(testPopulation, "message-instance"),
    hostingProcessInstanceId: "message-instance",
  });
  assert.equal(work.status, EngineOpenWorkStatus.Open);
  if (work.status === EngineOpenWorkStatus.Open) assert.equal(work.openUserTasks[0]?.id.elementId, "UserTask_Approve");
  assert.equal(await describeBpmnDefinitionMessageStart({
    host, workflowId: engineDefinitionMessageStartWorkflowId(testPopulation, "message-instance"), expectedIntent: prepared.intent }),
    EngineStartDescriptionStatus.Matching);
});

test("a Message start the definition does not publish is refused; changed capabilities are drift", async () => {
  const host = testHost();
  const unselected = await prepareBpmnDefinitionMessageStart({
    ...await request(host),
    messageStart: { startEventId: "MessageStart_ApprovalRequest", channel: { ...channel, messageId: "Other" } },
  });
  assert.equal(unselected.status, EngineDefinitionMessageStartStatus.Rejected);
  if (unselected.status === EngineDefinitionMessageStartStatus.Rejected) {
    assert.equal(unselected.failure.code, EngineDefinitionMessageStartFailureCode.CapabilityNotSelected);
  }
  const drifted = await prepareBpmnDefinitionMessageStart({ ...await request(host), expectedStarts: [] });
  assert.equal(drifted.status, EngineDefinitionMessageStartStatus.IntegrityFailure);
  if (drifted.status === EngineDefinitionMessageStartStatus.IntegrityFailure) {
    assert.equal(drifted.failure.code, EngineDefinitionMessageStartFailureCode.CapabilityDrift);
  }
});
