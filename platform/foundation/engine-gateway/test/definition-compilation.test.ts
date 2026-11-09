/** Compilation in Product 2's terms: its definition identity, its start capabilities, and its catalog's profiles. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BpmnEngineGateway,
  DefinitionCompilationStatus,
  unknownProfileCode,
} from "@bpmn-lean/platform-engine-gateway";

import { limits, profileRelations, scenarioBytes, sha256, standardProfile, testHost } from "./support.ts";

function gateway(): BpmnEngineGateway {
  return new BpmnEngineGateway({ ...limits, host: testHost(), profileRelations });
}

test("an accepted Message start definition carries Product 2's identity and its operation-channel start", async () => {
  const bytes = await scenarioBytes("message-start-event/process.bpmn");
  const digest = await sha256(bytes);
  const result = await gateway().compileDefinition({
    bytes, sourceId: "approval", semanticProfile: standardProfile, expectedSha256: digest });
  assert.equal(result.status, DefinitionCompilationStatus.Accepted);
  if (result.status !== DefinitionCompilationStatus.Accepted) return;
  assert.deepEqual(result.source, {
    kind: "bpmnSource",
    id: "approval",
    sha256: digest,
    byteLength: bytes.byteLength,
    declaredEncoding: "UTF-8",
    decodedAs: "UTF-8",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.definition.semanticProfile, standardProfile);
  assert.equal(result.definition.sourceOverlay, null);
  assert.deepEqual(result.startCapabilities.messageStarts, [{
    startEventId: "MessageStart_ApprovalRequest",
    channel: {
      kind: "operationMessage",
      interfaceId: "Interface_ProcessMessages",
      interfaceOperationId: "Operation_ReceiveApprovalRequest",
      messageId: "Message_ApprovalRequest",
    },
  }]);
  assert.deepEqual(result.startCapabilities.timerStarts, []);
});

test("a Timer start is published with the delay the kernel resolves from its schedule", async () => {
  const bytes = await scenarioBytes("timer-start-event/process.bpmn");
  const result = await gateway().compileDefinition({
    bytes, sourceId: "timer", semanticProfile: standardProfile, expectedSha256: undefined });
  assert.equal(result.status, DefinitionCompilationStatus.Accepted);
  if (result.status !== DefinitionCompilationStatus.Accepted) return;
  assert.deepEqual(result.startCapabilities.timerStarts, [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }]);
});

test("a profile outside the deployment's catalog is a rejected compilation with a stable code", async () => {
  const bytes = await scenarioBytes("user-task-preserved-notation/process.bpmn");
  const result = await gateway().compileDefinition({
    bytes, sourceId: "approval", semanticProfile: "absent", expectedSha256: undefined });
  assert.equal(result.status, DefinitionCompilationStatus.Rejected);
  assert.equal(result.diagnostics[0]?.code, unknownProfileCode);
  assert.equal(result.source.decodedAs, null);
});

test("bytes that differ from the expected digest are rejected", async () => {
  const bytes = await scenarioBytes("user-task-preserved-notation/process.bpmn");
  const result = await gateway().compileDefinition({
    bytes, sourceId: "approval", semanticProfile: standardProfile, expectedSha256: "0".repeat(64) });
  assert.equal(result.status, DefinitionCompilationStatus.Rejected);
});
