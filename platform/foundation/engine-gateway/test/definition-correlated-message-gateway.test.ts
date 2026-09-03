import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  BpmnDefinitionCorrelatedMessageGateway,
  DefinitionCorrelatedMessageCapabilityStatus,
  DefinitionCorrelatedMessagePublicationStatus,
  DefinitionCorrelatedMessageResolutionKind,
} from "@bpmn-lean/platform-engine-gateway";
import type {
  BpmnDefinitionCorrelatedMessageGatewayOptions,
  DefinitionCorrelatedMessageHost,
} from "@bpmn-lean/platform-engine-gateway";

const sourceUrl = new URL(
  "../../../../scenarios/message-key-correlation/process.bpmn",
  import.meta.url,
);

test("projects only the public trigger facts from the exact admitted definition", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new UnavailableCorrelationClient();
  const host: DefinitionCorrelatedMessageHost = gateway(fake);

  const result = await host.describe({
    bytes,
    definition: definitionFor(bytes),
  });

  assert.deepEqual(result, {
    status: DefinitionCorrelatedMessageCapabilityStatus.Available,
    messages: [{
      catchEventId: "MessageCatch_CorrelatedSettlement",
      channel: {
        kind: "operationMessage",
        interfaceId: "Interface_ClearingHouse",
        interfaceOperationId: "Operation_ConfirmSettlement",
        messageId: "Message_SettlementConfirmed",
      },
      correlationKeyId: "CorrelationKey_SettlementReference",
    }],
  });
  assert.equal(fake.starts, 0);
  assert.equal(JSON.stringify(result).includes("sourceSha256"), false);
  assert.equal(JSON.stringify(result).includes("processInstanceId"), false);
});

test("revalidates exact source and capability before any correlation ingress call", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new UnavailableCorrelationClient();
  const host = gateway(fake);
  const base = {
    bytes,
    definition: definitionFor(bytes),
    commandId: "correlation-publication-1",
    payload: { kind: "string", value: "settlement-42" },
  } as const;

  const missing = await host.publish({
    ...base,
    catchEventId: "MessageCatch_Unknown",
  });
  const changedBytes = await host.publish({
    ...base,
    bytes: Buffer.concat([bytes, Buffer.from("\n")]),
    catchEventId: "MessageCatch_CorrelatedSettlement",
  });

  assert.deepEqual(missing, {
    status: DefinitionCorrelatedMessagePublicationStatus.CapabilityNotFound,
  });
  assert.equal(
    changedBytes.status,
    DefinitionCorrelatedMessagePublicationStatus.IntegrityFailure,
  );
  assert.equal(fake.starts, 0);
});

test("publishes the selected target-free command and keeps host identity private", async () => {
  const bytes = await readFile(sourceUrl);
  const fake = new UnavailableCorrelationClient();
  const host = gateway(fake);

  const result = await host.publish({
    bytes,
    definition: definitionFor(bytes),
    catchEventId: "MessageCatch_CorrelatedSettlement",
    commandId: "correlation-publication-1",
    payload: { kind: "string", value: "settlement-42" },
  });

  assert.equal(
    result.status,
    DefinitionCorrelatedMessagePublicationStatus.Resolved,
  );
  if (result.status !== DefinitionCorrelatedMessagePublicationStatus.Resolved) {
    throw new TypeError("Expected a resolved correlation publication");
  }
  assert.equal(
    result.resolution.kind,
    DefinitionCorrelatedMessageResolutionKind.InfrastructureIndeterminate,
  );
  assert.equal(fake.starts, 1);
  assert.deepEqual(fake.startArgs?.[0], {
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "bpmn-2.0.2-message-key-correlation-draft",
      sourceId: "message-key-correlation-process",
      sourceSha256: sha256(bytes),
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
  });
  assert.equal(JSON.stringify(result).includes("workflowId"), false);
  assert.equal(JSON.stringify(result).includes("subscriptionId"), false);
});

class UnavailableCorrelationClient {
  starts = 0;
  startArgs: readonly unknown[] | undefined;
  readonly client = {
    start: async (_workflowType: string, options: Readonly<{ args: readonly unknown[] }>) => {
      this.starts += 1;
      this.startArgs = options.args;
      return {};
    },
    getHandle: () => ({
      query: async () => {
        throw new Error("deliberately unavailable");
      },
    }),
  } as unknown as BpmnDefinitionCorrelatedMessageGatewayOptions["temporalClient"];
}

function gateway(
  fake: UnavailableCorrelationClient,
): BpmnDefinitionCorrelatedMessageGateway {
  return new BpmnDefinitionCorrelatedMessageGateway({
    maxSourceBytes: 1_048_576,
    parserDeadlineMs: 1_000,
    temporalClient: fake.client,
    temporalTaskQueue: "message-correlation-queue",
  });
}

function definitionFor(bytes: Uint8Array) {
  return {
    processId: "Process_SettlementCorrelation",
    source: {
      id: "message-key-correlation-process",
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    },
    semanticProfile: "bpmn-2.0.2-message-key-correlation-draft",
  } as const;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
