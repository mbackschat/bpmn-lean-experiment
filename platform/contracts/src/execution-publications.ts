import type { DeepReadonly } from "@bpmn-lean/contract-types";
import type { PublicProcessInstanceIdentity } from "./process-instances.js";

export const executionPublicationExportFormat =
  "bpmn-lean.execution-publication.v1" as const;

export type ExecutionPublicationSourceOverlayIdentity = DeepReadonly<{
  id: string;
  sha256: string;
}>;

/** Exact Product 1 semantic definition identity, with no deployed-version or host facts. */
export type ExecutionPublicationDefinitionIdentity = DeepReadonly<{
  compiler: "bpmn-source-semantic-process";
  semanticProfile: string;
  sourceId: string;
  sourceSha256: string;
  sourceOverlay: ExecutionPublicationSourceOverlayIdentity | null;
}>;

export type ExecutionPublicationIdentity = DeepReadonly<{
  definition: ExecutionPublicationDefinitionIdentity;
  processId: string;
  processInstanceId: string;
}>;

/** Maps the current exact admitted Product 2 definition to Product 1 publication identity. */
export function executionPublicationIdentityForPublicProcessInstance(
  instance: PublicProcessInstanceIdentity,
): ExecutionPublicationIdentity {
  return {
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: instance.definition.semanticProfile,
      sourceId: instance.definition.source.id,
      sourceSha256: instance.definition.source.sha256,
      sourceOverlay: null,
    },
    processId: instance.definition.processId,
    processInstanceId: instance.processInstanceId,
  };
}

export type ExecutionPublicationRequest = DeepReadonly<{
  afterRevision: number;
  limit?: number;
}>;

export type ExecutionPublicationDecodeContext = DeepReadonly<
  ExecutionPublicationIdentity & ExecutionPublicationRequest
>;

export type ScopeOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  definitionScopeId: string;
  activation: number;
}>;

export type OccurrenceId = DeepReadonly<{
  processInstanceId: string;
  elementId: string;
  activation: number;
}>;

/** Exact Product 1 Activity occurrence identity, distinct from an inner task occurrence. */
export type ActivityOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  activityElementId: string;
  activation: number;
}>;

export const VariableValueKind = {
  Boolean: "boolean",
  Integer: "integer",
  String: "string",
  StringList: "stringList",
  Null: "null",
} as const;

export type VariableValue = DeepReadonly<
  | { kind: typeof VariableValueKind.Boolean; value: boolean }
  | { kind: typeof VariableValueKind.Integer; value: number }
  | { kind: typeof VariableValueKind.String; value: string }
  | { kind: typeof VariableValueKind.StringList; value: string[] }
  | { kind: typeof VariableValueKind.Null }
>;

export type VariableBinding = DeepReadonly<{
  name: string;
  value: VariableValue;
}>;

export const MessageChannelKind = {
  OperationMessage: "operationMessage",
  DirectMessage: "directMessage",
} as const;

export type MessageChannel = DeepReadonly<
  | {
      kind: typeof MessageChannelKind.OperationMessage;
      interfaceId: string;
      interfaceOperationId: string;
      messageId: string;
    }
  | { kind: typeof MessageChannelKind.DirectMessage; messageId: string }
>;

export type EffectIncidentId = DeepReadonly<{
  effectId: OccurrenceId;
  generation: 1;
}>;

export const EffectExecutionResultKind = {
  Success: "success",
  BpmnError: "bpmnError",
} as const;

export type EffectExecutionResult = DeepReadonly<
  | {
      kind: typeof EffectExecutionResultKind.Success;
      localPatch: VariableBinding[];
    }
  | {
      kind: typeof EffectExecutionResultKind.BpmnError;
      code: string;
      message: string | null;
      localPatch: VariableBinding[];
    }
>;

export const StimulusKind = {
  StartProcess: "startProcess",
  TriggerMessageStart: "triggerMessageStart",
  TriggerTimerStart: "triggerTimerStart",
  CompleteUserTaskInstance: "completeUserTaskInstance",
  DeliverMessage: "deliverMessage",
  FireTimer: "fireTimer",
  CompleteEffect: "completeEffect",
  ReportEffectFailure: "reportEffectFailure",
  RetryIncident: "retryIncident",
  CancelIncidentProcess: "cancelIncidentProcess",
} as const;

