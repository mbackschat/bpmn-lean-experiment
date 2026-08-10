import BpmnSemantics.SemanticProcess

/-! # Message Start Event conformance

This module owns the exact standards-only Message Start checkpoint fixture and its proved admission, lowering, transition, identity-refusal, closure, and scenario-ordering laws. It covers one operation-addressed, payload-free Message Start Event followed by one User Task and a None End Event. Routing, subscriptions, Message Flow, multiple starts, and Temporal identity remain outside this account.
-/

namespace BpmnSemantics.MessageStartConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  messageStartProfileId

def channel : MessageChannel :=
  .operationMessage
    ⟨"Interface_ProcessMessages"⟩
    ⟨"Operation_ReceiveApprovalRequest"⟩
    ⟨"Message_ApprovalRequest"⟩

def wrongMessageChannel : MessageChannel :=
  .operationMessage
    ⟨"Interface_ProcessMessages"⟩
    ⟨"Operation_ReceiveApprovalRequest"⟩
    ⟨"Message_Wrong"⟩

def wrongInterfaceChannel : MessageChannel :=
  .operationMessage
    ⟨"Interface_Wrong"⟩
    ⟨"Operation_ReceiveApprovalRequest"⟩
    ⟨"Message_ApprovalRequest"⟩

def wrongInterfaceOperationChannel : MessageChannel :=
  .operationMessage
    ⟨"Interface_ProcessMessages"⟩
    ⟨"Operation_Wrong"⟩
    ⟨"Message_ApprovalRequest"⟩

def sourceIdentity : SourceIdentity :=
  { semanticProfile := profileId
    sourceId := ⟨"message-start-event"⟩
    sourceSha256 :=
      "254823e574c7ba8b69ff3e965a86cc579c3ccfcb42f23f0abb344aacc130099c" }

def processId : ProcessId :=
  ⟨"Process_MessageStart"⟩

def startEventId : NodeId :=
  ⟨"MessageStart_ApprovalRequest"⟩

def taskNodeId : NodeId :=
  ⟨"UserTask_Approve"⟩

def endEventId : NodeId :=
  ⟨"EndEvent_Approved"⟩

def startOutput : ControlPlaceId :=
  ⟨"place:Flow_StartToTask"⟩

def taskOutput : ControlPlaceId :=
  ⟨"place:Flow_TaskToEnd"⟩

def checkedProcess : CheckedProcess :=
  { identity := sourceIdentity
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [endEventId, startEventId, taskNodeId]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [⟨"Flow_StartToTask"⟩, ⟨"Flow_TaskToEnd"⟩]
    nodes :=
      [ .noneEndEvent endEventId
      , .messageStartEvent startEventId channel
      , .userTask taskNodeId (some "Approve") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_StartToTask"⟩
          sourceId := startEventId
          targetId := taskNodeId }
      , { id := ⟨"Flow_TaskToEnd"⟩
          sourceId := taskNodeId
          targetId := endEventId } ] }

