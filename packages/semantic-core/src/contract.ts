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

export enum ScenarioDocumentKind {
  Scenario = "scenario",
}

export enum StimulusKind {
  StartProcess = "startProcess",
  CompleteUserTaskInstance = "completeUserTaskInstance",
  FireTimer = "fireTimer",
}

export type StartProcessStimulus = Readonly<{
  kind: StimulusKind.StartProcess;
  commandId: string;
  processId: string;
  instanceId: string;
}>;

export type UserTaskInstanceId = Readonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

export type CompleteUserTaskInstanceStimulus = Readonly<{
  kind: StimulusKind.CompleteUserTaskInstance;
  commandId: string;
  taskId: UserTaskInstanceId;
}>;

export type TimerOccurrenceId = Readonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

export type FireTimerStimulus = Readonly<{
  kind: StimulusKind.FireTimer;
  commandId: string;
  timerId: TimerOccurrenceId;
  logicalTimeMs: number;
}>;

export type Stimulus =
  | StartProcessStimulus
  | CompleteUserTaskInstanceStimulus
  | FireTimerStimulus;

export enum ProcessStatus {
  NotStarted = "notStarted",
  Running = "running",
  Completed = "completed",
}

export enum WaitKind {
  UserTask = "userTask",
  Timer = "timer",
}

export enum ObservationRequestKind {
  Deployment = "deployment",
  CommandResults = "commandResults",
  ProcessStatus = "processStatus",
  ActiveWaits = "activeWaits",
  OpenUserTasks = "openUserTasks",
  OpenTimers = "openTimers",
  EnabledInteractions = "enabledInteractions",
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

export enum UserTaskLifecycleState {
  Active = "active",
}

export type OpenUserTask = Readonly<{
  id: UserTaskInstanceId;
  name: string | null;
  state: UserTaskLifecycleState;
}>;

export type CompleteUserTaskInstanceInteraction = Readonly<{
  kind: StimulusKind.CompleteUserTaskInstance;
  taskId: UserTaskInstanceId;
}>;

export type EnabledInteraction = CompleteUserTaskInstanceInteraction;

export type OpenTimer = Readonly<{
  id: TimerOccurrenceId;
  deadlineMs: number;
}>;

export type StateObservation = Readonly<{
  kind: CanonicalObservationKind.State;
  instanceId: string;
  status: ProcessStatus;
  activeWaits: ReadonlyArray<ActiveWait>;
  openUserTasks: ReadonlyArray<OpenUserTask>;
  openTimers: ReadonlyArray<OpenTimer>;
  enabledInteractions: ReadonlyArray<EnabledInteraction>;
  logicalTimeMs: number;
}>;

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
  | StateObservation;

export type BpmnResource = Readonly<{
  id: string;
  relativePath: string;
  sha256: string;
}>;

export type Scenario = Readonly<{
  kind: ScenarioDocumentKind.Scenario;
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
