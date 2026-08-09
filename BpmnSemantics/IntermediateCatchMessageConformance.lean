import BpmnSemantics.SemanticProcess

/-! # Intermediate Catch Message conformance

This module closes the payload-free direct-address Message capsule over one Message-then-User-Task Process and the reverse mechanism order. It owns the exact checked sources, lowering locks, separating refusals, bounded-closure witnesses, and stable public observations. CIB Message compatibility, payloads, name or business-key routing, modeled throw, Collaboration, and Message Flow are outside this account.
-/

namespace BpmnSemantics.IntermediateCatchMessageConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-intermediate-catch-message-draft"⟩

def channel : MessageChannel :=
  .operationMessage
    ⟨"Interface_ProcessMessages"⟩
    ⟨"Operation_ReceiveApprovalRequest"⟩
    ⟨"Message_ApprovalRequest"⟩

def sourceIdentity : SourceIdentity :=
  { semanticProfile := profileId
    sourceId := ⟨"intermediate-catch-message-process"⟩
    sourceSha256 :=
      "41ba50066e54fa1a01340b185afb04c70d1acc761f902a8f321f31eb095f2515" }

def processId : ProcessId :=
  ⟨"Process_IntermediateCatchMessage"⟩

def checkedProcess : CheckedProcess :=
  { identity := sourceIdentity
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"EndEvent_1"⟩, ⟨"MessageCatch_ApprovalRequest"⟩
      , ⟨"StartEvent_1"⟩, ⟨"UserTask_Approve"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_MessageToTask"⟩, ⟨"Flow_StartToMessage"⟩
      , ⟨"Flow_TaskToEnd"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_1"⟩
      , .intermediateCatchMessageEvent
          ⟨"MessageCatch_ApprovalRequest"⟩ channel
      , .noneStartEvent ⟨"StartEvent_1"⟩
      , .userTask ⟨"UserTask_Approve"⟩ (some "Approve") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_MessageToTask"⟩
          sourceId := ⟨"MessageCatch_ApprovalRequest"⟩
          targetId := ⟨"UserTask_Approve"⟩ }
      , { id := ⟨"Flow_StartToMessage"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"MessageCatch_ApprovalRequest"⟩ }
      , { id := ⟨"Flow_TaskToEnd"⟩
          sourceId := ⟨"UserTask_Approve"⟩
          targetId := ⟨"EndEvent_1"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def directChannelCheckedProcess : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun node =>
      match node with
      | .intermediateCatchMessageEvent id _ =>
          .intermediateCatchMessageEvent id
            (.directMessage ⟨"Message_ApprovalRequest"⟩)
      | other => other }

def subscriptionId : MessageSubscriptionId :=
  { processInstanceId := ⟨"MessageInstance_1"⟩
    elementId := ⟨"MessageCatch_ApprovalRequest"⟩
    activation := 1 }

def taskId : UserTaskInstanceId :=
  { processInstanceId := subscriptionId.processInstanceId
    elementId := ⟨"UserTask_Approve"⟩
    activation := 1 }

def startStimulus : Stimulus :=
  .startProcess
    ⟨"start-message-process"⟩
    ⟨processId.value⟩
    subscriptionId.processInstanceId
    []

def exactDelivery : Stimulus :=
  .deliverMessage ⟨"deliver-message"⟩ subscriptionId channel

def exactCompletion : Stimulus :=
  .completeUserTaskInstance ⟨"complete-message-user-task"⟩ taskId []

def observations : List ObservationKind :=
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

def scenario : Scenario :=
  { kind := .scenario
    id := ⟨"intermediate-catch-message"⟩
    profile := profileId
    bpmn :=
      { id := sourceIdentity.sourceId
        relativePath := "scenarios/intermediate-catch-message/process.bpmn"
        sha256 := sourceIdentity.sourceSha256
        sourceOverlay := none }
    stimuli := [startStimulus, exactDelivery, exactCompletion]
    observations
    provenance :=
      { normativeRefs :=
          [ "BPMN 2.0.2 §8.4.2"
          , "BPMN 2.0.2 §8.4.11"
          , "BPMN 2.0.2 §8.5"
          , "BPMN 2.0.2 §10.5.4"
          , "BPMN 2.0.2 §10.5.5" ]
        cibRevision := "834a9874760de8a0107f7c1b32806e37f17fb017"
        cibRefs :=
          ["engine/src/main/java/org/cibseven/bpm/engine/impl/bpmn/behavior/UserTaskActivityBehavior.java"] } }

def messageWaitingResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState startStimulus

def taskWaitingResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program messageWaitingResult.state
    exactDelivery

def completedResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program taskWaitingResult.state
    exactCompletion

def messageWaitingObservation : StateObservation :=
  { instanceId := subscriptionId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := subscriptionId.elementId
         kind := .message
         multiplicity := 1 }]
    openUserTasks := []
    openMessageSubscriptions := [{ id := subscriptionId, channel }]
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions := [.deliverMessage subscriptionId channel]
    logicalTimeMs := 0 }

def taskWaitingObservation : StateObservation :=
  { instanceId := taskId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := taskId.elementId
         kind := .userTask
         multiplicity := 1 }]
    openUserTasks :=
      [{ id := taskId, name := some "Approve", state := .active }]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := []
    enabledInteractions := [.completeUserTaskInstance taskId]
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { taskWaitingObservation with
    status := .completed
    activeWaits := []
    openUserTasks := []
    enabledInteractions := [] }

def expectedTrace : List CanonicalObservation :=
  [ .deployment .committed
  , .command ⟨"start-message-process"⟩ .committed
  , .state messageWaitingObservation
  , .command ⟨"deliver-message"⟩ .committed
  , .state taskWaitingObservation
  , .command ⟨"complete-message-user-task"⟩ .committed
  , .state completedObservation ]

/-- The checked graph and lowered program are admitted without a complete-topology predicate. -/
theorem exact_definition_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide +kernel

/-- A checked Intermediate Catch Message Event requires its complete Operation address. -/
theorem catch_event_rejects_direct_message_channel :
    definitionBindingValid directChannelCheckedProcess
      (lowerCheckedProcess directChannelCheckedProcess) = false := by
  decide +kernel

/-- Canonical lowering retains the complete reference-resolved channel and Catch Event identity. -/
theorem lowering_preserves_message_channel :
    program.operations.find? (fun operation =>
        decide (operation.id.value =
          "operation:MessageCatch_ApprovalRequest")) =
      some
        (.awaitMessage
          ⟨"operation:MessageCatch_ApprovalRequest"⟩
          { elementId := ⟨"MessageCatch_ApprovalRequest"⟩ }
          ⟨"place:Flow_StartToMessage"⟩
          ⟨"place:Flow_MessageToTask"⟩
          { elementId := ⟨"MessageCatch_ApprovalRequest"⟩, channel }) := by
  decide +kernel

/-- Start requires exactly the initiate and Message-activation internal steps. -/
theorem start_closure_uses_two_internal_steps :
    (applyStimulus 1 program initialState startStimulus).internalStepBoundExceeded =
        true ∧
      (applyStimulus 2 program initialState startStimulus).internalStepBoundExceeded =
        false ∧
      messageWaitingResult.internalStepBoundExceeded = false ∧
      enabledInternalOperationCount program messageWaitingResult.state = 0 := by
  decide +kernel

/-- `awaitMessage` creates one Process-owned occurrence with the definition channel and stops closure. -/
theorem message_activation_preserves_complete_subscription :
    messageWaitingResult.outcome = .committed ∧
      messageWaitingResult.state.messageWaits =
        [{ processInstanceId := subscriptionId.processInstanceId
           owner := rootScopeOccurrenceId subscriptionId.processInstanceId processId
           elementId := ⟨subscriptionId.elementId.value⟩
           activation := subscriptionId.activation
           channel
           output := ⟨"place:Flow_MessageToTask"⟩ }] ∧
      observeStableState program messageWaitingResult.state =
        some messageWaitingObservation := by
  decide +kernel

/-- Exact delivery consumes the subscription and needs one automatic User Task activation step. -/
theorem exact_delivery_opens_only_the_trailing_task :
    (applyStimulus 0 program messageWaitingResult.state
        exactDelivery).internalStepBoundExceeded = true ∧
      taskWaitingResult.outcome = .committed ∧
      taskWaitingResult.state.messageWaits = [] ∧
      observeStableState program taskWaitingResult.state =
        some taskWaitingObservation := by
  decide +kernel

