/**
 * Durable refinement witness for one payload-bearing Intermediate Catch Message Event, run for the closed scalar
 * profile and for the structured Message-payload profile (`PBV-MSG-01`..`03`): each refused delivery leaves the
 * subscription live across Continue-As-New, the routed delivery survives a Worker outage, a reused command ID with a
 * changed payload leaf is an identity conflict, Review survives a second outage, and every Run replays.
 */
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
  VariableValue,
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

const scenarios = new URL("../../../../scenarios/", import.meta.url);
const operationDeadlineMs = 10_000;

export type PayloadMessageWorkflowChainCase = Readonly<{
  scenarioUrl: URL;
  bpmnUrl: URL;
  propertyId: string;
  /** Well-formed payloads the profile refuses, each delivered after the payload-free command. */
  refusedPayloads: ReadonlyArray<VariableValue>;
  /** The delivered payload with one leaf changed, reused under the delivery's command ID. */
  conflictingPayload: (payload: VariableValue) => VariableValue;
}>;

/** The closed scalar profile also refuses a structured payload, hosted (`PBV-MSG-01`). */
export const scalarPayloadMessageCase: PayloadMessageWorkflowChainCase = {
  scenarioUrl: new URL("message-payload-catch/supplied-scalar.scenario.json", scenarios),
  bpmnUrl: new URL("message-payload-catch/process.bpmn", scenarios),
  propertyId: "Property_SettlementReference",
  refusedPayloads: [{ kind: VariableValueKind.Map, value: [{ name: "reference", value: { kind: VariableValueKind.String, value: "s" } }] }],
  conflictingPayload: () => ({ kind: VariableValueKind.String, value: "settlement-reference-conflict" }),
};

export const structuredPayloadMessageCase: PayloadMessageWorkflowChainCase = {
  scenarioUrl: new URL("portable-business-message-payload/manifest-delivered.scenario.json", scenarios),
  bpmnUrl: new URL("portable-business-message-payload/process.bpmn", scenarios),
  propertyId: "Property_ShipmentManifest",
  refusedPayloads: [{ kind: VariableValueKind.List, value: [{ kind: VariableValueKind.String, value: "P-1" }] }],
  conflictingPayload: withChangedNestedLeaf,
};

export async function exercisePayloadMessageAcrossWorkflowChain(
  context: MessageTemporalCaseContext,
  selected: PayloadMessageWorkflowChainCase,
): Promise<void> {
  const scenario = await loadJson<Scenario>(selected.scenarioUrl);
  const input = await compileExecutionInput(scenario, selected.bpmnUrl);
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
    payload: selected.conflictingPayload(payloadDelivery.payload),
  } satisfies DeliverPayloadMessageStimulus;
  const refusedDeliveries = selected.refusedPayloads.map((payload, index) => ({
    ...payloadDelivery,
    commandId: `deliver-refused-payload-${index}`,
    payload,
  }) satisfies DeliverPayloadMessageStimulus);
  const expected = expectedSemanticExecution(
    input.semanticProcess,
    [
      start,
      payloadFreeDelivery,
      ...refusedDeliveries,
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
  for (const refused of refusedDeliveries) {
    assert.deepEqual(
      await submitMessageDelivery(context.environment.client.workflow, start.instanceId, refused),
      { kind: ProcessCommandResultKind.Semantic, commandId: refused.commandId, outcome: CommandOutcome.Rejected },
    );
  }
  const refusedRuns = refusedDeliveries.length;
  await waitForWorkflowChainRunCount(context.environment, workflowId, 2 + refusedRuns);
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

  await waitForWorkflowChainRunCount(context.environment, workflowId, 3 + refusedRuns);
  const taskState = await waitForPublishedWorkflowChainState(
    context.environment,
    workflowId,
    input.semanticProcess,
    start.instanceId,
    (state) => state.openUserTasks.length === 1,
  );
  assert.deepEqual(taskState.variables, [{
    name: selected.propertyId,
    value: payloadDelivery.payload,
  }]);
  assert.deepEqual(taskState.openMessageSubscriptions, []);

  // A second outage while Review waits with the routed Property; the replacement Worker completes it.
  await context.suspendWorker();
  const completionResult = submitUserTaskCompletion(
    context.environment.client.workflow,
    start.instanceId,
    completion,
  );
  await context.resumeWorker();
  assert.deepEqual(
    await completionResult,
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
    ...refusedDeliveries.map((refused) =>
      expectedWorkflowChainRecoveryEntry(start.instanceId, refused, CommandOutcome.Rejected)
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
  assert.equal(runs.length, 3 + refusedRuns);
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
    ...refusedDeliveries,
    payloadDelivery,
    conflictingDelivery,
  ]);
  assertNoNonSignalMessageHostEvents(combinedHistory);
}

/** Appends to the first String leaf below the root, so only a nested leaf separates the two command identities. */
function withChangedNestedLeaf(payload: VariableValue): VariableValue {
  const copy = structuredClone(payload) as VariableValue;
  const visit = (value: { kind: string; value?: unknown }, depth: number): boolean => {
    if (value.kind === VariableValueKind.String && depth > 0) {
      value.value = `${String(value.value)}-conflict`;
      return true;
    }
    if (value.kind === VariableValueKind.Map) {
      return (value.value as Array<{ value: { kind: string } }>).some((entry) => visit(entry.value, depth + 1));
    }
    if (value.kind === VariableValueKind.List) {
      return (value.value as Array<{ kind: string }>).some((member) => visit(member, depth + 1));
    }
    return false;
  };
  assert.ok(visit(copy as { kind: string; value?: unknown }, 0), "the payload has a nested String leaf");
  return copy;
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
