import {
  WorkflowChainBudgetKind,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

import type {
  WorkflowChainObservedCapacityBound,
} from "./workflow-chain-capacity.js";

export enum WorkflowTimerCapacityPreflightKind {
  Ready = "ready",
  CapacityExceeded = "capacityExceeded",
}

export type WorkflowTimerCapacityPreflight =
  | Readonly<{
      kind: WorkflowTimerCapacityPreflightKind.Ready;
    }>
  | Readonly<{
      kind: WorkflowTimerCapacityPreflightKind.CapacityExceeded;
      failure: WorkflowChainObservedCapacityBound;
    }>;

/**
 * Classifies the complete committed Timer projection before any scheduler can observe it.
 *
 * Current admitted profiles retain the stronger invariant that at most one Timer is live. The
 * protocol limit remains explicit here so a malformed or future-broadened state cannot enter a
 * managed scheduler or schedule a raw durable Timer after crossing the production bound.
 */
export function preflightPendingWorkflowTimers(
  pendingTimers: number,
): WorkflowTimerCapacityPreflight {
  if (!Number.isSafeInteger(pendingTimers) || pendingTimers < 0) {
    throw new RangeError("Pending Workflow Timer count must be a non-negative safe integer");
  }
  const configuredBound = workflowChainProductionLimit(
    WorkflowChainBudgetKind.PendingTimers,
  );
  return pendingTimers <= configuredBound
    ? { kind: WorkflowTimerCapacityPreflightKind.Ready }
    : {
        kind: WorkflowTimerCapacityPreflightKind.CapacityExceeded,
        failure: {
          budget: WorkflowChainBudgetKind.PendingTimers,
          configuredBound,
          observedValue: pendingTimers,
        },
      };
}
