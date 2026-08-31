import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
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
import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind,
  CorrelationPublicationAdmissionResultKind,
  CorrelationPublicationLedgerPhase,
  CorrelationPublicationSemanticOutcomeKind,
  CorrelationPublicationStatusKind,
  CorrelationPublicationStoredResolutionKind,
  ProcessCommandResultKind,
  WorkflowChainBudgetKind,
  bpmnAdmitCorrelationPublicationUpdateName,
  bpmnCorrelationPublicationStatusQueryName,
  bpmnProcessWorkflowType,
  bpmnResolveCorrelationTargetDeliveryActivityName,
  bpmnSemanticTaskQueue,
  bpmnWorkflowContinuationV1,
  correlationIngressWorkflowId,
  correlationPublicationUpdateId,
  correlationTargetDeliveryStimulus,
  createCachedLocalEnvironment,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  productionCorrelationIngressConfiguration,
  requireCorrelationTargetDeliveryActivityRequest,
  submitMessageDelivery,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  CorrelationPublicationAdmissionResult,
  CorrelationPublicationCommand,
  CorrelationPublicationStatus,
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
  waitForOpenUserTaskIds,
} from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";

const operationDeadlineMs = 20_000;

test("delivers one selected publication after Worker replacement and replays both histories", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../../scenarios/message-key-correlation/process.bpmn",
      import.meta.url,
    )),
    sourceId: "message-key-correlation-target-delivery",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    assert.fail("Message correlation target fixture was not admitted");
  }
  const program = compilation.semanticProcess;
  const first = correlationProcessFixture(
    program,
    "CorrelationTargetDelivery_1",
    "first",
    "settlement-42",
  );
  const { instanceId, start, opening, candidate } = first;
  const publication: CorrelationPublicationCommand = {
    commandId: "publish-correlation-target-delivery",
    address: candidate!.address,
    payload: candidate!.key,
  };

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-correlation-target-delivery",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "correlation target-delivery environment startup",
  );
  const bundle = await loadBpmnWorkflowBundle();
  let worker: WorkerLease | undefined;
  let process: WorkflowHandle<BpmnProcessWorkflow> | undefined;
  let inconsistentProcess: WorkflowHandle<BpmnProcessWorkflow> | undefined;
  let ingress: WorkflowHandle | undefined;
  let processHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> |
    undefined;
  let ingressHistory: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> |
    undefined;
  let inconsistentProcessHistory: Awaited<
    ReturnType<WorkflowHandle["fetchHistory"]>
  > | undefined;
  try {
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "bpmn-correlation-target-delivery-worker-1",
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
      correlationIngressWorkflowId(publication.address),
    );

    await stopBpmnTestWorker(worker);
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "bpmn-correlation-target-delivery-worker-2",
    );
    await ingress.executeUpdate(
      bpmnAdmitCorrelationPublicationUpdateName,
      {
        args: [publication],
        updateId: correlationPublicationUpdateId(publication),
      },
    );
    const status = await waitForSettled(ingress, publication);
    assert.deepEqual(status.record.resolution, {
      kind: CorrelationPublicationStoredResolutionKind.Semantic,
      outcome: {
        kind: CorrelationPublicationSemanticOutcomeKind.Committed,
        target: {
          processInstanceId: instanceId,
          subscriptionId: candidate!.subscriptionId,
        },
      },
    });
    await waitForOpenUserTaskIds(process, ["UserTask_ReviewSettlement"]);
    const inconsistent = correlationProcessFixture(
      program,
      "CorrelationTargetDelivery_2",
      "inconsistent",
      "settlement-43",
    );
    inconsistentProcess = await environment.client.workflow.start<BpmnProcessWorkflow>(
      bpmnProcessWorkflowType,
      {
        args: [
          inconsistent.start,
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
        workflowId: processWorkflowId(inconsistent.instanceId),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );
    await waitForMessageState(
      inconsistentProcess,
      (state) => state.openMessageSubscriptions.some(({ id }) =>
        id.elementId === inconsistent.opening.subscriptionId.elementId
      ),
    );
    assert.equal(
      (await submitMessageDelivery(
        environment.client.workflow,
        inconsistent.instanceId,
        inconsistent.opening,
      )).kind,
      ProcessCommandResultKind.Semantic,
    );
    await stopBpmnTestWorker(worker);
    worker = await startBpmnTestWorker(
      environment,
      bundle,
      "bpmn-correlation-target-delivery-worker-3",
      undefined,
      {
        [bpmnResolveCorrelationTargetDeliveryActivityName]: async (...args) => {
          const request = requireCorrelationTargetDeliveryActivityRequest(args[0]);
          return {
            stimulus: correlationTargetDeliveryStimulus(request),
            result: {
              kind: ProcessCommandResultKind.ProcessUnknown,
              commandId: request.commandId,
              processInstanceId: request.target.processInstanceId,
            },
          };
        },
      },
    );
    const inconsistentPublication: CorrelationPublicationCommand = {
      commandId: "publish-correlation-target-inconsistent",
      address: inconsistent.candidate.address,
      payload: inconsistent.candidate.key,
    };
    await ingress.executeUpdate(
      bpmnAdmitCorrelationPublicationUpdateName,
      {
        args: [inconsistentPublication],
        updateId: correlationPublicationUpdateId(inconsistentPublication),
      },
    );
    const inconsistentStatus = await waitForSettled(
      ingress,
      inconsistentPublication,
    );
    assert.deepEqual(inconsistentStatus.record.resolution, {
      kind: CorrelationPublicationStoredResolutionKind.TargetInconsistent,
      target: {
        processInstanceId: inconsistent.instanceId,
        subscriptionId: inconsistent.candidate.subscriptionId,
      },
    });
    await waitForMessageState(
      inconsistentProcess,
      (state) => state.openMessageSubscriptions.some(({ id }) =>
        id.processInstanceId === inconsistent.instanceId &&
        id.elementId === inconsistent.candidate.subscriptionId.elementId
      ),
    );
    const later: CorrelationPublicationCommand = {
      ...inconsistentPublication,
      commandId: "publish-after-target-quarantine",
    };
    const refused = await ingress.executeUpdate<
      CorrelationPublicationAdmissionResult,
      [CorrelationPublicationCommand]
    >(bpmnAdmitCorrelationPublicationUpdateName, {
      args: [later],
      updateId: correlationPublicationUpdateId(later),
    });
    assert.deepEqual(refused, {
      kind: CorrelationPublicationAdmissionResultKind.AddressQuarantined,
      commandId: later.commandId,
      target: {
        processInstanceId: inconsistent.instanceId,
        subscriptionId: inconsistent.candidate.subscriptionId,
      },
    });
    assert.equal(
      (await ingress.query<
        CorrelationPublicationStatus,
        [CorrelationPublicationCommand]
      >(bpmnCorrelationPublicationStatusQueryName, later)).kind,
      CorrelationPublicationStatusKind.Absent,
    );
    processHistory = await process.fetchHistory();
    inconsistentProcessHistory = await inconsistentProcess.fetchHistory();
    ingressHistory = await ingress.fetchHistory();
  } finally {
    await process?.terminate("correlation target-delivery cleanup")
      .catch(() => undefined);
    await inconsistentProcess?.terminate("correlation target-inconsistent cleanup")
      .catch(() => undefined);
    await ingress?.terminate("correlation target ingress cleanup")
      .catch(() => undefined);
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }

  assert.ok(processHistory !== undefined &&
    inconsistentProcessHistory !== undefined &&
    ingressHistory !== undefined);
  await replayBpmnHistory(bundle, processHistory, processWorkflowId(instanceId));
  await replayBpmnHistory(
    bundle,
    inconsistentProcessHistory,
    processWorkflowId("CorrelationTargetDelivery_2"),
  );
  await replayBpmnHistory(
    bundle,
    ingressHistory,
    correlationIngressWorkflowId(publication.address),
  );
});

