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
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  BpmnProcessWorkflow,
  CorrelationCandidateRegistrationRequest,
  CorrelationCandidateRegistrationResult,
  ProcessCorrelationRegistrationActivityRequest,
  ProcessCorrelationRegistrationResolution,
} from "@bpmn-lean/temporal-testkit";
import {
  BpmnCorrelationCandidateCapacityExhausted,
  BpmnWorkflowHostInputKind,
  CorrelationCandidateCapacityMeasure,
  CorrelationCandidateRegistrationPhase,
  CorrelationCandidateRegistrationResultKind,
  ProcessCorrelationRegistrationPhase,
  ProcessCorrelationRegistrationResolutionKind,
  WorkflowChainBudgetKind,
  bpmnExecutionPublicationQueryName,
  bpmnFinalizeCorrelationCandidateUpdateName,
  bpmnFlowNodeOccurrencesQueryName,
  bpmnProcessCorrelationCandidateQueryName,
  bpmnProcessWorkflowType,
  bpmnResolveCorrelationCandidateRegistrationActivityName,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  bpmnWorkflowContinuationV1,
  correlationIngressWorkflowId,
  createCachedLocalEnvironment,
  finalizeCorrelationCandidateRegistrationUpdateId,
  loadBpmnWorkflowBundle,
  processWorkflowId,
  submitMessageDelivery,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type { WorkflowHandle } from "@temporalio/client";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";

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

test("stages one Process successor until its exact candidate registration is active", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../../scenarios/message-key-correlation/process.bpmn",
      import.meta.url,
    )),
    sourceId: "message-key-correlation-process-registration",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    assert.fail("Message correlation Process fixture was not admitted");
  }
  const program = compilation.semanticProcess;
  const instanceId = "ProcessCorrelationRegistration_1";
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: "start-process-correlation-registration",
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
    commandId: "open-process-correlation-registration",
    subscriptionId: initialWait.id,
    channel: directOperation.message.channel,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  } as const;
  const opened = advanceScenario(program, started.state, opening);
  assert.equal(opened.kind, ScenarioStepKind.Committed);
  const candidate = projectCorrelatedMessageCandidate(program, opened.state);
  assert.notEqual(candidate, null);
  const workflowId = processWorkflowId(instanceId);
  const registration: CorrelationCandidateRegistrationRequest = {
    transactionId: opening.commandId,
    candidate: candidate!,
    processLocator: { workflowId },
  };

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-process-correlation-registration",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Process correlation registration environment startup",
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
      "bpmn-process-correlation-registration-worker",
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
        workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
      },
    );
    await waitForMessageState(
      process,
      (state) => state.openMessageSubscriptions.some(({ id }) =>
        id.elementId === opening.subscriptionId.elementId
      ),
    );

    let openingResult;
    try {
      openingResult = await withDeadline(
        submitMessageDelivery(environment.client.workflow, instanceId, opening),
        operationDeadlineMs,
        "opening Message settlement",
      );
    } catch (error: unknown) {
      const history = await process.fetchHistory();
      const observedCandidate = await process.query(
        bpmnProcessCorrelationCandidateQueryName,
        {
          address: candidate!.address,
          subscriptionId: candidate!.subscriptionId,
        },
      ).catch((queryError: unknown) => String(queryError));
      const activityFailures = history.events?.flatMap((event) =>
        event.activityTaskFailedEventAttributes === null ||
            event.activityTaskFailedEventAttributes === undefined
          ? []
          : [event.activityTaskFailedEventAttributes.failure]
      ) ?? [];
      const activitySchedules = history.events?.flatMap((event) =>
        event.activityTaskScheduledEventAttributes === null ||
            event.activityTaskScheduledEventAttributes === undefined
          ? []
          : [{
              activityId: event.activityTaskScheduledEventAttributes.activityId,
              activityType:
                event.activityTaskScheduledEventAttributes.activityType?.name,
            }]
      ) ?? [];
      const workflowTaskFailures = history.events?.flatMap((event) =>
        event.workflowTaskFailedEventAttributes === null ||
            event.workflowTaskFailedEventAttributes === undefined
          ? []
          : [{
              cause: event.workflowTaskFailedEventAttributes.cause,
              failure: event.workflowTaskFailedEventAttributes.failure,
            }]
      ) ?? [];
      throw new Error(
        `Opening Message remained pending; candidate=${JSON.stringify(observedCandidate)} ` +
          `activitySchedules=${JSON.stringify(activitySchedules)} ` +
          `activityFailures=${JSON.stringify(activityFailures)} ` +
          `workflowTaskFailures=${JSON.stringify(workflowTaskFailures)}`,
        { cause: error },
      );
    }
    assert.deepEqual(openingResult, {
      kind: "semantic",
      commandId: opening.commandId,
      outcome: CommandOutcome.Committed,
    });
    assert.deepEqual(
      await process.query(
        bpmnProcessCorrelationCandidateQueryName,
        {
          address: candidate!.address,
          subscriptionId: candidate!.subscriptionId,
        },
      ),
      candidate,
    );
    await waitForMessageState(
      process,
      (state) => state.openMessageSubscriptions.some(({ id }) =>
        id.elementId === candidate!.subscriptionId.elementId
      ),
    );

    ingress = environment.client.workflow.getHandle(
      correlationIngressWorkflowId(candidate!.address),
    );
    assert.deepEqual(
      await ingress.executeUpdate<
        CorrelationCandidateRegistrationResult,
        [CorrelationCandidateRegistrationRequest]
      >(bpmnFinalizeCorrelationCandidateUpdateName, {
        args: [registration],
        updateId: finalizeCorrelationCandidateRegistrationUpdateId(registration),
      }),
      {
        kind: CorrelationCandidateRegistrationResultKind.Finalized,
        transactionId: opening.commandId,
        phase: CorrelationCandidateRegistrationPhase.Active,
      },
    );
    processHistory = await process.fetchHistory();
    ingressHistory = await ingress.fetchHistory();
  } finally {
    await process?.terminate("Process correlation registration cleanup")
      .catch(() => undefined);
    await ingress?.terminate("Process correlation ingress cleanup")
      .catch(() => undefined);
    if (worker !== undefined) {
      await stopBpmnTestWorker(worker);
    }
    await environment.teardown();
  }

  assert.ok(processHistory !== undefined && ingressHistory !== undefined);
  await replayBpmnHistory(bundle, processHistory, workflowId);
  await replayBpmnHistory(
    bundle,
    ingressHistory,
    correlationIngressWorkflowId(candidate!.address),
  );
});

