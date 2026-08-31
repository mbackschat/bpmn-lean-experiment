import assert from "node:assert/strict";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateRegistrationResultKind,
  ProcessCorrelationRegistrationPhase,
  ProcessCorrelationRegistrationResolutionKind,
  bpmnFinalizeCorrelationCandidateUpdateName,
  bpmnPrepareCorrelationCandidateUpdateName,
  bpmnProcessCorrelationCandidateQueryName,
  bpmnResolveCorrelationCandidateRegistrationActivityName,
  correlationIngressWorkflowId,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationCandidateRegistrationRequest,
  ProcessCorrelationRegistrationActivityRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  createCorrelationRegistrationActivities,
} from "../dist/index.js";

const registration = candidateRegistration();
const ingressWorkflowId = correlationIngressWorkflowId(
  registration.candidate.address,
);

test("ensures ingress and maps one exact prepare result", async () => {
  const calls: string[] = [];
  const activities = createCorrelationRegistrationActivities(
    client({
      calls,
      updateResult: {
        kind: CorrelationCandidateRegistrationResultKind.Prepared,
        transactionId: registration.transactionId,
        phase: CorrelationCandidateRegistrationPhase.Pending,
      },
    }) as never,
    "bpmn-semantic",
  );

  const result = await activities[
    bpmnResolveCorrelationCandidateRegistrationActivityName
  ](activityRequest(ProcessCorrelationRegistrationPhase.Prepare));
  assert.deepEqual(result, {
    kind: ProcessCorrelationRegistrationResolutionKind.Prepared,
    transactionId: registration.transactionId,
    phase: CorrelationCandidateRegistrationPhase.Pending,
  });
  assert.deepEqual(calls, [
    "start-ingress",
    "query-ingress-configuration",
    `update:${bpmnPrepareCorrelationCandidateUpdateName}`,
  ]);
});

test("queries the exact Process candidate before finalizing ingress", async () => {
  const calls: string[] = [];
  const activities = createCorrelationRegistrationActivities(
    client({
      calls,
      processCandidate: registration.candidate,
      updateResult: {
        kind: CorrelationCandidateRegistrationResultKind.Finalized,
        transactionId: registration.transactionId,
        phase: CorrelationCandidateRegistrationPhase.Active,
      },
    }) as never,
    "bpmn-semantic",
  );

  const result = await activities[
    bpmnResolveCorrelationCandidateRegistrationActivityName
  ](activityRequest(ProcessCorrelationRegistrationPhase.Finalize));
  assert.deepEqual(result, {
    kind: ProcessCorrelationRegistrationResolutionKind.Finalized,
    transactionId: registration.transactionId,
    phase: CorrelationCandidateRegistrationPhase.Active,
  });
  assert.deepEqual(calls, [
    "start-ingress",
    "query-ingress-configuration",
    `query-process:${bpmnProcessCorrelationCandidateQueryName}`,
    `update:${bpmnFinalizeCorrelationCandidateUpdateName}`,
  ]);
});

test("never finalizes when the Process candidate Query is absent", async () => {
  const calls: string[] = [];
  const activities = createCorrelationRegistrationActivities(
    client({
      calls,
      processCandidate: null,
      updateResult: {
        kind: CorrelationCandidateRegistrationResultKind.Finalized,
        transactionId: registration.transactionId,
        phase: CorrelationCandidateRegistrationPhase.Active,
      },
    }) as never,
    "bpmn-semantic",
  );

  await assert.rejects(
    activities[bpmnResolveCorrelationCandidateRegistrationActivityName](
      activityRequest(ProcessCorrelationRegistrationPhase.Finalize),
    ),
    /Process correlation candidate is not current/,
  );
  assert.deepEqual(calls, [
    "start-ingress",
    "query-ingress-configuration",
    `query-process:${bpmnProcessCorrelationCandidateQueryName}`,
  ]);
});

function activityRequest(
  phase: ProcessCorrelationRegistrationPhase,
): ProcessCorrelationRegistrationActivityRequest {
  return {
    phase,
    taskQueue: "bpmn-semantic",
    configuration: productionCorrelationIngressConfiguration,
    registration,
  };
}

function client(input: Readonly<{
  calls: string[];
  processCandidate?: unknown;
  updateResult: unknown;
}>) {
  return {
    workflow: {
      start: async () => {
        input.calls.push("start-ingress");
      },
      getHandle: (workflowId: string) => ({
        query: async (name: string) => {
          if (workflowId === ingressWorkflowId) {
            input.calls.push("query-ingress-configuration");
            return {
              address: registration.candidate.address,
              protocolVersion: "bpmn-correlation-ingress-v1",
              configuration: productionCorrelationIngressConfiguration,
            };
          }
          input.calls.push(`query-process:${name}`);
          return input.processCandidate;
        },
        executeUpdate: async (name: string) => {
          input.calls.push(`update:${name}`);
          return input.updateResult;
        },
      }),
    },
  };
}

function candidateRegistration(): CorrelationCandidateRegistrationRequest {
  const processInstanceId = "ProcessInstance_1";
  return {
    transactionId: "initialize-correlation",
    processLocator: { workflowId: "bpmn-process-sha256:process-1" },
    candidate: {
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
      key: { kind: VariableValueKind.String, value: "settlement-42" },
    },
  };
}
