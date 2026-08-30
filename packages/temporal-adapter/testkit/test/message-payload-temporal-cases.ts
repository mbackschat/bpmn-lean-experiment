/** Durable refinement witness for one payload-bearing Intermediate Catch Message Event. */
import assert from "node:assert/strict";

import {
  CanonicalObservationKind,
  CommandOutcome,
  ProcessStatus,
  ScenarioStepKind,
  StimulusKind,
  VariableValueKind,
  advanceScenario,
  deployProcess,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation,
  DeliverMessageStimulus,
  DeliverPayloadMessageStimulus,
  Scenario,
  SemanticProcessProgram,
  StateObservation,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  BpmnCommandIdentityConflict,
  BpmnWorkflowHostInputKind,
  ProcessCommandResultKind,
  WorkflowChainBudgetKind,
  bpmnProcessWorkflowType,
  bpmnSemanticTaskQueue,
  bpmnTraceQueryName,
  bpmnWorkflowContinuationV1,
  getTestProcessHandle,
  isCompletedProcessReceipt,
  processWorkflowId,
  readTestProcessTerminalResult,
  submitMessageDelivery,
  submitUserTaskCompletion,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  BpmnProcessWorkflow,
  ProcessCommandResult,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";

import {
  assertExactMessageSignals,
  assertNoNonSignalMessageHostEvents,
  expectedWorkflowChainRecoveryEntry,
  waitForMessageSignalCount,
  waitForMessageState,
} from "./message-temporal-test-support.ts";
import type {
  MessageTemporalCaseContext,
} from "./message-temporal-test-support.ts";
import {
  compileExecutionInput,
  loadJson,
  requiredAt,
  withDeadline,
} from "./temporal-test-support.ts";
import {
  waitForPublishedWorkflowChainState,
  waitForWorkflowChainRunCount,
  workflowChainRuns,
} from "./workflow-chain-test-support.ts";

const scenarioUrl = new URL(
  "../../../../scenarios/message-payload-catch/supplied-scalar.scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/message-payload-catch/process.bpmn",
  import.meta.url,
);
const operationDeadlineMs = 10_000;

export async function exercisePayloadMessageAcrossWorkflowChain(
  context: MessageTemporalCaseContext,
): Promise<void> {
  const scenario = await loadJson<Scenario>(scenarioUrl);
  const input = await compileExecutionInput(scenario, bpmnUrl);
  const start = requiredAt(input.scenario.stimuli, 0, "Message payload stimuli");
  const payloadDelivery = requiredAt(
    input.scenario.stimuli,
    1,
    "Message payload stimuli",
  );
  const completion = requiredAt(
    input.scenario.stimuli,
    2,
    "Message payload stimuli",
  );
  assert.equal(start.kind, StimulusKind.StartProcess);
  assert.equal(payloadDelivery.kind, StimulusKind.DeliverPayloadMessage);
  assert.equal(completion.kind, StimulusKind.CompleteUserTaskInstance);
  if (
    start.kind !== StimulusKind.StartProcess ||
    payloadDelivery.kind !== StimulusKind.DeliverPayloadMessage ||
    completion.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    assert.fail("Message payload scenario has an unexpected stimulus sequence");
  }

  const payloadFreeDelivery = {
    kind: StimulusKind.DeliverMessage,
    commandId: "deliver-message-payload-catch-without-payload",
    subscriptionId: payloadDelivery.subscriptionId,
    channel: payloadDelivery.channel,
  } satisfies DeliverMessageStimulus;
  const conflictingDelivery = {
    ...payloadDelivery,
    payload: {
      kind: VariableValueKind.String,
      value: "settlement-reference-conflict",
    },
  } satisfies DeliverPayloadMessageStimulus;
  const expected = expectedSemanticExecution(
    input.semanticProcess,
    [
      start,
      payloadFreeDelivery,
      payloadDelivery,
      completion,
    ],
  );
  const workflowId = processWorkflowId(start.instanceId);
  const firstHandle = await context.environment.client.workflow.start<
    BpmnProcessWorkflow
  >(
    bpmnProcessWorkflowType,
    {
      args: [
        start,
        input.semanticProcess,
        {
          protocol: bpmnWorkflowContinuationV1,
          kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: 4,
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
  const processHandle = getTestProcessHandle(
    context.environment.client.workflow,
    start.instanceId,
  );

  const initialWait = await waitForMessageState(
    processHandle,
    (state) => state.openMessageSubscriptions.length === 1,
  );
  assert.deepEqual(initialWait.variables, []);
  assert.deepEqual(initialWait.enabledInteractions, [{
    kind: StimulusKind.DeliverPayloadMessage,
    subscriptionId: payloadDelivery.subscriptionId,
    channel: payloadDelivery.channel,
  }]);

  assert.deepEqual(
    await submitMessageDelivery(
      context.environment.client.workflow,
      start.instanceId,
      payloadFreeDelivery,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: payloadFreeDelivery.commandId,
      outcome: CommandOutcome.Rejected,
    },
  );
  await waitForWorkflowChainRunCount(context.environment, workflowId, 2);
  const successorWait = await waitForPublishedWorkflowChainState(
    context.environment,
    workflowId,
    input.semanticProcess,
    start.instanceId,
    (state) => state.openMessageSubscriptions.length === 1,
  );
  assert.deepEqual(successorWait, initialWait);

  const runsBeforePayload = await workflowChainRuns(
    context.environment,
    workflowId,
  );
  const liveRun = runsBeforePayload.at(-1);
  assert.ok(liveRun !== undefined);
  const liveRunHandle = context.environment.client.workflow.getHandle<
    BpmnProcessWorkflow
  >(workflowId, liveRun.runId);

  await context.suspendWorker();
  const payloadResult = submitMessageDelivery(
    context.environment.client.workflow,
    start.instanceId,
    payloadDelivery,
  );
  let conflictResult: Promise<
    | Readonly<{ kind: "resolved"; value: ProcessCommandResult }>
    | Readonly<{ kind: "rejected"; error: unknown }>
  > | undefined;
  try {
    await waitForMessageSignalCount(liveRunHandle, 1);
    conflictResult = submitMessageDelivery(
      context.environment.client.workflow,
      start.instanceId,
      conflictingDelivery,
    ).then(
      (value) => ({ kind: "resolved", value } as const),
      (error: unknown) => ({ kind: "rejected", error } as const),
    );
    await waitForMessageSignalCount(liveRunHandle, 2);
  } finally {
    await context.resumeWorker();
  }

  assert.deepEqual(await payloadResult, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: payloadDelivery.commandId,
    outcome: CommandOutcome.Committed,
  });
  assert.ok(conflictResult !== undefined);
  const conflict = await conflictResult;
  assert.equal(conflict.kind, "rejected");
  if (conflict.kind !== "rejected") {
    assert.fail("Payload-distinct Message delivery unexpectedly resolved");
  }
  assert.ok(conflict.error instanceof BpmnCommandIdentityConflict);

  await waitForWorkflowChainRunCount(context.environment, workflowId, 3);
  const taskState = await waitForPublishedWorkflowChainState(
    context.environment,
    workflowId,
    input.semanticProcess,
    start.instanceId,
    (state) => state.openUserTasks.length === 1,
  );
  assert.deepEqual(taskState.variables, [{
    name: "Property_SettlementReference",
    value: payloadDelivery.payload,
  }]);
  assert.deepEqual(taskState.openMessageSubscriptions, []);

  assert.deepEqual(
    await submitUserTaskCompletion(
      context.environment.client.workflow,
      start.instanceId,
      completion,
    ),
    {
      kind: ProcessCommandResultKind.Semantic,
      commandId: completion.commandId,
      outcome: CommandOutcome.Committed,
    },
  );
  const terminal = await withDeadline(
    readTestProcessTerminalResult(firstHandle),
    operationDeadlineMs,
    "Message payload terminal result",
  );
  assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
  assert.deepEqual(terminal.receipt.finalState, expected.finalState);
  assert.deepEqual(terminal.recoveryEntries, [
    expectedWorkflowChainRecoveryEntry(
      start.instanceId,
      payloadFreeDelivery,
      CommandOutcome.Rejected,
    ),
    expectedWorkflowChainRecoveryEntry(
      start.instanceId,
      payloadDelivery,
      CommandOutcome.Committed,
    ),
    expectedWorkflowChainRecoveryEntry(
      start.instanceId,
      completion,
      CommandOutcome.Committed,
    ),
  ]);
  assert.deepEqual(terminal.legacyMessageDeliveryRecords, []);

  const runs = await workflowChainRuns(context.environment, workflowId);
  assert.equal(runs.length, 3);
  const histories: TemporalHistory[] = [];
  const trace: CanonicalObservation[] = [];
  for (const run of runs) {
    const runHandle = context.environment.client.workflow.getHandle<
      BpmnProcessWorkflow
    >(workflowId, run.runId);
    const history = await runHandle.fetchHistory();
    histories.push(history as TemporalHistory);
    trace.push(...await runHandle.query<ReadonlyArray<CanonicalObservation>>(
      bpmnTraceQueryName,
    ));
    context.retainHistory(history as TemporalHistory, workflowId);
  }
  assert.deepEqual(trace, expected.trace);
  const combinedHistory = {
    events: histories.flatMap((history) => [...history.events]),
  } as TemporalHistory;
  assertExactMessageSignals(combinedHistory, [
    payloadFreeDelivery,
    payloadDelivery,
    conflictingDelivery,
  ]);
  assertNoNonSignalMessageHostEvents(combinedHistory);
}

function expectedSemanticExecution(
  semanticProcess: SemanticProcessProgram,
  stimuli: ReadonlyArray<Stimulus>,
): Readonly<{
  trace: ReadonlyArray<CanonicalObservation>;
  finalState: StateObservation & { status: ProcessStatus.Completed };
}> {
  const start = stimuli[0];
  assert.ok(start?.kind === StimulusKind.StartProcess);
  const deployment = deployProcess(start, semanticProcess);
  assert.equal(deployment.outcome, CommandOutcome.Committed);
  const trace: CanonicalObservation[] = [deployment.observation];
  let state = initialState;
  for (const stimulus of stimuli) {
    const step = advanceScenario(semanticProcess, state, stimulus);
    assert.notEqual(step.kind, ScenarioStepKind.HarnessFailure);
    if (step.kind === ScenarioStepKind.HarnessFailure) {
      assert.fail(`semantic oracle failed for ${stimulus.commandId}`);
    }
    state = step.state;
    trace.push(...step.observations);
  }
  const finalState = trace.findLast(
    (observation): observation is StateObservation =>
      observation.kind === CanonicalObservationKind.State,
  );
  assert.ok(
    finalState !== undefined && finalState.status === ProcessStatus.Completed,
  );
  return {
    trace,
    finalState: finalState as StateObservation & {
      status: ProcessStatus.Completed;
    },
  };
}
