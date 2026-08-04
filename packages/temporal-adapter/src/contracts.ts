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
  StartProcessStimulus,
  StateObservation,
  UserTaskInstanceId,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import type {
  EffectExecutionSchedule,
  EffectProbeEvidence,
} from "./effect-probe.js";

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
export const bpmnSemanticTaskQueue = "bpmn-semantic";

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
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  finalState: StateObservation & {
    status: ProcessStatus.Completed;
  };
  messageDeliveryRecords: MessageDeliveryRecord[];
}>;

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
      receipt: CompletedProcessReceipt;
    }>
  | DeepReadonly<{
      kind: ProcessCommandResultKind.ProcessUnknown;
      commandId: string;
      processInstanceId: string;
    }>;

export type BpmnProcessWorkflow = (
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
) => Promise<CompletedProcessReceipt>;

export type TemporalScenarioRunnerOptions = DeepReadonly<{
  /** Overrides the pinned `temporalCliVersion`. */
  cliVersion?: string;
  downloadDirectory: string;
}>;

export type TemporalTimeSkippingRunnerOptions = DeepReadonly<{
  downloadDirectory: string;
}>;

export enum TemporalCompletionDelivery {
  Ordered = "ordered",
  PostTerminal = "postTerminal",
  AcceptedBatch = "acceptedBatch",
  Concurrent = "concurrent",
}

export enum TemporalExecutionSchedule {
  Normal = "normal",
  DuplicateFirstCompletion = "duplicateFirstCompletion",
  WorkerDownAtTimerDue = "workerDownAtTimerDue",
  WorkerDownAtEffectPending = "workerDownAtEffectPending",
}

export type TemporalScenarioExecutionOptions = DeepReadonly<{
  workflowId: string;
  completionDelivery: TemporalCompletionDelivery;
  executionSchedule: TemporalExecutionSchedule;
  effectExecutionSchedule: EffectExecutionSchedule | null;
}>;

export type TemporalScenarioBatchItem = DeepReadonly<{
  scenario: Scenario;
  semanticProcess: SemanticProcessProgram;
  options: TemporalScenarioExecutionOptions;
}>;

export type TemporalHistory = DeepReadonly<{
  events: unknown[];
}>;

export type TemporalReplayItem = DeepReadonly<{
  history: unknown;
  workflowId: string;
}>;

export type TemporalScenarioExecution = DeepReadonly<{
  waitTrace: CanonicalObservation[];
  interactionEvidence: TemporalInteractionEvidence;
  result: ScenarioResult;
  receipt: CompletedProcessReceipt | null;
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence | null;
}>;

export type TemporalTimerBypassMutationExecution = DeepReadonly<{
  result: ScenarioResult;
  receipt: CompletedProcessReceipt;
  history: TemporalHistory;
}>;

export type TemporalEffectBypassMutationExecution =
  TemporalTimerBypassMutationExecution;

export type TemporalBranchBypassMutationExecution = DeepReadonly<{
  waitTrace: CanonicalObservation[];
  history: TemporalHistory;
}>;

export type TemporalScopeBypassMutationExecution = DeepReadonly<{
  trace: CanonicalObservation[];
  history: TemporalHistory;
  completionOutcome: CommandOutcome;
}>;

export type TemporalErrorPropagationBypassMutationExecution = DeepReadonly<{
  trace: CanonicalObservation[];
  history: TemporalHistory;
  completionOutcome: CommandOutcome;
  discriminatorOutcome: CommandOutcome;
}>;

export type TemporalEffectFailureExecution = DeepReadonly<{
  failureType: "BPMN_EFFECT_EXECUTION_EXHAUSTED";
  lastCommittedTrace: CanonicalObservation[];
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence;
}>;

export type TemporalUnhandledBpmnErrorExecution = DeepReadonly<{
  failureType: "BPMN_UNHANDLED_BPMN_ERROR";
  lastCommittedTrace: CanonicalObservation[];
  history: TemporalHistory;
  effectProbeEvidence: EffectProbeEvidence;
  returnedResult: import("@bpmn-lean/semantic-core").EffectExecutionResult;
}>;

export type TemporalSharedEffectExecutions = DeepReadonly<{
  executions: TemporalScenarioExecution[];
  effectProbeEvidence: EffectProbeEvidence;
}>;

export type TemporalInteractionEvidence = DeepReadonly<{
  openUserTasksAtWait: OpenUserTask[];
  openTimersAtWait: OpenTimer[];
  openEffectsAtWait: OpenEffect[];
  openUserTasksAfterCompletions: OpenUserTask[][];
  completionOutcomes: CommandOutcome[];
  duplicateCompletionOutcome: CommandOutcome | null;
  postTerminalResult: ProcessCommandResult | null;
}>;

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
