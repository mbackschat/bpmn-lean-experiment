/** Real-Temporal evidence for public flow-node occurrence retention and lifecycle discrimination. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
} from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  FlowNodeOccurrencePublicationResultKind,
  FlowNodeOccurrenceTerminalKind,
  ProcessCommandResultKind,
  runFlowNodeOccurrenceLiveEvidence,
} from "@bpmn-lean/temporal-testkit";
import type {
  ExecutionPublicationPage,
  FlowNodeOccurrenceId,
  FlowNodeOccurrencePage,
} from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  temporalCacheDirectory,
} from "./temporal-test-support.ts";

const primaryScenarioUrl = new URL(
  "../../../../scenarios/user-task-discovery-completion/scenario.json",
  import.meta.url,
);
const primaryBpmnUrl = new URL(
  "../../../../scenarios/user-task-discovery-completion/process.bpmn",
  import.meta.url,
);
const eventRaceScenarioUrl = new URL(
  "../../../../scenarios/event-based-gateway-message-timer/message-wins.scenario.json",
  import.meta.url,
);
const eventRaceBpmnUrl = new URL(
  "../../../../scenarios/event-based-gateway-message-timer/process.bpmn",
  import.meta.url,
);
const callActivityScenarioUrl = new URL(
  "../../../../scenarios/called-process-call-activity/scenario.json",
  import.meta.url,
);
const callActivityBpmnUrl = new URL(
  "../../../../scenarios/called-process-call-activity/process.bpmn",
  import.meta.url,
);
const boundaryScenarioUrl = new URL(
  "../../../../scenarios/activity-boundary-timer/deadline-wins.scenario.json",
  import.meta.url,
);
const boundaryBpmnUrl = new URL(
  "../../../../scenarios/activity-boundary-timer/process.bpmn",
  import.meta.url,
);

test("retains exact flow-node occurrence publication through Worker replacement and replay", async () => {
  const scenarios = await Promise.all([
    loadJson<Scenario>(primaryScenarioUrl),
    loadJson<Scenario>(eventRaceScenarioUrl),
    loadJson<Scenario>(callActivityScenarioUrl),
    loadJson<Scenario>(boundaryScenarioUrl),
  ]);
  const [primary, eventRace, callActivity, boundary] = await Promise.all([
    compileExecutionInput(scenarios[0]!, primaryBpmnUrl),
    compileExecutionInput(scenarios[1]!, eventRaceBpmnUrl),
    compileExecutionInput(scenarios[2]!, callActivityBpmnUrl),
    compileExecutionInput(scenarios[3]!, boundaryBpmnUrl),
  ]);
  const evidence = await runFlowNodeOccurrenceLiveEvidence(
    temporalCacheDirectory,
    primary,
    eventRace,
    callActivity,
    boundary,
  );
  const primaryEvidence = evidence.primary;

  assert.deepEqual(primaryEvidence.start, primaryEvidence.repeatedStart);
  assert.deepEqual(
    primaryEvidence.queryHistoryEventCounts[0],
    primaryEvidence.queryHistoryEventCounts[1],
  );
  assert.notEqual(
    primaryEvidence.workerIdentities[0],
    primaryEvidence.workerIdentities[1],
  );
  assert.deepEqual(primaryEvidence.start.currentOpen?.map(({ elementId }) => elementId), [
    "UserTask_Approve",
  ]);
  assert.deepEqual(primaryEvidence.terminal.currentOpen, []);

  const facts = lifecycleFacts(primaryEvidence.terminal);
  assert.deepEqual(facts.map(({ processId, elementId, terminal }) => ({
    processId,
    elementId,
    terminal,
  })), [
    {
      processId: "Process_SequentialUserTask",
      elementId: "StartEvent_1",
      terminal: FlowNodeOccurrenceTerminalKind.Completed,
    },
    {
      processId: "Process_SequentialUserTask",
      elementId: "UserTask_Approve",
      terminal: FlowNodeOccurrenceTerminalKind.Completed,
    },
    {
      processId: "Process_SequentialUserTask",
      elementId: "EndEvent_1",
      terminal: FlowNodeOccurrenceTerminalKind.Completed,
    },
  ]);
  assert.equal(requireFact(facts, "StartEvent_1").elapsedMs, 0);
  assert.ok(requireFact(facts, "UserTask_Approve").elapsedMs > 0);
  assert.equal(requireFact(facts, "EndEvent_1").elapsedMs, 0);
  assert.equal(new Set(facts.map(({ id }) => idKey(id))).size, facts.length);

  const commitTimes = primaryEvidence.terminal.batches.map(
    ({ committedAtEpochMs }) => committedAtEpochMs,
  );
  assert.ok(commitTimes.every(Number.isSafeInteger));
  assert.ok(commitTimes.every((time, index) =>
    index === 0 || time >= commitTimes[index - 1]!
  ));
  assert.deepEqual(
    occurrenceE1Summary(primaryEvidence.terminal),
    executionE1Summary(primaryEvidence.executionTerminal),
  );

  assert.equal(primaryEvidence.firstPage.batches.length, 1);
  assert.deepEqual(
    primaryEvidence.firstPage.batches,
    primaryEvidence.terminal.batches.slice(0, 1),
  );
  assert.equal(primaryEvidence.firstPage.currentOpen, null);
  assert.equal(primaryEvidence.secondPage.batches.length, 1);
  assert.deepEqual(
    primaryEvidence.secondPage.batches,
    primaryEvidence.terminal.batches.slice(1),
  );
  assert.deepEqual(primaryEvidence.secondPage.currentOpen, []);
  assert.deepEqual(primaryEvidence.insideBatch, {
    kind: FlowNodeOccurrencePublicationResultKind.Gap,
  });
  assert.deepEqual(primaryEvidence.aheadOfHead, {
    kind: FlowNodeOccurrencePublicationResultKind.Gap,
  });

  assert.deepEqual(primaryEvidence.terminal, primaryEvidence.terminalBeforeDuplicate);
  assert.deepEqual(primaryEvidence.retainedAfterReplay, primaryEvidence.terminal);
  assert.deepEqual(primaryEvidence.duplicateResult, {
    kind: ProcessCommandResultKind.Semantic,
    commandId: "complete-user-task-instance",
    outcome: CommandOutcome.Committed,
  });
  assert.equal(
    requireFact(lifecycleFacts(evidence.eventRace), "MessageCatch").terminal,
    FlowNodeOccurrenceTerminalKind.Completed,
  );
  assert.equal(
    requireFact(lifecycleFacts(evidence.eventRace), "TimerCatch").terminal,
    FlowNodeOccurrenceTerminalKind.Cancelled,
  );
  const callFacts = lifecycleFacts(evidence.callActivity).filter(
    ({ elementId }) => elementId === "Call_CalledProcess",
  );
  assert.equal(callFacts.length, 1);
  assert.equal(callFacts[0]?.terminal, FlowNodeOccurrenceTerminalKind.Completed);
  assert.equal(
    requireFact(lifecycleFacts(evidence.boundary), "BoundedTask").terminal,
    FlowNodeOccurrenceTerminalKind.Cancelled,
  );
  assert.equal(
    requireFact(lifecycleFacts(evidence.boundary), "Deadline").terminal,
    FlowNodeOccurrenceTerminalKind.Completed,
  );
});

type LifecycleFact = Readonly<{
  id: FlowNodeOccurrenceId;
  processId: string;
  elementId: string;
  terminal: FlowNodeOccurrenceTerminalKind;
  elapsedMs: number;
}>;

function lifecycleFacts(page: FlowNodeOccurrencePage): LifecycleFact[] {
  const open = new Map<string, Readonly<{
    id: FlowNodeOccurrenceId;
    processId: string;
    elementId: string;
    startedAtEpochMs: number;
  }>>();
  const facts: LifecycleFact[] = [];
  for (const batch of page.batches) {
    for (const transition of batch.transitions) {
      for (const started of transition.lifecycle.started) {
        open.set(idKey(started.id), {
          id: started.id,
          processId: started.processId,
          elementId: started.elementId,
          startedAtEpochMs: batch.committedAtEpochMs,
        });
      }
      for (const ended of transition.lifecycle.ended) {
        const started = open.get(idKey(ended.id));
        assert.ok(started, `terminal has no published start ${idKey(ended.id)}`);
        open.delete(idKey(ended.id));
        facts.push({
          id: started.id,
          processId: started.processId,
          elementId: started.elementId,
          terminal: ended.terminal,
          elapsedMs: batch.committedAtEpochMs - started.startedAtEpochMs,
        });
      }
    }
  }
  assert.equal(open.size, page.currentOpen?.length ?? 0);
  return facts.sort((left, right) =>
    left.id.startRevision - right.id.startRevision ||
    left.id.startIndex - right.id.startIndex
  );
}

function requireFact(
  facts: readonly LifecycleFact[],
  elementId: string,
): LifecycleFact {
  const selected = facts.filter((fact) => fact.elementId === elementId);
  assert.equal(selected.length, 1, `expected one lifecycle for ${elementId}`);
  return selected[0]!;
}

function idKey(id: FlowNodeOccurrenceId): string {
  return `${id.processInstanceId}:${id.startRevision}:${id.startIndex}`;
}

function occurrenceE1Summary(page: FlowNodeOccurrencePage) {
  return page.batches.map(({ commandId, fromRevision, throughRevision, transitions }) => ({
    commandId,
    fromRevision,
    throughRevision,
    revisions: transitions.map(({ revision }) => revision),
  }));
}

function executionE1Summary(page: ExecutionPublicationPage) {
  return page.batches.map(({ commandId, fromRevision, throughRevision, transitions }) => ({
    commandId,
    fromRevision,
    throughRevision,
    revisions: transitions.map(({ revision }) => revision),
  }));
}
