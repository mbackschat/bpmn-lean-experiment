/**
 * Event History of a host chain for hosted tests: one Run's history read in small pages, the histories of every Run
 * of a chain, and the replay of closed Runs against this package's Workflow bundle.
 */
import type { Client } from "@temporalio/client";

import { replayHistory } from "./worker.js";

type HistoryPage = Awaited<ReturnType<Client["workflowService"]["getWorkflowExecutionHistory"]>>;
export type RunHistoryEvent = NonNullable<NonNullable<HistoryPage["history"]>["events"]>[number];
export type RunHistory = Readonly<{ events: RunHistoryEvent[] }>;

/**
 * A Run's Event History, read four Events a page. The client's gRPC channel takes at most 4 MiB a message (the grpc-js
 * default), and `fetchHistory` asks for the server's default page, which outgrew it at a Run near the server's 4 MiB
 * history suggestion (Verify 43419579034). No Event of this host exceeds the 448 KiB continuation argument, so four
 * stay far below the limit. The Worker is not exposed: sdk-core raises its own limit to 128 MiB (`get_decode_max_size`).
 */
export async function fetchRunHistory(client: Client, workflowId: string, runId?: string): Promise<RunHistory> {
  const events: RunHistoryEvent[] = [];
  let nextPageToken: Uint8Array | null = null;
  do {
    const page: HistoryPage = await client.workflowService.getWorkflowExecutionHistory({
      namespace: client.options.namespace,
      execution: { workflowId, runId: runId ?? null },
      maximumPageSize: 4,
      nextPageToken,
    });
    events.push(...page.history?.events ?? []);
    nextPageToken = page.nextPageToken ?? null;
  } while (nextPageToken != null && nextPageToken.length > 0);
  return { events };
}

/** The Event Histories of the chain's Runs, newest first; a Run's start names the Run it continued. */
export async function chainHistories(client: Client, workflowId: string): Promise<RunHistory[]> {
  const histories: RunHistory[] = [];
  for (let runId: string | undefined = undefined; ;) {
    const history = await fetchRunHistory(client, workflowId, runId);
    histories.push(history);
    runId = history.events[0]?.workflowExecutionStartedEventAttributes?.continuedExecutionRunId ?? undefined;
    if (runId === undefined || runId === "") return histories;
  }
}

/**
 * Replays closed Runs only, and rejects any other. `Worker.runReplayHistory` settles on the replay Worker's eviction,
 * which sdk-core requests after the first activation that is no longer replaying (`replay/mod.rs`,
 * `get_post_activate_hook`, SDK 1.21.0); the replay of an open Run's history never settled in the hosted runs of
 * 2026-11-13.
 */
export async function replayClosedRuns(workflowId: string, histories: readonly RunHistory[]): Promise<void> {
  for (const history of histories) {
    const last = history.events.at(-1);
    if (last?.workflowExecutionContinuedAsNewEventAttributes == null && last?.workflowExecutionCompletedEventAttributes == null) {
      throw new Error(`a Run of ${workflowId} that neither continued as new nor completed is not replayed`);
    }
    await replayHistory(history, workflowId);
  }
}
