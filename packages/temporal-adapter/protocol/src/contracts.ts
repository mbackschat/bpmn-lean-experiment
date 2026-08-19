import type {
  CanonicalObservation,
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  DeliverMessageStimulus,
  OpenEffect,
  OpenTimer,
  OpenUserTask,
  ProcessStatus,
  Scenario,
  ScenarioResult,
  SemanticProcessIdentity,
  SemanticProcessProgram,
  ProcessStartStimulus,
  StateObservation,
  UserTaskInstanceId,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

export const bpmnProcessWorkflowType = "runBpmnProcess";
export const bpmnTraceQueryName = "bpmn-trace";
export const bpmnOpenUserTasksQueryName = "bpmn-open-user-tasks";
export const bpmnUserTaskDetailQueryName = "bpmn-user-task-detail";
export const bpmnCompleteUserTaskUpdateName = "bpmn-complete-user-task";
export const bpmnDeliverMessageSignalName = "bpmn-deliver-message";
export const bpmnMessageDeliveryResultQueryName =
  "bpmn-message-delivery-result";
export const bpmnEventRaceOrderingUnavailableFailureType =
  "BpmnEventRaceOrderingUnavailable";
/**
 * Distinct from the Event race identity on purpose: it names a different host class whose
 * coalescing premise is licensed by a different SDK fact, so overloading one identity would make a
 * defect in either class invisible in both.
 */
export const bpmnBoundedActivitySchedulerUnavailableFailureType =
  "BpmnBoundedActivitySchedulerUnavailable";
/**
 * Distinct from the bounded-Activity identity for the same reason that one is distinct from the
 * Event race: both are one wait racing one deadline, but the semantic outcome an operator loses
 * differs. Here the losing arm is a whole child region reaching quiescence rather than one task
 * completion, so a shared identity would leave a defect in either family invisible in both.
 */
export const bpmnBoundedScopeSchedulerUnavailableFailureType =
  "BpmnBoundedScopeSchedulerUnavailable";
/**
 * Distinct from both bounded identities, because the outcome an operator loses is not an end.
 *
 * A monitored deadline never terminates anything: what fails to happen is a handler branch that
 * never starts beside a task that keeps running normally. Sharing an identity with either bounded
 * family would report the one host failure whose symptom is a *missing* branch as one whose symptom
 * is a branch that never finished.
 */
export const bpmnMonitoredActivitySchedulerUnavailableFailureType =
  "BpmnMonitoredActivitySchedulerUnavailable";
export const bpmnSemanticTaskQueue = "bpmn-semantic";
export const processTerminalReceiptFormatV1 =
  "bpmn-lean.process-terminal-receipt.v1" as const;

export enum TemporalHostCapabilityResultKind {
  Admitted = "admitted",
  Rejected = "rejected",
}

export enum TemporalHostAdmissionFailureCode {
  ConcurrentHostDrivenWaits = "concurrentHostDrivenWaits",
  EventRaceSchedulerUnavailable = "eventRaceSchedulerUnavailable",
  /**
   * Deliberately distinct from `EventRaceSchedulerUnavailable`.
   *
   * The bounded-Activity scheduler and the Event-Based Gateway race share a barrier but not the fact
   * that licenses it, so one code per host class keeps the two separately falsifiable.
   */
  BoundedActivitySchedulerUnavailable = "boundedActivitySchedulerUnavailable",
  /**
   * Deliberately distinct from `BoundedActivitySchedulerUnavailable`.
   *
   * Both are one Activity racing one deadline, but the contract an operator loses is different: here
   * the losing arm is a whole child region reaching quiescence, not one task completion, so a shared
   * code would report an unavailable scheduler without saying which semantic outcome is unreachable.
   */
  BoundedScopeSchedulerUnavailable = "boundedScopeSchedulerUnavailable",
  /**
   * Deliberately distinct from both bounded codes.
   *
   * Neither bounded family can reach the state this one loses: a deadline that fires while its host
   * keeps running. Reporting it as a bounded failure would say a race had no scheduler, when what
   * has no scheduler is the spawn of a concurrent branch.
   */
  MonitoredActivitySchedulerUnavailable = "monitoredActivitySchedulerUnavailable",
  /**
   * Not a missing scheduler: a missing semantics.
   *
   * The other codes report an operation the host cannot schedule in the offered composition. This one
   * reports an operation no host can run at all, because the contract admits its shape before its
   * runtime transition exists. It is reported separately so an operator is not told to simplify a
   * composition that would still be unrunnable alone.
   */
  UnsupportedOperationSemantics = "unsupportedOperationSemantics",
}

export type TemporalHostAdmissionFailure = DeepReadonly<{
  code: TemporalHostAdmissionFailureCode;
  evidence: string;
}>;

export type TemporalHostCapabilityResult =
  | DeepReadonly<{
      kind: TemporalHostCapabilityResultKind.Admitted;
    }>
  | DeepReadonly<{
      kind: TemporalHostCapabilityResultKind.Rejected;
      failure: TemporalHostAdmissionFailure;
    }>;

export type CompletedProcessReceipt = DeepReadonly<{
  format: typeof processTerminalReceiptFormatV1;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  finalState: StateObservation & {
    status: ProcessStatus.Completed;
  };
}>;

export type CancelledProcessReceipt = DeepReadonly<{
  format: typeof processTerminalReceiptFormatV1;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  finalState: StateObservation & {
    status: ProcessStatus.Cancelled;
  };
}>;

export type TerminalProcessReceipt =
  | CompletedProcessReceipt
  | CancelledProcessReceipt;

/** Caller-selected detail for one exact currently open semantic User Task. */
export type UserTaskDetailRequest = DeepReadonly<{
  taskId: UserTaskInstanceId;
  inputVariableNames: string[];
}>;

export type UserTaskDetail = DeepReadonly<{
  task: OpenUserTask;
  inputVariables: VariableBinding[];
}>;

export const MessageDeliveryResolutionKind = {
  Pending: "pending",
  Semantic: "semantic",
  RequestFailure: "requestFailure",
} as const;

export type MessageDeliveryResolutionKind =
  typeof MessageDeliveryResolutionKind[
    keyof typeof MessageDeliveryResolutionKind
  ];

export type MessageDeliveryResolution = DeepReadonly<
  | {
      kind: typeof MessageDeliveryResolutionKind.Pending;
      stimulus: DeliverMessageStimulus;
    }
  | {
      kind: typeof MessageDeliveryResolutionKind.Semantic;
      stimulus: DeliverMessageStimulus;
      outcome: CommandOutcome;
    }
  | {
      kind: typeof MessageDeliveryResolutionKind.RequestFailure;
      stimulus: DeliverMessageStimulus;
      failure: "commandIdentityConflict";
    }
>;

export type MessageDeliveryRecord = Exclude<
  MessageDeliveryResolution,
  { kind: typeof MessageDeliveryResolutionKind.Pending }
>;

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
      receipt: TerminalProcessReceipt;
    }>
  | DeepReadonly<{
      kind: ProcessCommandResultKind.ProcessUnknown;
      commandId: string;
      processInstanceId: string;
    }>;

export type BpmnProcessWorkflow = (
  start: ProcessStartStimulus,
  semanticProcess: SemanticProcessProgram,
  hostInput?: import("./workflow-continuation.js").BpmnWorkflowHostInputV1,
  carriedState?: import("./workflow-continuation.js").BpmnWorkflowContinuationStateV1,
  carriedRecovery?: import("./workflow-continuation.js").BpmnWorkflowContinuationRecoveryV1,
  carriedPublication?: import("./workflow-continuation.js").BpmnWorkflowContinuationPublicationV1,
) => Promise<unknown>;

export type BpmnCompleteUserTaskUpdateArguments = [
  stimulus: CompleteUserTaskInstanceStimulus,
];

export type BpmnUserTaskDetailQueryArguments = [
  request: UserTaskDetailRequest,
];

export type BpmnDeliverMessageSignalArguments = [
  stimulus: DeliverMessageStimulus,
];

export type BpmnMessageDeliveryResultQueryArguments = [
  stimulus: DeliverMessageStimulus,
];
