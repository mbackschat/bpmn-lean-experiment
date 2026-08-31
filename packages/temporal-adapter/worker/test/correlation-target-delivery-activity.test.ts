import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowNotFoundError,
} from "@temporalio/client";
import {
  CorrelationCandidateRegistrationPhase,
  ProcessCommandResultKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnDeliverCorrelatedMessageUpdateName,
  bpmnResolveCorrelationTargetDeliveryActivityName,
  buildWorkflowChainRecoveryRequest,
  contentBoundUpdateId,
  correlationCandidateRegistrationContentSha256,
  correlationTargetDeliveryStimulus,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-protocol";
import type {
  CorrelationTargetDeliveryActivityRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  createCorrelationTargetDeliveryActivities,
} from "../dist/index.js";

const processInstanceId = "ProcessInstance_target";
const workflowId = "bpmn-process-sha256:target";
const request = activityRequest();
const stimulus = correlationTargetDeliveryStimulus(request);

test("updates only the retained target with the exact content-bound stimulus", async () => {
  const calls: unknown[] = [];
  const activities = createCorrelationTargetDeliveryActivities(client({
    calls,
    executeUpdate: async () => CommandOutcome.Committed,
  }) as never);
  const completion = await activities[
    bpmnResolveCorrelationTargetDeliveryActivityName
  ](request);

  assert.deepEqual(completion, {
    stimulus,
    result: {
      kind: ProcessCommandResultKind.Semantic,
      commandId: request.commandId,
      outcome: CommandOutcome.Committed,
    },
  });
  assert.deepEqual(calls, [{
    workflowId,
    name: bpmnDeliverCorrelatedMessageUpdateName,
    options: {
      args: [stimulus],
      updateId: contentBoundUpdateId(stimulus),
    },
  }]);
});

test("recovers a lost response against the same target without another Update", async () => {
  const calls: unknown[] = [];
  const recoveryRequest = buildWorkflowChainRecoveryRequest(
    processInstanceId,
    stimulus,
  );
  const activities = createCorrelationTargetDeliveryActivities(client({
    calls,
    executeUpdate: async () => {
      throw new WorkflowNotFoundError("response lost", workflowId, undefined);
    },
    query: async () => ({
      ...recoveryRequest,
      kind: WorkflowChainCommandRecoveryResponseKind.Resolved,
      outcome: CommandOutcome.Committed,
    }),
  }) as never);

  const completion = await activities[
    bpmnResolveCorrelationTargetDeliveryActivityName
  ](request);
  assert.equal(completion.result.kind, ProcessCommandResultKind.Semantic);
  assert.deepEqual(calls.map((call) => (call as { workflowId: string }).workflowId), [
    workflowId,
    workflowId,
  ]);
});

function client(input: Readonly<{
  calls: unknown[];
  executeUpdate: (name: string, options: unknown) => Promise<unknown>;
  query?: (name: string, request: unknown) => Promise<unknown>;
}>) {
  return {
    getHandle: (addressedWorkflowId: string) => ({
      executeUpdate: async (name: string, options: unknown) => {
        input.calls.push({ workflowId: addressedWorkflowId, name, options });
        return input.executeUpdate(name, options);
      },
      query: async (name: string, candidate: unknown) => {
        input.calls.push({ workflowId: addressedWorkflowId, name, candidate });
        if (input.query === undefined) {
          throw new Error("unexpected recovery Query");
        }
        return input.query(name, candidate);
      },
    }),
  };
}

function activityRequest(): CorrelationTargetDeliveryActivityRequest {
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
    key: { kind: VariableValueKind.String, value: "settlement-42" },
  } as const;
  const base = {
    transactionId: "Registration_target",
    candidate,
    processLocator: { workflowId },
  };
  return {
    commandId: "Publication_target",
    ingressOrdinal: 1,
    address: candidate.address,
    payload: candidate.key,
    target: {
      processInstanceId,
      subscriptionId: candidate.subscriptionId,
    },
    registration: {
      ...base,
      contentSha256: correlationCandidateRegistrationContentSha256(base),
      phase: CorrelationCandidateRegistrationPhase.Active,
    },
    configuration: productionCorrelationIngressConfiguration,
  };
}
