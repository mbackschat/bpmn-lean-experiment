/** Product 2 sees only a closed Message Start host contract, never the program or SDK description. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnDefinitionMessageStartGateway,
  DefinitionMessageStartDescriptionStatus,
  DefinitionMessageStartStatus,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  BpmnDefinitionMessageStartGatewayOptions,
  DefinitionMessageStartHost,
  DefinitionMessageStartRequest,
} from "@bpmn-lean/platform-engine-gateway";

const sourceUrl = new URL(
  "../../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);
const messageStart = {
  startEventId: "MessageStart_ApprovalRequest",
  channel: {
    kind: "operationMessage",
    interfaceId: "Interface_ProcessMessages",
    interfaceOperationId: "Operation_ReceiveApprovalRequest",
    messageId: "Message_ApprovalRequest",
  },
} as const;

test("prepares exact admission and marker with zero SDK operations", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new GatewayMessageStartClient();
  const host: DefinitionMessageStartHost = gateway(fake);

  const result = await host.prepare(requestFor(bytes));

  assert.equal(result.status, DefinitionMessageStartStatus.Admitted);
  if (result.status !== DefinitionMessageStartStatus.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }
  assert.match(result.intent.intentSha256, /^[0-9a-f]{64}$/u);
  assert.equal(fake.starts, 0);
  assert.equal(fake.describes, 0);
  assert.deepEqual(Object.keys(result).sort(), ["intent", "status"]);
});

test("preserves Interface Operation identity and starts through a handle-free boundary", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new GatewayMessageStartClient();
  const host: DefinitionMessageStartHost = gateway(fake);
  const request = requestFor(bytes);
  const prepared = await host.prepare(request);
  assert.equal(prepared.status, DefinitionMessageStartStatus.Admitted);
  if (prepared.status !== DefinitionMessageStartStatus.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }

  const started = await host.start({
    ...request,
    expectedIntent: prepared.intent,
  });
  const wrongOperation = await host.prepare({
    ...request,
    messageStart: {
      ...messageStart,
      channel: {
        ...messageStart.channel,
        interfaceOperationId: "Operation_ChangedOnly",
      },
    },
  });

  assert.deepEqual(started, { status: DefinitionMessageStartStatus.Started });
  assert.equal(wrongOperation.status, DefinitionMessageStartStatus.Rejected);
  assert.equal(fake.starts, 1);
  assert.equal("handle" in started, false);
  assert.equal("workflowId" in started, false);
});

test("closes retained comparison to matching, divergent, or unavailable", async () => {
  const bytes = await readFile(sourceUrl);
  const request = requestFor(bytes);
  const preparationHost = gateway(new GatewayMessageStartClient());
  const prepared = await preparationHost.prepare(request);
  assert.equal(prepared.status, DefinitionMessageStartStatus.Admitted);
  if (prepared.status !== DefinitionMessageStartStatus.Admitted) {
    throw new TypeError("Expected admitted Message Start preparation");
  }

  for (const [description, expected] of [
    [rawDescription(prepared.intent), DefinitionMessageStartDescriptionStatus.Matching],
    [{ ...rawDescription(prepared.intent), type: "wrongWorkflow" }, DefinitionMessageStartDescriptionStatus.Divergent],
    [new Error("private unavailable detail"), DefinitionMessageStartDescriptionStatus.Unavailable],
  ] as const) {
    const fake = new GatewayMessageStartClient(description);
    const result = await gateway(fake).describe({
      workflowId: request.workflowId,
      expectedIntent: prepared.intent,
    });
    assert.deepEqual(result, { status: expected });
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.equal(fake.describes, 1);
  }
});

class GatewayMessageStartClient {
  starts = 0;
  describes = 0;
  readonly client;
  readonly #description: unknown;

  constructor(description: unknown = undefined) {
    this.#description = description;
    this.client = {
      start: async () => {
        this.starts += 1;
        return { privateHandle: true };
      },
      getHandle: () => ({
        describe: async () => {
          this.describes += 1;
          if (this.#description instanceof Error) {
            throw this.#description;
          }
          return this.#description;
        },
      }),
    } as unknown as BpmnDefinitionMessageStartGatewayOptions["temporalClient"];
  }
}

function gateway(
  fake: GatewayMessageStartClient,
): BpmnDefinitionMessageStartGateway {
  return new BpmnDefinitionMessageStartGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fake.client,
    temporalTaskQueue: "message-start-queue",
  });
}

function requestFor(bytes: Uint8Array): DefinitionMessageStartRequest {
  return {
    bytes,
    definition: {
      processId: "Process_MessageStart",
      source: {
        id: "stored-message-start-source",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        byteLength: bytes.byteLength,
      },
      semanticProfile: "bpmn-2.0.2-message-start-event-draft",
      startCapabilities: {
        messageStarts: [messageStart],
        timerStarts: [],
      },
    },
    messageStart,
    processInstanceId: "semantic-instance-42",
    commandId: "private-command-42",
    workflowId: "private-workflow-address-42",
  };
}

function rawDescription(intent: Readonly<{ protocol: string; intentSha256: string }>) {
  return {
    workflowId: "private-workflow-address-42",
    runId: "private-run-must-not-escape",
    type: "runBpmnProcess",
    taskQueue: "message-start-queue",
    status: { code: 1, name: "RUNNING" },
    historyLength: 1,
    startTime: new Date(0),
    memo: { bpmnMessageStartIntent: intent },
    searchAttributes: {},
    typedSearchAttributes: {},
    raw: { privateRaw: true },
    staticDetails: async () => undefined,
    staticSummary: async () => undefined,
  };
}