def expectedProgram : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := profileId
        sourceId := sourceIdentity.sourceId
        sourceSha256 := sourceIdentity.sourceSha256 }
    processId
    definitionScopes := checkedProcess.definitionScopes
    operationScopes :=
      [ { operationId := ⟨"operation:EndEvent_Approved"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId := ⟨"operation:MessageStart_ApprovalRequest"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId := ⟨"operation:UserTask_Approve"⟩
          scopeId := rootDefinitionScopeId processId }
      , { operationId :=
            ⟨"operation:complete-scope:scope:Process_MessageStart"⟩
          scopeId := rootDefinitionScopeId processId } ]
    controlPlaceScopes := rootSequenceFlowScopes processId
      [⟨"Flow_StartToTask"⟩, ⟨"Flow_TaskToEnd"⟩] |>.map
        fun ownership =>
          { controlPlaceId := flowControlPlaceId ownership.sequenceFlowId
            scopeId := ownership.scopeId }
    controlPlaces := checkedProcess.sequenceFlows.map
      CheckedSequenceFlow.toControlPlace
    operations :=
      [ .reachNoneEnd
          ⟨"operation:EndEvent_Approved"⟩
          { elementId := endEventId }
          taskOutput
      , .initiateMessage
          ⟨"operation:MessageStart_ApprovalRequest"⟩
          { elementId := startEventId }
          channel
          [startOutput]
      , .awaitUserTask
          ⟨"operation:UserTask_Approve"⟩
          { elementId := taskNodeId }
          startOutput
          taskOutput
          { id := ⟨taskNodeId.value⟩, name := some "Approve" }
      , .completeScope
          ⟨"operation:complete-scope:scope:Process_MessageStart"⟩
          { elementId := ⟨processId.value⟩ }
          (rootDefinitionScopeId processId)
          none ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def startOperationId : OperationId :=
  ⟨"operation:MessageStart_ApprovalRequest"⟩

def taskOperationId : OperationId :=
  ⟨"operation:UserTask_Approve"⟩

def instanceId : SemanticId :=
  ⟨"MessageStartInstance_1"⟩

def trigger : Stimulus :=
  .triggerMessageStart
    ⟨"trigger-message-start"⟩
    ⟨processId.value⟩
    instanceId
    ⟨startEventId.value⟩
    channel

private def requiredObservations : List ObservationKind :=
  [ .deployment
  , .commandResults
  , .processStatus
  , .activeWaits
  , .openUserTasks
  , .openTimers
  , .openEffects
  , .variables
  , .enabledInteractions
  , .logicalTime ]

private def scenarioForProgram (candidate : Program) (stimuli : List Stimulus) :
    Scenario :=
  { kind := .scenario
    id := ⟨"message-start-pairing"⟩
    profile := candidate.identity.semanticProfile
    bpmn :=
      { id := candidate.identity.sourceId
        relativePath := "message-start-pairing.bpmn"
        sha256 := candidate.identity.sourceSha256
        sourceOverlay := candidate.identity.sourceOverlay }
    stimuli
    observations := requiredObservations
    provenance :=
      { normativeRefs := []
        cibRevision := "not-applicable"
        cibRefs := [] } }

def rootOwner (id : SemanticId) : ScopeOccurrenceId :=
  rootScopeOccurrenceId id processId

def admittedState : RuntimeState :=
  (admitMessageStart? program initialState ⟨processId.value⟩ instanceId
    ⟨startEventId.value⟩ channel).getD initialState

def initiatedState : RuntimeState :=
  (step program admittedState startOperationId).getD initialState

def exactWait : UserTaskWait :=
  { processInstanceId := instanceId
    owner := rootOwner instanceId
    task := { id := ⟨taskNodeId.value⟩, name := some "Approve" }
    activation := 1
    output := taskOutput }

def waitingState : RuntimeState :=
  { admittedState with
    initiationPending := false
    waits := [exactWait]
    activations := [{ taskId := exactWait.task.id, count := 1 }] }

def noneStartInstanceId : SemanticId :=
  ⟨"NoneStartInstance_1"⟩

def noneStartAdmittedState : RuntimeState :=
  (runningProgramStartState? sequentialProgram noneStartInstanceId []).getD
    initialState

def noneStartInitiatedState : RuntimeState :=
  (step sequentialProgram noneStartAdmittedState
    ⟨"operation:StartEvent_1"⟩).getD initialState

def startIdentityRenaming : StartControlIdentityRenaming :=
  { leftInstanceId := instanceId
    rightInstanceId := noneStartInstanceId
    leftRootScopeId := rootDefinitionScopeId processId
    rightRootScopeId := rootDefinitionScopeId sequentialProgram.processId
    leftOutput := startOutput
    rightOutput := ⟨"place:Flow_StartToTask"⟩ }

/-- The exact checked graph is independently admitted. -/
theorem exact_checked_process_is_admitted :
    checkedWellFormed checkedProcess = true := by
  decide +kernel

/-- The exact lowered IL is independently admitted. -/
theorem exact_program_is_admitted :
    programWellFormed program = true := by
  decide +kernel

/-- The checkpoint profile selects exactly one Message Start operation with one output. -/
theorem exact_program_profile_is_admitted :
    programProfileCapabilitiesValid program = true := by
  decide +kernel

/-- Checked source and IL are bound by exact lowering equality. -/
theorem exact_definition_binding_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide +kernel

/-- Lowering preserves the exact Start Event origin, full channel, and endpoint-derived output. -/
theorem exact_lowering_preserves_message_start :
    lowerCheckedProcess checkedProcess = expectedProgram := by
  decide +kernel

/-- Message Start output lowering is a canonical projection of checked Sequence Flow endpoints. -/
theorem exact_lowering_uses_only_checked_flow_endpoints :
    lowerMessageStartOutputs checkedProcess startEventId = [startOutput] := by
  decide +kernel

/-- A same-Message, same-Interface source mutation with a different Interface Operation changes the lowered operation. -/
theorem interface_operation_is_a_lowering_discriminator :
    lowerMessageStartOperation checkedProcess startEventId
        wrongInterfaceOperationChannel ≠
      lowerMessageStartOperation checkedProcess startEventId channel := by
  decide +kernel

/-- Generic IL validation admits canonical nonempty distinct Message initiation outputs. -/
theorem generic_message_initiation_accepts_multiple_distinct_outputs :
    messageInitiationOperationWellFormed
      [ { id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }
      , { id := ⟨"place:B"⟩, origin := { elementId := ⟨"Flow_B"⟩ } } ]
      ⟨"operation:message-start"⟩
      { elementId := startEventId }
      channel
      [⟨"place:A"⟩, ⟨"place:B"⟩] = true := by
  decide +kernel

/-- Generic IL validation rejects empty and repeated output lists. -/
theorem generic_message_initiation_rejects_empty_or_repeated_outputs :
    messageInitiationOperationWellFormed
        [{ id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }]
        ⟨"operation:message-start"⟩
        { elementId := startEventId }
        channel [] = false ∧
      messageInitiationOperationWellFormed
        [{ id := ⟨"place:A"⟩, origin := { elementId := ⟨"Flow_A"⟩ } }]
        ⟨"operation:message-start"⟩
        { elementId := startEventId }
        channel [⟨"place:A"⟩, ⟨"place:A"⟩] = false := by
  decide +kernel

/-- The selected profile refuses the generic multi-output representation. -/
theorem checkpoint_profile_requires_exactly_one_output :
    programProfileCapabilitiesValid
      { expectedProgram with
        operations := expectedProgram.operations.map fun operation =>
          match operation with
          | .initiateMessage id origin messageChannel _ =>
              .initiateMessage id origin messageChannel
                [⟨"place:A"⟩, ⟨"place:B"⟩]
          | other => other } = false := by
  decide +kernel

/-- Exact trigger admission creates one fresh root occurrence and no payload or subscription state. -/
theorem exact_trigger_admission_state :
    admittedState =
      { runningStartState instanceId [] with
        scopeOccurrences := [{ id := rootOwner instanceId, parent := none }]
        scopeActivations :=
          [{ scopeId := rootDefinitionScopeId processId, count := 1 }] } := by
  decide +kernel

/-- Internal Message initiation creates the sole root-owned output token and no subscription. -/
theorem exact_message_initiation_state :
    initiatedState =
      { admittedState with
        initiationPending := false
        tokens := [rootToken instanceId processId startOutput] } := by
  decide +kernel

/-- The executable Message initiation evaluator is sound for the declarative relation. -/
theorem message_initiation_evaluator_is_sound
    (before after : RuntimeState) (outputs : List ControlPlaceId)
    (result : initiateMessageState? before outputs = some after) :
    MessageInitiationStep before outputs after :=
  initiateMessageState_sound before after outputs result

/-- The first unstable prefix enables only Message initiation. -/
theorem admitted_prefix_enables_exactly_one_operation :
    enabledInternalOperationCount program admittedState = 1 := by
  decide +kernel

/-- The second unstable prefix enables only the downstream User Task. -/
theorem initiated_prefix_enables_exactly_one_operation :
    enabledInternalOperationCount program initiatedState = 1 := by
  decide +kernel

/-- The exact internal trace is Message initiation followed by User Task activation. -/
theorem exact_two_step_internal_trace :
    runChoices program admittedState [startOperationId, taskOperationId] =
      some waitingState := by
  decide +kernel

/-- Production closure reaches one stable resumable User Task wait in two steps. -/
theorem exact_trigger_reaches_stable_user_task_wait :
    scenarioClosureLimit = 8 ∧
      applyStimulus scenarioClosureLimit program initialState trigger =
        { outcome := .committed
          state := waitingState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      enabledInternalOperationCount program waitingState = 0 ∧
      stableStateResumable waitingState = true := by
  decide +kernel

/-- The production limit exceeds the exact two-step closure length. -/
theorem exact_closure_length_fits_production_limit :
    2 ≤ scenarioClosureLimit := by
  decide +kernel

/-- A one-step test limit reports the remaining enabled User Task operation. -/
theorem one_step_limit_reports_overflow :
    applyStimulus 1 program initialState trigger =
      { outcome := .committed
        state := initiatedState
        internalStepBoundExceeded := true
        ambiguousInternalChoice := false } := by
  decide +kernel

private def rejectedExactly (candidateProgram : Program)
    (state : RuntimeState) (stimulus : Stimulus) : Bool :=
  decide (applyStimulus scenarioClosureLimit candidateProgram state stimulus =
    { outcome := .rejected
      state
      internalStepBoundExceeded := false
      ambiguousInternalChoice := false })

/-- An ordinary None Start command cannot select a Message Start program. -/
theorem wrong_start_kind_is_rejected_with_exact_state :
    ordinaryStartMatchesProgram program = false ∧
      rejectedExactly program initialState
        (.startProcess ⟨"wrong-kind"⟩ ⟨processId.value⟩ instanceId []) = true := by
  decide +kernel

/-- The inverse cross-kind discriminator also holds: a Message trigger cannot start a None Start program. -/
theorem message_trigger_cannot_start_none_start_program :
    admitMessageStart? sequentialProgram initialState
        ⟨sequentialProgram.processId.value⟩ instanceId ⟨"StartEvent_1"⟩
        channel = none ∧
      rejectedExactly sequentialProgram initialState
        (.triggerMessageStart
          ⟨"message-against-none-start"⟩
          ⟨sequentialProgram.processId.value⟩
          instanceId
          ⟨"StartEvent_1"⟩
          channel) = true := by
  decide +kernel

/-- Equivalent one-output Message and None starts have the same post-initiation control shape under explicit identity renaming. -/
theorem message_and_none_start_post_initiation_control_shapes_agree :
    OneOutputPostInitiationControlRelated startIdentityRenaming
      initiatedState noneStartInitiatedState := by
  unfold OneOutputPostInitiationControlRelated
  decide +kernel

/-- Process and Start Event identity mismatches reject with exact state preservation. -/
theorem process_or_start_event_mismatch_is_rejected_with_exact_state :
    admitMessageStart? program initialState ⟨"Other_Process"⟩ instanceId
        ⟨startEventId.value⟩ channel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-process"⟩ ⟨"Other_Process"⟩
          instanceId ⟨startEventId.value⟩ channel) = true ∧
      admitMessageStart? program initialState ⟨processId.value⟩ instanceId
        ⟨"Other_Start"⟩ channel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-start"⟩ ⟨processId.value⟩
          instanceId ⟨"Other_Start"⟩ channel) = true := by
  decide +kernel

