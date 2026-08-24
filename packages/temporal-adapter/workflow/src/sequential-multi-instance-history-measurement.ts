/** Closed exact-version service-measurement contract for Sequential Multi-Instance capacity. */
import type { CommandOutcome } from "@bpmn-lean/semantic-core";

export enum SequentialMultiInstanceHistoryTopology {
  Natural = "natural",
  Interrupted = "interrupted",
}

export enum SequentialMultiInstanceHistoryRunRole {
  PreArming = "preArming",
  Armed = "armed",
  StaleRefusal = "staleRefusal",
  Escalation = "escalation",
}

export enum SequentialMultiInstanceHistoryEventFamily {
  WorkflowExecutionStarted = "workflowExecutionStarted",
  WorkflowTask = "workflowTask",
  UpdateAccepted = "updateAccepted",
  UpdateCompleted = "updateCompleted",
  TimerStarted = "timerStarted",
  TimerCanceled = "timerCanceled",
  TimerFired = "timerFired",
  ContinuedAsNew = "continuedAsNew",
  TerminalCompleted = "terminalCompleted",
}

export type SequentialMultiInstanceHistoryEnvironment = Readonly<{
  temporalCliVersion: "v1.8.1";
  temporalServerVersion: "1.31.2";
  temporalSdkVersion: "1.21.0";
}>;

export type SequentialMultiInstanceHistorySeparator = Readonly<{
  maximumItems: number;
  maximumItemUtf8Bytes: number;
  maximumCanonicalCollectionUtf8Bytes: number;
  canonicalMaximumCollectionBytes: number;
  equal508CollectionBytes: number;
  equal512CollectionBytes: number;
  exact16Admitted: boolean;
  exact17Refused: boolean;
}>;

export type SequentialMultiInstanceHistoryEventFamilyCounts = Readonly<
  Record<SequentialMultiInstanceHistoryEventFamily, number>
>;

export type SequentialMultiInstanceHistoryCheckpoint = Readonly<{
  label: string;
  historyLength: number;
  historySize: number;
}>;

/** Raw service sizes are observations; the deterministic envelope also accounts for closing Events and their payloads. */
export type SequentialMultiInstanceHistoryFinalBoundary = Readonly<{
  eventsNotIncludedAtCheckpoint: number;
  canonicalPayloadBytes: number;
  conservativeEnvelopeBytes: number;
}>;

export type SequentialMultiInstanceRunHistoryMeasurement = Readonly<{
  runOrdinal: number;
  role: SequentialMultiInstanceHistoryRunRole;
  stableCheckpoints: readonly SequentialMultiInstanceHistoryCheckpoint[];
  finalBoundary: SequentialMultiInstanceHistoryFinalBoundary;
  finalEventCount: number;
  conservativeFinalHistorySize: number;
  largestActivationEvents: number;
  largestActivationCanonicalPayloadBytes: number;
  eventFamilies: SequentialMultiInstanceHistoryEventFamilyCounts;
}>;

export type SequentialMultiInstanceTopologyHistoryMeasurement = Readonly<{
  topology: SequentialMultiInstanceHistoryTopology;
  completedItemsBeforeTimerResolution: number;
  terminalOutcome: CommandOutcome;
  runs: readonly SequentialMultiInstanceRunHistoryMeasurement[];
}>;

export type SequentialMultiInstanceMeasuredHistory = Readonly<{
  state: "measured";
  environment: SequentialMultiInstanceHistoryEnvironment;
  separator: SequentialMultiInstanceHistorySeparator;
  natural: SequentialMultiInstanceTopologyHistoryMeasurement;
  interrupted: SequentialMultiInstanceTopologyHistoryMeasurement;
}>;

export type SequentialMultiInstanceHistoryMeasurement =
  | Readonly<{ state: "unmeasured" }>
  | SequentialMultiInstanceMeasuredHistory;

export function sequentialMultiInstanceHistoryCheckpointLabels(
  topology: SequentialMultiInstanceHistoryTopology,
  role: SequentialMultiInstanceHistoryRunRole,
): readonly string[] {
  switch (role) {
    case SequentialMultiInstanceHistoryRunRole.PreArming:
      return ["run-open", "before-pre-arming-continue-as-new"];
    case SequentialMultiInstanceHistoryRunRole.Armed:
      return topology === SequentialMultiInstanceHistoryTopology.Natural
        ? [
          "run-open",
          ...Array.from({ length: 16 }, (_, index) => `update-${index + 1}`),
          "before-natural-terminal",
        ]
        : [
          "run-open",
          ...Array.from({ length: 15 }, (_, index) => `update-${index + 1}`),
          "timer-fired",
          "before-interrupted-continue-as-new",
        ];
    case SequentialMultiInstanceHistoryRunRole.StaleRefusal:
      return ["run-open", "update-16", "before-stale-refusal-continue-as-new"];
    case SequentialMultiInstanceHistoryRunRole.Escalation:
      return ["run-open", "update-17", "before-escalation-terminal"];
  }
}
