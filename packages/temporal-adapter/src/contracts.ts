import type {
  CanonicalObservation,
  Scenario,
  ScenarioResult,
  SequentialUserTaskExecutableIr,
  Stimulus,
} from "@bpmn-lean/semantic-core";

export const bpmnScenarioWorkflowType = "runBpmnScenario";
export const bpmnStimulusSignalName = "bpmn-stimulus";
export const bpmnTraceQueryName = "bpmn-trace";
export const bpmnSemanticTaskQueue = "bpmn-semantic-m0";

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
}>;

export type TemporalHistory = Readonly<{
  events: ReadonlyArray<unknown>;
}>;

export type TemporalScenarioExecution = Readonly<{
  waitTrace: ReadonlyArray<CanonicalObservation>;
  result: ScenarioResult;
  history: TemporalHistory;
}>;

export type BpmnStimulusSignalArguments = [stimulus: Stimulus];