/-- Every component of the operation-addressed Message channel participates in trigger identity. -/
theorem every_channel_component_mismatch_is_rejected_with_exact_state :
    admitMessageStart? program initialState ⟨processId.value⟩ instanceId
        ⟨startEventId.value⟩ wrongInterfaceChannel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-interface"⟩ ⟨processId.value⟩
          instanceId ⟨startEventId.value⟩ wrongInterfaceChannel) = true ∧
      admitMessageStart? program initialState ⟨processId.value⟩ instanceId
        ⟨startEventId.value⟩ wrongInterfaceOperationChannel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-operation"⟩ ⟨processId.value⟩
          instanceId ⟨startEventId.value⟩
          wrongInterfaceOperationChannel) = true ∧
      admitMessageStart? program initialState ⟨processId.value⟩ instanceId
        ⟨startEventId.value⟩ wrongMessageChannel = none ∧
      rejectedExactly program initialState
        (.triggerMessageStart ⟨"wrong-message"⟩ ⟨processId.value⟩
          instanceId ⟨startEventId.value⟩ wrongMessageChannel) = true := by
  decide +kernel

/-- Wrong profile, broken root binding, and repeated-state triggers all preserve the exact input state. -/
theorem profile_root_or_state_mismatch_is_rejected_with_exact_state :
    let wrongProfileProgram :=
      { program with
          identity :=
            { program.identity with
              semanticProfile :=
                ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩ } }
    let brokenRootProgram := { program with definitionScopes := [] }
    admitMessageStart? wrongProfileProgram initialState ⟨processId.value⟩
        instanceId ⟨startEventId.value⟩ channel = none ∧
      rejectedExactly wrongProfileProgram initialState trigger = true ∧
      admitMessageStart? brokenRootProgram initialState ⟨processId.value⟩
        instanceId ⟨startEventId.value⟩ channel = none ∧
      rejectedExactly brokenRootProgram initialState trigger = true ∧
      admitMessageStart? program waitingState ⟨processId.value⟩ instanceId
        ⟨startEventId.value⟩ channel = none ∧
      rejectedExactly program waitingState trigger = true := by
  decide +kernel

