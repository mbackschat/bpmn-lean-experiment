import assert from "node:assert/strict";

import { CommandOutcome } from "@bpmn-lean/semantic-core";
import {
  TemporalScenarioRunner,
  createCachedLocalEnvironment,
  durableUpdateOutcomes,
  historyEvents,
  isCompletedProcessReceipt,
  processWorkflowId,
  readTestProcessTerminalResult,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

const operationDeadlineMs = 20_000;
const replayStartupDeadlineMs = 30_000;

type TemporalClient = Awaited<ReturnType<typeof createCachedLocalEnvironment>>["client"];

type JourneyEvidence = Readonly<{
  status: "completed";
  runs: number;
  replayedRuns: number;
  committedUpdates: number;
  timerStarts: number;
  timerFirings: number;
  timerCancellations: number;
}>;

export type MuePreviewAlphaEvidence = Readonly<{
  natural: JourneyEvidence;
  interrupted: JourneyEvidence;
}>;

/** Reads Event History only after both journeys terminate, then replays every exact Run. */
export async function verifyMuePreviewAlphaEvidence(input: Readonly<{
  client: TemporalClient;
  naturalProcessInstanceId: string;
  interruptedProcessInstanceId: string;
  temporalCacheDirectory: string;
}>): Promise<MuePreviewAlphaEvidence> {
  const [natural, interrupted] = await Promise.all([
    collectJourney(input.client, input.naturalProcessInstanceId),
    collectJourney(input.client, input.interruptedProcessInstanceId),
  ]);
  const runner = await withDeadline(
    TemporalScenarioRunner.create({ downloadDirectory: input.temporalCacheDirectory }),
    replayStartupDeadlineMs,
    "MUE Preview Alpha replay runner startup",
  );
  try {
    const naturalReplayed = await replayEveryRun(runner, "natural", natural.histories);
    const interruptedReplayed = await replayEveryRun(
      runner,
      "interrupted",
      interrupted.histories,
    );
    const naturalEvidence = evidenceFor(natural.histories, naturalReplayed);
    const interruptedEvidence = evidenceFor(interrupted.histories, interruptedReplayed);
    assert.equal(naturalEvidence.committedUpdates, 3);
    assert.equal(naturalEvidence.timerStarts, 1);
    assert.equal(naturalEvidence.timerFirings, 0);
    assert.equal(naturalEvidence.timerCancellations, 1);
    assert.equal(interruptedEvidence.committedUpdates, 2);
    assert.equal(interruptedEvidence.timerStarts, 1);
    assert.equal(interruptedEvidence.timerFirings, 1);
    assert.equal(interruptedEvidence.timerCancellations, 0);
    return { natural: naturalEvidence, interrupted: interruptedEvidence };
  } finally {
    await runner.shutdown();
  }
}

async function collectJourney(
  client: TemporalClient,
  processInstanceId: string,
): Promise<Readonly<{ histories: readonly TemporalHistory[] }>> {
  const workflowId = processWorkflowId(processInstanceId);
  const terminal = await withDeadline(
    readTestProcessTerminalResult(client.workflow.getHandle(workflowId)),
    operationDeadlineMs,
    `MUE Preview Alpha ${processInstanceId} terminal result`,
  );
  assert.equal(isCompletedProcessReceipt(terminal.receipt), true);
  if (!isCompletedProcessReceipt(terminal.receipt)) {
    throw new Error(`MUE Preview Alpha ${processInstanceId} did not complete`);
  }
  const runs = await workflowChainRuns(client, workflowId);
  if (runs.length === 0) {
    throw new Error(`MUE Preview Alpha ${processInstanceId} has no visible Workflow Runs`);
  }
  const histories = await Promise.all(runs.map(async ({ runId }) => {
    const history = await withDeadline(
      client.workflow.getHandle(workflowId, runId).fetchHistory(),
      operationDeadlineMs,
      `MUE Preview Alpha ${runId} history fetch`,
    );
    if (!Array.isArray(history.events)) {
      throw new Error(`MUE Preview Alpha ${runId} history has no events`);
    }
    return history as TemporalHistory;
  }));
  return { histories };
}

async function workflowChainRuns(
  client: TemporalClient,
  workflowId: string,
): Promise<readonly Readonly<{ runId: string; startedAt: number }>[]> {
  return withDeadline((async () => {
    const runs: Array<Readonly<{ runId: string; startedAt: number }>> = [];
    for await (const execution of client.workflow.list()) {
      if (execution.workflowId === workflowId) {
        runs.push({
          runId: execution.runId,
          startedAt: execution.startTime.getTime(),
        });
      }
    }
    return runs.sort((left, right) => left.startedAt - right.startedAt);
  })(), operationDeadlineMs, `MUE Preview Alpha ${workflowId} Run listing`);
}

async function replayEveryRun(
  runner: TemporalScenarioRunner,
  journey: string,
  histories: readonly TemporalHistory[],
): Promise<number> {
  let replayed = 0;
  for (const [index, history] of histories.entries()) {
    await withDeadline(
      runner.replayHistory(history, `mue-preview-alpha-${journey}-run-${index + 1}`),
      operationDeadlineMs,
      `MUE Preview Alpha ${journey} Run ${index + 1} replay`,
    );
    replayed += 1;
  }
  return replayed;
}

function evidenceFor(
  histories: readonly TemporalHistory[],
  replayedRuns: number,
): JourneyEvidence {
  const updates = histories.flatMap((history) => [...durableUpdateOutcomes(history).values()]);
  assert.equal(updates.every((outcome) => outcome === CommandOutcome.Committed), true);
  return {
    status: "completed",
    runs: histories.length,
    replayedRuns,
    committedUpdates: updates.length,
    timerStarts: countEvents(histories, "timerStartedEventAttributes"),
    timerFirings: countEvents(histories, "timerFiredEventAttributes"),
    timerCancellations: countEvents(histories, "timerCanceledEventAttributes"),
  };
}

function countEvents(
  histories: readonly TemporalHistory[],
  attribute: Parameters<typeof historyEvents>[1],
): number {
  return histories.reduce(
    (count, history) => count + historyEvents(history, attribute).length,
    0,
  );
}
