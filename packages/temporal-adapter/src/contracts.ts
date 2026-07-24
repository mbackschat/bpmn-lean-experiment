import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  Scenario,
  ScenarioResult,
  SequentialUserTaskExecutableIr,
} from "@bpmn-lean/semantic-core";

export const bpmnScenarioWorkflowType = "runBpmnScenario";
export const bpmnTraceQueryName = "bpmn-trace";
export const bpmnOpenUserTasksQueryName = "bpmn-open-user-tasks";
export const bpmnCompleteUserTaskUpdateName = "bpmn-complete-user-task";
export const bpmnSemanticTaskQueue = "bpmn-semantic";

export type BpmnScenarioWorkflow = (
  scenario: Scenario,
  executableIr: SequentialUserTaskExecutableIr,
) => Promise<ScenarioResult>;

export type TemporalScenarioRunnerOptions = Readonly<{
  cliVersion: string;
  downloadDirectory: string;
}>;

export type TemporalScenarioExecutionOptions = Readonly<{
  workflowId: string;
  duplicateFirstCompletionUpdateId?: string;
}>;

export type TemporalScenarioBatchItem = Readonly<{
  scenario: Scenario;
  executableIr: SequentialUserTaskExecutableIr;
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
  interactionEvidence: TemporalUserTaskInteractionEvidence;
  result: ScenarioResult;
  history: TemporalHistory;
}>;

export type TemporalUserTaskInteractionEvidence = Readonly<{
  openUserTasksAtWait: ReadonlyArray<OpenUserTask>;
  completionOutcomes: ReadonlyArray<CommandOutcome>;
  duplicateCompletionOutcome: CommandOutcome | null;
}>;

export type BpmnCompleteUserTaskUpdateArguments = [
  stimulus: CompleteUserTaskInstanceStimulus,
];
