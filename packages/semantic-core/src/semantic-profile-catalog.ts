/** Product-registered semantic profiles available to ordinary execution admission. */
export const SemanticProfileId = Object.freeze({
  ActivityBoundaryMessage:
    "bpmn-2.0.2-activity-boundary-message-draft",
  ActivityBoundaryTimer:
    "bpmn-2.0.2-activity-boundary-timer-draft",
  ActivityDataInputUserTask:
    "bpmn-2.0.2-activity-data-input-user-task-draft",
  ActivityDataOutputUserTask:
    "bpmn-2.0.2-activity-data-output-user-task-draft",
  SequentialMultiInstanceUserTask:
    "bpmn-2.0.2-sequential-multi-instance-user-task-draft",
  ParallelMultiInstanceUserTask:
    "bpmn-2.0.2-parallel-multi-instance-user-task-draft",
  MappedBoundaryErrorServiceTask:
    "cibseven-2.0.0-mapped-boundary-error-service-task-draft",
  CalledProcessCallActivity:
    "bpmn-2.0.2-called-process-call-activity-draft",
  MappedSuccessServiceTask:
    "cibseven-2.0.0-mapped-success-service-task-draft",
  MessageStart: "bpmn-2.0.2-message-start-event-draft",
  TimerStart: "bpmn-2.0.2-timer-start-event-draft",
  TerminateEnd: "bpmn-2.0.2-terminate-end-event-draft",
  EmbeddedSubProcessCompletion:
    "cibseven-2.2.0-embedded-subprocess-completion-draft",
  SubProcessBoundaryTimer:
    "bpmn-2.0.2-subprocess-boundary-timer-draft",
  SubProcessErrorPropagation:
    "cibseven-2.2.0-subprocess-error-propagation-draft",
  ExclusiveGatewaySimpleBoolean:
    "bpmn-2.0.2-simple-boolean-exclusive-gateway-draft",
  InclusiveGatewaySelectedBranches:
    "bpmn-2.0.2-inclusive-gateway-selected-branches-draft",
  EventBasedGatewayMessageTimer:
    "bpmn-2.0.2-event-based-gateway-message-timer-draft",
  IntermediateCatchTimer:
    "cibseven-2.2.0-intermediate-catch-timer-draft",
  IntermediateCatchMessage:
    "bpmn-2.0.2-intermediate-catch-message-draft",
  MessagePayloadCatch:
    "bpmn-2.0.2-message-payload-catch-draft",
  MessageAddressedReceiveTask:
    "cibseven-2.2.0-message-addressed-receive-task-draft",
  NonInterruptingBoundaryTimer:
    "bpmn-2.0.2-non-interrupting-boundary-timer-draft",
  ParallelForkJoin: "parallel-fork-join-draft",
  ServiceTaskEffect: "cibseven-2.2.0-service-task-effect-draft",
  ServiceTaskIncident:
    "cibseven-2.2.0-service-task-incident-draft",
  ServiceTaskIncidentCancellation:
    "cibseven-2.2.0-service-task-incident-cancellation-draft",
  TimerUserTaskComposition:
    "bpmn-2.0.2-timer-user-task-composition-draft",
  UserTask: "cibseven-2.2.0-user-task-process-data-draft",
  UserTaskCycle: "bpmn-2.0.2-user-task-cycle-draft",
  UserTaskPreservedNotation:
    "bpmn-2.0.2-user-task-preserved-notation-draft",
  UserTaskProcessDataPreservedNotation:
    "cibseven-2.2.0-user-task-process-data-preserved-notation-draft",
  ConfiguredTask:
    "bpmn-2.0.2-bpmn-lean-configured-task-effect-draft",
  UserTaskBooleanCompletionData:
    "cibseven-2.2.0-user-task-boolean-completion-data-draft",
  UserTaskAssignmentFormMetadata:
    "cibseven-2.2.0-user-task-assignment-form-metadata-draft",
  ParallelUserTaskAssignmentFormMetadata:
    "cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft",
  StructuredHumanWork:
    "bpmn-2.0.2-bpmn-lean-structured-human-work-draft",
} as const);

/** Admission-only identity held outside the product registry until its host lane is reviewed. */
export const MESSAGE_KEY_CORRELATION_CHECKPOINT_PROFILE_ID =
  "bpmn-2.0.2-message-key-correlation-draft" as const;

/** Transition alias retained while closure lanes migrate to the registered catalog member. */
export const SERVICE_TASK_INCIDENT_CHECKPOINT_PROFILE_ID =
  SemanticProfileId.ServiceTaskIncident;
