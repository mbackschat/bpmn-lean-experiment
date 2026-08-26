import type {
  PublicIncident,
  PublicIncidentSnapshot,
} from "@bpmn-lean/platform-contracts";

import { incidentKey } from "./incident-identity.ts";

export type IncidentCollectionConvergenceOptions = Readonly<{
  committedIncident: PublicIncident;
  deadlineMs: number;
  pollingDelayMs: number;
  read: () => Promise<PublicIncidentSnapshot>;
  now?: () => number;
  wait?: (delayMs: number) => Promise<void>;
}>;

/** Reads through bounded projection lag without hiding a latest still-current incident. */
export async function readIncidentCollectionAfterCommit(
  options: IncidentCollectionConvergenceOptions,
): Promise<PublicIncidentSnapshot> {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (async (delayMs: number) => {
    await new Promise<void>((resolve) => { setTimeout(resolve, delayMs); });
  });
  const deadlineAt = now() + options.deadlineMs;
  const committedKey = incidentKey(options.committedIncident);

  while (true) {
    const snapshot = await options.read();
    if (!snapshot.incidents.some((incident) => incidentKey(incident) === committedKey)) {
      return snapshot;
    }
    const remainingMs = deadlineAt - now();
    if (remainingMs <= 0) return snapshot;
    await wait(Math.min(options.pollingDelayMs, remainingMs));
  }
}
