import type { DeepReadonly } from "./deep-readonly.js";
import type { UserTaskMetadata } from "./user-task-metadata.js";
import type { SourceOverlayIdentity } from "./source-overlay-identity.js";
import { MessageChannelKind } from "./semantic-value-contract.js";
import type { MessageChannel } from "./semantic-value-contract.js";

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
  | DeepReadonly<{
      kind: ScenarioOutcomeKind.Semantic;
      outcome: CommandOutcome;
    }>
  | DeepReadonly<{
      kind: ScenarioOutcomeKind.HarnessFailure;
    }>
  | DeepReadonly<{
      kind: ScenarioOutcomeKind.InfrastructureFailure;
    }>;

export enum ScenarioDocumentKind {
  Scenario = "scenario",
}

export enum StimulusKind {
  StartProcess = "startProcess",
  TriggerMessageStart = "triggerMessageStart",
  TriggerTimerStart = "triggerTimerStart",
  CompleteUserTaskInstance = "completeUserTaskInstance",
  DeliverMessage = "deliverMessage",
  FireTimer = "fireTimer",
  CompleteEffect = "completeEffect",
  ReportEffectFailure = "reportEffectFailure",
  RetryIncident = "retryIncident",
  CancelIncidentProcess = "cancelIncidentProcess",
}

export type StartProcessStimulus = DeepReadonly<{
  kind: StimulusKind.StartProcess;
  commandId: string;
  processId: string;
  instanceId: string;
  initialVariables: VariableBinding[];
}>;

/** Starts one fresh Process instance through one exact operation-addressed Message Start Event. */
export type TriggerMessageStartStimulus = DeepReadonly<{
  kind: StimulusKind.TriggerMessageStart;
  commandId: string;
  processId: string;
  instanceId: string;
  startEventId: string;
  channel: Extract<
    MessageChannel,
    { kind: typeof MessageChannelKind.OperationMessage }
  >;
}>;

/** Starts one fresh Process instance through one exact resolved Timer Start occurrence. */
export type TriggerTimerStartStimulus = DeepReadonly<{
  kind: StimulusKind.TriggerTimerStart;
  commandId: string;
  processId: string;
  instanceId: string;
  startEventId: string;
}>;

export type ProcessStartStimulus =
  | StartProcessStimulus
  | TriggerMessageStartStimulus
  | TriggerTimerStartStimulus;

export type OccurrenceId = DeepReadonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

export type UserTaskInstanceId = OccurrenceId;
export type MessageSubscriptionId = OccurrenceId;

export type CompleteUserTaskInstanceStimulus = DeepReadonly<{
  kind: StimulusKind.CompleteUserTaskInstance;
  commandId: string;
  taskId: UserTaskInstanceId;
  submittedValues: UserTaskCompletionBinding[];
}>;

export type DeliverMessageStimulus = DeepReadonly<{
  kind: StimulusKind.DeliverMessage;
  commandId: string;
  subscriptionId: MessageSubscriptionId;
  channel: import("./semantic-value-contract.js").MessageChannel;
}>;

export type TimerOccurrenceId = OccurrenceId;

export type FireTimerStimulus = DeepReadonly<{
  kind: StimulusKind.FireTimer;
  commandId: string;
  timerId: TimerOccurrenceId;
  logicalTimeMs: number;
}>;

export type EffectOccurrenceId = OccurrenceId;

export enum VariableValueKind {
  Boolean = "boolean",
  Integer = "integer",
  String = "string",
  StringList = "stringList",
  Null = "null",
}

export type VariableValue =
  | DeepReadonly<{
      kind: VariableValueKind.Boolean;
      value: boolean;
    }>
  | DeepReadonly<{
      kind: VariableValueKind.Integer;
      value: number;
    }>
  | DeepReadonly<{
      kind: VariableValueKind.String;
      value: string;
    }>
  | DeepReadonly<{
      kind: VariableValueKind.StringList;
      value: string[];
    }>
  | DeepReadonly<{
      kind: VariableValueKind.Null;
    }>;

export type VariableBinding = DeepReadonly<{
  name: string;
  value: VariableValue;
}>;

export type UserTaskCompletionValue = VariableValue;
export type UserTaskCompletionBinding = VariableBinding;

export enum EffectExecutionResultKind {
  Success = "success",
  BpmnError = "bpmnError",
}

export type EffectExecutionResult =
  | DeepReadonly<{
      kind: EffectExecutionResultKind.Success;
      localPatch: VariableBinding[];
    }>
  | DeepReadonly<{
      kind: EffectExecutionResultKind.BpmnError;
      code: string;
      message: string | null;
      localPatch: VariableBinding[];
    }>;

export type CompleteEffectStimulus = DeepReadonly<{
  kind: StimulusKind.CompleteEffect;
  commandId: string;
  effectId: EffectOccurrenceId;
  result: EffectExecutionResult;
}>;

export type EffectIncidentId = DeepReadonly<{
  effectId: EffectOccurrenceId;
  generation: 1;
}>;

