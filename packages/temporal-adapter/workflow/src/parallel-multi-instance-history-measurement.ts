/** Closed measurement contract for pre-registration parallel Multi-Instance capacity. */
export enum ParallelMultiInstanceCapacityTopology {
  Natural = "natural",
  TimerInterruption = "timerInterruption",
  EarlyCompletion = "earlyCompletion",
}

export type ParallelMultiInstanceTopologyMeasurement = Readonly<{
  topology: ParallelMultiInstanceCapacityTopology;
  itemCount: number;
  maximumCommittedTransitions: number;
  maximumActivationEvents: number;
  maximumActivationPayloadBytes: number;
  maximumHistoryEnvelopeBytes: number;
}>;

export type ParallelMultiInstanceHistoryMeasurement = Readonly<{
  selectedMaximumItems: number;
  maximumItemUtf8Bytes: number;
  maximumCanonicalCollectionUtf8Bytes: number;
  canonicalMaximumCollectionBytes: number;
  exactLimitAdmitted: boolean;
  limitPlusOneRefusedWithoutMutation: boolean;
  topologies: readonly ParallelMultiInstanceTopologyMeasurement[];
}>;

export enum ParallelMultiInstanceHistoryEventFamily {
  WorkflowExecutionStarted = "workflowExecutionStarted",
  WorkflowTask = "workflowTask",
  PatchMarker = "patchMarker",
  SearchAttributeUpsert = "searchAttributeUpsert",
  UpdateAccepted = "updateAccepted",
  UpdateCompleted = "updateCompleted",
  TimerStarted = "timerStarted",
  TimerCanceled = "timerCanceled",
  TimerFired = "timerFired",
  ContinuedAsNew = "continuedAsNew",
  TerminalCompleted = "terminalCompleted",
}

export type ParallelMultiInstanceHistoryEventFamilyCounts = Readonly<
  Record<ParallelMultiInstanceHistoryEventFamily, number>
>;

export type ParallelMultiInstanceServiceHistoryCheckpoint = Readonly<{
  label: string;
  historyLength: number;
  historySize: number;
  canonicalActivationPayloadBytes: number;
}>;

export type ParallelMultiInstanceServiceHistoryRun = Readonly<{
  runOrdinal: number;
  checkpoints: readonly ParallelMultiInstanceServiceHistoryCheckpoint[];
  finalEventCount: number;
  finalHistorySize: number;
  conservativeFinalHistoryEnvelopeBytes: number;
  maximumActivationEvents: number;
  maximumActivationCanonicalPayloadBytes: number;
  eventFamilies: ParallelMultiInstanceHistoryEventFamilyCounts;
}>;

export type ParallelMultiInstanceServiceTopologyMeasurement = Readonly<{
  topology: ParallelMultiInstanceCapacityTopology;
  itemCount: number;
  activeChildrenAtDecision: number;
  runs: readonly ParallelMultiInstanceServiceHistoryRun[];
}>;

export type ParallelMultiInstanceServiceHistoryMeasurement = Readonly<{
  state: "measured";
  environment: {
    temporalCliVersion: string;
    temporalServerVersion: string;
    temporalSdkVersion: string;
  };
  separator: {
    selectedMaximumItems: number;
    maximumItemUtf8Bytes: number;
    maximumCanonicalCollectionUtf8Bytes: number;
    canonicalMaximumCollectionBytes: number;
    exactLimitAdmitted: true;
    limitPlusOneRefusedWithoutMutation: true;
  };
  topologies: readonly ParallelMultiInstanceServiceTopologyMeasurement[];
}>;
