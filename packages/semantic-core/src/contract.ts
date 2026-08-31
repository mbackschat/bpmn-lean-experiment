import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import type { DeepReadonly } from "./deep-readonly.js";
import type { UserTaskMetadata } from "./user-task-metadata.js";
import type { SourceOverlayIdentity } from "./source-overlay-identity.js";
import {
  CorrelatedMessageInteractionKind,
} from "./message-key-correlation.js";
import type {
  CorrelatedMessageAddress,
} from "./message-key-correlation.js";
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
  DeliverPayloadMessage = "deliverPayloadMessage",
  DeliverCorrelatedPayloadMessage = "deliverCorrelatedPayloadMessage",
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

/**
 * Delivers one Message together with the single payload value its subscription declares.
 *
 * A separate arm rather than an optional `payload` on `DeliverMessageStimulus`, so an absent payload
 * is a choice of arm instead of a null at a field. That keeps a delivered explicit null a payload
 * whose kind is null, which is the same presence-of-binding discipline the Activity data capsules
 * use, and leaves every existing `deliverMessage` producer and consumer byte-identical.
 *
 * The payload participates in content-bound command identity. Two deliveries that differ only in
 * payload are semantically distinct commands, so a host deriving an identity from `commandId` and
 * `subscriptionId` alone would deduplicate the second into the first and lose a transition no public
 * observation could recover.
 */
export type DeliverPayloadMessageStimulus = DeepReadonly<{
  kind: StimulusKind.DeliverPayloadMessage;
  commandId: string;
  subscriptionId: MessageSubscriptionId;
  channel: import("./semantic-value-contract.js").MessageChannel;
  payload: VariableValue;
}>;

/** Private target delivery selected by the global pure matcher and fixed durable ingress ordinal. */
export type DeliverCorrelatedPayloadMessageStimulus = DeepReadonly<{
  kind: StimulusKind.DeliverCorrelatedPayloadMessage;
  commandId: string;
  address: CorrelatedMessageAddress;
  ingressOrdinal: number;
  subscriptionId: MessageSubscriptionId;
  correlationPropertyId: string;
  processPropertyId: string;
  payload: Extract<VariableValue, { kind: VariableValueKind.String }>;
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
  | DeliverPayloadMessageStimulus
  | DeliverCorrelatedPayloadMessageStimulus
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
  OpenMultiInstances = "openMultiInstances",
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
  /**
   * The Activity DataInputs this task occurrence was activated with, when its program declares any.
   *
   * Present exactly for a task whose program fills an Activity data interface, and absent otherwise,
   * so every existing profile's canonical observation bytes are unchanged. Each binding's `name` is
   * the exact BPMN DataInput `id` and its value is the copy taken when the Activity became active.
   *
   * This is an engine observation of selected BPMN DataInput state, not a form schema, an
   * authorization decision, or a view of general Activity-local variables, which stay private. A
   * consumer must read it from this field rather than reconstruct it from a start payload, the
   * definition XML, or a difference between two observed states.
   */
  inputs?: [VariableBinding];
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

/**
 * The interaction a payload-declaring subscription publishes instead of `deliverMessage`.
 *
 * This is what makes the refusal of a payload-free delivery legible: a caller reads the requirement
 * from the published contract rather than discovering it by being refused. The wait itself keeps its
 * existing shape, so the two dispositions are distinguished here and nowhere else.
 */
export type DeliverPayloadMessageInteraction = DeepReadonly<{
  kind: StimulusKind.DeliverPayloadMessage;
  subscriptionId: MessageSubscriptionId;
  channel: import("./semantic-value-contract.js").MessageChannel;
}>;

/** Global definition-addressed interaction; the caller supplies no Process-instance target. */
export type PublishCorrelatedPayloadMessageInteraction = DeepReadonly<{
  kind: typeof CorrelatedMessageInteractionKind.PublishCorrelatedPayloadMessage;
  address: CorrelatedMessageAddress;
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
  | DeliverPayloadMessageInteraction
  | PublishCorrelatedPayloadMessageInteraction
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

/**
 * One iteration of an open sequential Multi-Instance Activity.
 *
 * An array rather than a nullable singleton so a later parallel profile can broaden the cardinality
 * without replacing the identity or the observation concept. The sequential profile validates exactly
 * one entry whenever a controller is open.
 *
 * `taskInput.name` is the exact scalar task DataInput ID and its value is the snapshot item at
 * `loopCounter`; `completionBindingName` is the exact scalar task DataOutput ID a completion must use.
 * Neither exposes the private snapshot or any output slot.
 */
export type OpenSequentialMultiInstanceIteration = DeepReadonly<{
  loopCounter: number;
  taskId: UserTaskInstanceId;
  taskInput: VariableBinding;
  completionBindingName: string;
}>;

/**
 * The stable progress of one open sequential Multi-Instance Activity.
 *
 * Every count here is derived from committed state rather than stored beside it: `planned` is the
 * immutable snapshot's length, `completed` and the active loop counter are the filled-slot count,
 * `active` is read from the Activity occurrence record's body, `pending` is the remaining difference
 * truncated at zero, and `terminated` is zero because interruption removes the controller in the
 * transition that terminates the active instance. `numberOfInstances` is the sum of `active`,
 * `completed`, and `terminated`, so Table 10.30's identity is arithmetic rather than an agreement
 * between the controller and the record, which are two structures a state can make disagree.
 */
export type OpenSequentialMultiInstance = DeepReadonly<{
  id: ActivityOccurrenceId;
  mode: "sequential";
  plannedInstanceCount: number;
  pendingItemCount: number;
  numberOfInstances: number;
  numberOfActiveInstances: number;
  numberOfCompletedInstances: number;
  numberOfTerminatedInstances: number;
  activeIterations: OpenSequentialMultiInstanceIteration[];
}>;

export type OpenParallelMultiInstanceIteration =
  OpenSequentialMultiInstanceIteration;

/** Stable progress for one parallel Multi-Instance Activity with index-owned live children. */
export type OpenParallelMultiInstance = DeepReadonly<{
  id: ActivityOccurrenceId;
  mode: "parallel";
  plannedInstanceCount: number;
  pendingItemCount: 0;
  numberOfInstances: number;
  numberOfActiveInstances: number;
  numberOfCompletedInstances: number;
  numberOfTerminatedInstances: 0;
  activeIterations: OpenParallelMultiInstanceIteration[];
}>;

export type OpenMultiInstance =
  | OpenSequentialMultiInstance
  | OpenParallelMultiInstance;

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
  /**
   * Present exactly when the current program declares a supported Multi-Instance Activity.
   *
   * Presence is a *program* property, not a profile-registration one, which is what keeps every
   * existing profile's canonical observation bytes unchanged: a program with no such Activity omits the
   * key entirely rather than carrying an empty array. Under a program that has one it is always
   * present, including as an empty array before outer entry and after either closing route, so the
   * profile has no ambiguous missing-controller observation.
   *
   * A consumer must validate it recursively and must never infer Multi-Instance state from
   * `openUserTasks`, `openTimers`, occurrence history, or a difference between two states.
   */
  openMultiInstances?: OpenMultiInstance[];
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