export type ReportEffectFailureStimulus = DeepReadonly<{
  kind: StimulusKind.ReportEffectFailure;
  commandId: string;
  effectId: EffectOccurrenceId;
  generation: 1;
}>;

export type RetryIncidentStimulus = DeepReadonly<{
  kind: StimulusKind.RetryIncident;
  commandId: string;
  incidentId: EffectIncidentId;
}>;

export type CancelIncidentProcessStimulus = DeepReadonly<{
  kind: StimulusKind.CancelIncidentProcess;
  commandId: string;
  processInstanceId: string;
  incidentId: EffectIncidentId;
}>;

export type Stimulus =
  | ProcessStartStimulus
  | CompleteUserTaskInstanceStimulus
  | DeliverMessageStimulus
  | FireTimerStimulus
  | CompleteEffectStimulus
  | ReportEffectFailureStimulus
  | RetryIncidentStimulus
  | CancelIncidentProcessStimulus;

export enum ProcessStatus {
  NotStarted = "notStarted",
  Running = "running",
  Completed = "completed",
  Cancelled = "cancelled",
}

export enum WaitKind {
  UserTask = "userTask",
  Message = "message",
  Timer = "timer",
  Effect = "effect",
  Incident = "incident",
}

export enum ObservationRequestKind {
  Deployment = "deployment",
  CommandResults = "commandResults",
  ProcessStatus = "processStatus",
  ActiveWaits = "activeWaits",
  OpenUserTasks = "openUserTasks",
  OpenTimers = "openTimers",
  OpenEffects = "openEffects",
  Variables = "variables",
  EnabledInteractions = "enabledInteractions",
  LogicalTime = "logicalTime",
}

export type ActiveWait = DeepReadonly<{
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

export type OpenUserTask = DeepReadonly<{
  id: UserTaskInstanceId;
  name: string | null;
  state: UserTaskLifecycleState;
  metadata?: UserTaskMetadata;
}>;

export type CompleteUserTaskInstanceInteraction = DeepReadonly<{
  kind: StimulusKind.CompleteUserTaskInstance;
  taskId: UserTaskInstanceId;
}>;

export type DeliverMessageInteraction = DeepReadonly<{
  kind: StimulusKind.DeliverMessage;
  subscriptionId: MessageSubscriptionId;
  channel: import("./semantic-value-contract.js").MessageChannel;
}>;

export type RetryIncidentInteraction = DeepReadonly<{
  kind: StimulusKind.RetryIncident;
  incidentId: EffectIncidentId;
}>;

export type CancelIncidentProcessInteraction = DeepReadonly<{
  kind: StimulusKind.CancelIncidentProcess;
  processInstanceId: string;
  incidentId: EffectIncidentId;
}>;

export type EnabledInteraction =
  | CompleteUserTaskInstanceInteraction
  | DeliverMessageInteraction
  | RetryIncidentInteraction
  | CancelIncidentProcessInteraction;

export type OpenMessageSubscription = DeepReadonly<{
  id: MessageSubscriptionId;
  channel: import("./semantic-value-contract.js").MessageChannel;
}>;

export type OpenTimer = DeepReadonly<{
  id: TimerOccurrenceId;
  deadlineMs: number;
}>;

export type OpenEffect = DeepReadonly<{
  id: EffectOccurrenceId;
  descriptor: import("./semantic-value-contract.js").EffectDescriptor;
  arguments: VariableBinding[];
}>;

export type OpenEffectIncident = DeepReadonly<{
  kind: "effectExecutionFailed";
  id: EffectIncidentId;
  effect: OpenEffect;
}>;

export type StateObservation = DeepReadonly<{
  kind: CanonicalObservationKind.State;
  instanceId: string;
  status: ProcessStatus;
  activeWaits: ActiveWait[];
  openUserTasks: OpenUserTask[];
  openMessageSubscriptions: OpenMessageSubscription[];
  openTimers: OpenTimer[];
  openEffects: OpenEffect[];
  openIncidents: OpenEffectIncident[];
  variables: VariableBinding[];
  enabledInteractions: EnabledInteraction[];
  logicalTimeMs: number;
}>;

export type CanonicalObservation =
  | DeepReadonly<{
      kind: CanonicalObservationKind.Deployment;
      outcome: CommandOutcome;
    }>
  | DeepReadonly<{
      kind: CanonicalObservationKind.Command;
      commandId: string;
      outcome: CommandOutcome;
    }>
  | StateObservation;

export type BpmnResource = DeepReadonly<{
  id: string;
  relativePath: string;
  sha256: string;
  sourceOverlay: SourceOverlayIdentity | null;
}>;

export type Scenario = DeepReadonly<{
  kind: ScenarioDocumentKind.Scenario;
  id: string;
  profile: string;
  bpmn: BpmnResource;
  stimuli: Stimulus[];
  observations: ObservationRequestKind[];
  provenance: {
    normativeRefs: string[];
    cibRevision: string;
    cibRefs: string[];
  };
}>;

export type ScenarioResult = DeepReadonly<{
  outcome: ScenarioOutcome;
  trace: CanonicalObservation[];
}>;
