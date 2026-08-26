import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublicIncident } from "@bpmn-lean/platform-contracts";

import { readIncidentCollectionAfterCommit } from "../src/incident-collection-convergence.ts";

const committedIncident = incident("Process_Retry", "Task_Fail");
const otherIncident = incident("Process_Cancel", "Task_Fail");

test("paces collection reads until the committed incident leaves an eventually consistent projection", async () => {
  let nowMs = 0;
  let reads = 0;
  const waits: number[] = [];

  const snapshot = await readIncidentCollectionAfterCommit({
    committedIncident,
    deadlineMs: 2_000,
    pollingDelayMs: 250,
    now: () => nowMs,
    wait: async (delayMs) => {
      waits.push(delayMs);
      nowMs += delayMs;
    },
    read: async () => {
      reads += 1;
      return reads <= 5
        ? { incidents: [committedIncident, otherIncident] }
        : { incidents: [otherIncident] };
    },
  });

  assert.equal(reads, 6);
  assert.deepEqual(waits, [250, 250, 250, 250, 250]);
  assert.deepEqual(snapshot, { incidents: [otherIncident] });
});

test("returns the latest honest snapshot when convergence reaches its deadline", async () => {
  let nowMs = 0;
  let reads = 0;
  const stale = { incidents: [committedIncident, otherIncident] } as const;

  const snapshot = await readIncidentCollectionAfterCommit({
    committedIncident,
    deadlineMs: 500,
    pollingDelayMs: 250,
    now: () => nowMs,
    wait: async (delayMs) => { nowMs += delayMs; },
    read: async () => {
      reads += 1;
      return stale;
    },
  });

  assert.equal(reads, 3);
  assert.equal(snapshot, stale);
});

function incident(processInstanceId: string, elementId: string): PublicIncident {
  return {
    hostingInstance: { processInstanceId },
    incident: {
      id: {
        effectId: { processInstanceId, elementId, activation: 1 },
        generation: 1,
      },
    },
  } as unknown as PublicIncident;
}