/-- Distinct semantic instance identities create distinct root occurrences and controls. -/
theorem distinct_fresh_instances_do_not_alias :
    let first := (admitMessageStart? program initialState
      ⟨processId.value⟩ ⟨"Instance_A"⟩ ⟨startEventId.value⟩
      channel).getD initialState
    let second := (admitMessageStart? program initialState
      ⟨processId.value⟩ ⟨"Instance_B"⟩ ⟨startEventId.value⟩
      channel).getD initialState
    first.control ≠ second.control ∧
      first.scopeOccurrences ≠ second.scopeOccurrences := by
  decide +kernel

/-- Both supported start variants are first-only, and no later start stimulus is admitted. -/
theorem scenario_start_sequence_is_first_only :
    stimulusSequenceSupported
        [trigger,
          .completeUserTaskInstance ⟨"complete"⟩
            { processInstanceId := instanceId
              elementId := ⟨taskNodeId.value⟩
              activation := 1 } []] = true ∧
      stimulusSequenceSupported
        [.startProcess ⟨"ordinary"⟩ ⟨"P"⟩ ⟨"I"⟩ []] = true ∧
      stimulusSequenceSupported [trigger, trigger] = false ∧
      stimulusSequenceSupported
        [.completeUserTaskInstance ⟨"complete"⟩
          { processInstanceId := instanceId
            elementId := ⟨taskNodeId.value⟩
            activation := 1 } []] = false := by
  decide +kernel

