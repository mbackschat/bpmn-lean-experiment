import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome,
  MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
  ScenarioStepKind,
  SemanticOperationKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  initialState,
  projectCorrelatedMessageCandidate,
} from "@bpmn-lean/semantic-core";
import type {
  BpmnProcessWorkflow,
  CorrelationCandidateRegistrationRequest,
  CorrelationCandidateRegistrationResult,
  CorrelationCandidateScanBeginResult,
  CorrelationCandidateScanCompletion,
  CorrelationCandidateScanFinishResult,
} from "@bpmn-lean/temporal-testkit";
import {
  BpmnWorkflowHostInputKind,
  CorrelationCandidateRegistrationResultKind,
  CorrelationCandidateScanCompletionKind,
  CorrelationCandidateScanResultKind,
  WorkflowChainBudgetKind,
  beginCorrelationCandidateScanUpdateId,
  bpmnBeginCorrelationCandidateScanUpdateName,
  bpmnFinishCorrelationCandidateScanUpdateName,
  bpmnPrepareCorrelationCandidateUpdateName,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnWorkflowContinuationV1,
  correlationIngressWorkflowId,
  createCachedLocalEnvironment,
  finishCorrelationCandidateScanUpdateId,
  loadBpmnWorkflowBundle,
  prepareCorrelationCandidateRegistrationUpdateId,
  processWorkflowId,
  submitMessageDelivery,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { WorkflowHandle } from "@temporalio/client";

import {
  waitForMessageState,
} from "./message-temporal-test-support.ts";
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

test("holds one complete candidate snapshot across fanout success and failure", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../../scenarios/message-key-correlation/process.bpmn",
      import.meta.url,
    )),
    sourceId: "message-key-correlation-scan",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    assert.fail("Message correlation scan fixture was not admitted");
  }
  const program = compilation.semanticProcess;
  const instanceId = "CorrelationCandidateScan_1";
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: "start-correlation-candidate-scan",
    processId: program.processId,
    instanceId,
    initialVariables: [],
  } as const;
  const started = advanceScenario(program, initialState, start);
  assert.equal(started.kind, ScenarioStepKind.Committed);
  const initialWait = started.state.messageWaits[0];
  const directOperation = program.operations.find((operation) =>
    operation.kind === SemanticOperationKind.AwaitPayloadMessage &&
    operation.message.elementId === initialWait?.id.elementId
  );
  assert.ok(initialWait !== undefined &&
    directOperation?.kind === SemanticOperationKind.AwaitPayloadMessage);
  const opening = {
    kind: StimulusKind.DeliverPayloadMessage,
    commandId: "open-correlation-candidate-scan",
    subscriptionId: initialWait.id,
    channel: directOperation.message.channel,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  } as const;
  const opened = advanceScenario(program, started.state, opening);
  assert.equal(opened.kind, ScenarioStepKind.Committed);
  const candidate = projectCorrelatedMessageCandidate(program, opened.state);
  assert.notEqual(candidate, null);

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-correlation-candidate-scan",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "correlation candidate scan environment startup",
  );
  const bundle = await loadBpmnWorkflowBundle();
  let worker: WorkerLease | undefined;
  let process: WorkflowHandle<BpmnProcessWorkflow> | undefined;
  let ingress: WorkflowHandle | undefined;
  let processHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> |
    undefined;
  let ingressHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> |
    undefined;
  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "bpmn-correlation-candidate-scan-worker",
    );
    process = await environment.client.workflow.start<BpmnProcessWorkflow>(
      bpmnProcessWorkflowType,
      {
        args: [
          start,
          program,
          {
            protocol: bpmnWorkflowContinuationV1,
            kind: BpmnWorkflowHostInputKind.Initial,
            eventHistoryEventLimit: workflowChainProductionLimit(
              WorkflowChainBudgetKind.EventHistoryEvents,
            ),
            eventHistoryByteLimit: workflowChainProductionLimit(
              WorkflowChainBudgetKind.EventHistoryBytes,
            ),
          },
        ],
        taskQueue: bpmnSemanticTaskQueue,
        workflowId: processWorkflowId(instanceId),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );
    await waitForMessageState(
      process,
      (state) => state.openMessageSubscriptions.some(({ id }) =>
        id.elementId === opening.subscriptionId.elementId
      ),
    );
    assert.deepEqual(
      await submitMessageDelivery(
        environment.client.workflow,
        instanceId,
        opening,
      ),
      {
        kind: "semantic",
        commandId: opening.commandId,
        outcome: CommandOutcome.Committed,
      },
    );
    ingress = environment.client.workflow.getHandle(
      correlationIngressWorkflowId(candidate!.address),
    );

    const scan = { scanId: "Scan_complete" } as const;
    const completion = await withDeadline(
      ingress.executeUpdate<
        CorrelationCandidateScanBeginResult,
        [typeof scan]
      >(bpmnBeginCorrelationCandidateScanUpdateName, {
        args: [scan],
        updateId: beginCorrelationCandidateScanUpdateId(scan),
      }),
      operationDeadlineMs,
      "complete candidate scan",
    );
    assert.deepEqual(completion, {
      kind: CorrelationCandidateScanCompletionKind.Complete,
      scanId: scan.scanId,
      candidates: [candidate],
    });

    const deferred = laterRegistration(candidate!, "Registration_deferred");
    assert.deepEqual(
      await ingress.executeUpdate<
        CorrelationCandidateRegistrationResult,
        [CorrelationCandidateRegistrationRequest]
      >(bpmnPrepareCorrelationCandidateUpdateName, {
        args: [deferred],
        updateId: prepareCorrelationCandidateRegistrationUpdateId(deferred),
      }),
      {
        kind: CorrelationCandidateRegistrationResultKind.DeferredByScan,
        transactionId: deferred.transactionId,
        scanId: scan.scanId,
      },
    );
    assert.deepEqual(
      await ingress.executeUpdate<
        CorrelationCandidateScanFinishResult,
        [CorrelationCandidateScanCompletion]
      >(bpmnFinishCorrelationCandidateScanUpdateName, {
        args: [completion as CorrelationCandidateScanCompletion],
        updateId: finishCorrelationCandidateScanUpdateId(
          completion as CorrelationCandidateScanCompletion,
        ),
      }),
      {
        kind: CorrelationCandidateScanResultKind.Finished,
        scanId: scan.scanId,
      },
    );

    processHistory = await process.fetchHistory();
    await process.terminate("make the retained candidate locator stale");
    const failedScan = { scanId: "Scan_failed" } as const;
    await assert.rejects(withDeadline(
      ingress.executeUpdate(
        bpmnBeginCorrelationCandidateScanUpdateName,
        {
          args: [failedScan],
          updateId: beginCorrelationCandidateScanUpdateId(failedScan),
        },
      ),
      operationDeadlineMs,
      "failed candidate scan",
    ));
    const blocked = laterRegistration(candidate!, "Registration_blocked");
    assert.deepEqual(
      await ingress.executeUpdate(
        bpmnPrepareCorrelationCandidateUpdateName,
        {
          args: [blocked],
          updateId: prepareCorrelationCandidateRegistrationUpdateId(blocked),
        },
      ),
      {
        kind: CorrelationCandidateRegistrationResultKind.DeferredByScan,
        transactionId: blocked.transactionId,
        scanId: failedScan.scanId,
      },
    );
    ingressHistory = await ingress.fetchHistory();
  } finally {
    await process?.terminate("correlation candidate scan cleanup")
      .catch(() => undefined);
    await ingress?.terminate("correlation candidate ingress cleanup")
      .catch(() => undefined);
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }

  assert.ok(processHistory !== undefined && ingressHistory !== undefined);
  await replayBpmnHistory(
    bundle,
    processHistory,
    processWorkflowId(instanceId),
  );
  await replayBpmnHistory(
    bundle,
    ingressHistory,
    correlationIngressWorkflowId(candidate!.address),
  );
});

function laterRegistration(
  candidate: NonNullable<ReturnType<typeof projectCorrelatedMessageCandidate>>,
  transactionId: string,
): CorrelationCandidateRegistrationRequest {
  return {
    transactionId,
    candidate: {
      ...candidate,
      processInstanceId: `${candidate.processInstanceId}_${transactionId}`,
      subscriptionId: {
        ...candidate.subscriptionId,
        processInstanceId:
          `${candidate.subscriptionId.processInstanceId}_${transactionId}`,
      },
    },
    processLocator: {
      workflowId: `bpmn-process-sha256:${transactionId}`,
    },
  };
}
