/** Product 2 reaches BPMN compilation and exact-version start only through this gateway. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnEngineGateway,
  DefinitionCompilationStatus,
  DefinitionStartStatus,
  createBpmnEngineGatewayRuntime,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  BpmnEngineGatewayOptions,
} from "@bpmn-lean/platform-engine-gateway";

const admittedSource = new URL(
  "../../../../scenarios/user-task-preserved-notation/process.bpmn",
  import.meta.url,
);
const timerStartSource = new URL(
  "../../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const messageStartSource = new URL(
  "../../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);
const semanticProfile = "bpmn-2.0.2-user-task-preserved-notation-draft";

test("compiles exact third-party bytes through the only product-2 engine boundary", async () => {
  const gateway = new BpmnEngineGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fakeClient([]),
    temporalTaskQueue: "m1-start-queue",
  });
  const result = await gateway.compileDefinition({
    bytes: await readFile(admittedSource),
    sourceId: "uploaded-review-process",
    semanticProfile,
    expectedSha256: undefined,
  });

  assert.equal(result.status, DefinitionCompilationStatus.Accepted);
  assert.equal(result.source.id, "uploaded-review-process");
  assert.equal(result.definition.processId, "Process_SequentialUserTask");
  assert.equal(result.definition.semanticProfile, semanticProfile);
  assert.deepEqual(result.startCapabilities, {
    messageStarts: [],
    timerStarts: [],
  });
});

test("maps the Timer Start capability into a platform-owned gateway value", async () => {
  const gateway = new BpmnEngineGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fakeClient([]),
    temporalTaskQueue: "m1-start-queue",
  });
  const result = await gateway.compileDefinition({
    bytes: await readFile(timerStartSource),
    sourceId: "uploaded-timer-start-process",
    semanticProfile: "bpmn-2.0.2-timer-start-event-draft",
    expectedSha256: undefined,
  });

  assert.equal(result.status, DefinitionCompilationStatus.Accepted);
  assert.deepEqual(result.startCapabilities, {
    messageStarts: [],
    timerStarts: [{ startEventId: "TimerStart_PT1S", durationMs: 1_000 }],
  });
});

test("maps every operation-addressed Message Start field into the platform value", async () => {
  const gateway = new BpmnEngineGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fakeClient([]),
    temporalTaskQueue: "m1-start-queue",
  });
  const result = await gateway.compileDefinition({
    bytes: await readFile(messageStartSource),
    sourceId: "uploaded-message-start-process",
    semanticProfile: "bpmn-2.0.2-message-start-event-draft",
    expectedSha256: undefined,
  });

  assert.equal(result.status, DefinitionCompilationStatus.Accepted);
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
});

test("starts through the exact gateway boundary without exposing the SDK handle", async () => {
  const bytes = await readFile(admittedSource);
  const calls: unknown[] = [];
  const gateway = new BpmnEngineGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fakeClient(calls, {
      privateHandleSentinel: "must-not-escape",
    }),
    temporalTaskQueue: "m1-start-queue",
  });
  const result = await gateway.startDefinitionVersion({
    bytes,
    sourceId: "uploaded-review-process",
    expectedSha256: sha256(bytes),
    semanticProfile,
    expectedProcessId: "Process_SequentialUserTask",
    processInstanceId: "gateway-instance-1",
    initialVariables: [],
  });

  assert.equal(result.status, DefinitionStartStatus.Started);
  assert.equal(result.processInstanceId, "gateway-instance-1");
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
});

test("prepares without SDK calls and retains an opaque locator for exact start", async () => {
  const bytes = await readFile(admittedSource);
  const calls: unknown[] = [];
  const gateway = new BpmnEngineGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fakeClient(calls),
    temporalTaskQueue: "m1-start-queue",
  });
  const request = {
    bytes,
    sourceId: "uploaded-review-process",
    expectedSha256: sha256(bytes),
    semanticProfile,
    expectedProcessId: "Process_SequentialUserTask",
    processInstanceId: "prepared-instance-1",
    initialVariables: [],
  };

  const prepared = await gateway.prepareDefinitionVersion(request);
  assert.equal(prepared.status, DefinitionStartStatus.Admitted);
  assert.equal(calls.length, 0);
  assert.equal("locator" in prepared, true);
  if (prepared.status !== DefinitionStartStatus.Admitted) return;
  assert.match(prepared.locator, /^bpmn-process-work-v1:/u);

  const started = await gateway.startPreparedDefinitionVersion({
    ...request,
    expectedIntent: prepared.intent,
  });
  assert.equal(started.status, DefinitionStartStatus.Started);
  assert.equal(calls.length, 1);
});

test("forwards exact Sequential Multi-Instance start data through the gateway", async () => {
  const bytes = await readFile(new URL(
    "../../../../scenarios/sequential-multi-instance/process.bpmn",
    import.meta.url,
  ));
  const calls: unknown[] = [];
  const gateway = new BpmnEngineGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fakeClient(calls),
    temporalTaskQueue: "mue-alpha-queue",
  });
  const initialVariables = [{
    name: "DataObjectReference_InputItems",
    value: {
      kind: "stringList",
      value: ["contract", "invoice", "receipt"],
    },
  }] as const;

  const result = await gateway.startDefinitionVersion({
    bytes,
    sourceId: "sequential-multi-instance-review",
    expectedSha256: sha256(bytes),
    semanticProfile: "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
    expectedProcessId: "Process_SequentialMultiInstanceReview",
    processInstanceId: "gateway-multi-instance-1",
    initialVariables,
  });

  assert.equal(result.status, DefinitionStartStatus.Started);
  assert.deepEqual(
    (calls[0] as { options: { args: [{ initialVariables: unknown }] } })
      .options.args[0].initialVariables,
    initialVariables,
  );
});

test("constructs a close-idempotent gateway runtime without connecting", async () => {
  const runtime = createBpmnEngineGatewayRuntime({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalAddress: "unreachable.invalid:7233",
    temporalNamespace: "m1-test",
    temporalTaskQueue: "m1-start-queue",
    temporalConnectTimeoutMs: 1,
  });

  assert.equal(typeof runtime.messageStartHost.prepare, "function");
  assert.equal(typeof runtime.messageStartHost.start, "function");
  assert.equal(typeof runtime.messageStartHost.describe, "function");
  assert.equal(typeof runtime.ensureConnected, "function");
  const firstClose = runtime.close();
  assert.strictEqual(runtime.close(), firstClose);
  await firstClose;
});

test("rejects invalid concrete Temporal runtime configuration synchronously", () => {
  const valid = {
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalAddress: "127.0.0.1:7233",
    temporalNamespace: "m1-test",
    temporalTaskQueue: "m1-start-queue",
    temporalConnectTimeoutMs: 1_000,
  } as const;
  const cases = [
    { ...valid, temporalAddress: "" },
    { ...valid, temporalNamespace: "" },
    { ...valid, temporalTaskQueue: "" },
    { ...valid, temporalConnectTimeoutMs: 0 },
  ] as const;

  for (const options of cases) {
    assert.throws(() => createBpmnEngineGatewayRuntime(options));
  }
});

function fakeClient(
  calls: unknown[],
  handle: unknown = {},
): BpmnEngineGatewayOptions["temporalClient"] {
  return {
    start: async (_workflowType: unknown, options: unknown) => {
      calls.push({ options });
      return handle;
    },
  } as unknown as BpmnEngineGatewayOptions["temporalClient"];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
