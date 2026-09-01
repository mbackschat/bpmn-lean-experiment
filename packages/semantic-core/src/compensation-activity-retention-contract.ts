import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";

export type BoundaryCompensationTarget = DeepReadonly<{
  activityElementId: string;
  boundaryEventElementId: string;
  compensationActivityElementId: string;
}>;

export type CompensationActivityRetentionDeclaration = DeepReadonly<{
  definitionScopeId: string;
  targets: BoundaryCompensationTarget[];
  limits: {
    maxRecords: number;
    maxCanonicalBytes: number;
  };
}>;

export type CompletedCompensableActivity = DeepReadonly<{
  id: ActivityOccurrenceId;
  completionOrdinal: number;
}>;

export type CompensationActivityRetention = DeepReadonly<{
  owner: ScopeOccurrenceId;
  nextCompletionOrdinal: number;
  records: CompletedCompensableActivity[];
}>;

export enum CompensationCompletionFactKind {
  OrdinaryUserTask = "ordinaryUserTask",
  MultiInstanceUserTask = "multiInstanceUserTask",
}

export enum MultiInstanceCompensationCompletionOutcome {
  AllSuccessfulCompletion = "allSuccessfulCompletion",
  EarlyCompletion = "earlyCompletion",
  Interrupted = "interrupted",
}

export type CompensationCompletionFacts =
  | DeepReadonly<{
      kind: CompensationCompletionFactKind.OrdinaryUserTask;
      activity: ActivityOccurrenceId;
    }>
  | DeepReadonly<{
      kind: CompensationCompletionFactKind.MultiInstanceUserTask;
      activity: ActivityOccurrenceId;
      plannedInstances: number;
      successfullyCompletedInstances: number;
      outcome: MultiInstanceCompensationCompletionOutcome;
    }>;

export enum CompensationRetentionResultKind {
  Retained = "retained",
  NotEligible = "notEligible",
  Refused = "refused",
}

export enum CompensationRetentionRefusalKind {
  DeclarationAbsent = "declarationAbsent",
  InvalidProgram = "invalidProgram",
  InvalidCompletionFacts = "invalidCompletionFacts",
  TargetAbsent = "targetAbsent",
  RetentionStateMismatch = "retentionStateMismatch",
  DuplicateActivity = "duplicateActivity",
  CapacityExceeded = "capacityExceeded",
}

export enum CompensationRetentionCapacityMeasure {
  Records = "records",
  CanonicalBytes = "canonicalBytes",
}

export type CompensationRetentionRefusal =
  | DeepReadonly<{
      kind:
        | CompensationRetentionRefusalKind.DeclarationAbsent
        | CompensationRetentionRefusalKind.InvalidProgram
        | CompensationRetentionRefusalKind.InvalidCompletionFacts
        | CompensationRetentionRefusalKind.TargetAbsent
        | CompensationRetentionRefusalKind.RetentionStateMismatch
        | CompensationRetentionRefusalKind.DuplicateActivity;
    }>
  | DeepReadonly<{
      kind: CompensationRetentionRefusalKind.CapacityExceeded;
      measure: CompensationRetentionCapacityMeasure;
      configuredBound: number;
      observedValue: number;
    }>;

export type CompensationRetentionResult =
  | DeepReadonly<{
      kind: CompensationRetentionResultKind.Retained;
      state: RuntimeState;
    }>
  | DeepReadonly<{
      kind: CompensationRetentionResultKind.NotEligible;
      state: RuntimeState;
    }>
  | DeepReadonly<{
      kind: CompensationRetentionResultKind.Refused;
      state: RuntimeState;
      refusal: CompensationRetentionRefusal;
    }>;

export enum CompensationRetentionProgramDefect {
  InvalidRootScope = "invalidRootScope",
  InvalidLimits = "invalidLimits",
  EmptyTargets = "emptyTargets",
  InvalidTarget = "invalidTarget",
  UnorderedTargets = "unorderedTargets",
  DuplicateActivityTarget = "duplicateActivityTarget",
  TargetOperationMismatch = "targetOperationMismatch",
  UnsupportedLifecycle = "unsupportedLifecycle",
}

export enum CompensationRetentionStateDefect {
  ProgramPresenceMismatch = "programPresenceMismatch",
  RegisterCardinalityMismatch = "registerCardinalityMismatch",
  RegisterOwnerMismatch = "registerOwnerMismatch",
  InvalidChronology = "invalidChronology",
  DuplicateActivity = "duplicateActivity",
  UndeclaredActivity = "undeclaredActivity",
  CapacityExceeded = "capacityExceeded",
}