/-- Scenario admission pairs the first start kind with the program before executing any stimulus. -/
theorem scenario_start_is_paired_with_program :
    supportsScenario program (scenarioForProgram program [trigger]) = true ∧
      supportsScenario sequentialProgram
        (scenarioForProgram sequentialProgram
          [.startProcess ⟨"ordinary"⟩
            ⟨sequentialProgram.processId.value⟩ noneStartInstanceId []]) = true ∧
      supportsScenario program
        (scenarioForProgram program
          [.startProcess ⟨"wrong-kind"⟩ ⟨processId.value⟩ instanceId []]) = false ∧
      supportsScenario sequentialProgram
        (scenarioForProgram sequentialProgram
          [.triggerMessageStart
            ⟨"message-against-none-start"⟩
            ⟨sequentialProgram.processId.value⟩
            instanceId
            ⟨"StartEvent_1"⟩
            channel]) = false := by
  decide +kernel

/-- Cross-kind starts fail deployment admission and therefore execute no stimulus. -/
theorem cross_kind_scenarios_execute_no_stimulus :
    runScenario program
        (scenarioForProgram program
          [.startProcess ⟨"wrong-kind"⟩ ⟨processId.value⟩ instanceId []]) =
      { outcome := .semantic .unsupported
        trace := [.deployment .unsupported] } ∧
      runScenario sequentialProgram
        (scenarioForProgram sequentialProgram
          [.triggerMessageStart
            ⟨"message-against-none-start"⟩
            ⟨sequentialProgram.processId.value⟩
            instanceId
            ⟨"StartEvent_1"⟩
            channel]) =
        { outcome := .semantic .unsupported
          trace := [.deployment .unsupported] } := by
  decide +kernel

/-- Exact full-channel target pairing participates in scenario support admission. -/
theorem wrong_interface_operation_is_unsupported_before_execution :
    supportsScenario program
      (scenarioForProgram program
        [.triggerMessageStart
          ⟨"wrong-operation"⟩
          ⟨processId.value⟩
          instanceId
          ⟨startEventId.value⟩
          wrongInterfaceOperationChannel]) = false := by
  decide +kernel

end BpmnSemantics.MessageStartConformance