test("publishes no Process state or E1/E2 while prepare is deferred or capacity-refused", async () => {
  const compilation = await compileBpmnToSemanticProcess({
    bytes: await readFile(new URL(
      "../../../../scenarios/message-key-correlation/process.bpmn",
      import.meta.url,
    )),
    sourceId: "message-key-correlation-process-refusal",
    expectedSha256: undefined,
    sourceOverlay: null,
    semanticProfile: MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
  if (compilation.status !== BpmnCompilationStatus.Accepted) {
    assert.fail("Message correlation refusal fixture was not admitted");
  }
  const fixture = correlationOpening(
    compilation.semanticProcess,
    "ProcessCorrelationRegistrationRefused_1",
    "refused",
  );
  let deferredObserved!: () => void;
  const firstDeferred = new Promise<void>((resolve) => {
    deferredObserved = resolve;
  });
  let secondStarted!: () => void;
  const capacityAttempt = new Promise<void>((resolve) => {
    secondStarted = resolve;
  });
  let releaseCapacity!: () => void;
  const capacityReleased = new Promise<void>((resolve) => {
    releaseCapacity = resolve;
  });
  let invocations = 0;
  const activity = async (
    request: ProcessCorrelationRegistrationActivityRequest,
  ): Promise<ProcessCorrelationRegistrationResolution> => {
    assert.equal(request.phase, ProcessCorrelationRegistrationPhase.Prepare);
    invocations += 1;
    if (invocations === 1) {
      deferredObserved();
      return {
        kind: ProcessCorrelationRegistrationResolutionKind.DeferredByScan,
        transactionId: request.registration.transactionId,
        scanId: "scan-held",
      };
    }
    secondStarted();
    await capacityReleased;
    return {
      kind: ProcessCorrelationRegistrationResolutionKind.CandidateCapacity,
      transactionId: request.registration.transactionId,
      failure: {
        measure: CorrelationCandidateCapacityMeasure.CandidateLocatorRecords,
        configuredBound: 1,
        observedValue: 2,
      },
    };
  };

  const environment = await withDeadline(
    createCachedLocalEnvironment({
      identity: "bpmn-process-correlation-registration-refusal",
      downloadDirectory: temporalCacheDirectory,
    }),
    40_000,
    "Process correlation refusal environment startup",
  );
  const bundle = await loadBpmnWorkflowBundle();
  let worker: Worker | undefined;
  let workerRun: Promise<void> | undefined;
  let workerFailure: unknown;
  let process: WorkflowHandle<BpmnProcessWorkflow> | undefined;
  let history: Awaited<ReturnType<WorkflowHandle["fetchHistory"]>> |
    undefined;
  try {
    worker = await Worker.create({
      connection: environment.nativeConnection,
      identity: "bpmn-process-correlation-registration-refusal-worker",
      taskQueue: bpmnSemanticTaskQueue,
      workflowBundle: bundle,
      activities: {
        [bpmnResolveCorrelationCandidateRegistrationActivityName]: activity,
      },
    });
    workerRun = worker.run().catch((error: unknown) => {
      workerFailure = error;
    });
    process = await startProcessWorkflow(
      environment,
      fixture.program,
      fixture.start,
    );
    const initialStateObservation = await waitForMessageState(
      process,
      (state) => state.openMessageSubscriptions.some(({ id }) =>
        id.elementId === fixture.opening.subscriptionId.elementId
      ),
    );
    const queryRequest = { afterRevision: 0, limit: 100 } as const;
    const initialExecution = await process.query(
      bpmnExecutionPublicationQueryName,
      queryRequest,
    );
    const initialOccurrences = await process.query(
      bpmnFlowNodeOccurrencesQueryName,
      queryRequest,
    );
    const initialTrace = await process.query(bpmnTraceQueryName);
    const submission = submitMessageDelivery(
      environment.client.workflow,
      fixture.start.instanceId,
      fixture.opening,
    );
    await withDeadline(firstDeferred, operationDeadlineMs, "scan deferral");
    await withDeadline(capacityAttempt, operationDeadlineMs, "capacity retry");

    assert.deepEqual(
      await process.query(bpmnExecutionPublicationQueryName, queryRequest),
      initialExecution,
    );
    assert.deepEqual(
      await process.query(bpmnFlowNodeOccurrencesQueryName, queryRequest),
      initialOccurrences,
    );
    assert.deepEqual(await process.query(bpmnTraceQueryName), initialTrace);
    assert.deepEqual(
      await waitForMessageState(
        process,
        (state) => state.openMessageSubscriptions.some(({ id }) =>
          id.elementId === fixture.opening.subscriptionId.elementId
        ),
      ),
      initialStateObservation,
    );
    assert.equal(
      await process.query(
        bpmnProcessCorrelationCandidateQueryName,
        {
          address: fixture.candidate.address,
          subscriptionId: fixture.candidate.subscriptionId,
        },
      ),
      null,
    );

    releaseCapacity();
    await assert.rejects(submission, BpmnCorrelationCandidateCapacityExhausted);
    assert.deepEqual(
      await process.query(bpmnExecutionPublicationQueryName, queryRequest),
      initialExecution,
    );
    assert.deepEqual(
      await process.query(bpmnFlowNodeOccurrencesQueryName, queryRequest),
      initialOccurrences,
    );
    assert.deepEqual(await process.query(bpmnTraceQueryName), initialTrace);
    history = await process.fetchHistory();
  } finally {
    releaseCapacity?.();
    await process?.terminate("Process correlation refusal cleanup")
      .catch(() => undefined);
    if (worker !== undefined && workerRun !== undefined) {
      worker.shutdown();
      await workerRun;
    }
    await environment.teardown();
  }
  if (workerFailure !== undefined) {
    throw workerFailure;
  }
  assert.ok(history !== undefined);
  await replayBpmnHistory(
    bundle,
    history,
    processWorkflowId(fixture.start.instanceId),
  );
});

function correlationOpening(
  program: SemanticProcessProgram,
  instanceId: string,
  suffix: string,
) {
  const start = {
    kind: StimulusKind.StartProcess,
    commandId: `start-process-correlation-${suffix}`,
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
    commandId: `open-process-correlation-${suffix}`,
    subscriptionId: initialWait.id,
    channel: directOperation.message.channel,
    payload: { kind: VariableValueKind.String, value: "settlement-42" },
  } as const;
  const opened = advanceScenario(program, started.state, opening);
  assert.equal(opened.kind, ScenarioStepKind.Committed);
  const candidate = projectCorrelatedMessageCandidate(program, opened.state);
  assert.notEqual(candidate, null);
  return { program, start, opening, candidate: candidate! };
}

function startProcessWorkflow(
  environment: TestWorkflowEnvironment,
  program: SemanticProcessProgram,
  start: ReturnType<typeof correlationOpening>["start"],
): Promise<WorkflowHandle<BpmnProcessWorkflow>> {
  return environment.client.workflow.start<BpmnProcessWorkflow>(
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
      workflowId: processWorkflowId(start.instanceId),
      workflowIdReusePolicy: "REJECT_DUPLICATE",
    },
  );
}
