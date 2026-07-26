import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
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

export const bpmnProcessWorkflowType = "runBpmnProcess";
export const bpmnTraceQueryName = "bpmn-trace";
export const bpmnOpenUserTasksQueryName = "bpmn-open-user-tasks";
export const bpmnCompleteUserTaskUpdateName = "bpmn-complete-user-task";
export const bpmnSemanticTaskQueue = "bpmn-semantic";

export type CompletedProcessReceipt = Readonly<{
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
  | Readonly<{
      kind: ProcessCommandResultKind.Semantic;
      commandId: string;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: ProcessCommandResultKind.ProcessClosed;
      commandId: string;
      receipt: CompletedProcessReceipt;
    }>
  | Readonly<{
      kind: ProcessCommandResultKind.ProcessUnknown;
      commandId: string;
      processInstanceId: string;
    }>;

export type BpmnProcessWorkflow = (
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
) => Promise<CompletedProcessReceipt>;

export type TemporalScenarioRunnerOptions = Readonly<{
  cliVersion: string;
  downloadDirectory: string;
}>;

export type TemporalTimeSkippingRunnerOptions = Readonly<{
  downloadDirectory: string;
}>;

export enum TemporalCompletionDelivery {
  Ordered = "ordered",
  PostTerminal = "postTerminal",
  AcceptedBatch = "acceptedBatch",
  Concurrent = "concurrent",
}

export type TemporalScenarioExecutionOptions = Readonly<{
  workflowId: string;
  completionDelivery: TemporalCompletionDelivery;
  duplicateFirstCompletion?: boolean;
  workerDownAtTimerDue?: boolean;
}>;

export type TemporalScenarioBatchItem = Readonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  options: TemporalScenarioExecutionOptions;
}>;

export type TemporalHistory = Readonly<{
  events: ReadonlyArray<unknown>;
}>;

export type TemporalReplayItem = Readonly<{
  history: unknown;
  workflowId: string;
}>;

export type TemporalScenarioExecution = Readonly<{
  waitTrace: ReadonlyArray<CanonicalObservation>;
  interactionEvidence: TemporalInteractionEvidence;
  result: ScenarioResult;
  receipt: CompletedProcessReceipt | null;
  history: TemporalHistory;
}>;

export type TemporalTimerBypassMutationExecution = Readonly<{
  result: ScenarioResult;
  receipt: CompletedProcessReceipt;
  history: TemporalHistory;
}>;

export type TemporalInteractionEvidence = Readonly<{
  openUserTasksAtWait: ReadonlyArray<OpenUserTask>;
  openTimersAtWait: ReadonlyArray<OpenTimer>;
  openUserTasksAfterCompletions: ReadonlyArray<
    ReadonlyArray<OpenUserTask>
  >;
  completionOutcomes: ReadonlyArray<CommandOutcome>;
  duplicateCompletionOutcome: CommandOutcome | null;
  postTerminalResult: ProcessCommandResult | null;
}>;

export type BpmnCompleteUserTaskUpdateArguments = [
  stimulus: CompleteUserTaskInstanceStimulus,
];
