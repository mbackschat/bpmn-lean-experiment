import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import {
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import {
  CorrelationPublicationAdmissionResultKind,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationStatusKind,
  bpmnAdmitCorrelationPublicationUpdateName,
  bpmnCorrelationIngressWorkflowType,
  bpmnCorrelationPublicationCapacityFailureType,
  bpmnCorrelationPublicationIdentityConflictFailureType,
  bpmnCorrelationPublicationStatusQueryName,
  bpmnSemanticTaskQueue,
  correlationIngressWorkflowId,
  correlationPublicationUpdateId,
  createCachedLocalEnvironment,
  loadBpmnWorkflowBundle,
  productionCorrelationIngressConfiguration,
} from "@bpmn-lean/temporal-testkit";
import type {
  CorrelationPublicationAdmissionResult,
  CorrelationPublicationCommand,
  CorrelationPublicationStatus,
} from "@bpmn-lean/temporal-testkit";
import { ApplicationFailure } from "@temporalio/client";
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
const address = publication("unused", "unused").address;

test("reserves the concurrent last queue slot before Update acceptance", async () => {
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-correlation-publication-admission",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "correlation publication admission environment startup",
  );
  const bundle = await loadBpmnWorkflowBundle();
  let worker: WorkerLease | undefined;
  let ingress: WorkflowHandle | undefined;
  let history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> | undefined;
  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "bpmn-correlation-publication-admission-worker",
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

    const current = publication("Publication_in_flight", "settlement-current");
    assert.equal(
      (await admit(ingress, current)).kind,
      CorrelationPublicationAdmissionResultKind.Admitted,
    );
    const currentStatus = await waitForStatus(
      ingress,
      current,
      (status) => status.kind === CorrelationPublicationStatusKind.Accepted &&
        status.record.phase === CorrelationPublicationLedgerPhase.InFlight,
    );
    assert.equal(currentStatus.kind, CorrelationPublicationStatusKind.Accepted);
    if (currentStatus.kind !== CorrelationPublicationStatusKind.Accepted) {
      assert.fail("The first publication never acquired the in-flight reservation");
    }
    assert.equal(currentStatus.record.ordinal, 1);

    for (
      let index = 1;
      index < productionCorrelationIngressConfiguration.maxQueuedPublicationRecords;
      index += 1
    ) {
      const command = publication(
        `Publication_queued_${String(index).padStart(2, "0")}`,
        `settlement-${String(index).padStart(2, "0")}`,
      );
      assert.equal(
        (await admit(ingress, command)).kind,
        CorrelationPublicationAdmissionResultKind.Admitted,
      );
    }

    const left = publication("Publication_last_left", "settlement-left");
    const right = publication("Publication_last_right", "settlement-right");
    const contenders = await Promise.allSettled([
      admit(ingress, left),
      admit(ingress, right),
    ]);
    assert.equal(
      contenders.filter(({ status }) => status === "fulfilled").length,
      1,
    );
    assert.equal(
      contenders.filter(({ status }) => status === "rejected").length,
      1,
    );
    const rejected = contenders.find(({ status }) => status === "rejected");
    const acceptedContender = contenders.find(
      ({ status }) => status === "fulfilled",
    );
    assert.ok(rejected?.status === "rejected");
    assert.ok(acceptedContender?.status === "fulfilled");
    assert.equal(
      hasApplicationFailureType(
        rejected.reason,
        bpmnCorrelationPublicationCapacityFailureType,
      ),
      true,
    );

    const leftStatus = await status(ingress, left);
    const rightStatus = await status(ingress, right);
    const accepted = [
      { command: left, status: leftStatus },
      { command: right, status: rightStatus },
    ].find(({ status: candidate }) =>
      candidate.kind === CorrelationPublicationStatusKind.Accepted
    );
    const refused = [
      { command: left, status: leftStatus },
      { command: right, status: rightStatus },
    ].find(({ status: candidate }) =>
      candidate.kind === CorrelationPublicationStatusKind.Absent
    );
    assert.ok(accepted?.status.kind === CorrelationPublicationStatusKind.Accepted);
    assert.ok(refused?.status.kind === CorrelationPublicationStatusKind.Absent);
    assert.equal(accepted.status.record.phase, CorrelationPublicationLedgerPhase.Queued);
    assert.equal(accepted.status.record.ordinal, null);

    assert.deepEqual(
      await admit(ingress, accepted.command),
      acceptedContender.value,
    );
    await assert.rejects(
      admit(ingress, {
        ...accepted.command,
        payload: {
          kind: VariableValueKind.String,
          value: `${accepted.command.payload.value}-changed`,
        },
      }),
      (error: unknown) => hasApplicationFailureType(
        error,
        bpmnCorrelationPublicationIdentityConflictFailureType,
      ),
    );
    assert.equal(
      (await status(ingress, refused.command)).kind,
      CorrelationPublicationStatusKind.Absent,
    );

    history = await ingress.fetchHistory();
    assert.equal(
      history.events?.filter((event) =>
        event.workflowExecutionUpdateAcceptedEventAttributes !== undefined &&
        event.workflowExecutionUpdateAcceptedEventAttributes !== null
      ).length,
      1 + productionCorrelationIngressConfiguration.maxQueuedPublicationRecords,
    );
  } finally {
    await ingress?.terminate("correlation publication admission cleanup")
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

async function status(
  ingress: WorkflowHandle,
  command: CorrelationPublicationCommand,
): Promise<CorrelationPublicationStatus> {
  return ingress.query<CorrelationPublicationStatus, [CorrelationPublicationCommand]>(
    bpmnCorrelationPublicationStatusQueryName,
    command,
  );
}

async function waitForStatus(
  ingress: WorkflowHandle,
  command: CorrelationPublicationCommand,
  predicate: (status: CorrelationPublicationStatus) => boolean,
): Promise<CorrelationPublicationStatus> {
  return withDeadline((async () => {
    for (;;) {
      const observed = await status(ingress, command);
      if (predicate(observed)) {
        return observed;
      }
      await delay(20);
    }
  })(), operationDeadlineMs, `status ${command.commandId}`);
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

function hasApplicationFailureType(error: unknown, type: string): boolean {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure && current.type === type) {
      return true;
    }
    current = current.cause;
  }
  return false;
}
