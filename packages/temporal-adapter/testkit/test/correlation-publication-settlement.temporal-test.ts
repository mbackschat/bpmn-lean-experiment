import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationCandidateRegistrationResultKind,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStatusKind,
  CorrelationPublicationStoredResolutionKind,
  bpmnAdmitCorrelationPublicationUpdateName,
  bpmnCorrelationIngressWorkflowType,
  bpmnCorrelationPublicationStatusQueryName,
  bpmnPrepareCorrelationCandidateUpdateName,
  bpmnSemanticTaskQueue,
  correlationIngressWorkflowId,
  correlationPublicationUpdateId,
  createCachedLocalEnvironment,
  loadBpmnWorkflowBundle,
  prepareCorrelationCandidateRegistrationUpdateId,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-testkit";
import type {
  CorrelationCandidateRegistrationResult,
  CorrelationCandidateRegistrationRequest,
  CorrelationPublicationAdmissionResult,
  CorrelationPublicationCommand,
  CorrelationPublicationStatus,
} from "@bpmn-lean/temporal-testkit";
import type { WorkflowHandle } from "@temporalio/client";

import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const operationDeadlineMs = 20_000;
const first = publication("Publication_no_match_1", "absent-1");
const second = publication("Publication_no_match_2", "absent-2");
const address = first.address;

test("settles zero-candidate publications in FIFO order and releases each barrier", async () => {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-correlation-publication-settlement",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "correlation publication settlement environment startup",
  );
  const bundle = await loadBpmnWorkflowBundle();
  let worker: WorkerLease | undefined;
  let ingress: WorkflowHandle | undefined;
  let history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> | undefined;
  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "bpmn-correlation-publication-settlement-worker",
    );
    ingress = await environment.client.workflow.start(
      bpmnCorrelationIngressWorkflowType,
      {
        args: [address, productionCorrelationIngressConfiguration],
        taskQueue: bpmnSemanticTaskQueue,
        workflowId: correlationIngressWorkflowId(address),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );

    await admit(ingress, first);
    await admit(ingress, second);
    const firstStatus = await waitForSettled(ingress, first);
    const secondStatus = await waitForSettled(ingress, second);
    assertSettledNoMatch(firstStatus, 1);
    assertSettledNoMatch(secondStatus, 2);

    const registration = candidateRegistration();
    const prepared = await ingress.executeUpdate<
      CorrelationCandidateRegistrationResult,
      [CorrelationCandidateRegistrationRequest]
    >(bpmnPrepareCorrelationCandidateUpdateName, {
      args: [registration],
      updateId: prepareCorrelationCandidateRegistrationUpdateId(registration),
    });
    assert.equal(
      prepared.kind,
      CorrelationCandidateRegistrationResultKind.Prepared,
    );
    history = await ingress.fetchHistory();
  } finally {
    await ingress?.terminate("correlation publication settlement cleanup")
      .catch(() => undefined);
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }

  assert.ok(history !== undefined);
  await replayBpmnHistory(
    bundle,
    history,
    correlationIngressWorkflowId(address),
  );
});

async function admit(
  ingress: WorkflowHandle,
  command: CorrelationPublicationCommand,
): Promise<CorrelationPublicationAdmissionResult> {
  return withDeadline(
    ingress.executeUpdate<
      CorrelationPublicationAdmissionResult,
      [CorrelationPublicationCommand]
    >(bpmnAdmitCorrelationPublicationUpdateName, {
      args: [command],
      updateId: correlationPublicationUpdateId(command),
    }),
    operationDeadlineMs,
    `admit ${command.commandId}`,
  );
}

async function waitForSettled(
  ingress: WorkflowHandle,
  command: CorrelationPublicationCommand,
): Promise<CorrelationPublicationStatus> {
  return withDeadline((async () => {
    for (;;) {
      const observed = await ingress.query<
        CorrelationPublicationStatus,
        [CorrelationPublicationCommand]
      >(bpmnCorrelationPublicationStatusQueryName, command);
      if (observed.kind === CorrelationPublicationStatusKind.Accepted &&
        observed.record.phase === CorrelationPublicationLedgerPhase.Settled) {
        return observed;
      }
      await delay(20);
    }
  })(), operationDeadlineMs, `settle ${command.commandId}`);
}

function assertSettledNoMatch(
  status: CorrelationPublicationStatus,
  ordinal: number,
): void {
  assert.equal(status.kind, CorrelationPublicationStatusKind.Accepted);
  if (status.kind !== CorrelationPublicationStatusKind.Accepted) {
    assert.fail("The accepted publication disappeared");
  }
  assert.equal(status.record.phase, CorrelationPublicationLedgerPhase.Settled);
  assert.equal(status.record.ordinal, ordinal);
  assert.equal(status.record.target, null);
  assert.deepEqual(status.record.resolution, {
    kind: CorrelationPublicationStoredResolutionKind.Semantic,
    outcome: { kind: CorrelationPublicationSemanticOutcomeKind.RejectedNoMatch },
  });
}

function candidateRegistration(): CorrelationCandidateRegistrationRequest {
  const processInstanceId = "ProcessInstance_after_settlement";
  return {
    transactionId: "Registration_after_settlement",
    candidate: {
      address,
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
    processLocator: {
      workflowId: "bpmn-process-sha256:after-settlement",
    },
  };
}

function publication(
  commandId: string,
  value: string,
): CorrelationPublicationCommand {
  return {
    commandId,
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
    payload: { kind: VariableValueKind.String, value },
  };
}
