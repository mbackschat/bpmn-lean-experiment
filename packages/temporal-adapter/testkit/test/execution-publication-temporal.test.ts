import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionPublicationResultKind,
  FlowNodeOccurrenceTerminalKind,
  ProcessCommandResultKind,
  asArray,
  asRecord,
  decodeJsonPayload,
  durableUpdateOutcomes,
  historyEvents,
  productionBpmnWorkflowInitialHostInput,
  runExecutionPublicationLiveEvidence,
} from "@bpmn-lean/temporal-testkit";
import type {
  CommittedTransitionRecord,
  ExecutionPublicationLiveEvidence,
  FlowNodeOccurrenceDelta,
  FlowNodeOccurrenceTransition,
  TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import {
  CommandOutcome, SemanticOperationKind, SemanticOriginKind, SemanticTransitionKind,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";

import {
  compileExecutionInput,
  loadJson,
  temporalCacheDirectory,
} from "./temporal-test-support.ts";

const parallelScenarioUrl = new URL(
  "../../../../scenarios/parallel-fork-join/a-then-b.scenario.json",
  import.meta.url,
);
const parallelBpmnUrl = new URL(
  "../../../../scenarios/parallel-fork-join/process.bpmn",
  import.meta.url,
);
const cycleScenarioUrl = new URL(
  "../../../../scenarios/user-task-cycle/scenario.json",
  import.meta.url,
);
const cycleBpmnUrl = new URL(
  "../../../../scenarios/user-task-cycle/process.bpmn",
  import.meta.url,
);

test("retains exact paired parallel publication through rollover, accepted-result recovery and every-Run replay", async () => {
  const [parallelScenario, cycleScenario] = await Promise.all([
    loadJson<Scenario>(parallelScenarioUrl),
    loadJson<Scenario>(cycleScenarioUrl),
  ]);
  const [parallel, cycle] = await Promise.all([
    compileExecutionInput(parallelScenario, parallelBpmnUrl),
    compileExecutionInput(cycleScenario, cycleBpmnUrl),
  ]);
  const evidence = await runExecutionPublicationLiveEvidence(
    temporalCacheDirectory,
    parallel,
    cycle,
  );

  assert.ok([
    ExecutionPublicationResultKind.NotReady,
    ExecutionPublicationResultKind.Available,
  ].includes(evidence.immediateKind));
  assert.deepEqual(evidence.start, evidence.repeatedStart);
  assert.deepEqual(evidence.queryHistoryEventCounts[0], evidence.queryHistoryEventCounts[1]);
  assert.equal(evidence.start.headRevision, 5);
  assert.equal(evidence.start.pageThroughRevision, 5);
  assert.equal(evidence.start.current?.revision, 5);
  assert.deepEqual(evidence.start.batches.map(batchSummary), [{
    commandId: "start-process",
    fromRevision: 0,
    throughRevision: 5,
    revisions: [1, 2, 3, 4, 5],
  }]);
  assert.deepEqual(transitionNames(evidence.start), [
    "external:start-process",
    "internal:operation:StartEvent_1:initiate",
    "internal:operation:Gateway_Fork:duplicate",
    "internal:operation:UserTask_A:awaitUserTask",
    "internal:operation:UserTask_B:awaitUserTask",
  ]);
  assert.deepEqual(positionFlowSummary(evidence.start), [
    [[], []],
    [[], ["Flow_StartToFork"]],
    [["Flow_StartToFork"], ["Flow_ForkToA", "Flow_ForkToB"]],
    [["Flow_ForkToA"], []],
    [["Flow_ForkToB"], []],
  ]);
  assert.deepEqual(
    evidence.start.batches[0]?.transitions.map(({ logicalTimeMs }) => logicalTimeMs),
    [0, 0, 0, 0, 0],
  );
  assert.deepEqual(evidence.start.current?.controlTokens, []);
  assert.deepEqual(evidence.start.current?.scopes, [{
    id: {
      processInstanceId: "Instance_1",
      definitionScopeId: "scope:Process_ParallelForkJoin",
      activation: 1,
    },
    parent: null,
    bpmnElementId: "Process_ParallelForkJoin",
  }]);

  assert.deepEqual(evidence.afterFirstCompletion.batches.map(batchSummary), [{
    commandId: "complete-user-task-a",
    fromRevision: 5,
    throughRevision: 6,
    revisions: [6],
  }]);
  assert.equal(evidence.afterFirstCompletion.headRevision, 6);
  assert.deepEqual(
    evidence.afterFirstCompletion.current?.controlTokens.map(({ sequenceFlowId }) => sequenceFlowId),
    ["Flow_AToJoin"],
  );
  assert.deepEqual(evidence.terminalSuffix.batches.map(batchSummary), [{
    commandId: "complete-user-task-b",
    fromRevision: 6,
    throughRevision: 10,
    revisions: [7, 8, 9, 10],
  }]);
  assert.deepEqual(transitionNames(evidence.terminalSuffix), [
    "external:complete-user-task-b",
    "internal:operation:Gateway_Join:synchronize",
    "internal:operation:EndEvent_1:reachNoneEnd",
    "internal:operation:complete-scope:scope:Process_ParallelForkJoin:completeScope",
  ]);
  assert.equal(evidence.terminal.headRevision, 10);
  assert.equal(evidence.terminal.current?.revision, evidence.terminal.headRevision);
  assert.deepEqual(evidence.terminal.current?.controlTokens, []);
  assert.deepEqual(evidence.terminal.current?.scopes, []);
  assert.deepEqual(evidence.terminal.batches.map(batchSummary), [
    { commandId: "start-process", fromRevision: 0, throughRevision: 5, revisions: [1, 2, 3, 4, 5] },
    { commandId: "complete-user-task-a", fromRevision: 5, throughRevision: 6, revisions: [6] },
    { commandId: "complete-user-task-b", fromRevision: 6, throughRevision: 10, revisions: [7, 8, 9, 10] },
  ]);

  assert.deepEqual(evidence.firstTerminalPage.batches.map(batchSummary), [
    { commandId: "start-process", fromRevision: 0, throughRevision: 5, revisions: [1, 2, 3, 4, 5] },
  ]);
  assert.equal(evidence.firstTerminalPage.current, null);
  assert.deepEqual(evidence.secondTerminalPage.batches.map(batchSummary), [
    { commandId: "complete-user-task-a", fromRevision: 5, throughRevision: 6, revisions: [6] },
  ]);
  assert.equal(evidence.secondTerminalPage.current, null);
  assert.deepEqual(evidence.atHead.batches, []);
  assert.equal(evidence.atHead.current?.revision, 10);
  assert.deepEqual(evidence.insideBatch, { kind: ExecutionPublicationResultKind.Gap });
  assert.deepEqual(evidence.aheadOfHead, { kind: ExecutionPublicationResultKind.Gap });
  assert.deepEqual(evidence.retainedAfterReplay, evidence.terminal);

  assert.notEqual(evidence.historyDerivedRevisionMutation, evidence.terminal.headRevision);
  assert.deepEqual(evidence.startStateDifferenceMutation, []);
  assert.equal(evidence.start.batches[0]?.transitions.length, 5);

  assert.equal(evidence.cycle.terminal.headRevision, 16);
  assert.deepEqual(evidence.cycle.reviewOperationRevisions, [4, 8, 12]);
  assert.deepEqual(evidence.cycle.completionActivations, [1, 2, 3]);
  assert.deepEqual(evidence.cycle.retainedAfterReplay, evidence.cycle.terminal);

  assert.ok(
    "parallelRunIds" in evidence && Array.isArray(evidence.parallelRunIds) &&
      evidence.parallelRunIds.length > 1,
    "parallel publication must retain and replay an actual Workflow Run chain",
  );
  assert.ok(
    "firstCompletionRecovery" in evidence,
    "parallel publication must recover the accepted first completion after Worker replacement",
  );
  assertParallelChain(evidence, parallel);
  const recovery = evidence.firstCompletionRecovery;
  assert.equal(recovery.acceptedOutcome, CommandOutcome.Committed);
  assert.equal(recovery.recoveredOutcome, recovery.acceptedOutcome);
  assert.deepEqual(recovery.duplicateResult, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: "complete-user-task-a",
    outcome: recovery.acceptedOutcome,
  });
  assert.deepEqual(recovery.after, recovery.before);
  assert.deepEqual(evidence.start.current?.state.openUserTasks.map(({ id }) => id), [
    { processInstanceId: "Instance_1", elementId: "UserTask_A", activation: 1 },
    { processInstanceId: "Instance_1", elementId: "UserTask_B", activation: 1 },
  ]);
  assert.deepEqual(evidence.afterFirstCompletion.current?.state.openUserTasks.map(({ id }) => id), [
    { processInstanceId: "Instance_1", elementId: "UserTask_B", activation: 1 },
  ]);
  assert.deepEqual(evidence.parallelPages.execution.map((page) => [
    page.requestedAfterRevision, page.pageThroughRevision, page.headRevision,
  ]), [[0, 5, 10], [5, 6, 10], [6, 10, 10]]);
  assert.deepEqual(evidence.parallelPages.occurrences.map((page) => [
    page.requestedAfterRevision, page.pageThroughRevision, page.headRevision,
  ]), [[0, 5, 10], [5, 6, 10], [6, 10, 10]]);
  assert.deepEqual(evidence.parallelPages.occurrences.map(({ currentOpen }) => currentOpen), [null, null, []]);
  assert.deepEqual(evidence.retainedOccurrencesAfterReplay, evidence.parallelPages.occurrences);
  const startedAtEpochMs = evidence.startOccurrences.batches[0]!.committedAtEpochMs;
  assert.ok(Number.isSafeInteger(startedAtEpochMs) && startedAtEpochMs > 0);
  assert.deepEqual(evidence.startOccurrences.currentOpen, [
    { ...occurrenceStart("UserTask_A", 4), startedAtEpochMs },
    { ...occurrenceStart("UserTask_B", 5), startedAtEpochMs },
  ]);
  assert.deepEqual(recovery.after.occurrences.at(-1)?.currentOpen, [
    { ...occurrenceStart("UserTask_B", 5), startedAtEpochMs },
  ]);
  const committedTimes = evidence.parallelPages.occurrences.flatMap(({ batches }) =>
    batches.map(({ committedAtEpochMs }) => committedAtEpochMs));
  assert.deepEqual(committedTimes, [...committedTimes].sort((a, b) => a - b));

  const actual = pairedRecords(evidence.parallelPages);
  const expected = expectedParallelRecords(parallelScenario);
  assert.deepEqual(actual, expected);
  // Start indexes 3 and 4 are distinct same-batch Task arms; move E1/E2 together while preserving numbering.
  const orderMutation = actual.map((record, index) => {
    const replacement = index === 3 ? actual[4]! : index === 4 ? actual[3]! : record;
    return {
      execution: { ...replacement.execution, revision: record.execution.revision },
      occurrence: { ...replacement.occurrence, revision: record.occurrence.revision },
    };
  });
  assert.notDeepEqual(actual[3], actual[4]);
  assert.throws(() => assert.deepEqual(orderMutation, expected), assert.AssertionError);
});

const processId = "Process_ParallelForkJoin";
const owner = { processInstanceId: "Instance_1", definitionScopeId: `scope:${processId}`, activation: 1 };
const rootScope = { id: owner, parent: null, bpmnElementId: processId };
type PairedRecord = Readonly<{
  execution: CommittedTransitionRecord;
  occurrence: FlowNodeOccurrenceTransition;
}>;

function occurrenceStart(elementId: string, startRevision: number) {
  return { id: { processInstanceId: "Instance_1", startRevision, startIndex: 0 },
    processId, elementId, owner };
}

function occurrenceEnd(startRevision: number) {
  return { id: { processInstanceId: "Instance_1", startRevision, startIndex: 0 },
    terminal: FlowNodeOccurrenceTerminalKind.Completed };
}

function expectedParallelRecords(scenario: Scenario): PairedRecord[] {
  const external = (index: number): CommittedTransitionRecord["transition"] => ({
    kind: SemanticTransitionKind.ExternalStimulus, stimulus: scenario.stimuli[index]!,
  });
  const internal = (
    elementId: string, operationKind: SemanticOperationKind, operationId = `operation:${elementId}`,
  ): CommittedTransitionRecord["transition"] => ({
    kind: SemanticTransitionKind.InternalOperation, operationId, operationKind,
    origin: { kind: SemanticOriginKind.BpmnElement, elementId }, owner,
  });
  const instant = (elementId: string, revision: number): FlowNodeOccurrenceDelta => ({
    started: [occurrenceStart(elementId, revision)], ended: [occurrenceEnd(revision)],
  });
  const row = (
    transition: CommittedTransitionRecord["transition"], consumed: string[], produced: string[],
    lifecycle: FlowNodeOccurrenceDelta = { started: [], ended: [] },
  ) => ({ transition, consumed, produced, lifecycle });
  const rows = [
    row(external(0), [], []),
    row(internal("StartEvent_1", SemanticOperationKind.Initiate), [], ["Flow_StartToFork"], instant("StartEvent_1", 2)),
    row(internal("Gateway_Fork", SemanticOperationKind.Duplicate), ["Flow_StartToFork"], ["Flow_ForkToA", "Flow_ForkToB"], instant("Gateway_Fork", 3)),
    row(internal("UserTask_A", SemanticOperationKind.AwaitUserTask), ["Flow_ForkToA"], [], { started: [occurrenceStart("UserTask_A", 4)], ended: [] }),
    row(internal("UserTask_B", SemanticOperationKind.AwaitUserTask), ["Flow_ForkToB"], [], { started: [occurrenceStart("UserTask_B", 5)], ended: [] }),
    row(external(1), [], ["Flow_AToJoin"], { started: [], ended: [occurrenceEnd(4)] }),
    row(external(2), [], ["Flow_BToJoin"], { started: [], ended: [occurrenceEnd(5)] }),
    row(internal("Gateway_Join", SemanticOperationKind.Synchronize), ["Flow_AToJoin", "Flow_BToJoin"], ["Flow_JoinToEnd"], instant("Gateway_Join", 8)),
    row(internal("EndEvent_1", SemanticOperationKind.ReachNoneEnd), ["Flow_JoinToEnd"], [], instant("EndEvent_1", 9)),
    row(internal(processId, SemanticOperationKind.CompleteScope, `operation:complete-scope:scope:${processId}`), [], []),
  ];
  const token = (sequenceFlowId: string) => ({ sequenceFlowId, owner, multiplicity: 1 });
  return rows.map(({ transition, consumed, produced, lifecycle }, index) => ({
    execution: {
      revision: index + 1, logicalTimeMs: 0, transition,
      positionDelta: {
        consumedTokens: consumed.map(token), producedTokens: produced.map(token),
        enteredScopes: index === 0 ? [rootScope] : [], exitedScopes: index === 9 ? [rootScope] : [],
      },
    },
    occurrence: { revision: index + 1, lifecycle },
  }));
}

function pairedRecords(pages: ExecutionPublicationLiveEvidence["parallelPages"]): PairedRecord[] {
  return pages.execution.flatMap((page, pageIndex) => page.batches.flatMap((batch, batchIndex) => {
    const occurrences = pages.occurrences[pageIndex]?.batches[batchIndex];
    assert.ok(occurrences !== undefined);
    assert.deepEqual(batchSummary(batch), batchSummary(occurrences));
    return batch.transitions.map((execution, index) => {
      const occurrence = occurrences.transitions[index];
      assert.ok(occurrence !== undefined);
      return { execution, occurrence };
    });
  }));
}

function workflowArguments(history: TemporalHistory, attribute: string): ReadonlyArray<unknown> {
  const events = historyEvents(history, attribute);
  assert.equal(events.length, 1);
  const input = asRecord(events[0]!.attributes.input, "Workflow input");
  return asArray(input.payloads, "Workflow arguments").map((value) => decodeJsonPayload(value, "Workflow argument"));
}

function assertParallelChain(
  evidence: ExecutionPublicationLiveEvidence,
  input: Awaited<ReturnType<typeof compileExecutionInput>>,
): void {
  assert.equal(evidence.parallelRunIds.length, 3);
  assert.equal(new Set(evidence.parallelRunIds).size, 3);
  assert.equal(evidence.parallelHistories.length, 3);
  assert.deepEqual(evidence.replayedParallelRunIds, evidence.parallelRunIds);
  assert.equal(evidence.firstCompletionRecovery.acceptedRunId, evidence.parallelRunIds[1]);
  assert.deepEqual(evidence.preCompletionHistory, evidence.parallelHistories[0]);
  assert.equal(historyEvents(evidence.preCompletionHistory, "workflowExecutionUpdateAcceptedEventAttributes").length, 0);
  assert.deepEqual(workflowArguments(evidence.preCompletionHistory, "workflowExecutionStartedEventAttributes"), [
    input.scenario.stimuli[0], input.semanticProcess,
    { ...productionBpmnWorkflowInitialHostInput(), eventHistoryEventLimit: 3 },
  ]);
  const carried = workflowArguments(evidence.preCompletionHistory, "workflowExecutionContinuedAsNewEventAttributes");
  assert.deepEqual(carried[0], input.scenario.stimuli[0]);
  assert.deepEqual(carried[1], input.semanticProcess);
  const publication = asRecord(carried[5], "carried paired Start publication");
  const execution = asRecord(publication.execution, "carried E1");
  const occurrences = asRecord(publication.flowNodeOccurrences, "carried E2");
  assert.deepEqual(execution, {
    definition: input.semanticProcess.identity, processId, processInstanceId: "Instance_1",
    headRevision: 5, current: evidence.start.current,
  });
  assert.equal(occurrences.headRevision, 5);
  assert.deepEqual(occurrences.currentOpen, evidence.startOccurrences.currentOpen);
  const retained = asArray(occurrences.retainedOpen, "carried occurrence anchors");
  assert.equal(retained.length, 2);
  for (const value of retained) {
    assert.deepEqual(asRecord(value, "retained occurrence").attachedHandlers, []);
  }
  const outcomes = new Map<string, CommandOutcome>();
  for (const [index, history] of evidence.parallelHistories.entries()) {
    const args = workflowArguments(history, "workflowExecutionStartedEventAttributes");
    assert.deepEqual(args[0], input.scenario.stimuli[0]);
    assert.deepEqual(args[1], input.semanticProcess);
    const continuations = historyEvents(history, "workflowExecutionContinuedAsNewEventAttributes");
    if (index < evidence.parallelHistories.length - 1) {
      assert.equal(continuations.length, 1);
      assert.equal(continuations[0]!.attributes.newExecutionRunId, evidence.parallelRunIds[index + 1]);
      assert.deepEqual(workflowArguments(history, "workflowExecutionContinuedAsNewEventAttributes"),
        workflowArguments(evidence.parallelHistories[index + 1]!, "workflowExecutionStartedEventAttributes"));
    } else {
      assert.equal(continuations.length, 0);
      assert.equal(historyEvents(history, "workflowExecutionCompletedEventAttributes").length, 1);
    }
    for (const [commandId, outcome] of durableUpdateOutcomes(history)) outcomes.set(commandId, outcome);
  }
  assert.deepEqual(outcomes, new Map([
    ["complete-user-task-a", CommandOutcome.Committed], ["complete-user-task-b", CommandOutcome.Committed],
  ]));
}

function batchSummary(
  batch: Pick<import("@bpmn-lean/temporal-testkit").CommittedTransitionBatch,
    "commandId" | "fromRevision" | "throughRevision"> & { readonly transitions: ReadonlyArray<{ revision: number }> },
) {
  return {
    commandId: batch.commandId,
    fromRevision: batch.fromRevision,
    throughRevision: batch.throughRevision,
    revisions: batch.transitions.map(({ revision }) => revision),
  };
}

function transitionNames(
  page: import("@bpmn-lean/temporal-testkit").ExecutionPublicationPage,
): string[] {
  return page.batches.flatMap(({ transitions }) => transitions).map(({ transition }) => {
    switch (transition.kind) {
      case SemanticTransitionKind.ExternalStimulus:
        return `external:${transition.stimulus.commandId}`;
      case SemanticTransitionKind.InternalOperation:
        return `internal:${transition.operationId}:${transition.operationKind}`;
    }
  });
}

function positionFlowSummary(
  page: import("@bpmn-lean/temporal-testkit").ExecutionPublicationPage,
): ReadonlyArray<readonly [consumed: string[], produced: string[]]> {
  return page.batches.flatMap(({ transitions }) => transitions).map(({ positionDelta }) => [
    positionDelta.consumedTokens.map(({ sequenceFlowId }) => sequenceFlowId),
    positionDelta.producedTokens.map(({ sequenceFlowId }) => sequenceFlowId),
  ]);
}
