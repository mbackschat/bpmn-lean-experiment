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
  CompleteUserTaskInstance = "completeUserTaskInstance",
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

export type Stimulus =
  | StartProcessStimulus
  | CompleteUserTaskStimulus
  | CompleteUserTaskInstanceStimulus;

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
  OpenUserTasks = "openUserTasks",
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

type StateObservationBase = Readonly<{
  kind: CanonicalObservationKind.State;
  instanceId: string;
  status: ProcessStatus;
  activeWaits: ReadonlyArray<ActiveWait>;
  logicalTimeMs: number;
}>;

type RetainedLifecycleStateObservation = StateObservationBase &
  Readonly<{
    enabledStimuli: ReadonlyArray<Stimulus>;
    openUserTasks?: never;
    enabledInteractions?: never;
  }>;

type UserTaskInteractionStateObservation = StateObservationBase &
  Readonly<{
    openUserTasks: ReadonlyArray<OpenUserTask>;
    enabledInteractions: ReadonlyArray<EnabledInteraction>;
    enabledStimuli?: never;
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
  | RetainedLifecycleStateObservation
  | UserTaskInteractionStateObservation;

export type BpmnResource = Readonly<{
  id: string;
  relativePath: string;
  sha256: string;
}>;

export type Scenario = Readonly<{
  schemaVersion: string;
  traceSchemaVersion?: string;
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
