export enum CommandOutcome {
  Committed = "committed",
  RolledBack = "rolledBack",
  Rejected = "rejected",
  SemanticFailure = "semanticFailure",
  Unsupported = "unsupported",
}

export enum ScenarioOutcomeKind {
  Semantic = "semantic",
  HarnessFailure = "harnessFailure",
  InfrastructureFailure = "infrastructureFailure",
}

export type ScenarioOutcome =
  | Readonly<{
      kind: ScenarioOutcomeKind.Semantic;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: ScenarioOutcomeKind.HarnessFailure;
    }>
  | Readonly<{
      kind: ScenarioOutcomeKind.InfrastructureFailure;
    }>;

export enum StimulusKind {
  StartProcess = "startProcess",
  CompleteUserTask = "completeUserTask",
}

export type StartProcessStimulus = Readonly<{
  kind: StimulusKind.StartProcess;
  commandId: string;
  processId: string;
  instanceId: string;
}>;

export type CompleteUserTaskStimulus = Readonly<{
  kind: StimulusKind.CompleteUserTask;
  commandId: string;
  elementId: string;
}>;

export type Stimulus = StartProcessStimulus | CompleteUserTaskStimulus;

export enum ProcessStatus {
  NotStarted = "notStarted",
  Running = "running",
  Completed = "completed",
}

export enum WaitKind {
  UserTask = "userTask",
}

export enum ObservationRequestKind {
  Deployment = "deployment",
  CommandResults = "commandResults",
  ProcessStatus = "processStatus",
  ActiveWaits = "activeWaits",
  EnabledStimuli = "enabledStimuli",
  LogicalTime = "logicalTime",
}

export type ActiveWait = Readonly<{
  elementId: string;
  kind: WaitKind;
  multiplicity: number;
}>;

export enum CanonicalObservationKind {
  Deployment = "deployment",
  Command = "command",
  State = "state",
}

export type CanonicalObservation =
  | Readonly<{
      kind: CanonicalObservationKind.Deployment;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: CanonicalObservationKind.Command;
      commandId: string;
      outcome: CommandOutcome;
    }>
  | Readonly<{
      kind: CanonicalObservationKind.State;
      instanceId: string;
      status: ProcessStatus;
      activeWaits: ReadonlyArray<ActiveWait>;
      enabledStimuli: ReadonlyArray<Stimulus>;
      logicalTimeMs: number;
    }>;

export type BpmnResource = Readonly<{
  id: string;
  relativePath: string;
  sha256: string;
}>;

export type Scenario = Readonly<{
  schemaVersion: string;
  id: string;
  profile: string;
  bpmn: BpmnResource;
  stimuli: ReadonlyArray<Stimulus>;
  observations: ReadonlyArray<ObservationRequestKind>;
  provenance: Readonly<{
    normativeRefs: ReadonlyArray<string>;
    cibRevision: string;
    cibRefs: ReadonlyArray<string>;
  }>;
}>;

export type ScenarioResult = Readonly<{
  outcome: ScenarioOutcome;
  trace: ReadonlyArray<CanonicalObservation>;
}>;
