/** Closed Run-role and Event-family account for production SMI histories. */
import {
  SequentialMultiInstanceHistoryRunRole,
  SequentialMultiInstanceHistoryTopology,
} from "@bpmn-lean/temporal-workflow";

export const SequentialMultiInstanceProductionHistoryEventFamily =
  Object.freeze({
    WorkflowExecutionStarted: "workflowExecutionStarted",
    WorkflowTaskScheduled: "workflowTaskScheduled",
    WorkflowTaskStarted: "workflowTaskStarted",
    WorkflowTaskCompleted: "workflowTaskCompleted",
    PatchMarker: "patchMarker",
    SearchAttributeUpsert: "searchAttributeUpsert",
    UpdateAccepted: "updateAccepted",
    UpdateCompleted: "updateCompleted",
    TimerStarted: "timerStarted",
    TimerCanceled: "timerCanceled",
    TimerFired: "timerFired",
    ContinuedAsNew: "continuedAsNew",
    TerminalCompleted: "terminalCompleted",
    Signal: "signal",
    Activity: "activity",
    ChildWorkflow: "childWorkflow",
    WorkflowCancellation: "workflowCancellation",
    WorkflowTermination: "workflowTermination",
    WorkflowFailureOrRetry: "workflowFailureOrRetry",
    WorkflowTaskFailureOrRetry: "workflowTaskFailureOrRetry",
    ExternalWorkflow: "externalWorkflow",
  } as const);

export type SequentialMultiInstanceProductionHistoryEventFamily =
  (typeof SequentialMultiInstanceProductionHistoryEventFamily)[
    keyof typeof SequentialMultiInstanceProductionHistoryEventFamily
  ];

export type SequentialMultiInstanceProductionHistoryFamilyCounts = Readonly<
  Record<SequentialMultiInstanceProductionHistoryEventFamily, number>
>;

export function sequentialMultiInstanceProductionHistoryRoles(
  topology: SequentialMultiInstanceHistoryTopology,
): readonly SequentialMultiInstanceHistoryRunRole[] {
  switch (topology) {
    case SequentialMultiInstanceHistoryTopology.Natural:
      return [
        SequentialMultiInstanceHistoryRunRole.PreArming,
        SequentialMultiInstanceHistoryRunRole.Armed,
      ];
    case SequentialMultiInstanceHistoryTopology.Interrupted:
      return [
        SequentialMultiInstanceHistoryRunRole.PreArming,
        SequentialMultiInstanceHistoryRunRole.Armed,
        SequentialMultiInstanceHistoryRunRole.StaleRefusal,
        SequentialMultiInstanceHistoryRunRole.Escalation,
      ];
  }
}

export function requireSequentialMultiInstanceProductionRunFamilies(
  topology: SequentialMultiInstanceHistoryTopology,
  role: SequentialMultiInstanceHistoryRunRole,
  counts: SequentialMultiInstanceProductionHistoryFamilyCounts,
): void {
  switch (role) {
    case SequentialMultiInstanceHistoryRunRole.PreArming:
      requireUpdates(counts, 0, "pre-arming Run");
      requireTimer(counts, 0, 0, 0, "pre-arming Run");
      requireContinuation(counts, 1, 0, "pre-arming Run");
      return;
    case SequentialMultiInstanceHistoryRunRole.Armed:
      if (topology === SequentialMultiInstanceHistoryTopology.Natural) {
        requireUpdates(counts, 3, "armed natural Run");
        requireTimer(counts, 1, 1, 0, "armed natural Run");
        requireContinuation(counts, 0, 1, "armed natural Run");
        return;
      }
      requireUpdates(counts, 1, "armed interrupted Run");
      requireTimer(counts, 1, 0, 1, "armed interrupted Run");
      requireContinuation(counts, 1, 0, "armed interrupted Run");
      return;
    case SequentialMultiInstanceHistoryRunRole.StaleRefusal:
      if (topology !== SequentialMultiInstanceHistoryTopology.Interrupted) {
        throw evidenceError("natural topology cannot contain a stale-refusal Run");
      }
      requireUpdates(counts, 1, "stale-refusal Run");
      requireTimer(counts, 0, 0, 0, "stale-refusal Run");
      requireContinuation(counts, 1, 0, "stale-refusal Run");
      return;
    case SequentialMultiInstanceHistoryRunRole.Escalation:
      if (topology !== SequentialMultiInstanceHistoryTopology.Interrupted) {
        throw evidenceError("natural topology cannot contain an escalation Run");
      }
      requireUpdates(counts, 1, "escalation Run");
      requireTimer(counts, 0, 0, 0, "escalation Run");
      requireContinuation(counts, 0, 1, "escalation Run");
      return;
  }
}

function requireUpdates(
  counts: SequentialMultiInstanceProductionHistoryFamilyCounts,
  expected: number,
  label: string,
): void {
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.UpdateAccepted,
    expected,
    `${label} requires ${String(expected)} accepted Updates`,
  );
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.UpdateCompleted,
    expected,
    `${label} requires ${String(expected)} completed Updates`,
  );
}

function requireTimer(
  counts: SequentialMultiInstanceProductionHistoryFamilyCounts,
  started: number,
  canceled: number,
  fired: number,
  label: string,
): void {
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.TimerStarted,
    started,
    `${label} requires ${String(started)} timer starts`,
  );
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.TimerCanceled,
    canceled,
    `${label} requires ${numberWord(canceled)} timer cancellation${canceled === 1 ? "" : "s"}`,
  );
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.TimerFired,
    fired,
    `${label} requires ${String(fired)} timer firings`,
  );
}

function requireContinuation(
  counts: SequentialMultiInstanceProductionHistoryFamilyCounts,
  continued: number,
  completed: number,
  label: string,
): void {
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.ContinuedAsNew,
    continued,
    `${label} requires ${String(continued)} Continue-As-New Events`,
  );
  requireCount(
    counts,
    SequentialMultiInstanceProductionHistoryEventFamily.TerminalCompleted,
    completed,
    `${label} requires ${String(completed)} terminal completions`,
  );
}

function requireCount(
  counts: SequentialMultiInstanceProductionHistoryFamilyCounts,
  family: SequentialMultiInstanceProductionHistoryEventFamily,
  expected: number,
  message: string,
): void {
  if (counts[family] !== expected) {
    throw evidenceError(message);
  }
}

function numberWord(value: number): string {
  return value === 1 ? "one" : String(value);
}

function evidenceError(message: string): RangeError {
  return new RangeError(`Sequential Multi-Instance production history: ${message}`);
}