def mismatchedDeliveries : List Stimulus :=
  [ .deliverMessage ⟨"wrong-instance"⟩
      { subscriptionId with processInstanceId := ⟨"OtherInstance"⟩ } channel
  , .deliverMessage ⟨"wrong-element"⟩
      { subscriptionId with elementId := ⟨"OtherCatch"⟩ } channel
  , .deliverMessage ⟨"wrong-activation"⟩
      { subscriptionId with activation := 2 } channel
  , .deliverMessage ⟨"wrong-interface"⟩ subscriptionId
      (.operationMessage ⟨"OtherInterface"⟩
        ⟨"Operation_ReceiveApprovalRequest"⟩ ⟨"Message_ApprovalRequest"⟩)
  , .deliverMessage ⟨"wrong-operation"⟩ subscriptionId
      (.operationMessage ⟨"Interface_ProcessMessages"⟩
        ⟨"OtherOperation"⟩ ⟨"Message_ApprovalRequest"⟩)
  , .deliverMessage ⟨"wrong-message"⟩ subscriptionId
      (.operationMessage ⟨"Interface_ProcessMessages"⟩
        ⟨"Operation_ReceiveApprovalRequest"⟩ ⟨"OtherMessage"⟩) ]

/-- Every direct address or definition-consistency mismatch rejects with exact state preservation. -/
theorem every_message_mismatch_preserves_state :
    mismatchedDeliveries.map (fun stimulus =>
        let result :=
          applyStimulus scenarioClosureLimit program
            messageWaitingResult.state stimulus
        (result.outcome, result.state)) =
      List.replicate 6 (.rejected, messageWaitingResult.state) := by
  decide +kernel

/-- A fresh command targeting the consumed occurrence is stale and cannot consume it twice. -/
theorem consumed_subscription_cannot_be_delivered_again :
    applyStimulus scenarioClosureLimit program taskWaitingResult.state
        (.deliverMessage ⟨"deliver-message-stale"⟩ subscriptionId channel) =
      { outcome := .rejected
        state := taskWaitingResult.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

/-- The answer-free scenario closes through the exact canonical public observations. -/
theorem scenario_matches_expected_trace :
    runScenario program scenario =
      { outcome := .semantic .committed, trace := expectedTrace } := by
  decide +kernel

def reverseCheckedProcess : CheckedProcess :=
  { checkedProcess with
    identity :=
      { sourceIdentity with
        sourceId := ⟨"reverse-intermediate-catch-message-process"⟩
        sourceSha256 :=
          "3333333333333333333333333333333333333333333333333333333333333333" }
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_MessageToEnd"⟩, ⟨"Flow_StartToTask"⟩
      , ⟨"Flow_TaskToMessage"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_MessageToEnd"⟩
          sourceId := ⟨"MessageCatch_ApprovalRequest"⟩
          targetId := ⟨"EndEvent_1"⟩ }
      , { id := ⟨"Flow_StartToTask"⟩
          sourceId := ⟨"StartEvent_1"⟩
          targetId := ⟨"UserTask_Approve"⟩ }
      , { id := ⟨"Flow_TaskToMessage"⟩
          sourceId := ⟨"UserTask_Approve"⟩
          targetId := ⟨"MessageCatch_ApprovalRequest"⟩ } ] }

def reverseProgram : Program :=
  lowerCheckedProcess reverseCheckedProcess

def reverseTaskWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit reverseProgram initialState startStimulus

def reverseMessageWaiting : StimulusResult :=
  applyStimulus scenarioClosureLimit reverseProgram reverseTaskWaiting.state
    exactCompletion

def reverseCompleted : StimulusResult :=
  applyStimulus scenarioClosureLimit reverseProgram reverseMessageWaiting.state
    exactDelivery

/-- Generic graph facts admit the reverse mechanism order under the same operation multiset and preserve one resumption surface at each stable state. -/
theorem reverse_order_is_admitted_and_preserves_progress :
    definitionBindingValid reverseCheckedProcess reverseProgram = true ∧
      reverseTaskWaiting.outcome = .committed ∧
      reverseTaskWaiting.state.waits.length = 1 ∧
      reverseTaskWaiting.state.messageWaits = [] ∧
      stableStateResumable reverseTaskWaiting.state = true ∧
      reverseMessageWaiting.outcome = .committed ∧
      reverseMessageWaiting.state.waits = [] ∧
      reverseMessageWaiting.state.messageWaits.length = 1 ∧
      stableStateResumable reverseMessageWaiting.state = true ∧
      reverseCompleted.outcome = .committed ∧
      reverseCompleted.state.control =
        .completed subscriptionId.processInstanceId := by
  decide +kernel

/-- Before reverse-order Message activation, even an otherwise exact delivery rejects without changing the User Task wait. -/
theorem reverse_order_pre_activation_delivery_is_rejected :
    applyStimulus scenarioClosureLimit reverseProgram
        reverseTaskWaiting.state exactDelivery =
      { outcome := .rejected
        state := reverseTaskWaiting.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide +kernel

end BpmnSemantics.IntermediateCatchMessageConformance
