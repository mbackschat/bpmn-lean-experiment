import assert from "node:assert/strict";

import {
  TemporalScenarioRunner,
  createCachedLocalEnvironment,
  durableUpdateOutcomes,
  historyEvents,
  isCancelledProcessReceipt,
  isCompletedProcessReceipt,
  processWorkflowId,
  withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

const operationDeadlineMs = 10_000;
const replayStartupDeadlineMs = 30_000;

type TemporalClient = Awaited<
  ReturnType<typeof createCachedLocalEnvironment>
>["client"];

type ProcessEvidence = Readonly<{
  status: "completed" | "cancelled";
  activityCompletions: number;
  acceptedUpdates: number;
  completedUpdates: number;
  openIncidents: number;
  replayed: true;
}>;

export type ShowcaseEvidence = Readonly<{
  retry: ProcessEvidence;
  cancellation: ProcessEvidence;
}>;

/** Isolated acceptance evidence. No value from history feeds Product 2 or an action. */
export async function verifyIncidentTerminalEvidence(
  input: Readonly<{
    client: TemporalClient;
    retryProcessInstanceId: string;
    cancelledProcessInstanceId: string;
    temporalCacheDirectory: string;
  }>,
): Promise<ShowcaseEvidence> {
  const retryHandle = input.client.workflow.getHandle(
    processWorkflowId(input.retryProcessInstanceId),
  );
  const cancellationHandle = input.client.workflow.getHandle(
    processWorkflowId(input.cancelledProcessInstanceId),
  );
  const [retryReceipt, cancellationReceipt, retryHistory, cancellationHistory] =
    await Promise.all([
      withDeadline(
        retryHandle.result(),
        operationDeadlineMs,
        "M4 retried Process result",
      ),
      withDeadline(
        cancellationHandle.result(),
        operationDeadlineMs,
        "M4 cancelled Process result",
      ),
      withDeadline(
        retryHandle.fetchHistory(),
        operationDeadlineMs,
        "M4 retried Process history",
      ) as Promise<TemporalHistory>,
      withDeadline(
        cancellationHandle.fetchHistory(),
        operationDeadlineMs,
        "M4 cancelled Process history",
      ) as Promise<TemporalHistory>,
    ]);
  assert.equal(isCompletedProcessReceipt(retryReceipt), true);
  assert.equal(isCancelledProcessReceipt(cancellationReceipt), true);
  if (!isCompletedProcessReceipt(retryReceipt)) {
    throw new TypeError("retried Process did not return a completed receipt");
  }
  if (!isCancelledProcessReceipt(cancellationReceipt)) {
    throw new TypeError("cancelled Process did not return a cancelled receipt");
  }
  assert.equal(retryReceipt.finalState.openIncidents.length, 0);
  assert.equal(cancellationReceipt.finalState.openIncidents.length, 0);
  await replayHistories(input.temporalCacheDirectory, [
    { history: retryHistory, replayId: "m4-incident-retry-replay" },
    { history: cancellationHistory, replayId: "m4-incident-cancel-replay" },
  ]);
  return {
    retry: evidenceFor(
      retryHistory,
      "completed",
      retryReceipt.finalState.openIncidents.length,
    ),
    cancellation: evidenceFor(
      cancellationHistory,
      "cancelled",
      cancellationReceipt.finalState.openIncidents.length,
    ),
  };
}

async function replayHistories(
  temporalCacheDirectory: string,
  entries: readonly Readonly<{ history: TemporalHistory; replayId: string }>[],
): Promise<void> {
  const runner = await withDeadline(
    TemporalScenarioRunner.create({ downloadDirectory: temporalCacheDirectory }),
    replayStartupDeadlineMs,
    "M4 incident operations replay runner startup",
  );
  try {
    for (const entry of entries) {
      await withDeadline(
        runner.replayHistory(entry.history, entry.replayId),
        operationDeadlineMs,
        `${entry.replayId} history replay`,
      );
    }
  } finally {
    await runner.shutdown();
  }
}

function evidenceFor(
  history: TemporalHistory,
  status: "completed" | "cancelled",
  openIncidents: number,
): ProcessEvidence {
  assert.deepEqual([...durableUpdateOutcomes(history).values()], ["committed"]);
  return {
    status,
    activityCompletions: historyEvents(
      history,
      "activityTaskCompletedEventAttributes",
    ).length,
    acceptedUpdates: historyEvents(
      history,
      "workflowExecutionUpdateAcceptedEventAttributes",
    ).length,
    completedUpdates: historyEvents(
      history,
      "workflowExecutionUpdateCompletedEventAttributes",
    ).length,
    openIncidents,
    replayed: true,
  };
}
