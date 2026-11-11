import assert from "node:assert/strict";

import { ResultKind } from "@bpmn-lean/temporal-host/client";
import { replayHistory } from "@bpmn-lean/temporal-host/worker";

import { withDeadline } from "../src/host-worker.ts";
import type { TemporalEnvironment } from "../src/host-worker.ts";
import { alphaTaskQueue, processWorkflowId } from "../src/process-address.ts";

const operationDeadlineMs = 20_000;
const replayDeadlineMs = 30_000;

type TemporalClient = TemporalEnvironment["client"];
export type TemporalHistory = Awaited<ReturnType<ReturnType<TemporalClient["workflow"]["getHandle"]>["fetchHistory"]>>;
type HistoryEntry = NonNullable<TemporalHistory["events"]>[number];

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

/**
 * Reads Event History only after both journeys terminate, then replays every exact Run. The host arms one durable
 * Timer per open Timer wait and cancels it when the wait closes (`packages/temporal-host/src/workflow-host.ts`), so the
 * natural journey cancels the lifetime Timer and the interrupted one fires it.
 */
export async function verifyMuePreviewAlphaEvidence(input: Readonly<{
  client: TemporalClient;
  naturalProcessInstanceId: string;
  interruptedProcessInstanceId: string;
}>): Promise<MuePreviewAlphaEvidence> {
  const [natural, interrupted] = await Promise.all([
    collectJourney(input.client, input.naturalProcessInstanceId),
    collectJourney(input.client, input.interruptedProcessInstanceId),
  ]);
  const naturalEvidence = evidenceFor(natural, await replayEveryRun("natural", natural));
  const interruptedEvidence = evidenceFor(interrupted, await replayEveryRun("interrupted", interrupted));
  assert.equal(naturalEvidence.committedUpdates, 3);
  assert.equal(naturalEvidence.timerStarts, 1);
  assert.equal(naturalEvidence.timerFirings, 0);
  assert.equal(naturalEvidence.timerCancellations, 1);
  assert.equal(interruptedEvidence.committedUpdates, 2);
  assert.equal(interruptedEvidence.timerStarts, 1);
  assert.equal(interruptedEvidence.timerFirings, 1);
  assert.equal(interruptedEvidence.timerCancellations, 0);
  return { natural: naturalEvidence, interrupted: interruptedEvidence };
}

async function collectJourney(client: TemporalClient, processInstanceId: string): Promise<readonly TemporalHistory[]> {
  const result = await withDeadline(
    client.workflow.getHandle(processWorkflowId(alphaTaskQueue, processInstanceId)).result(),
    operationDeadlineMs,
    `MUE Preview Alpha ${processInstanceId} terminal result`,
  );
  if (result.kind !== ResultKind.Ended || result.status !== "completed") {
    throw new Error(`MUE Preview Alpha ${processInstanceId} did not complete: ${JSON.stringify(result)}`);
  }
  return collectProcessRunHistories(client, processInstanceId);
}

/** Every Run of the instance's Workflow chain, oldest first. */
export async function collectProcessRunHistories(
  client: TemporalClient,
  processInstanceId: string,
): Promise<readonly TemporalHistory[]> {
  const workflowId = processWorkflowId(alphaTaskQueue, processInstanceId);
  const runs = await withDeadline((async () => {
    const found: Array<Readonly<{ runId: string; startedAt: number }>> = [];
    for await (const execution of client.workflow.list()) {
      if (execution.workflowId === workflowId) found.push({ runId: execution.runId, startedAt: execution.startTime.getTime() });
    }
    return found.sort((left, right) => left.startedAt - right.startedAt);
  })(), operationDeadlineMs, `MUE Preview Alpha ${workflowId} Run listing`);
  if (runs.length === 0) throw new Error(`MUE Preview Alpha ${processInstanceId} has no visible Workflow Runs`);
  return Promise.all(runs.map(({ runId }) => withDeadline(
    client.workflow.getHandle(workflowId, runId).fetchHistory(),
    operationDeadlineMs,
    `MUE Preview Alpha ${runId} history fetch`,
  )));
}

export async function replayEveryRun(journey: string, histories: readonly TemporalHistory[]): Promise<number> {
  let replayed = 0;
  for (const [index, history] of histories.entries()) {
    await withDeadline(
      replayHistory(history, `mue-preview-alpha-${journey}-run-${index + 1}`),
      replayDeadlineMs,
      `MUE Preview Alpha ${journey} Run ${index + 1} replay`,
    );
    replayed += 1;
  }
  return replayed;
}

function evidenceFor(histories: readonly TemporalHistory[], replayedRuns: number): JourneyEvidence {
  const outcomes = histories.flatMap(updateOutcomes);
  assert.equal(outcomes.every((outcome) => outcome === "committed"), true);
  return {
    status: "completed",
    runs: histories.length,
    replayedRuns,
    committedUpdates: outcomes.length,
    timerStarts: countEvents(histories, "timerStartedEventAttributes"),
    timerFirings: countEvents(histories, "timerFiredEventAttributes"),
    timerCancellations: countEvents(histories, "timerCanceledEventAttributes"),
  };
}

function countEvents(histories: readonly TemporalHistory[], attribute: keyof HistoryEntry): number {
  return histories.reduce((count, history) => count + historyEvents(history, attribute).length, 0);
}

function historyEvents(history: TemporalHistory, attribute: keyof HistoryEntry): readonly HistoryEntry[] {
  return (history.events ?? []).filter((event) => event[attribute] !== undefined && event[attribute] !== null);
}

/** The kernel outcome of every completed Update, from its `CommandResult` (`packages/temporal-host/src/host-contract.ts`). */
function updateOutcomes(history: TemporalHistory): readonly string[] {
  return historyEvents(history, "workflowExecutionUpdateCompletedEventAttributes").map((event) => {
    const data = event.workflowExecutionUpdateCompletedEventAttributes?.outcome?.success?.payloads?.[0]?.data;
    if (!(data instanceof Uint8Array)) throw new TypeError("completed Update carries no JSON result payload");
    const result = JSON.parse(Buffer.from(data).toString("utf8")) as Readonly<{ outcome?: unknown }>;
    if (typeof result.outcome !== "string") throw new TypeError("completed Update result has no outcome");
    return result.outcome;
  });
}
