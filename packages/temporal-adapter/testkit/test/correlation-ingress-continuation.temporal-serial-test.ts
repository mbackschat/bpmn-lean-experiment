/** Real-service continuation witness for pending registration, failed fanout, and selected-target delivery. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CommandOutcome,
  MessageChannelKind,
  SemanticProcessCompilerId,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CorrelatedMessageAddress,
  CorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowHandle,
} from "@temporalio/client";
import {
  DefaultLogger,
  bundleWorkflowCode,
} from "@temporalio/worker";

import {
  CorrelationCandidateRegistrationResultKind,
  CorrelationCandidateScanCompletionKind,
  CorrelationPublicationAdmissionResultKind,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationStatusKind,
  ProcessCommandResultKind,
  bpmnAdmitCorrelationPublicationUpdateName,
  bpmnCorrelationPublicationStatusQueryName,
  bpmnFinalizeCorrelationCandidateUpdateName,
  bpmnPrepareCorrelationCandidateUpdateName,
  bpmnResolveCorrelationCandidateScanActivityName,
  bpmnResolveCorrelationTargetDeliveryActivityName,
  bpmnSemanticTaskQueue,
  canonicalWorkflowChainJson,
  correlationIngressWorkflowId,
  correlationPublicationContentSha256,
  correlationPublicationUpdateId,
  correlationTargetDeliveryStimulus,
  createCachedLocalEnvironment,
  finalizeCorrelationCandidateRegistrationUpdateId,
  prepareCorrelationCandidateRegistrationUpdateId,
  productionCorrelationIngressConfiguration,
  requireCorrelationCandidateScanActivityRequest,
  requireCorrelationTargetDeliveryActivityRequest,
} from "@bpmn-lean/temporal-testkit";
import type {
  CorrelationCandidateRegistrationRequest,
  CorrelationPublicationAdmissionResult,
  CorrelationPublicationCommand,
  CorrelationPublicationStatus,
  CorrelationTargetDeliveryActivityRequest,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  historyEvents,
} from "./temporal-history-facts.ts";
import {
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  replayBpmnHistory,
  startBpmnTestWorker,
  stopBpmnTestWorker,
} from "./temporal-worker-test-support.ts";
import type {
  TestActivityOverrides,
  WorkerLease,
} from "./temporal-worker-test-support.ts";
import {
  waitForWorkflowChainRunCount,
  workflowChainRuns,
} from "./workflow-chain-test-support.ts";

const workflowsPath = fileURLToPath(new URL(
  "./correlation-ingress-continuation-workflows.ts",
  import.meta.url,
));
const operationDeadlineMs = 20_000;

const ContinuationCase = {
  CandidateFanout: "candidate-fanout",
  TargetDelivery: "target-delivery",
} as const;
type ContinuationCase = typeof ContinuationCase[keyof typeof ContinuationCase];

test("carries pending registration, failed fanout, and selected target through exact two-Run chains", async () => {
  const bundle = await bundleWorkflowCode({
    workflowsPath,
    logger: new DefaultLogger("ERROR"),
  });
  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-correlation-ingress-continuation",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "correlation continuation environment startup",
  );
  try {
    await runPendingRegistrationContinuationCase(environment, bundle);
    await runContinuationCase(
      environment,
      bundle,
      ContinuationCase.CandidateFanout,
    );
    await runContinuationCase(
      environment,
      bundle,
      ContinuationCase.TargetDelivery,
    );
  } finally {
    await environment.teardown();
  }
});

async function runPendingRegistrationContinuationCase(
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>,
  bundle: Awaited<ReturnType<typeof bundleWorkflowCode>>,
): Promise<void> {
  const address = addressFor("pending-registration");
  const workflowId = correlationIngressWorkflowId(address);
  const command = publication(address, "pending-registration", "settlement-42");
  const registration = registrationFor(address);
  const gate = failureGate();
  gate.release();
  let worker: WorkerLease | undefined;
  let ingress: WorkflowHandle | undefined;
  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "pending-registration-run-one-worker",
      undefined,
      activityOverrides(
        ContinuationCase.CandidateFanout,
        correlationPublicationContentSha256(command),
        gate,
        [],
        [],
        false,
      ),
    );
    ingress = await environment.client.workflow.start(
      "correlationIngressContinuationProbe",
      {
        args: [address, productionCorrelationIngressConfiguration],
        taskQueue: bpmnSemanticTaskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );
    assert.equal(
      (await executeRegistration(
        ingress,
        bpmnPrepareCorrelationCandidateUpdateName,
        prepareCorrelationCandidateRegistrationUpdateId(registration),
        registration,
      )).kind,
      CorrelationCandidateRegistrationResultKind.Prepared,
    );
    assert.equal(
      (await admit(ingress, command)).kind,
      CorrelationPublicationAdmissionResultKind.Admitted,
    );
    await waitForWorkflowChainRunCount(environment, workflowId, 2);
    const retained = await status(ingress, command);
    assert.equal(retained.kind, CorrelationPublicationStatusKind.Accepted);
    if (retained.kind !== CorrelationPublicationStatusKind.Accepted) {
      assert.fail("pending-registration publication was not retained");
    }
    assert.equal(retained.record.phase, CorrelationPublicationLedgerPhase.InFlight);
    assert.equal(retained.record.ordinal, 1);
    assert.equal(retained.record.target, null);

    await stopBpmnTestWorker(worker);
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "pending-registration-run-two-worker",
      undefined,
      activityOverrides(
        ContinuationCase.CandidateFanout,
        correlationPublicationContentSha256(command),
        gate,
        [],
        [],
        false,
      ),
    );
    assert.equal(
      (await executeRegistration(
        ingress,
        bpmnFinalizeCorrelationCandidateUpdateName,
        finalizeCorrelationCandidateRegistrationUpdateId(registration),
        registration,
      )).kind,
      CorrelationCandidateRegistrationResultKind.Finalized,
    );
    const settled = await waitForSettled(ingress, command);
    assert.equal(settled.record.ordinal, 1);

    const runs = await workflowChainRuns(environment, workflowId);
    assert.equal(runs.length, 2);
    await environment.client.workflow.getHandle(workflowId).terminate(
      "pending-registration continuation test cleanup",
    );
    for (const [index, run] of runs.entries()) {
      const rawHistory = await environment.client.workflow
        .getHandle(workflowId, run.runId)
        .fetchHistory();
      if (index === 0) {
        const history = rawHistory as TemporalHistory;
        assert.equal(historyEvents(history, "timerStartedEventAttributes").length, 0);
        assert.equal(
          historyEvents(
            history,
            "workflowExecutionContinuedAsNewEventAttributes",
          ).length,
          1,
        );
      }
      await replayBpmnHistory(bundle, rawHistory, workflowId);
    }
  } finally {
    if (ingress !== undefined) {
      await environment.client.workflow.getHandle(workflowId)
        .terminate("pending-registration failed-test cleanup")
        .catch(() => undefined);
    }
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
  }
}

async function runContinuationCase(
  environment: Awaited<ReturnType<typeof createCachedLocalEnvironment>>,
  bundle: Awaited<ReturnType<typeof bundleWorkflowCode>>,
  mode: ContinuationCase,
): Promise<void> {
  const address = addressFor(mode);
  const workflowId = correlationIngressWorkflowId(address);
  const prelude = publication(address, `${mode}-prelude`, "unmatched");
  const forced = publication(address, `${mode}-forced`, "settlement-42");
  const queued = publication(address, `${mode}-queued`, "queued-after-target");
  const forcedScanId = correlationPublicationContentSha256(forced);
  const gate = failureGate();
  const scanRequests: string[] = [];
  const targetRequests: string[] = [];
  let worker: WorkerLease | undefined;
  let ingress: WorkflowHandle | undefined;
  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${mode}-run-one-worker`,
      undefined,
      activityOverrides(
        mode,
        forcedScanId,
        gate,
        scanRequests,
        targetRequests,
        true,
      ),
    );
    ingress = await environment.client.workflow.start(
      "correlationIngressContinuationProbe",
      {
        args: [address, productionCorrelationIngressConfiguration],
        taskQueue: bpmnSemanticTaskQueue,
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );

    assert.equal(
      (await admit(ingress, prelude)).kind,
      CorrelationPublicationAdmissionResultKind.Admitted,
    );
    const preludeStatus = await waitForSettled(ingress, prelude);
    assert.equal(preludeStatus.record.ordinal, 1);

    const registration = registrationFor(address);
    assert.equal(
      (await executeRegistration(
        ingress,
        bpmnPrepareCorrelationCandidateUpdateName,
        prepareCorrelationCandidateRegistrationUpdateId(registration),
        registration,
      )).kind,
      CorrelationCandidateRegistrationResultKind.Prepared,
    );
    assert.equal(
      (await executeRegistration(
        ingress,
        bpmnFinalizeCorrelationCandidateUpdateName,
        finalizeCorrelationCandidateRegistrationUpdateId(registration),
        registration,
      )).kind,
      CorrelationCandidateRegistrationResultKind.Finalized,
    );

    assert.equal(
      (await admit(ingress, forced)).kind,
      CorrelationPublicationAdmissionResultKind.Admitted,
    );
    assert.equal(
      (await admit(ingress, queued)).kind,
      CorrelationPublicationAdmissionResultKind.Admitted,
    );
    await withDeadline(
      gate.reached,
      operationDeadlineMs,
      `${mode} third failed Activity attempt`,
    );
    const retainedBefore = await waitForStatus(
      ingress,
      forced,
      (status) => status.kind === CorrelationPublicationStatusKind.Accepted &&
        status.record.phase === CorrelationPublicationLedgerPhase.InFlight &&
        (mode === ContinuationCase.CandidateFanout
          ? status.record.target === null
          : status.record.target !== null),
    );
    gate.release();
    await waitForWorkflowChainRunCount(environment, workflowId, 2);
    const retainedAfter = await status(ingress, forced);
    assert.deepEqual(retainedAfter, retainedBefore);

    await stopBpmnTestWorker(worker);
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      `${mode}-run-two-worker`,
      undefined,
      activityOverrides(
        mode,
        forcedScanId,
        gate,
        scanRequests,
        targetRequests,
        false,
      ),
    );
    const forcedStatus = await waitForSettled(ingress, forced);
    const queuedStatus = await waitForSettled(ingress, queued);
    assert.equal(forcedStatus.record.ordinal, 2);
    assert.equal(queuedStatus.record.ordinal, 3);
    assert.deepEqual(await status(ingress, prelude), preludeStatus);

    const runs = await workflowChainRuns(environment, workflowId);
    assert.equal(runs.length, 2);
    await environment.client.workflow.getHandle(workflowId).terminate(
      `${mode} continuation test cleanup`,
    );
    for (const [index, run] of runs.entries()) {
      const rawHistory = await environment.client.workflow
        .getHandle(workflowId, run.runId)
        .fetchHistory();
      const history = rawHistory as TemporalHistory;
      if (index === 0) {
        assert.equal(
          historyEvents(history, "timerStartedEventAttributes").length,
          0,
        );
        assert.equal(
          historyEvents(
            history,
            "workflowExecutionContinuedAsNewEventAttributes",
          ).length,
          1,
        );
      }
      await replayBpmnHistory(bundle, rawHistory, workflowId);
    }

    const forcedScanRequests = scanRequests.filter((encoded) =>
      encoded.includes(forcedScanId)
    );
    if (mode === ContinuationCase.CandidateFanout) {
      assert.ok(forcedScanRequests.length >= 4);
      assert.equal(new Set(forcedScanRequests).size, 1);
    } else {
      assert.equal(forcedScanRequests.length, 1);
      assert.ok(targetRequests.length >= 4);
      assert.equal(new Set(targetRequests).size, 1);
    }
  } finally {
    gate.release();
    if (ingress !== undefined) {
      await environment.client.workflow.getHandle(workflowId)
        .terminate(`${mode} failed-test cleanup`)
        .catch(() => undefined);
    }
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
  }
}

function activityOverrides(
  mode: ContinuationCase,
  forcedScanId: string,
  gate: ReturnType<typeof failureGate>,
  scanRequests: string[],
  targetRequests: string[],
  failSelectedPhase: boolean,
): TestActivityOverrides {
  return {
    [bpmnResolveCorrelationCandidateScanActivityName]: async (value) => {
      const request = requireCorrelationCandidateScanActivityRequest(value);
      scanRequests.push(canonicalWorkflowChainJson(request));
      if (failSelectedPhase &&
        mode === ContinuationCase.CandidateFanout &&
        request.scanId === forcedScanId) {
        await gate.failAttempt();
      }
      return {
        kind: CorrelationCandidateScanCompletionKind.Complete,
        scanId: request.scanId,
        candidates: request.registrations.map(({ candidate }) => candidate),
      };
    },
    [bpmnResolveCorrelationTargetDeliveryActivityName]: async (value) => {
      const request = requireCorrelationTargetDeliveryActivityRequest(value);
      if (request.commandId === `${mode}-forced`) {
        targetRequests.push(canonicalWorkflowChainJson(request));
      }
      if (failSelectedPhase &&
        mode === ContinuationCase.TargetDelivery &&
        request.commandId === `${mode}-forced`) {
        await gate.failAttempt();
      }
      return committedTargetCompletion(request);
    },
  };
}

function committedTargetCompletion(
  request: CorrelationTargetDeliveryActivityRequest,
) {
  return {
    stimulus: correlationTargetDeliveryStimulus(request),
    result: {
      kind: ProcessCommandResultKind.Semantic,
      commandId: request.commandId,
      outcome: CommandOutcome.Committed,
    },
  } as const;
}

function failureGate(): Readonly<{
  reached: Promise<void>;
  failAttempt: () => Promise<never>;
  release: () => void;
}> {
  let attempts = 0;
  let announceReached!: () => void;
  let releaseThird!: () => void;
  let released = false;
  const reached = new Promise<void>((resolve) => {
    announceReached = resolve;
  });
  const thirdMayFail = new Promise<void>((resolve) => {
    releaseThird = resolve;
  });
  return {
    reached,
    failAttempt: async () => {
      attempts += 1;
      if (attempts === 3) {
        announceReached();
        await thirdMayFail;
      }
      throw new Error(`forced Activity failure ${attempts}`);
    },
    release: () => {
      if (!released) {
        released = true;
        releaseThird();
      }
    },
  };
}

async function executeRegistration(
  ingress: WorkflowHandle,
  updateName: string,
  updateId: string,
  request: CorrelationCandidateRegistrationRequest,
) {
  return withDeadline(
    ingress.executeUpdate(updateName, { args: [request], updateId }),
    operationDeadlineMs,
    `${updateName} Update`,
  ) as Promise<{ kind: CorrelationCandidateRegistrationResultKind }>;
}

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
) {
  const settled = await waitForStatus(
    ingress,
    command,
    (observed) => observed.kind === CorrelationPublicationStatusKind.Accepted &&
      observed.record.phase === CorrelationPublicationLedgerPhase.Settled,
  );
  assert.equal(settled.kind, CorrelationPublicationStatusKind.Accepted);
  if (settled.kind !== CorrelationPublicationStatusKind.Accepted) {
    assert.fail("correlation publication did not retain its settled record");
  }
  return settled;
}

async function waitForStatus(
  ingress: WorkflowHandle,
  command: CorrelationPublicationCommand,
  predicate: (value: CorrelationPublicationStatus) => boolean,
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

function status(
  ingress: WorkflowHandle,
  command: CorrelationPublicationCommand,
): Promise<CorrelationPublicationStatus> {
  return ingress.query<
    CorrelationPublicationStatus,
    [CorrelationPublicationCommand]
  >(bpmnCorrelationPublicationStatusQueryName, command);
}

function addressFor(
  mode: ContinuationCase | "pending-registration",
): CorrelatedMessageAddress {
  return {
    definition: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "message-key-correlation-checkpoint",
      sourceId: `settlement-confirmation-${mode}`,
      sourceSha256: mode === ContinuationCase.CandidateFanout
        ? "a".repeat(64)
        : mode === ContinuationCase.TargetDelivery
        ? "b".repeat(64)
        : "c".repeat(64),
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
}

function publication(
  address: CorrelatedMessageAddress,
  commandId: string,
  value: string,
): CorrelationPublicationCommand {
  return {
    commandId,
    address,
    payload: { kind: VariableValueKind.String, value },
  };
}

function registrationFor(
  address: CorrelatedMessageAddress,
): CorrelationCandidateRegistrationRequest {
  const candidate: CorrelatedMessageCandidate = {
    address,
    processInstanceId: "ProcessInstance_1",
    subscriptionId: {
      processInstanceId: "ProcessInstance_1",
      elementId: "Catch_SettlementConfirmed",
      activation: 1,
    },
    correlationPropertyId: "CorrelationProperty_SettlementReference",
    processPropertyId: "Property_SettlementReference",
    key: { kind: VariableValueKind.String, value: "settlement-42" },
  };
  return {
    transactionId: "Registration_1",
    candidate,
    processLocator: { workflowId: "bpmn-process-sha256:test-process" },
  };
}