function correlationProcessFixture(
  program: SemanticProcessProgram,
  instanceId: string,
  commandSuffix: string,
  key: string,
) {
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: `start-correlation-target-${commandSuffix}`,
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
    commandId: `open-correlation-target-${commandSuffix}`,
    subscriptionId: initialWait.id,
    channel: directOperation.message.channel,
    payload: { kind: VariableValueKind.String, value: key },
  } as const;
  const opened = advanceScenario(program, started.state, opening);
  assert.equal(opened.kind, ScenarioStepKind.Committed);
  const candidate = projectCorrelatedMessageCandidate(program, opened.state);
  assert.notEqual(candidate, null);
  return { instanceId, start, opening, candidate: candidate! };
}

async function waitForSettled(
  ingress: WorkflowHandle,
  publication: CorrelationPublicationCommand,
): Promise<Extract<CorrelationPublicationStatus, {
  kind: CorrelationPublicationStatusKind.Accepted;
}>> {
  return withDeadline((async () => {
    for (;;) {
      const status = await ingress.query<
        CorrelationPublicationStatus,
        [CorrelationPublicationCommand]
      >(
        bpmnCorrelationPublicationStatusQueryName,
        publication,
      );
      if (status.kind === CorrelationPublicationStatusKind.Accepted &&
        status.record.phase === CorrelationPublicationLedgerPhase.Settled) {
        return status;
      }
      await delay(20);
    }
  })(), operationDeadlineMs, "correlation target settlement");
}
