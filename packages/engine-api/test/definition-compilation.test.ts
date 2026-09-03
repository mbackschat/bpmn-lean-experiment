/**
 * The engine API exposes admission facts needed by product 2 without exposing the checked graph or
 * Semantic Process program that remain private to product 1.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  EngineDefinitionCompilationStatus,
  compileBpmnDefinition,
} from "@bpmn-lean/engine-api";

const admittedSource = new URL(
  "../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const timerStartSource = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const messageStartSource = new URL(
  "../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);
const messageCorrelationSource = new URL(
  "../../../scenarios/message-key-correlation/process.bpmn",
  import.meta.url,
);
const limits = {
  maxBytes: 1_048_576,
  parserDeadlineMs: 1_000,
} as const;
const semanticProfile = "bpmn-2.0.2-user-task-preserved-notation-draft";

test("projects accepted source identity without exposing engine representations", async () => {
  const result = await compileBpmnDefinition({
    bytes: await readFile(admittedSource),
    sourceId: "third-party-review-process",
    semanticProfile,
    expectedSha256: undefined,
    limits,
  });

  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  assert.equal(result.source.id, "third-party-review-process");
  assert.match(result.source.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.definition.processId, "Process_SequentialUserTask");
  assert.equal(result.definition.semanticProfile, semanticProfile);
  assert.deepEqual(result.startCapabilities, {
    messageStarts: [],
    timerStarts: [],
  });
  assert.equal("checkedProcess" in result, false);
  assert.equal("semanticProcess" in result, false);
});

test("projects the admitted Timer Start identity and normalized duration", async () => {
  const result = await compileBpmnDefinition({
    bytes: await readFile(timerStartSource),
    sourceId: "third-party-timer-start-process",
    semanticProfile: "bpmn-2.0.2-timer-start-event-draft",
    expectedSha256: undefined,
    limits,
  });

  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  assert.deepEqual(result.startCapabilities, {
    messageStarts: [],
    timerStarts: [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }],
  });
  assert.equal("checkedProcess" in result, false);
  assert.equal("semanticProcess" in result, false);
});

test("projects the exact complete operation-addressed Message Start capability", async () => {
  const result = await compileBpmnDefinition({
    bytes: await readFile(messageStartSource),
    sourceId: "arbitrary message source",
    semanticProfile: "bpmn-2.0.2-message-start-event-draft",
    expectedSha256: undefined,
    limits,
  });

  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  assert.deepEqual(result.startCapabilities, {
    messageStarts: [{
      startEventId: "MessageStart_ApprovalRequest",
      channel: {
        kind: "operationMessage",
        interfaceId: "Interface_ProcessMessages",
        interfaceOperationId: "Operation_ReceiveApprovalRequest",
        messageId: "Message_ApprovalRequest",
      },
    }],
    timerStarts: [],
  });
  const changedOperation = {
    ...result.startCapabilities,
    messageStarts: result.startCapabilities.messageStarts.map((capability) => ({
      ...capability,
      channel: {
        ...capability.channel,
        interfaceOperationId: "Operation_ChangedOnly",
      },
    })),
  };
  assert.notDeepEqual(changedOperation, result.startCapabilities);
});

test("projects the complete target-free correlated Message capability", async () => {
  const result = await compileBpmnDefinition({
    bytes: await readFile(messageCorrelationSource),
    sourceId: "message-key-correlation-process",
    semanticProfile: "bpmn-2.0.2-message-key-correlation-draft",
    expectedSha256: undefined,
    limits,
  });

  assert.equal(result.status, EngineDefinitionCompilationStatus.Accepted);
  assert.deepEqual(result.correlationCapabilities, {
    messages: [{
      catchEventId: "MessageCatch_CorrelatedSettlement",
      address: {
        definition: {
          compiler: "bpmn-source-semantic-process",
          semanticProfile: "bpmn-2.0.2-message-key-correlation-draft",
          sourceId: "message-key-correlation-process",
          sourceSha256: "8d16faca66b00378d4ab02189cdd3270143076a46086b46dff68729d90dba086",
          sourceOverlay: null,
        },
        processId: "Process_SettlementCorrelation",
        channel: {
          kind: "operationMessage",
          interfaceId: "Interface_ClearingHouse",
          interfaceOperationId: "Operation_ConfirmSettlement",
          messageId: "Message_SettlementConfirmed",
        },
        correlationKeyId: "CorrelationKey_SettlementReference",
      },
    }],
  });
  assert.equal(JSON.stringify(result).includes("processInstanceId"), false);
  assert.equal(JSON.stringify(result).includes("subscriptionId"), false);
});

test("retains every located rejection while keeping engine representations private", async () => {
  const source = (await readFile(admittedSource, "utf8")).replace(
    "<bpmn:textAnnotation",
    '<bpmn:scriptTask id="ScriptTask_1" name="Compute"/><bpmn:textAnnotation',
  );
  const result = await compileBpmnDefinition({
    bytes: new TextEncoder().encode(source),
    sourceId: "third-party-unsupported-process",
    semanticProfile,
    expectedSha256: undefined,
    limits,
  });

  assert.equal(result.status, EngineDefinitionCompilationStatus.Rejected);
  assert.deepEqual(
    result.diagnostics.map(({ code, element }) => ({
      code,
      id: element?.id,
      type: element?.type,
    })),
    [{
      code: "unsupportedElementType",
      id: "ScriptTask_1",
      type: "bpmn:ScriptTask",
    }],
  );
  assert.equal("checkedProcess" in result, false);
  assert.equal("semanticProcess" in result, false);
});
