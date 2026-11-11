import assert from "node:assert/strict";

import { engineDefinitionMessageStartWorkflowId } from "@bpmn-lean/engine-api";
import { ResultKind } from "@bpmn-lean/temporal-host/client";
import { replayHistory } from "@bpmn-lean/temporal-host/worker";

import { withDeadline } from "../src/host-worker.ts";
import type { TemporalEnvironment } from "../src/host-worker.ts";

const operationDeadlineMs = 10_000;
const replayDeadlineMs = 30_000;

type TemporalClient = TemporalEnvironment["client"];
type ProcessHandle = ReturnType<TemporalClient["workflow"]["getHandle"]>;
type TemporalHistory = Awaited<ReturnType<ProcessHandle["fetchHistory"]>>;
type HistoryEntry = NonNullable<TemporalHistory["events"]>[number];

/**
 * The host Workflow ID engine-api gives a directly started instance: engine-api exports its instance-address rule only
 * under the Message Start name, and both starts derive the address from the population and the instance.
 */
const processWorkflowId = engineDefinitionMessageStartWorkflowId;

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
    population: string;
    retryProcessInstanceId: string;
    cancelledProcessInstanceId: string;
  }>,
): Promise<ShowcaseEvidence> {
  const retryHandle = input.client.workflow.getHandle(processWorkflowId(input.population, input.retryProcessInstanceId));
  const cancellationHandle = input.client.workflow.getHandle(processWorkflowId(input.population, input.cancelledProcessInstanceId));
  const [retryResult, cancellationResult, retryHistory, cancellationHistory] = await Promise.all([
    withDeadline(retryHandle.result(), operationDeadlineMs, "M4 retried Process result"),
    withDeadline(cancellationHandle.result(), operationDeadlineMs, "M4 cancelled Process result"),
    withDeadline(retryHandle.fetchHistory(), operationDeadlineMs, "M4 retried Process history"),
    withDeadline(cancellationHandle.fetchHistory(), operationDeadlineMs, "M4 cancelled Process history"),
  ]);
  assert.equal(retryResult.kind, ResultKind.Ended);
  assert.equal(cancellationResult.kind, ResultKind.Ended);
  assert.equal(retryResult.kind === ResultKind.Ended ? retryResult.status : null, "completed");
  assert.equal(cancellationResult.kind === ResultKind.Ended ? cancellationResult.status : null, "cancelled");
  const [retryIncidents, cancellationIncidents] = await Promise.all([
    openIncidents(retryHandle),
    openIncidents(cancellationHandle),
  ]);
  assert.equal(retryIncidents, 0);
  assert.equal(cancellationIncidents, 0);
  for (const [history, replayId] of [
    [retryHistory, "m4-incident-retry-replay"],
    [cancellationHistory, "m4-incident-cancel-replay"],
  ] as const) {
    await withDeadline(replayHistory(history, replayId), replayDeadlineMs, `${replayId} history replay`);
  }
  return {
    retry: evidenceFor(retryHistory, "completed", retryIncidents),
    cancellation: evidenceFor(cancellationHistory, "cancelled", cancellationIncidents),
  };
}

/** The incident waits the final canonical state observation still holds. */
async function openIncidents(handle: ProcessHandle): Promise<number> {
  const state = await withDeadline(
    handle.query<Readonly<{ openWaits: readonly Readonly<{ detail: Readonly<{ kind: string }> }>[] }>>("observation"),
    operationDeadlineMs,
    "M4 final state observation",
  );
  return state.openWaits.filter(({ detail }) => detail.kind === "incident").length;
}

function evidenceFor(
  history: TemporalHistory,
  status: "completed" | "cancelled",
  incidents: number,
): ProcessEvidence {
  assert.deepEqual(updateOutcomes(history), ["committed"]);
  return {
    status,
    activityCompletions: historyEvents(history, "activityTaskCompletedEventAttributes").length,
    acceptedUpdates: historyEvents(history, "workflowExecutionUpdateAcceptedEventAttributes").length,
    completedUpdates: historyEvents(history, "workflowExecutionUpdateCompletedEventAttributes").length,
    openIncidents: incidents,
    replayed: true,
  };
}

function historyEvents(history: TemporalHistory, attribute: keyof HistoryEntry): readonly HistoryEntry[] {
  return (history.events ?? []).filter((event) => event[attribute] !== undefined && event[attribute] !== null);
}

/** The kernel outcome of every completed Update, from its `CommandResult` (`packages/temporal-host/src/host-contract.ts`). */
function updateOutcomes(history: TemporalHistory): readonly string[] {
  return historyEvents(history, "workflowExecutionUpdateCompletedEventAttributes").map((event) => {
    const payload = event.workflowExecutionUpdateCompletedEventAttributes?.outcome?.success?.payloads?.[0];
    const data = payload?.data;
    if (!(data instanceof Uint8Array)) throw new TypeError("completed Update carries no JSON result payload");
    const result = JSON.parse(Buffer.from(data).toString("utf8")) as Readonly<{ outcome?: unknown }>;
    if (typeof result.outcome !== "string") throw new TypeError("completed Update result has no outcome");
    return result.outcome;
  });
}
