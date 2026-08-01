import BpmnSemantics.SemanticProcess

/-! # Message-addressed Receive Task conformance

This module specializes the existing Message wait and delivery semantics to one payload-free, non-instantiating Receive Task with a direct Message address. It owns the exact checked-source lowering lock, bounded closure witnesses, direct-versus-operation address discriminator, and concrete refusal cases. Temporal hosting, retained CIB projection, payload, correlation, addressless signaling, and general Receive Task lifecycle remain outside this checkpoint.
-/

namespace BpmnSemantics.ReceiveTaskConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"cibseven-2.2.0-message-addressed-receive-task-draft"⟩

def channel : MessageChannel :=
  .directMessage ⟨"Message_NewInvoice"⟩

def sourceIdentity : SourceIdentity :=
  { semanticProfile := profileId
    sourceId := ⟨"message-addressed-receive-task-process"⟩
    sourceSha256 :=
      "2793f384239ccc0cc4fd9a6d558b53f97c8a3ec724083cf1702d684861397b2a" }

def processId : ProcessId :=
  ⟨"Process_MessageAddressedReceiveTaskProbe"⟩

def checkedProcess : CheckedProcess :=
  { identity := sourceIdentity
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"EndEvent_ProcessCompleted"⟩
      , ⟨"ReceiveTask_WaitForInvoice"⟩
      , ⟨"StartEvent_ProcessStarted"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"SequenceFlow_ReceiveToEnd"⟩
      , ⟨"SequenceFlow_StartToReceive"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_ProcessCompleted"⟩
      , .receiveTask ⟨"ReceiveTask_WaitForInvoice"⟩ channel
      , .noneStartEvent ⟨"StartEvent_ProcessStarted"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"SequenceFlow_ReceiveToEnd"⟩
          sourceId := ⟨"ReceiveTask_WaitForInvoice"⟩
          targetId := ⟨"EndEvent_ProcessCompleted"⟩ }
      , { id := ⟨"SequenceFlow_StartToReceive"⟩
          sourceId := ⟨"StartEvent_ProcessStarted"⟩
          targetId := ⟨"ReceiveTask_WaitForInvoice"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def subscriptionId : MessageSubscriptionId :=
  { processInstanceId := ⟨"ReceiveTaskInstance_1"⟩
    elementId := ⟨"ReceiveTask_WaitForInvoice"⟩
    activation := 1 }

def startStimulus : Stimulus :=
  .startProcess
    ⟨"start-receive-task"⟩
    ⟨processId.value⟩
    subscriptionId.processInstanceId
    []

def exactDelivery : Stimulus :=
  .deliverMessage ⟨"deliver-receive-task-message"⟩ subscriptionId channel

def waitingResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState startStimulus

def completedResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program waitingResult.state exactDelivery

/-- The selected checked node and reused operation multiset pass independent definition binding. -/
theorem exact_definition_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide

/-- Lowering preserves the Receive Task element and direct Message arm without an invented Interface or Operation. -/
theorem lowering_preserves_direct_message_address :
    program.operations.find? (fun operation =>
        decide (operation.id.value =
          "operation:ReceiveTask_WaitForInvoice")) =
      some
        (.awaitMessage
          ⟨"operation:ReceiveTask_WaitForInvoice"⟩
          { elementId := ⟨"ReceiveTask_WaitForInvoice"⟩ }
          ⟨"place:SequenceFlow_StartToReceive"⟩
          ⟨"place:SequenceFlow_ReceiveToEnd"⟩
          { elementId := ⟨"ReceiveTask_WaitForInvoice"⟩, channel }) := by
  decide

/-- Start requires exactly initiation followed by activation of the passive Message wait. -/
theorem start_closure_uses_two_internal_steps :
    (applyStimulus 1 program initialState startStimulus).internalStepBoundExceeded =
        true ∧
      waitingResult.internalStepBoundExceeded = false ∧
      enabledInternalOperationCount program waitingResult.state = 0 := by
  decide

/-- The stable wait retains the complete Process-owned occurrence and direct address. -/
theorem activation_creates_exact_direct_subscription :
    waitingResult.outcome = .committed ∧
      waitingResult.state.messageWaits =
        [{ processInstanceId := subscriptionId.processInstanceId
           owner := rootScopeOccurrenceId subscriptionId.processInstanceId processId
           elementId := ⟨subscriptionId.elementId.value⟩
           activation := subscriptionId.activation
           channel
           output := ⟨"place:SequenceFlow_ReceiveToEnd"⟩ }] ∧
      stableStateResumable waitingResult.state = true := by
  decide

/-- Exact delivery needs the End and root-completion steps, then terminates with no subscription. -/
theorem exact_delivery_completes_after_two_internal_steps :
    (applyStimulus 1 program waitingResult.state
        exactDelivery).internalStepBoundExceeded = true ∧
      completedResult.outcome = .committed ∧
      completedResult.internalStepBoundExceeded = false ∧
      completedResult.state.messageWaits = [] ∧
      completedResult.state.control =
        .completed subscriptionId.processInstanceId := by
  decide

/-- The executable direct delivery remains covered by the generic declarative Message relation. -/
theorem exact_direct_delivery_is_permitted
    (successor : RuntimeState)
    (success :
      deliverMessage program waitingResult.state subscriptionId channel =
        some successor) :
    MessageDeliveryStep program waitingResult.state subscriptionId channel
      successor :=
  deliverMessage_sound program waitingResult.state successor subscriptionId
    channel success

def mismatchedDeliveries : List Stimulus :=
  [ .deliverMessage ⟨"wrong-message"⟩ subscriptionId
      (.directMessage ⟨"Message_Other"⟩)
  , .deliverMessage ⟨"wrong-kind"⟩ subscriptionId
      (.operationMessage ⟨"Interface_ProcessMessages"⟩
        ⟨"Operation_ReceiveApprovalRequest"⟩ ⟨"Message_NewInvoice"⟩)
  , .deliverMessage ⟨"wrong-instance"⟩
      { subscriptionId with processInstanceId := ⟨"OtherInstance"⟩ } channel ]

/-- Message ID equality alone is insufficient: arm kind and occurrence identity remain semantic. -/
theorem every_direct_address_mismatch_preserves_state :
    mismatchedDeliveries.map (fun stimulus =>
        let result :=
          applyStimulus scenarioClosureLimit program waitingResult.state stimulus
        (result.outcome, result.state)) =
      List.replicate 3 (.rejected, waitingResult.state) := by
  decide

/-- A well-formed delivery before activation cannot create a subscription or progress control. -/
theorem pre_activation_delivery_is_rejected :
    applyStimulus scenarioClosureLimit program initialState exactDelivery =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide

/-- A fresh semantic command cannot consume the completed Receive Task twice. -/
theorem consumed_subscription_is_stale :
    applyStimulus scenarioClosureLimit program completedResult.state
        (.deliverMessage ⟨"stale-receive-task-message"⟩ subscriptionId channel) =
      { outcome := .rejected
        state := completedResult.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  decide

end BpmnSemantics.ReceiveTaskConformance
