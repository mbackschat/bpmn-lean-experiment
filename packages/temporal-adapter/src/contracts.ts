import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  OpenEffect,
  OpenTimer,
  OpenUserTask,
  ProcessStatus,
  Scenario,
  ScenarioResult,
  SemanticProcessIdentity,
  SemanticProcessProgram,
  StartProcessStimulus,
  StateObservation,
} from "@bpmn-lean/semantic-core";
import type {
  EffectExecutionSchedule,
  EffectProbeEvidence,
} from "./effect-probe.js";

export const bpmnProcessWorkflowType = "runBpmnProcess";
export const bpmnTraceQueryName = "bpmn-trace";
export const bpmnOpenUserTasksQueryName = "bpmn-open-user-tasks";
export const bpmnCompleteUserTaskUpdateName = "bpmn-complete-user-task";
export const bpmnSemanticTaskQueue = "bpmn-semantic";

export type CompletedProcessReceipt = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  finalState: StateObservation & {
    status: ProcessStatus.Completed;
  };
}>;

export enum ProcessCommandResultKind {
  Semantic = "semantic",
  ProcessClosed = "processClosed",
  ProcessUnknown = "processUnknown",
}

export type ProcessCommandResult =
  | DeepReadonly<{
      kind: ProcessCommandResultKind.Semantic;
      commandId: string;
      outcome: CommandOutcome;
    }>
  | DeepReadonly<{
      kind: ProcessCommandResultKind.ProcessClosed;
      commandId: string;
      receipt: CompletedProcessReceipt;
    }>
  | DeepReadonly<{
      kind: ProcessCommandResultKind.ProcessUnknown;
      commandId: string;
      processInstanceId: string;
    }>;

export type BpmnProcessWorkflow = (
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
) => Promise<CompletedProcessReceipt>;

export type TemporalScenarioRunnerOptions = DeepReadonly<{
  cliVersion: string;
  downloadDirectory: string;
}>;

export type TemporalTimeSkippingRunnerOptions = DeepReadonly<{
  downloadDirectory: string;
}>;

export enum TemporalCompletionDelivery {
  Ordered = "ordered",
  PostTerminal = "postTerminal",
  AcceptedBatch = "acceptedBatch",
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
  receipt: CompletedProcessReceipt | null;
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

export type TemporalEffectFailureExecution = DeepReadonly<{
  failureType: "BPMN_EFFECT_EXECUTION_EXHAUSTED";
  lastCommittedTrace: CanonicalObservation[];
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence;
}>;

export type TemporalUnhandledBpmnErrorExecution = DeepReadonly<{
  failureType: "BPMN_UNHANDLED_BPMN_ERROR";
  lastCommittedTrace: CanonicalObservation[];
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence;
  returnedResult: import("@bpmn-lean/semantic-core").EffectExecutionResult;
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
  duplicateCompletionOutcome: CommandOutcome | null;
  postTerminalResult: ProcessCommandResult | null;
}>;

export type BpmnCompleteUserTaskUpdateArguments = [
  stimulus: CompleteUserTaskInstanceStimulus,
];
