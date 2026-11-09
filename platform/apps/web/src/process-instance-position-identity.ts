import type { StateOccurrenceId, StateOpenWait } from "@bpmn-lean/platform-contracts";

/**
 * Structural React identity for one open wait. The detail kind is part of it because the canonical state orders
 * waits by occurrence and then detail kind, so one occurrence may hold waits of different kinds.
 */
export function openWaitKey(wait: StateOpenWait): string {
  return JSON.stringify([
    wait.id.processInstanceId,
    wait.id.elementId,
    wait.id.activation,
    wait.detail.kind,
  ]);
}

export function displayOccurrence(id: StateOccurrenceId): string {
  return `${id.processInstanceId} / ${id.elementId} / activation ${id.activation}`;
}
