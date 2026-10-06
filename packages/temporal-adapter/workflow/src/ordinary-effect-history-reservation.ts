import { WorkflowChainBudgetKind, workflowChainProductionLimit } from "@bpmn-lean/temporal-protocol";
import type { WorkflowChainObservedCapacityBound } from "./workflow-chain-capacity.js";
import { requireWorkflowChainEventHistoryMargin, workflowChainHistoryEventEnvelopeBytes } from "./workflow-event-history-capacity.js";
import type { WorkflowChainEventHistoryLimits } from "./workflow-event-history-capacity.js";

export enum OrdinaryEffectHistoryReservationKind {
  Ready = "ready",
  Rollover = "rollover",
  CapacityExceeded = "capacityExceeded",
}

type Cost = Readonly<{ reservedEvents: number; reservedBytes: number }>;
export type OrdinaryEffectHistoryReservation = Cost & (
  | Readonly<{ kind: OrdinaryEffectHistoryReservationKind.Ready }>
  | Readonly<{ kind: OrdinaryEffectHistoryReservationKind.Rollover | OrdinaryEffectHistoryReservationKind.CapacityExceeded;
      failure: WorkflowChainObservedCapacityBound }>);

/** Reserve the declared ordinary-effect drain envelope before issuing an indivisible frontier.
 * The Workflow-chain cost model supplies the Event envelope; terminal payloads use the bounded
 * Activity-result contract. This calculation alone does not qualify arbitrary Activity failure histories.
 */
export function assessOrdinaryEffectHistoryReservation(input: Readonly<{
  limits: WorkflowChainEventHistoryLimits;
  history: Readonly<{ historyLength: number; historySize: number }>;
  issuedActivities: number;
  requestBytes: ReadonlyArray<number>;
  hasRetainedWork: boolean;
}>): OrdinaryEffectHistoryReservation {
  const { limits, history, issuedActivities, requestBytes, hasRetainedWork } = input;
  for (const value of [history.historyLength, history.historySize, issuedActivities, ...requestBytes]) requireCount(value);
  for (const [value, production] of [
    [limits.eventHistoryEventLimit, workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryEvents)],
    [limits.eventHistoryByteLimit, workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes)],
  ] as const) {
    requireCount(value);
    if (value === 0 || value > production) throw new RangeError("History reservation requires lower-only production limits");
  }
  if (requestBytes.some(bytes => bytes > workflowChainProductionLimit(WorkflowChainBudgetKind.EffectActivityRequestBytes))) {
    throw new RangeError("Activity request must pass its byte preflight before history reservation");
  }
  const activities = issuedActivities + requestBytes.length;
  const ingress = workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticInputQueueEntries);
  const updates = workflowChainProductionLimit(WorkflowChainBudgetKind.ConcurrentInFlightUpdates);
  // Each Activity can finish in a separate activation: three Activity Events plus three Workflow Task Events.
  // The current Workflow Task completion and Continue-As-New add two; this Timer-free body arms no Timer.
  const reservedEvents = ingress + updates + 6 * activities + 2;
  const reservedBytes = requestBytes.reduce((sum, bytes) => sum + bytes, 0) +
    activities * workflowChainProductionLimit(WorkflowChainBudgetKind.EffectActivityResultBytes) +
    workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticInputQueueBytes) +
    updates * workflowChainProductionLimit(WorkflowChainBudgetKind.SemanticStimulusBytes) +
    workflowChainProductionLimit(WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes) +
    reservedEvents * workflowChainHistoryEventEnvelopeBytes;
  const events = history.historyLength + reservedEvents;
  const bytes = history.historySize + reservedBytes;
  for (const value of [activities, reservedEvents, reservedBytes, events, bytes]) requireCount(value);
  const cost = { reservedEvents, reservedBytes };
  // The lifecycle contract separates rollover triggers from the protected overshoot reserve.
  // A fresh Run must be able to make progress within that reserve; continuing it cannot shrink its start History.
  const fresh = !hasRetainedWork && issuedActivities === 0;
  const margin = requireWorkflowChainEventHistoryMargin();
  const eventCeiling = limits.eventHistoryEventLimit + (fresh ? margin.reservedEvents : 0);
  const byteCeiling = limits.eventHistoryByteLimit + (fresh ? margin.reservedBytes : 0);
  const failure = events > eventCeiling
    ? { budget: WorkflowChainBudgetKind.EventHistoryEvents, configuredBound: limits.eventHistoryEventLimit, observedValue: events }
    : bytes > byteCeiling
    ? { budget: WorkflowChainBudgetKind.EventHistoryBytes, configuredBound: limits.eventHistoryByteLimit, observedValue: bytes }
    : null;
  if (failure === null) return { kind: OrdinaryEffectHistoryReservationKind.Ready, ...cost };
  return { kind: hasRetainedWork || issuedActivities > 0
    ? OrdinaryEffectHistoryReservationKind.Rollover : OrdinaryEffectHistoryReservationKind.CapacityExceeded, failure, ...cost };
}

function requireCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("History reservation requires nonnegative safe integers");
}
