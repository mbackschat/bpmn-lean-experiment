import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateScanCompletionKind,
  bpmnProcessCorrelationCandidateQueryName,
  bpmnResolveCorrelationCandidateScanActivityName,
  correlationCandidateRegistrationContentSha256,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationRecord,
  CorrelationCandidateScanActivityRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  createCorrelationCandidateScanActivities,
} from "../dist/index.js";

const first = registration("Registration_1", "ProcessInstance_1", "settlement-42");
const second = registration("Registration_2", "ProcessInstance_2", "settlement-43");
const request: CorrelationCandidateScanActivityRequest = {
  scanId: "Scan_1",
  address: first.candidate.address,
  registrations: [first, second],
  configuration: productionCorrelationIngressConfiguration,
};

test("queries every finalized locator and returns one exact ordered vector", async () => {
  const calls: string[] = [];
  const activities = createCorrelationCandidateScanActivities(client({
    calls,
    responses: new Map([
      [first.processLocator.workflowId, first.candidate],
      [second.processLocator.workflowId, second.candidate],
    ]),
  }) as never);

  assert.deepEqual(
    await activities[bpmnResolveCorrelationCandidateScanActivityName](request),
    {
      kind: CorrelationCandidateScanCompletionKind.Complete,
      scanId: request.scanId,
      candidates: [first.candidate, second.candidate],
    },
  );
  assert.deepEqual(calls, [
    `${first.processLocator.workflowId}:describe`,
    `${first.processLocator.workflowId}:${bpmnProcessCorrelationCandidateQueryName}`,
    `${second.processLocator.workflowId}:describe`,
    `${second.processLocator.workflowId}:${bpmnProcessCorrelationCandidateQueryName}`,
  ]);
});

test("fails the whole fanout when one Query is absent, failed, changed, or closed", async () => {
  for (const failure of [
    { response: null, status: "RUNNING" },
    { response: new Error("Process Query unavailable"), status: "RUNNING" },
    {
      response: {
        ...second.candidate,
        key: { kind: VariableValueKind.String, value: "changed" },
      },
      status: "RUNNING",
    },
    { response: second.candidate, status: "TERMINATED" },
  ]) {
    const calls: string[] = [];
    const activities = createCorrelationCandidateScanActivities(client({
      calls,
      responses: new Map([
        [first.processLocator.workflowId, first.candidate],
        [second.processLocator.workflowId, failure.response],
      ]),
      statuses: new Map([[second.processLocator.workflowId, failure.status]]),
    }) as never);

    await assert.rejects(
      activities[bpmnResolveCorrelationCandidateScanActivityName](request),
    );
    assert.deepEqual(calls, [
      `${first.processLocator.workflowId}:describe`,
      `${first.processLocator.workflowId}:${bpmnProcessCorrelationCandidateQueryName}`,
      `${second.processLocator.workflowId}:describe`,
      `${second.processLocator.workflowId}:${bpmnProcessCorrelationCandidateQueryName}`,
    ]);
  }
});

function client(input: Readonly<{
  calls: string[];
  responses: ReadonlyMap<string, unknown>;
  statuses?: ReadonlyMap<string, string>;
}>) {
  return {
    getHandle: (workflowId: string) => ({
      describe: async () => {
        input.calls.push(`${workflowId}:describe`);
        return {
          status: { name: input.statuses?.get(workflowId) ?? "RUNNING" },
        };
      },
      query: async (name: string) => {
        input.calls.push(`${workflowId}:${name}`);
        const response = input.responses.get(workflowId);
        if (response instanceof Error) {
          throw response;
        }
        return response;
      },
    }),
  };
}

function registration(
  transactionId: string,
  processInstanceId: string,
  key: string,
): CorrelationCandidateRegistrationRecord {
  const candidate = {
    address: {
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
    },
    processInstanceId,
    subscriptionId: {
      processInstanceId,
      elementId: "Catch_SettlementConfirmed",
      activation: 1,
    },
    correlationPropertyId: "CorrelationProperty_SettlementReference",
    processPropertyId: "Property_SettlementReference",
    key: { kind: VariableValueKind.String, value: key },
  } as const;
  const base = {
    transactionId,
    candidate,
    processLocator: { workflowId: `bpmn-process-sha256:${processInstanceId}` },
  };
  return {
    ...base,
    contentSha256: correlationCandidateRegistrationContentSha256(base),
    phase: CorrelationCandidateRegistrationPhase.Active,
  };
}
