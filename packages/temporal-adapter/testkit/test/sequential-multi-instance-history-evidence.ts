/** Closed comparison of production SMI histories with the approved private-probe bounds. */
import {
  SequentialMultiInstanceHistoryRunRole, SequentialMultiInstanceHistoryTopology,
  requireSequentialMultiInstanceHistoryCapacity,
} from "@bpmn-lean/temporal-workflow";
import {
  FlowNodeOccurrenceTerminalKind, type FlowNodeOccurrenceBatch,
  type FlowNodeOccurrenceId, type TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import {
  SequentialMultiInstanceProductionHistoryEventFamily,
  requireSequentialMultiInstanceProductionRunFamilies,
  sequentialMultiInstanceProductionHistoryRoles,
} from "./sequential-multi-instance-production-history-topology.ts";
import type {
  SequentialMultiInstanceProductionHistoryEventFamily as ProductionHistoryEventFamily,
} from "./sequential-multi-instance-production-history-topology.ts";

export {
  SequentialMultiInstanceProductionHistoryEventFamily,
};

export type SequentialMultiInstanceProductionHistoryRunEvidence = Readonly<{
  runOrdinal: number;
  role: SequentialMultiInstanceHistoryRunRole;
  history: TemporalHistory;
  /** Service-reported raw History size, retained only as a positive bounded observation. */
  historySize: number;
}>;

export type SequentialMultiInstanceProductionHistoryEvidence = Readonly<{
  topology: SequentialMultiInstanceHistoryTopology;
  runs: readonly SequentialMultiInstanceProductionHistoryRunEvidence[];
}>;

export type SequentialMultiInstanceProductionHistoryRunResult = Readonly<{
  runOrdinal: number;
  role: SequentialMultiInstanceHistoryRunRole;
  classifiedEventCount: number;
  historySize: number;
  eventFamilies: Readonly<Record<ProductionHistoryEventFamily, number>>;
}>;

export type SequentialMultiInstanceProductionHistoryResult = Readonly<{
  topology: SequentialMultiInstanceHistoryTopology;
  maximumEventCount: number;
  maximumHistorySize: number;
  runs: readonly SequentialMultiInstanceProductionHistoryRunResult[];
}>;

const familyAttributes = Object.freeze<
  Record<string, ProductionHistoryEventFamily>
>({
  workflowExecutionStartedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowExecutionStarted,
  workflowTaskScheduledEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskScheduled,
  workflowTaskStartedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskStarted,
  workflowTaskCompletedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskCompleted,
  markerRecordedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.PatchMarker,
  upsertWorkflowSearchAttributesEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.SearchAttributeUpsert,
  workflowExecutionUpdateAcceptedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.UpdateAccepted,
  workflowExecutionUpdateCompletedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.UpdateCompleted,
  timerStartedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.TimerStarted,
  timerCanceledEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.TimerCanceled,
  timerFiredEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.TimerFired,
  workflowExecutionContinuedAsNewEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ContinuedAsNew,
  workflowExecutionCompletedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.TerminalCompleted,
  workflowExecutionSignaledEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Signal,
  signalExternalWorkflowExecutionInitiatedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Signal,
  signalExternalWorkflowExecutionFailedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Signal,
  externalWorkflowExecutionSignaledEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Signal,
  activityTaskScheduledEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Activity,
  activityTaskStartedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Activity,
  activityTaskCompletedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Activity,
  activityTaskFailedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Activity,
  activityTaskTimedOutEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Activity,
  activityTaskCancelRequestedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Activity,
  activityTaskCanceledEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.Activity,
  startChildWorkflowExecutionInitiatedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  startChildWorkflowExecutionFailedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  childWorkflowExecutionStartedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  childWorkflowExecutionCompletedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  childWorkflowExecutionFailedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  childWorkflowExecutionTimedOutEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  childWorkflowExecutionCanceledEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  childWorkflowExecutionTerminatedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  workflowExecutionCancelRequestedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowCancellation,
  workflowExecutionCanceledEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowCancellation,
  workflowExecutionTerminatedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTermination,
  workflowExecutionFailedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowFailureOrRetry,
  workflowExecutionTimedOutEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowFailureOrRetry,
  workflowTaskFailedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskFailureOrRetry,
  workflowTaskTimedOutEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskFailureOrRetry,
  requestCancelExternalWorkflowExecutionInitiatedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ExternalWorkflow,
  requestCancelExternalWorkflowExecutionFailedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ExternalWorkflow,
  externalWorkflowExecutionCancelRequestedEventAttributes:
    SequentialMultiInstanceProductionHistoryEventFamily.ExternalWorkflow,
});

const forbiddenFamilies = new Set<
  ProductionHistoryEventFamily
>([
  SequentialMultiInstanceProductionHistoryEventFamily.Signal,
  SequentialMultiInstanceProductionHistoryEventFamily.Activity,
  SequentialMultiInstanceProductionHistoryEventFamily.ChildWorkflow,
  SequentialMultiInstanceProductionHistoryEventFamily.WorkflowCancellation,
  SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTermination,
  SequentialMultiInstanceProductionHistoryEventFamily.WorkflowFailureOrRetry,
  SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskFailureOrRetry,
  SequentialMultiInstanceProductionHistoryEventFamily.ExternalWorkflow,
]);

const allFamilies = Object.freeze(
  Object.values(SequentialMultiInstanceProductionHistoryEventFamily),
);

export function requireSequentialMultiInstanceProductionHistory(
  value: SequentialMultiInstanceProductionHistoryEvidence,
): SequentialMultiInstanceProductionHistoryResult {
  const expectedRoles = sequentialMultiInstanceProductionHistoryRoles(
    value.topology,
  );
  if (value.runs.length !== expectedRoles.length) {
    throw evidenceError(`${value.topology} production history has the wrong Run count`);
  }
  const bounds = requireSequentialMultiInstanceHistoryCapacity();
  const runs = value.runs.map((run, index) => {
    const expectedRole = expectedRoles[index];
    if (
      run.runOrdinal !== index + 1 ||
      expectedRole === undefined ||
      run.role !== expectedRole
    ) {
      throw evidenceError(
        `${value.topology} production history has the wrong Run ${String(index + 1)}`,
      );
    }
    if (run.history.events.length > bounds.maximumMeasuredRunEvents) {
      throw evidenceError(
        `${run.role} Run exceeds the approved ${String(bounds.maximumMeasuredRunEvents)}-Event topology bound`,
      );
    }
    if (!Number.isSafeInteger(run.historySize) || run.historySize < 1) {
      throw evidenceError(`${run.role} Run has no positive service History size`);
    }
    if (run.historySize > bounds.maximumMeasuredRunBytes) {
      throw evidenceError(
        `${run.role} Run exceeds the approved ${String(bounds.maximumMeasuredRunBytes)}-byte topology bound`,
      );
    }
    if (
      run.history.events.length >= bounds.eventTrigger ||
      run.historySize >= bounds.byteTrigger
    ) {
      throw evidenceError(`${run.role} Run reached a production rollover trigger`);
    }
    const eventFamilies = classifyEveryEvent(run.history);
    requireCommonProductionFamilies(eventFamilies, run.role);
    requireSequentialMultiInstanceProductionRunFamilies(
      value.topology,
      run.role,
      eventFamilies,
    );
    return {
      runOrdinal: run.runOrdinal,
      role: run.role,
      classifiedEventCount: run.history.events.length,
      historySize: run.historySize,
      eventFamilies,
    };
  });
  return {
    topology: value.topology,
    maximumEventCount: Math.max(...runs.map(({ classifiedEventCount }) =>
      classifiedEventCount
    )),
    maximumHistorySize: Math.max(...runs.map(({ historySize }) => historySize)),
    runs,
  };
}

/** Closes E2 iteration identity without treating the outer controller as a FlowNode. */
export function requireNaturalSequentialMultiInstanceOccurrences(
  batches: readonly FlowNodeOccurrenceBatch[],
  turnoverCommandIds: readonly [string, string],
): void {
  const reviews = occurrenceFacts(batches).filter(
    ({ elementId }) => elementId === "UserTask_Review",
  );
  if (reviews.length !== 3) {
    throw evidenceError("natural E2 must contain exactly three review tasks");
  }
  requireDistinctOccurrenceIds(reviews.map(({ id }) => id));
  if (reviews.some(({ terminal }) =>
    terminal !== FlowNodeOccurrenceTerminalKind.Completed
  )) {
    throw evidenceError("natural review task did not complete");
  }
  requireTurnover(
    batches,
    turnoverCommandIds[0],
    reviews[0]!.id,
    reviews[1]!.id,
  );
  requireTurnover(
    batches,
    turnoverCommandIds[1],
    reviews[1]!.id,
    reviews[2]!.id,
  );
}

/** Closes timer cancellation, stale refusal, and the absence of a synthetic outer occurrence. */
export function requireInterruptedSequentialMultiInstanceOccurrences(
  batches: readonly FlowNodeOccurrenceBatch[],
  commands: Readonly<{
    firstCompletion: string;
    timerFiring: string;
    staleCompletion: string;
  }>,
): void {
  const reviews = occurrenceFacts(batches).filter(
    ({ elementId }) => elementId === "UserTask_Review",
  );
  if (reviews.length !== 2) {
    throw evidenceError("interrupted E2 must contain exactly two review tasks");
  }
  requireDistinctOccurrenceIds(reviews.map(({ id }) => id));
  if (
    reviews[0]?.terminal !== FlowNodeOccurrenceTerminalKind.Completed ||
    reviews[1]?.terminal !== FlowNodeOccurrenceTerminalKind.Cancelled
  ) {
    throw evidenceError("interrupted review terminals changed");
  }
  requireTurnover(
    batches,
    commands.firstCompletion,
    reviews[0].id,
    reviews[1].id,
  );
  const timerBatch = batches.find(({ commandId }) =>
    commandId === commands.timerFiring
  );
  if (
    timerBatch === undefined ||
    !timerBatch.transitions.some(({ lifecycle }) =>
      lifecycle.ended.some(({ id, terminal }) =>
        occurrenceKey(id) === occurrenceKey(reviews[1]!.id) &&
        terminal === FlowNodeOccurrenceTerminalKind.Cancelled
      )
    )
  ) {
    throw evidenceError("timer firing did not cancel review task two");
  }
  const staleBatch = batches.find(({ commandId }) =>
    commandId === commands.staleCompletion
  );
  if (staleBatch !== undefined) {
    throw evidenceError("stale completion published an E2 batch");
  }
}

function occurrenceFacts(batches: readonly FlowNodeOccurrenceBatch[]) {
  const open = new Map<
    string,
    Readonly<{ id: FlowNodeOccurrenceId; elementId: string }>
  >();
  const closed: Array<Readonly<{
    id: FlowNodeOccurrenceId;
    elementId: string;
    terminal: FlowNodeOccurrenceTerminalKind;
  }>> = [];
  for (const batch of batches) {
    for (const transition of batch.transitions) {
      for (const started of transition.lifecycle.started) {
        open.set(occurrenceKey(started.id), {
          id: started.id,
          elementId: started.elementId,
        });
      }
      for (const ended of transition.lifecycle.ended) {
        const started = open.get(occurrenceKey(ended.id));
        if (started === undefined) {
          throw evidenceError("E2 terminal has no matching start");
        }
        open.delete(occurrenceKey(ended.id));
        closed.push({ ...started, terminal: ended.terminal });
      }
    }
  }
  if (open.size !== 0) {
    throw evidenceError("terminal E2 retains an open FlowNode occurrence");
  }
  return closed.sort((left, right) =>
    left.id.startRevision - right.id.startRevision ||
    left.id.startIndex - right.id.startIndex
  );
}

function requireTurnover(
  batches: readonly FlowNodeOccurrenceBatch[],
  commandId: string,
  preceding: FlowNodeOccurrenceId,
  successor: FlowNodeOccurrenceId,
): void {
  const batch = batches.find((candidate) => candidate.commandId === commandId);
  if (
    batch === undefined ||
    !batch.transitions.some(({ lifecycle }) =>
      lifecycle.ended.some(({ id }) =>
        occurrenceKey(id) === occurrenceKey(preceding)
      )
    ) ||
    !batch.transitions.some(({ lifecycle }) =>
      lifecycle.started.some(({ id }) =>
        occurrenceKey(id) === occurrenceKey(successor)
      )
    )
  ) {
    throw evidenceError(`${commandId} did not turn over E2 in one batch`);
  }
}

function requireDistinctOccurrenceIds(
  values: readonly FlowNodeOccurrenceId[],
): void {
  if (new Set(values.map(occurrenceKey)).size !== values.length) {
    throw evidenceError("review task occurrence identity was reused");
  }
}

function occurrenceKey(id: FlowNodeOccurrenceId): string {
  return `${id.processInstanceId}:${String(id.startRevision)}:${String(id.startIndex)}`;
}

function classifyEveryEvent(
  history: TemporalHistory,
): Record<ProductionHistoryEventFamily, number> {
  const counts = Object.fromEntries(
    allFamilies.map((family) => [family, 0]),
  ) as Record<ProductionHistoryEventFamily, number>;
  for (const [index, value] of history.events.entries()) {
    const event = requireRecord(value, `Event ${String(index + 1)}`);
    const attributes = Object.entries(event).filter(([name, candidate]) =>
      name.endsWith("EventAttributes") &&
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    );
    if (attributes.length !== 1) {
      throw evidenceError(
        `Event ${String(index + 1)} does not have exactly one classified attributes arm`,
      );
    }
    const attributesName = attributes[0]?.[0];
    const family = attributesName === undefined
      ? undefined
      : familyAttributes[attributesName];
    if (family === undefined) {
      throw evidenceError(`unclassified Event family ${String(attributesName)}`);
    }
    if (forbiddenFamilies.has(family)) {
      throw evidenceError(`forbidden Event family ${family}`);
    }
    counts[family] += 1;
  }
  const classified = allFamilies.reduce((sum, family) => sum + counts[family], 0);
  if (classified !== history.events.length) {
    throw evidenceError("production Event-family account is incomplete");
  }
  return counts;
}

function requireCommonProductionFamilies(
  counts: Readonly<
    Record<ProductionHistoryEventFamily, number>
  >,
  role: SequentialMultiInstanceHistoryRunRole,
): void {
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowExecutionStarted,
    1,
    `${role} Run requires one Workflow start`,
  );
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.PatchMarker,
    1,
    `${role} Run requires one production patch marker`,
  );
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.SearchAttributeUpsert,
    1,
    `${role} Run requires one production search-attribute upsert`,
  );
  const scheduled = counts[
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskScheduled
  ];
  const started = counts[
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskStarted
  ];
  const completed = counts[
    SequentialMultiInstanceProductionHistoryEventFamily.WorkflowTaskCompleted
  ];
  if (scheduled < 1 || scheduled !== started || scheduled !== completed) {
    throw evidenceError(`${role} Run has an incomplete Workflow Task lifecycle`);
  }
}

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw evidenceError(`${label} is not a record`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireCount(
  counts: Readonly<Record<ProductionHistoryEventFamily, number>>,
  family: ProductionHistoryEventFamily,
  expected: number,
  message: string,
): void {
  if (counts[family] !== expected) {
    throw evidenceError(message);
  }
}

function evidenceError(message: string): RangeError {
  return new RangeError(`Sequential Multi-Instance production history: ${message}`);
}
