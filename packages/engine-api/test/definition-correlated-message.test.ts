import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  EngineCorrelatedMessageIngressInvalid,
  EngineCorrelatedMessagePublishResolutionKind,
  publishBpmnDefinitionCorrelatedMessage,
} from "@bpmn-lean/engine-api";
import {
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationStatusKind,
  CorrelationPublicationStoredResolutionKind,
  bpmnCorrelationIngressConfigurationQueryName,
  bpmnCorrelationIngressProtocolVersion,
  bpmnCorrelationPublicationStatusQueryName,
  correlationPublicationContentSha256,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";

const address = {
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
} as const;

test("projects the closed definition-scoped correlation result without a host locator", async () => {
  const calls: unknown[] = [];
  const command = {
    commandId: "Publication_1",
    address,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  } as const;
  let statusCalls = 0;
  const result = await publishBpmnDefinitionCorrelatedMessage({
    temporalClient: fakeClient(calls, command, () => {
      statusCalls += 1;
      return statusCalls === 1
        ? {
            kind: CorrelationPublicationStatusKind.Absent,
            commandId: command.commandId,
            contentSha256: correlationPublicationContentSha256(command),
          }
        : {
            kind: CorrelationPublicationStatusKind.Accepted,
            record: {
              commandId: command.commandId,
              contentSha256: correlationPublicationContentSha256(command),
              phase: CorrelationPublicationLedgerPhase.Settled,
              ordinal: 7,
              target: null,
              resolution: {
                kind: CorrelationPublicationStoredResolutionKind.Semantic,
                outcome: { kind: "rejectedNoMatch" },
              },
            },
          };
    }),
    ...command,
    taskQueue: "correlation-ingress",
  });

  assert.deepEqual(result, {
    kind: EngineCorrelatedMessagePublishResolutionKind.Semantic,
    commandId: "Publication_1",
    address,
    ingressOrdinal: 7,
    outcome: { kind: "rejectedNoMatch" },
  });
  const update = calls.find((call) =>
    typeof call === "object" && call !== null &&
    (call as Readonly<{ operation?: unknown }>).operation === "update"
  ) as Readonly<{ options: Readonly<{ args: readonly unknown[] }> }> | undefined;
  assert.deepEqual(update?.options.args, [command]);
  assert.equal(JSON.stringify(result).includes("workflowId"), false);
  assert.equal(JSON.stringify(result).includes("processLocator"), false);
});

test("translates malformed publication failures at the Product 1 boundary", async () => {
  const command = {
    commandId: "",
    address,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  } as const;

  await assert.rejects(
    publishBpmnDefinitionCorrelatedMessage({
      temporalClient: fakeClient([], command, () => null),
      ...command,
      taskQueue: "correlation-ingress",
    }),
    EngineCorrelatedMessageIngressInvalid,
  );
});

test("keeps Process locators and Temporal identity out of the public declaration", async () => {
  const declaration = await readFile(
    new URL("../dist/definition-correlated-message.d.ts", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    declaration.match(
      /\b(?:processLocator|workflowId|runId|eventHistory|candidateLocator)\b/giu,
    ) ?? [],
    [],
  );
  assert.match(declaration, /target: null;/u);
  assert.doesNotMatch(
    declaration,
    /target: EngineCorrelatedMessageTarget \| null;/u,
  );
});

function fakeClient(
  calls: unknown[],
  command: Readonly<Record<string, unknown>>,
  status: () => unknown,
): never {
  return {
    start: async () => ({}),
    getHandle: (workflowId: string) => ({
      query: async (name: string) => {
        if (name === bpmnCorrelationIngressConfigurationQueryName) {
          return {
            address: command.address,
            protocolVersion: bpmnCorrelationIngressProtocolVersion,
            configuration: productionCorrelationIngressConfiguration,
          };
        }
        assert.equal(name, bpmnCorrelationPublicationStatusQueryName);
        return status();
      },
      executeUpdate: async (_name: string, options: unknown) => {
        calls.push({ operation: "update", workflowId, options });
        return {
          kind: "admitted",
          commandId: command.commandId,
          contentSha256: correlationPublicationContentSha256(command as never),
          phase: CorrelationPublicationLedgerPhase.Queued,
          ordinal: null,
        };
      },
    }),
  } as never;
}
