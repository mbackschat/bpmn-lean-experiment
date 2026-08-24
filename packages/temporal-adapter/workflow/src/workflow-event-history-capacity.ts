/** Deterministic Event History rollover selection at one stable Workflow checkpoint. */
import { workflowInfo } from "@temporalio/workflow";
import {
  WorkflowChainBudgetKind,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";

export type WorkflowChainEventHistoryLimits = Readonly<{
  eventHistoryEventLimit: number;
  eventHistoryByteLimit: number;
}>;

export type WorkflowChainEventHistoryInformation = Readonly<{
  continueAsNewSuggested: boolean;
  historyLength: number;
  historySize: number;
}>;

export enum WorkflowChainEventHistoryTrigger {
  None = "none",
  SdkSuggested = "sdkSuggested",
  EventCount = "eventCount",
  ByteCount = "byteCount",
}

export enum WorkflowChainEventHistoryCostKind {
  SignalAndUpdateIngress = "signalAndUpdateIngress",
  UpdateResolution = "updateResolution",
  TimerLifecycle = "timerLifecycle",
  ActivityLifecycle = "activityLifecycle",
  WorkflowTaskAndContinueAsNew = "workflowTaskAndContinueAsNew",
}

export type WorkflowChainEventHistoryCostRow = Readonly<{
  kind: WorkflowChainEventHistoryCostKind;
  maximumEvents: number;
  maximumPayloadBytes: number;
}>;

export type WorkflowChainEventHistoryWarningLimits = Readonly<{
  eventWarningLimit: number;
  byteWarningLimit: number;
}>;

export type WorkflowChainEventHistoryMargin = Readonly<{
  eventWarningLimit: number;
  eventTrigger: number;
  reservedEvents: number;
  maximumActivationEvents: number;
  remainingEventHeadroom: number;
  byteWarningLimit: number;
  byteTrigger: number;
  reservedBytes: number;
  maximumActivationBytes: number;
  remainingByteHeadroom: number;
}>;

const temporalEventHistoryWarningEvents = 10_240;
const temporalEventHistoryWarningBytes = 10 * 1_024 * 1_024;
/** Conservative production-owned envelope used when service History bytes exclude closing Events. */
export const workflowChainHistoryEventEnvelopeBytes = 4 * 1_024;

export function decideWorkflowChainEventHistoryRollover(
  limits: WorkflowChainEventHistoryLimits,
  information: WorkflowChainEventHistoryInformation,
  hasRetainedWork: boolean,
): WorkflowChainEventHistoryTrigger {
  requireNonnegativeSafeInteger(information.historyLength, "historyLength");
  requireNonnegativeSafeInteger(information.historySize, "historySize");
  // A fresh continuation cannot shrink its own start history by continuing again. Deferring until
  // this Run retains work prevents a low test threshold or SDK suggestion from creating an empty
  // Continue-As-New loop; production continuation inputs remain bounded independently.
  if (!hasRetainedWork) {
    return WorkflowChainEventHistoryTrigger.None;
  }
  if (information.continueAsNewSuggested) {
    return WorkflowChainEventHistoryTrigger.SdkSuggested;
  }
  if (information.historyLength >= limits.eventHistoryEventLimit) {
    return WorkflowChainEventHistoryTrigger.EventCount;
  }
  if (information.historySize >= limits.eventHistoryByteLimit) {
    return WorkflowChainEventHistoryTrigger.ByteCount;
  }
  return WorkflowChainEventHistoryTrigger.None;
}

export function workflowChainRolloverTriggered(
  limits: WorkflowChainEventHistoryLimits,
  hasRetainedWork: boolean,
): boolean {
  const info = workflowInfo();
  return decideWorkflowChainEventHistoryRollover(
    limits,
    info,
    hasRetainedWork,
  ) !==
    WorkflowChainEventHistoryTrigger.None;
}

/**
 * Worst-case history contribution from one admitted host activation through Continue-As-New.
 * Signal and Update ingress share the bounded semantic queue. Update resolutions add their own
 * history events and may echo every queued command byte. Timer and Activity lifecycles cannot
 * coexist under the host-readiness invariant, so the final assessment takes their larger arm.
 */
export function workflowChainEventHistoryActivationCostTable():
  readonly WorkflowChainEventHistoryCostRow[] {
  return [
    {
      kind: WorkflowChainEventHistoryCostKind.SignalAndUpdateIngress,
      maximumEvents: workflowChainProductionLimit(
        WorkflowChainBudgetKind.SemanticInputQueueEntries,
      ),
      maximumPayloadBytes: workflowChainProductionLimit(
        WorkflowChainBudgetKind.SemanticInputQueueBytes,
      ),
    },
    {
      kind: WorkflowChainEventHistoryCostKind.UpdateResolution,
      maximumEvents: workflowChainProductionLimit(
        WorkflowChainBudgetKind.ConcurrentInFlightUpdates,
      ),
      maximumPayloadBytes: workflowChainProductionLimit(
        WorkflowChainBudgetKind.SemanticInputQueueBytes,
      ),
    },
    {
      kind: WorkflowChainEventHistoryCostKind.TimerLifecycle,
      maximumEvents: 2 * workflowChainProductionLimit(
        WorkflowChainBudgetKind.PendingTimers,
      ),
      maximumPayloadBytes: 0,
    },
    {
      kind: WorkflowChainEventHistoryCostKind.ActivityLifecycle,
      maximumEvents: 3 * workflowChainProductionLimit(
        WorkflowChainBudgetKind.PendingActivities,
      ),
      maximumPayloadBytes:
        workflowChainProductionLimit(WorkflowChainBudgetKind.EffectActivityRequestBytes) +
        workflowChainProductionLimit(WorkflowChainBudgetKind.EffectActivityResultBytes),
    },
    {
      kind: WorkflowChainEventHistoryCostKind.WorkflowTaskAndContinueAsNew,
      // Previous completion, next schedule/start, closing completion, and continuation.
      maximumEvents: 5,
      maximumPayloadBytes: workflowChainProductionLimit(
        WorkflowChainBudgetKind.ContinueAsNewCarriedArgumentsBytes,
      ),
    },
  ];
}

export function requireWorkflowChainEventHistoryMargin(
  warnings: WorkflowChainEventHistoryWarningLimits = {
    eventWarningLimit: temporalEventHistoryWarningEvents,
    byteWarningLimit: temporalEventHistoryWarningBytes,
  },
): WorkflowChainEventHistoryMargin {
  requirePositiveSafeInteger(warnings.eventWarningLimit, "eventWarningLimit");
  requirePositiveSafeInteger(warnings.byteWarningLimit, "byteWarningLimit");
  const eventTrigger = workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryEvents,
  );
  const byteTrigger = workflowChainProductionLimit(
    WorkflowChainBudgetKind.EventHistoryBytes,
  );
  const reservedEvents = warnings.eventWarningLimit - eventTrigger;
  const reservedBytes = warnings.byteWarningLimit - byteTrigger;
  const rows = workflowChainEventHistoryActivationCostTable();
  const ingress = requiredCostRow(
    rows,
    WorkflowChainEventHistoryCostKind.SignalAndUpdateIngress,
  );
  const updates = requiredCostRow(
    rows,
    WorkflowChainEventHistoryCostKind.UpdateResolution,
  );
  const timers = requiredCostRow(
    rows,
    WorkflowChainEventHistoryCostKind.TimerLifecycle,
  );
  const activity = requiredCostRow(
    rows,
    WorkflowChainEventHistoryCostKind.ActivityLifecycle,
  );
  const continuation = requiredCostRow(
    rows,
    WorkflowChainEventHistoryCostKind.WorkflowTaskAndContinueAsNew,
  );
  const maximumActivationEvents = ingress.maximumEvents + updates.maximumEvents +
    Math.max(timers.maximumEvents, activity.maximumEvents) +
    continuation.maximumEvents;
  const maximumPayloadBytes = ingress.maximumPayloadBytes +
    updates.maximumPayloadBytes +
    Math.max(timers.maximumPayloadBytes, activity.maximumPayloadBytes) +
    continuation.maximumPayloadBytes;
  const maximumActivationBytes = maximumPayloadBytes +
    maximumActivationEvents * workflowChainHistoryEventEnvelopeBytes;
  if (maximumActivationEvents > reservedEvents) {
    throw new RangeError(
      `Event History event warning margin ${reservedEvents} is below activation ${maximumActivationEvents}`,
    );
  }
  if (maximumActivationBytes > reservedBytes) {
    throw new RangeError(
      `Event History byte warning margin ${reservedBytes} is below activation ${maximumActivationBytes}`,
    );
  }
  return {
    eventWarningLimit: warnings.eventWarningLimit,
    eventTrigger,
    reservedEvents,
    maximumActivationEvents,
    remainingEventHeadroom: reservedEvents - maximumActivationEvents,
    byteWarningLimit: warnings.byteWarningLimit,
    byteTrigger,
    reservedBytes,
    maximumActivationBytes,
    remainingByteHeadroom: reservedBytes - maximumActivationBytes,
  };
}

function requireNonnegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer`);
  }
}

function requirePositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

function requiredCostRow(
  rows: readonly WorkflowChainEventHistoryCostRow[],
  kind: WorkflowChainEventHistoryCostKind,
): WorkflowChainEventHistoryCostRow {
  const row = rows.find((candidate) => candidate.kind === kind);
  if (row === undefined) {
    throw new TypeError(`Event History cost table has no ${kind} row`);
  }
  return row;
}
