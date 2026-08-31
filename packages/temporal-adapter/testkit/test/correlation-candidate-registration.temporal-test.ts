import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
} from "@temporalio/client";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import {
  CorrelationIngressEnsureResultKind,
  ensureCorrelationIngress,
} from "@bpmn-lean/temporal-client/correlation-ingress";
import {
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateRegistrationResultKind,
  bpmnCorrelationCandidateRegistrationIdentityConflictFailureType,
  bpmnFinalizeCorrelationCandidateUpdateName,
  bpmnPrepareCorrelationCandidateUpdateName,
  bpmnSemanticTaskQueue,
  correlationIngressWorkflowId,
  createCachedLocalEnvironment,
  finalizeCorrelationCandidateRegistrationUpdateId,
  loadBpmnWorkflowBundle,
  prepareCorrelationCandidateRegistrationUpdateId,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-testkit";
import type {
  CorrelationCandidateRegistrationRequest,
  CorrelationCandidateRegistrationResult,
} from "@bpmn-lean/temporal-testkit";

import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import type {
  WorkerLease,
} from "./temporal-worker-test-support.ts";
import { withDeadline } from "./temporal-test-support.ts";

const request = registration("Registration_1", "settlement-42");
const address = request.candidate.address;
const temporalCacheDirectory = fileURLToPath(
  new URL("../../../../.cache/temporal-cli/", import.meta.url),
);
const operationDeadlineMs = 10_000;

test("retains one content-bound prepare across Worker replacement and finalizes that exact fact", async () => {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-correlation-candidate-registration",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "correlation registration environment startup",
  );
  const workflowBundle = await loadBpmnWorkflowBundle();
  let workerLease: WorkerLease | undefined;
  let handle: WorkflowHandle | undefined;
  try {
    workerLease = await startBpmnTestWorker(
      environment,
      workflowBundle,
      "bpmn-correlation-registration-initial",
    );
    const ensure = await ensureCorrelationIngress(
      environment.client.workflow as never,
      {
        address,
        configuration: productionCorrelationIngressConfiguration,
        taskQueue: bpmnSemanticTaskQueue,
      },
    );
    assert.deepEqual(ensure, {
      kind: CorrelationIngressEnsureResultKind.Ready,
      workflowId: correlationIngressWorkflowId(address),
    });
    handle = environment.client.workflow.getHandle(ensure.workflowId);

    const prepared = await executeRegistrationUpdate(
      handle,
      bpmnPrepareCorrelationCandidateUpdateName,
      request,
      prepareCorrelationCandidateRegistrationUpdateId(request),
    );
    assert.deepEqual(prepared, {
      kind: CorrelationCandidateRegistrationResultKind.Prepared,
      transactionId: request.transactionId,
      phase: CorrelationCandidateRegistrationPhase.Pending,
    });

    await assert.rejects(
      executeRegistrationUpdate(
        handle,
        bpmnPrepareCorrelationCandidateUpdateName,
        { ...request, candidate: { ...request.candidate, key: { kind: VariableValueKind.String, value: "changed" } } },
        `${prepareCorrelationCandidateRegistrationUpdateId(request)}-changed`,
      ),
      (error: unknown) =>
        error instanceof Error &&
        error.cause instanceof ApplicationFailure &&
        error.cause.type ===
          bpmnCorrelationCandidateRegistrationIdentityConflictFailureType,
    );

    await stopBpmnTestWorker(workerLease);
    workerLease = await startBpmnTestWorker(
      environment,
      workflowBundle,
      "bpmn-correlation-registration-replacement",
    );
    const finalized = await executeRegistrationUpdate(
      handle,
      bpmnFinalizeCorrelationCandidateUpdateName,
      request,
      finalizeCorrelationCandidateRegistrationUpdateId(request),
    );
    assert.deepEqual(finalized, {
      kind: CorrelationCandidateRegistrationResultKind.Finalized,
      transactionId: request.transactionId,
      phase: CorrelationCandidateRegistrationPhase.Active,
    });

    await withDeadline(
      handle.terminate("correlation registration test cleanup"),
      operationDeadlineMs,
      "correlation registration termination",
    );
    const history = await withDeadline(
      handle.fetchHistory(),
      operationDeadlineMs,
      "correlation registration history",
    );
    await stopBpmnTestWorker(workerLease);
    workerLease = undefined;
    await replayBpmnHistory(workflowBundle, history, ensure.workflowId);
  } finally {
    if (handle !== undefined) {
      await handle.terminate("correlation registration failed-test cleanup").catch(() => undefined);
    }
    if (workerLease !== undefined) {
      await stopBpmnTestWorker(workerLease);
    }
    await environment.teardown();
  }
});

function executeRegistrationUpdate(
  handle: WorkflowHandle,
  updateName: string,
  candidateRequest: CorrelationCandidateRegistrationRequest,
  updateId: string,
): Promise<CorrelationCandidateRegistrationResult> {
  return withDeadline(
    handle.executeUpdate<
      CorrelationCandidateRegistrationResult,
      [CorrelationCandidateRegistrationRequest]
    >(updateName, { args: [candidateRequest], updateId }),
    operationDeadlineMs,
    `${updateName} Update`,
  );
}

function registration(
  transactionId: string,
  key: string,
): CorrelationCandidateRegistrationRequest {
  const processInstanceId = "ProcessInstance_1";
  return {
    transactionId,
    candidate: candidate(processInstanceId, key),
    processLocator: { workflowId: "bpmn-process-sha256:process-1" },
  };
}

function candidate(
  processInstanceId: string,
  key: string,
): CorrelatedMessageCandidate {
  return {
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
  };
}