export type Stimulus = DeepReadonly<
  | {
      kind: typeof StimulusKind.StartProcess;
      commandId: string;
      processId: string;
      instanceId: string;
      initialVariables: VariableBinding[];
    }
  | {
      kind: typeof StimulusKind.TriggerMessageStart;
      commandId: string;
      processId: string;
      instanceId: string;
      startEventId: string;
      channel: Extract<MessageChannel, { kind: "operationMessage" }>;
    }
  | {
      kind: typeof StimulusKind.TriggerTimerStart;
      commandId: string;
      processId: string;
      instanceId: string;
      startEventId: string;
    }
  | {
      kind: typeof StimulusKind.CompleteUserTaskInstance;
      commandId: string;
      taskId: OccurrenceId;
      submittedValues: VariableBinding[];
    }
  | {
      kind: typeof StimulusKind.DeliverMessage;
      commandId: string;
      subscriptionId: OccurrenceId;
      channel: MessageChannel;
    }
  | {
      kind: typeof StimulusKind.FireTimer;
      commandId: string;
      timerId: OccurrenceId;
      logicalTimeMs: number;
    }
  | {
      kind: typeof StimulusKind.CompleteEffect;
      commandId: string;
      effectId: OccurrenceId;
      result: EffectExecutionResult;
    }
  | {
      kind: typeof StimulusKind.ReportEffectFailure;
      commandId: string;
      effectId: OccurrenceId;
      generation: 1;
    }
  | {
      kind: typeof StimulusKind.RetryIncident;
      commandId: string;
      incidentId: EffectIncidentId;
    }
  | {
      kind: typeof StimulusKind.CancelIncidentProcess;
      commandId: string;
      processInstanceId: string;
      incidentId: EffectIncidentId;
    }
>;

export const SemanticOperationKind = {
  Initiate: "initiate",
  InitiateMessage: "initiateMessage",
  InitiateTimer: "initiateTimer",
  EnterScope: "enterScope",
  EnterBoundedScope: "enterBoundedScope",
  InvokeProcess: "invokeProcess",
  ReturnProcess: "returnProcess",
  AwaitUserTask: "awaitUserTask",
  AwaitBoundedUserTask: "awaitBoundedUserTask",
  AwaitMonitoredUserTask: "awaitMonitoredUserTask",
  AwaitSequentialMultiInstanceUserTask: "awaitSequentialMultiInstanceUserTask",
  AwaitParallelMultiInstanceUserTask: "awaitParallelMultiInstanceUserTask",
  AwaitMessage: "awaitMessage",
  AwaitTimer: "awaitTimer",
  AwaitEffect: "awaitEffect",
  Duplicate: "duplicate",
  Synchronize: "synchronize",
  MergeExclusive: "mergeExclusive",
  Choose: "choose",
  SelectMany: "selectMany",
  SynchronizeSelected: "synchronizeSelected",
  AwaitEventRace: "awaitEventRace",
  ThrowError: "throwError",
  TerminateScope: "terminateScope",
  ReachNoneEnd: "reachNoneEnd",
  CompleteScope: "completeScope",
} as const;

export type SemanticOperationKind =
  typeof SemanticOperationKind[keyof typeof SemanticOperationKind];

export type BpmnElementOrigin = DeepReadonly<{
  kind: "bpmnElement";
  elementId: string;
}>;

export const SemanticTransitionKind = {
  ExternalStimulus: "externalStimulus",
  InternalOperation: "internalOperation",
} as const;

export type CommittedTransition = DeepReadonly<
  | {
      kind: typeof SemanticTransitionKind.ExternalStimulus;
      stimulus: Stimulus;
    }
  | {
      kind: typeof SemanticTransitionKind.InternalOperation;
      operationId: string;
      operationKind: SemanticOperationKind;
      origin: BpmnElementOrigin;
      owner: ScopeOccurrenceId;
    }
>;

export type PublicControlTokenPosition = DeepReadonly<{
  sequenceFlowId: string;
  owner: ScopeOccurrenceId;
  multiplicity: number;
}>;

export type PublicScopePosition = DeepReadonly<{
  id: ScopeOccurrenceId;
  parent: ScopeOccurrenceId | null;
  bpmnElementId: string;
}>;

export type PublicControlPositionDelta = DeepReadonly<{
  consumedTokens: PublicControlTokenPosition[];
  producedTokens: PublicControlTokenPosition[];
  enteredScopes: PublicScopePosition[];
  exitedScopes: PublicScopePosition[];
}>;

export const ProcessStatus = {
  Running: "running",
  Completed: "completed",
  Cancelled: "cancelled",
} as const;

export type ProcessStatus = typeof ProcessStatus[keyof typeof ProcessStatus];

export const WaitKind = {
  UserTask: "userTask",
  Message: "message",
  Timer: "timer",
  Effect: "effect",
  Incident: "incident",
} as const;

