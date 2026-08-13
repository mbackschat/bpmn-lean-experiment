import type {
  CanonicalObservation,
  CommandOutcome,
  DeepReadonly,
  EffectExecutionResult,
  OpenEffect,
  OpenTimer,
  OpenUserTask,
  Scenario,
  ScenarioResult,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  CompletedProcessReceipt,
  ProcessCommandResult,
  TerminalProcessReceipt,
} from "@bpmn-lean/temporal-protocol";
import {
  ProcessCommandResultKind,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectExecutionSchedule,
  EffectProbeEvidence,
} from "./effect-probe.js";

export type TemporalScenarioRunnerOptions = DeepReadonly<{
  /** Overrides the pinned `temporalCliVersion`. */
  cliVersion?: string;
  downloadDirectory: string;
}>;

export type TemporalTimeSkippingRunnerOptions = DeepReadonly<{
  downloadDirectory: string;
}>;

export enum TemporalCompletionDelivery {
  Ordered = "ordered",
  PostTerminal = "postTerminal",
  LifecycleRace = "lifecycleRace",
  Concurrent = "concurrent",
}

export enum TemporalExecutionSchedule {
  Normal = "normal",
  DuplicateFirstCompletion = "duplicateFirstCompletion",
  WorkerDownAtTimerDue = "workerDownAtTimerDue",
  WorkerDownAtEffectPending = "workerDownAtEffectPending",
}

export type TemporalScenarioExecutionOptions = DeepReadonly<{
  workflowId: string;
  completionDelivery: TemporalCompletionDelivery;
  executionSchedule: TemporalExecutionSchedule;
  effectExecutionSchedule: EffectExecutionSchedule | null;
}>;

export type TemporalScenarioBatchItem = DeepReadonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  options: TemporalScenarioExecutionOptions;
}>;

export type TemporalHistory = DeepReadonly<{
  events: unknown[];
}>;

export type TemporalReplayItem = DeepReadonly<{
  history: unknown;
  workflowId: string;
}>;

export type TemporalScenarioExecution = DeepReadonly<{
  waitTrace: CanonicalObservation[];
  interactionEvidence: TemporalInteractionEvidence;
  result: ScenarioResult;
  receipt: TerminalProcessReceipt | null;
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence | null;
}>;

export type TemporalTimerBypassMutationExecution = DeepReadonly<{
  result: ScenarioResult;
  receipt: CompletedProcessReceipt;
  history: TemporalHistory;
}>;

export type TemporalEffectBypassMutationExecution =
  TemporalTimerBypassMutationExecution;

export type TemporalBranchBypassMutationExecution = DeepReadonly<{
  waitTrace: CanonicalObservation[];
  history: TemporalHistory;
}>;

export type TemporalScopeBypassMutationExecution = DeepReadonly<{
  trace: CanonicalObservation[];
  history: TemporalHistory;
  completionOutcome: CommandOutcome;
}>;

export type TemporalErrorPropagationBypassMutationExecution = DeepReadonly<{
  trace: CanonicalObservation[];
  history: TemporalHistory;
  completionOutcome: CommandOutcome;
  discriminatorOutcome: CommandOutcome;
}>;

export type TemporalEffectFailureExecution = DeepReadonly<{
  failureType: "BPMN_EFFECT_EXECUTION_EXHAUSTED";
  lastCommittedTrace: CanonicalObservation[];
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence;
}>;

export type TemporalIncidentRetryFailureExecution = DeepReadonly<{
  failureType: "BPMN_EFFECT_INCIDENT_RETRY_EXHAUSTED";
  lastCommittedTrace: CanonicalObservation[];
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence;
}>;

export type TemporalIncidentRetryRaceExecution = DeepReadonly<{
  outcomes: CommandOutcome[];
  trace: CanonicalObservation[];
  receipt: CompletedProcessReceipt;
  history: TemporalHistory;
}>;

export type TemporalUnhandledBpmnErrorExecution = DeepReadonly<{
  failureType: "BPMN_UNHANDLED_BPMN_ERROR";
  lastCommittedTrace: CanonicalObservation[];
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence;
  returnedResult: EffectExecutionResult;
}>;

export type TemporalSharedEffectExecutions = DeepReadonly<{
  executions: TemporalScenarioExecution[];
  effectProbeEvidence: EffectProbeEvidence;
}>;

export type TemporalInteractionEvidence = DeepReadonly<{
  openUserTasksAtWait: OpenUserTask[];
  openTimersAtWait: OpenTimer[];
  openEffectsAtWait: OpenEffect[];
  openUserTasksAfterCompletions: OpenUserTask[][];
  completionOutcomes: CommandOutcome[];
  completionClosureResults: Array<Extract<
    ProcessCommandResult,
    { kind: ProcessCommandResultKind.ProcessClosed }
  >>;
  duplicateCompletionOutcome: CommandOutcome | null;
  postTerminalResult: ProcessCommandResult | null;
}>;
