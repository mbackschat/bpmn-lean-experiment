/** Product 1 keeps Message Start compilation, admission, construction, and retained comparison private. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { enrollmentFixture } from "../../temporal-adapter/client/test/worker-deployment-enrollment-fixture.ts";

import {
  EngineDefinitionMessageStartDescriptionStatus,
  EngineDefinitionMessageStartStatus,
  describeBpmnDefinitionMessageStart,
  engineDefinitionMessageStartWorkflowId,
  prepareBpmnDefinitionMessageStart,
  startBpmnDefinitionMessageStart,
} from "@bpmn-lean/engine-api";
import type {
  EngineDefinitionMessageStartPreparationRequest,
} from "@bpmn-lean/engine-api";

const sourceUrl = new URL(
  "../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);
const limits = { maxBytes: 1_048_576, parserDeadlineMs: 1_000 } as const;
const messageStart = {
  startEventId: "MessageStart_ApprovalRequest",
  channel: {
    kind: "operationMessage",
    interfaceId: "Interface_ProcessMessages",
    interfaceOperationId: "Operation_ReceiveApprovalRequest",
    messageId: "Message_ApprovalRequest",
  },
} as const;

test("derives the canonical Process Workflow address behind Product 1", () => {
  assert.equal(
    engineDefinitionMessageStartWorkflowId("semantic-instance-42"),
    "bpmn-process-sha256:70bf84dd9e508d837f28845dabf282a408f90ef9516389a59d3a87d7ff0c3104",
  );
});

test("prepares the exact capability and intent with zero SDK calls", async () => {
  const bytes = await readFile(sourceUrl);
  const client = new FakeMessageStartClient();
  const result = await prepareBpmnDefinitionMessageStart(
    preparationFor(bytes),
  );

  assert.equal(result.status, EngineDefinitionMessageStartStatus.Admitted);
  if (result.status !== EngineDefinitionMessageStartStatus.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }
  assert.deepEqual(result.intent, {
    protocol: "bpmn-message-start-v1",
    intentSha256: result.intent.intentSha256,
  });
  assert.match(result.intent.intentSha256, /^[0-9a-f]{64}$/u);
  assert.equal(client.startCalls.length, 0);
  assert.equal(client.describeCalls, 0);
  assert.equal("semanticProcess" in result, false);
  assert.equal("stimulus" in result, false);
  assert.equal("workflowId" in result, false);
});

test("rejects changed Interface Operation selection before any SDK call", async () => {
  const bytes = await readFile(sourceUrl);
  const result = await prepareBpmnDefinitionMessageStart({
    ...preparationFor(bytes),
    expectedMessageStart: {
      ...messageStart,
      channel: {
        ...messageStart.channel,
        interfaceOperationId: "Operation_ChangedOnly",
      },
    },
  });

  assert.equal(result.status, EngineDefinitionMessageStartStatus.Rejected);
});

test("retained overlays reach Message Start profile admission instead of being silently dropped", async () => {
  const bytes = await readFile(sourceUrl);
  const base = preparationFor(bytes);
  const overlayBytes = new TextEncoder().encode(JSON.stringify({
    kind: "bpmnSourceOverlay",
    id: "message-overlay",
    semanticProfile: base.semanticProfile,
    effectBindings: [],
    inertAttributes: [],
  }));
  const actualDigest = createHash("sha256").update(overlayBytes).digest("hex");
  const admitted = await prepareBpmnDefinitionMessageStart(base);
  assert.equal(admitted.status, EngineDefinitionMessageStartStatus.Admitted);
  for (const digest of [actualDigest, "0".repeat(64)]) {
    const client = new FakeMessageStartClient();
    const request = {
      ...base,
      sourceOverlay: { id: "message-overlay", sha256: digest, bytes: overlayBytes },
    };
    const prepared = await prepareBpmnDefinitionMessageStart(request);
    assert.equal(prepared.status, EngineDefinitionMessageStartStatus.IntegrityFailure);
    assert.equal(prepared.failure.code, "definitionCompilationRejected");
    assert.match(prepared.failure.evidence, digest === actualDigest
      ? /does not admit a source overlay/u
      : /expected SHA-256/u);
    const started = await startBpmnDefinitionMessageStart({
      ...request,
      expectedIntent: admitted.intent,
      temporalClient: client.client,
    });
    assert.equal(started.status, EngineDefinitionMessageStartStatus.IntegrityFailure);
    assert.equal(client.startCalls.length, 0);
    assert.equal(client.describeCalls, 0);
  }
});

test("starts only through the persisted matching intent", async () => {
  const bytes = await readFile(sourceUrl);
  const client = new FakeMessageStartClient();
  const prepared = await prepareBpmnDefinitionMessageStart(
    preparationFor(bytes),
  );
  assert.equal(prepared.status, EngineDefinitionMessageStartStatus.Admitted);
  if (prepared.status !== EngineDefinitionMessageStartStatus.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }

  const result = await startBpmnDefinitionMessageStart({
    ...preparationFor(bytes),
    temporalClient: client.client,
    expectedIntent: prepared.intent,
  });

  assert.deepEqual(result, {
    status: EngineDefinitionMessageStartStatus.Started,
  });
  assert.equal(client.startCalls.length, 1);
  assert.equal(client.startCalls[0]?.options.workflowId, "private-workflow-42");
  assert.equal(client.startCalls[0]?.options.args[0].commandId, "private-command-42");
});

test("classifies retained match, divergence, and unavailability without leaking description", async () => {
  const bytes = await readFile(sourceUrl);
  const prepared = await prepareBpmnDefinitionMessageStart(
    preparationFor(bytes),
  );
  assert.equal(prepared.status, EngineDefinitionMessageStartStatus.Admitted);
  if (prepared.status !== EngineDefinitionMessageStartStatus.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }

  for (const [description, expectedStatus] of [
    [foundDescription(prepared.intent), EngineDefinitionMessageStartDescriptionStatus.Matching],
    [{ ...foundDescription(prepared.intent), workflowId: "wrong" }, EngineDefinitionMessageStartDescriptionStatus.Divergent],
    [{ ...foundDescription(prepared.intent), type: "wrong" }, EngineDefinitionMessageStartDescriptionStatus.Divergent],
    [{ ...foundDescription(prepared.intent), taskQueue: "wrong" }, EngineDefinitionMessageStartDescriptionStatus.Divergent],
    [{ ...foundDescription(prepared.intent), memo: undefined }, EngineDefinitionMessageStartDescriptionStatus.Divergent],
    [{
      ...foundDescription(prepared.intent),
      memo: {
        bpmnMessageStartIntent: {
          ...prepared.intent,
          intentSha256: "0".repeat(64),
        },
      },
    }, EngineDefinitionMessageStartDescriptionStatus.Divergent],
    [new TypeError("unavailable secret"), EngineDefinitionMessageStartDescriptionStatus.Unavailable],
  ] as const) {
    const fake = new FakeMessageStartClient(description);
    const result = await describeBpmnDefinitionMessageStart({
      temporalClient: fake.client,
      workflowId: "private-workflow-42",
      taskQueue: "message-start-queue",
      expectedIntent: prepared.intent,
    });
    assert.deepEqual(result, { status: expectedStatus });
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

function preparationFor(
  bytes: Uint8Array,
): EngineDefinitionMessageStartPreparationRequest {
  return {
    bytes,
    sourceId: "stored-message-start-source",
    expectedSha256: createHash("sha256").update(bytes).digest("hex"),
    expectedByteLength: bytes.byteLength,
    semanticProfile: "bpmn-2.0.2-message-start-event-draft",
    expectedProcessId: "Process_MessageStart",
    expectedStartCapabilities: {
      messageStarts: [messageStart],
      timerStarts: [],
    },
    expectedMessageStart: messageStart,
    processInstanceId: "semantic-instance-42",
    commandId: "private-command-42",
    workflowId: "private-workflow-42",
    taskQueue: "message-start-queue",
    limits,
  };
}

function foundDescription(intent: Readonly<{ protocol: string; intentSha256: string }>) {
  return {
    workflowId: "private-workflow-42",
    type: "runBpmnProcess",
    taskQueue: "message-start-queue",
    status: { code: 1, name: "RUNNING" },
    memo: { bpmnMessageStartIntent: intent },
    runId: "private-run",
    historyLength: 1,
    startTime: new Date(0),
    searchAttributes: {},
    typedSearchAttributes: {},
    raw: {},
    staticDetails: async () => undefined,
    staticSummary: async () => undefined,
  };
}

class FakeMessageStartClient {
  readonly startCalls: Array<Readonly<{
    workflowType: unknown;
    options: Readonly<{
      workflowId: string;
      args: readonly [Readonly<{ commandId: string }>, unknown];
    }>;
  }>> = [];
  describeCalls = 0;
  readonly client;

  constructor(description: unknown = undefined) {
    this.client = {
      ...enrollmentFixture("message-start-queue"),
      start: async (workflowType: unknown, options: unknown) => {
        this.startCalls.push({
          workflowType,
          options: options as typeof this.startCalls[number]["options"],
        });
        return {};
      },
      getHandle: () => ({
        describe: async () => {
          this.describeCalls += 1;
          if (description instanceof Error) {
            throw description;
          }
          return description;
        },
      }),
    } as never;
  }
}