export type ActiveWait = DeepReadonly<{
  elementId: string;
  kind: typeof WaitKind[keyof typeof WaitKind];
  multiplicity: number;
}>;

export type UserTaskMetadata = DeepReadonly<{
  assignment: { candidates: [{ kind: "group"; id: string }] };
  form: { fields: [{ key: string; type: "string" | "boolean" }] };
}>;

export type OpenUserTask = DeepReadonly<{
  id: OccurrenceId;
  name: string | null;
  state: "active";
  metadata?: UserTaskMetadata;
}>;

export type OpenMessageSubscription = DeepReadonly<{
  id: OccurrenceId;
  channel: MessageChannel;
}>;

export type OpenTimer = DeepReadonly<{
  id: OccurrenceId;
  deadlineMs: number;
}>;

export type OpenEffect = DeepReadonly<{
  id: OccurrenceId;
  descriptor: { protocol: string; operation: string };
  arguments: VariableBinding[];
}>;

export type OpenEffectIncident = DeepReadonly<{
  kind: "effectExecutionFailed";
  id: EffectIncidentId;
  effect: OpenEffect;
}>;

export type OpenSequentialMultiInstanceIteration = DeepReadonly<{
  loopCounter: number;
  taskId: OccurrenceId;
  taskInput: VariableBinding;
  completionBindingName: string;
}>;

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

export type EnabledInteraction = DeepReadonly<
  | { kind: typeof StimulusKind.CompleteUserTaskInstance; taskId: OccurrenceId }
  | {
      kind: typeof StimulusKind.DeliverMessage;
      subscriptionId: OccurrenceId;
      channel: MessageChannel;
    }
  | { kind: typeof StimulusKind.RetryIncident; incidentId: EffectIncidentId }
  | {
      kind: typeof StimulusKind.CancelIncidentProcess;
      processInstanceId: string;
      incidentId: EffectIncidentId;
    }
>;

/** The complete producer-owned state key census accepted by the strict Product 2 decoder. */
export const executionPublicationStateAcceptedKeys = [
  "kind", "instanceId", "status", "activeWaits", "openUserTasks",
  "openMessageSubscriptions", "openTimers", "openEffects", "openIncidents",
  "openMultiInstances", "variables", "enabledInteractions", "logicalTimeMs",
] as const;

export type StateObservation = DeepReadonly<{
  kind: "state";
  instanceId: string;
  status: ProcessStatus;
  activeWaits: ActiveWait[];
  openUserTasks: OpenUserTask[];
  openMessageSubscriptions: OpenMessageSubscription[];
  openTimers: OpenTimer[];
  openEffects: OpenEffect[];
  openIncidents: OpenEffectIncident[];
  openMultiInstances?: OpenMultiInstance[];
  variables: VariableBinding[];
  enabledInteractions: EnabledInteraction[];
  logicalTimeMs: number;
}>;

export type CommittedTransitionRecord = DeepReadonly<{
  revision: number;
  logicalTimeMs: number;
  transition: CommittedTransition;
  positionDelta: PublicControlPositionDelta;
}>;

export type CommittedTransitionBatch = DeepReadonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  transitions: [CommittedTransitionRecord, ...CommittedTransitionRecord[]];
}>;

export type CurrentCommittedExecution = DeepReadonly<{
  revision: number;
  state: StateObservation;
  controlTokens: PublicControlTokenPosition[];
  scopes: PublicScopePosition[];
}>;

export type ExecutionPublicationPage = DeepReadonly<
  ExecutionPublicationIdentity & {
    requestedAfterRevision: number;
    pageThroughRevision: number;
    headRevision: number;
    batches: CommittedTransitionBatch[];
    current: CurrentCommittedExecution | null;
  }
>;

export const ExecutionPublicationResultKind = {
  Available: "available",
  NotReady: "notReady",
  NotFound: "notFound",
  Unavailable: "unavailable",
  Gap: "gap",
} as const;

export type ExecutionPublicationResult = DeepReadonly<
  | {
      kind: typeof ExecutionPublicationResultKind.Available;
      page: ExecutionPublicationPage;
    }
  | { kind: typeof ExecutionPublicationResultKind.NotReady }
  | { kind: typeof ExecutionPublicationResultKind.NotFound }
  | { kind: typeof ExecutionPublicationResultKind.Unavailable }
  | { kind: typeof ExecutionPublicationResultKind.Gap }
>;

export type ExecutionPublicationExport = DeepReadonly<
  ExecutionPublicationIdentity & {
    format: typeof executionPublicationExportFormat;
    headRevision: number;
    batches: [CommittedTransitionBatch, ...CommittedTransitionBatch[]];
    current: CurrentCommittedExecution;
  }
>;
