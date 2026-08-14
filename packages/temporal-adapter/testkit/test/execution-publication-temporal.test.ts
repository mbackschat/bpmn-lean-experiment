import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionPublicationResultKind,
  runExecutionPublicationLiveEvidence,
} from "@bpmn-lean/temporal-testkit";
import { SemanticTransitionKind } from "@bpmn-lean/semantic-core";
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

test("retains exact execution publication through Worker replacement and replay", async () => {
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
});

function batchSummary(
  batch: import("@bpmn-lean/temporal-testkit").CommittedTransitionBatch,
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
