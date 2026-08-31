import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
} from "@bpmn-lean/semantic-core";
import {
  bpmnCorrelationIngressProtocolVersion,
  canonicalCorrelationIngressAddressEncoding,
  correlationIngressWorkflowId,
  productionCorrelationIngressConfiguration,
  requireCorrelationIngressEcho,
  sameCorrelationIngressEcho,
} from "@bpmn-lean/temporal-protocol";

const address: CorrelatedMessageAddress = {
  definition: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "message-key-correlation-checkpoint",
    sourceId: "settlement-confirmation",
    sourceSha256: "a".repeat(64),
    sourceOverlay: null,
  },
  processId: "Process_SettlementConfirmation",
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_Settlement",
    interfaceOperationId: "Operation_ConfirmSettlement",
    messageId: "Message_SettlementConfirmed",
  },
  correlationKeyId: "CorrelationKey_Settlement",
};

test("derives one domain-separated Workflow identity from the complete correlated address", () => {
  const canonical = JSON.stringify([
    "bpmnCorrelationIngressAddress",
    [
      [
        address.definition.compiler,
        address.definition.semanticProfile,
        address.definition.sourceId,
        address.definition.sourceSha256,
        ["none"],
      ],
      address.processId,
      [
        address.channel.kind,
        address.channel.interfaceId,
        address.channel.interfaceOperationId,
        address.channel.messageId,
      ],
      address.correlationKeyId,
    ],
  ]);
  const digest = createHash("sha256").update(canonical).digest("hex");

  assert.equal(canonicalCorrelationIngressAddressEncoding(address), canonical);
  assert.equal(
    correlationIngressWorkflowId(address),
    `bpmn-correlation-sha256:${digest}`,
  );

  const variants = [
    withMutation((value) => value.definition.sourceSha256 = "b".repeat(64)),
    withMutation((value) => value.definition.semanticProfile += "-other"),
    withMutation((value) => value.processId += "_Other"),
    withMutation((value) => value.channel.messageId += "_Other"),
    withMutation((value) => value.correlationKeyId += "_Other"),
    withMutation((value) => value.definition.sourceOverlay = {
      id: "overlay",
      sha256: "c".repeat(64),
    }),
  ];
  for (const variant of variants) {
    assert.notEqual(
      correlationIngressWorkflowId(variant),
      correlationIngressWorkflowId(address),
    );
  }
});

test("accepts only the complete production configuration echo", () => {
  const echo = {
    address,
    protocolVersion: bpmnCorrelationIngressProtocolVersion,
    configuration: productionCorrelationIngressConfiguration,
  };
  assert.deepEqual(requireCorrelationIngressEcho(echo), echo);
  assert.equal(sameCorrelationIngressEcho(echo, echo), true);

  for (const key of Object.keys(productionCorrelationIngressConfiguration)) {
    const changed = structuredClone(echo) as Record<string, unknown> & {
      configuration: Record<string, number>;
    };
    changed.configuration[key] = (changed.configuration[key] ?? 0) + 1;
    assert.throws(() => requireCorrelationIngressEcho(changed));
    assert.equal(sameCorrelationIngressEcho(echo, changed), false);
  }

  const missing = structuredClone(echo) as Record<string, unknown> & {
    configuration: Record<string, number>;
  };
  delete missing.configuration.maxRuns;
  assert.throws(() => requireCorrelationIngressEcho(missing));
  assert.equal(sameCorrelationIngressEcho(echo, missing), false);

  const crossDefinition = structuredClone(echo);
  crossDefinition.address.definition.sourceSha256 = "b".repeat(64);
  assert.equal(sameCorrelationIngressEcho(echo, crossDefinition), false);
});

function withMutation(
  mutate: (value: MutableAddress) => void,
): CorrelatedMessageAddress {
  const value = structuredClone(address) as MutableAddress;
  mutate(value);
  return value;
}

type MutableAddress = {
  -readonly [Key in keyof CorrelatedMessageAddress]: CorrelatedMessageAddress[Key]
} & {
  definition: {
    -readonly [Key in keyof CorrelatedMessageAddress["definition"]]:
      CorrelatedMessageAddress["definition"][Key]
  };
  channel: {
    -readonly [Key in keyof CorrelatedMessageAddress["channel"]]:
      CorrelatedMessageAddress["channel"][Key]
  };
};
