module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime
import all BpmnSemantics.SemanticProcess.EffectDataAdmission
import all BpmnSemantics.SemanticProcess.JsonSupport
import all BpmnSemantics.SemanticProcess.SequentialScopeDataAdmission
import all BpmnSemantics.SemanticProcess.MessageStartAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeData
import all BpmnSemantics.SemanticProcess.MixedTaskControlFlowAdmission
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.ParallelScopePopulation
import all BpmnSemantics.SemanticProcess.ScopeCompletion
import all BpmnSemantics.StrictJson
import all BpmnSemantics.SemanticProcess.BoundedScope
import all BpmnSemantics.SemanticProcess.BusinessTaskCommandAdmission
import all BpmnSemantics.SemanticProcess.CallActivityAdmission
import all BpmnSemantics.SemanticProcess.CallDataStateValidation
import all BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import all BpmnSemantics.SemanticProcess.ClosureLimit
import all BpmnSemantics.SemanticProcess.CommandAdmission
import all BpmnSemantics.SemanticProcess.CommandStartBindings
import all BpmnSemantics.SemanticProcess.CompensationActivityRetentionDeclaration
import all BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import all BpmnSemantics.SemanticProcess.CompensationSourceLowering
import all BpmnSemantics.SemanticProcess.CompensationSourceProfileAdmission
import all BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration
import all BpmnSemantics.SemanticProcess.DeclaredScopeTransition
import all BpmnSemantics.SemanticProcess.DefinitionArtifactInvariants
import all BpmnSemantics.SemanticProcess.DefinitionBindingValidation
import all BpmnSemantics.SemanticProcess.EffectDataCommandAdmission
import all BpmnSemantics.SemanticProcess.ErrorDefinition
import all BpmnSemantics.SemanticProcess.EventBasedGateway
import all BpmnSemantics.SemanticProcess.GraphReachability
import all BpmnSemantics.SemanticProcess.GraphValidation
import all BpmnSemantics.SemanticProcess.Incident
import all BpmnSemantics.SemanticProcess.InternalCommutationCore
import all BpmnSemantics.SemanticProcess.InternalDataArmingPreparation
import all BpmnSemantics.SemanticProcess.InternalEndPreparation
import all BpmnSemantics.SemanticProcess.InternalExecutionFrontier
import all BpmnSemantics.SemanticProcess.InternalLocalControlPreparation
import all BpmnSemantics.SemanticProcess.InternalPreparedArming
import all BpmnSemantics.SemanticProcess.InternalPreparedFrontier
import all BpmnSemantics.SemanticProcess.InternalPreparedTransition
import all BpmnSemantics.SemanticProcess.InternalScheduledClosure
import all BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
import all BpmnSemantics.SemanticProcess.InternalTransitionAlternative
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import all BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessStateValidation
import all BpmnSemantics.SemanticProcess.Lowering
import all BpmnSemantics.SemanticProcess.LoweringIdentity
import all BpmnSemantics.SemanticProcess.MergeTargetOperations
import all BpmnSemantics.SemanticProcess.Message
import all BpmnSemantics.SemanticProcess.MessageBoundedTask
import all BpmnSemantics.SemanticProcess.MessageKeyCorrelationProfileAdmission
import all BpmnSemantics.SemanticProcess.MessageMonitoredTask
import all BpmnSemantics.SemanticProcess.MonitoredScope
import all BpmnSemantics.SemanticProcess.OperationControlPlaces
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceController
import all BpmnSemantics.SemanticProcess.ParallelMultiInstanceProfileAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeCommandAdmission
import all BpmnSemantics.SemanticProcess.ParallelScopeDeclaration
import all BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
import all BpmnSemantics.SemanticProcess.ProfileCardinalities
import all BpmnSemantics.SemanticProcess.RootScopeFixtures
import all BpmnSemantics.SemanticProcess.RuntimePositionValidity
import all BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorage
import all BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import all BpmnSemantics.SemanticProcess.ScopeDataBearing
import all BpmnSemantics.SemanticProcess.StructuredHumanWorkAdmission
import all BpmnSemantics.SemanticProcess.TransactionSourceAdmission
import all BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.TransitionStates
import all BpmnSemantics.SemanticProcess.TransitionTrace
import all BpmnSemantics.SemanticProcess.WaitActivation
import all BpmnSemantics.CheckedProcessContract
import all BpmnSemantics.Scenario

/-! # Receive Task conformance

This module specializes the existing Message wait and delivery semantics to one payload-free, non-instantiating Receive Task with a direct Message address. It owns the exact checked-source lowering lock, bounded closure witnesses, direct-versus-operation address discriminator, and concrete refusal cases. Temporal hosting, retained CIB projection, payload, correlation, and general Receive Task lifecycle remain outside this checkpoint.

The `Addressless` section adds the same laws for the parcel-handover Receive Task without a Message, whose wait carries the field-free `unspecifiedMessage` arm ([addressless Receive Task account](../docs/capsules/ADDRESSLESS-RECEIVE-TASK-SPEC.md)). It sits here rather than in a family leaf because only a module that already runs commands keeps the `CommandAdmission` hidden-edit cone unchanged.
-/

public section

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

def locusSwappedCheckedProcess : CheckedProcess :=
  { checkedProcess with
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_ProcessCompleted"⟩
      , .intermediateCatchMessageEvent
          ⟨"ReceiveTask_WaitForInvoice"⟩ channel
      , .noneStartEvent ⟨"StartEvent_ProcessStarted"⟩ ] }

def operationAddressedChannel : MessageChannel :=
  .operationMessage ⟨"Interface_ProcessMessages"⟩
    ⟨"Operation_ReceiveApprovalRequest"⟩ ⟨"Message_NewInvoice"⟩

def crossArmCheckedProcess : CheckedProcess :=
  { checkedProcess with
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_ProcessCompleted"⟩
      , .receiveTask
          ⟨"ReceiveTask_WaitForInvoice"⟩ operationAddressedChannel
      , .noneStartEvent ⟨"StartEvent_ProcessStarted"⟩ ] }

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

def waitingObservation : StateObservation :=
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

def completedObservation : StateObservation :=
  { waitingObservation with
    status := .completed
    activeWaits := []
    openMessageSubscriptions := []
    enabledInteractions := [] }

/-- The selected checked node and reused operation multiset pass independent definition binding. -/
theorem exact_definition_is_admitted :
    definitionBindingValid checkedProcess program = true := by
  decide +kernel

/-- The Receive Task profile rejects a Catch Event even when lowering would erase the locus. -/
def catch_event_locus_is_not_receive_task_source : Bool := decide <|
    checkedProfileCapabilitiesValid locusSwappedCheckedProcess = false ∧
      definitionBindingValid locusSwappedCheckedProcess
        (lowerCheckedProcess locusSwappedCheckedProcess) = false

/-- A checked Receive Task cannot carry the operation-addressed Event channel arm. -/
def receive_task_rejects_operation_message_channel : Bool := decide <|
    definitionBindingValid crossArmCheckedProcess
      (lowerCheckedProcess crossArmCheckedProcess) = false

/-- Lowering preserves the Receive Task element and direct Message arm without an invented Interface or Operation. -/
def lowering_preserves_direct_message_address : Bool := decide <|
    program.operations.find? (fun operation =>
        decide (operation.id.value =
          "operation:ReceiveTask_WaitForInvoice")) =
      some
        (.awaitMessage
          ⟨"operation:ReceiveTask_WaitForInvoice"⟩
          { elementId := ⟨"ReceiveTask_WaitForInvoice"⟩ }
          ⟨"place:SequenceFlow_StartToReceive"⟩
          ⟨"place:SequenceFlow_ReceiveToEnd"⟩
          { elementId := ⟨"ReceiveTask_WaitForInvoice"⟩, channel })

/-- Start requires exactly initiation followed by activation of the passive Message wait. -/
theorem start_closure_uses_two_internal_steps :
    (applyStimulus 1 program initialState startStimulus).internalStepBoundExceeded =
        true ∧
      (applyStimulus 2 program initialState startStimulus).internalStepBoundExceeded =
        false ∧
      waitingResult.internalStepBoundExceeded = false ∧
      enabledInternalOperationCount program waitingResult.state = 0 := by
  decide +kernel

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
  decide +kernel

/-- Canonical observation exposes the complete direct subscription and its sole interaction. -/
def canonical_observation_preserves_direct_subscription : Bool := decide <|
    observeStableState program waitingResult.state = some waitingObservation ∧
      observeStableState program completedResult.state =
        some completedObservation

/-- Exact delivery needs the End and root-completion steps, then terminates with no subscription. -/
def exact_delivery_completes_after_two_internal_steps : Bool := decide <|
    (applyStimulus 1 program waitingResult.state
        exactDelivery).internalStepBoundExceeded = true ∧
      (applyStimulus 2 program waitingResult.state
        exactDelivery).internalStepBoundExceeded = false ∧
      completedResult.outcome = .committed ∧
      completedResult.internalStepBoundExceeded = false ∧
      completedResult.state.messageWaits = [] ∧
      completedResult.state.control =
        .completed subscriptionId.processInstanceId

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
  decide +kernel

/-- A well-formed delivery before activation cannot create a subscription or progress control. -/
def pre_activation_delivery_is_rejected : Bool := decide <|
    applyStimulus scenarioClosureLimit program initialState exactDelivery =
      { outcome := .rejected
        state := initialState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

/-- A fresh semantic command cannot consume the completed Receive Task twice. -/
def consumed_subscription_is_stale : Bool := decide <|
    applyStimulus scenarioClosureLimit program completedResult.state
        (.deliverMessage ⟨"stale-receive-task-message"⟩ subscriptionId channel) =
      { outcome := .rejected
        state := completedResult.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

namespace Addressless

private def profileId : ProfileId :=
  ⟨"cibseven-2.2.0-addressless-receive-task-draft"⟩

private def sourceIdentity : SourceIdentity :=
  { semanticProfile := profileId
    sourceId := ⟨"addressless-receive-task-process"⟩
    sourceSha256 := "8cd4ab3670897b60e8a68152e5021bc5f684c5522115a28a2fa46621d68ba3aa" }

private def processId : ProcessId := ⟨"Process_ParcelHandover"⟩

private def checkedProcessWith (identity : SourceIdentity) (channel : MessageChannel) : CheckedProcess :=
  { identity
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"EndEvent_ParcelHandedOver"⟩
      , ⟨"ReceiveTask_AwaitCourierPickup"⟩
      , ⟨"StartEvent_HandoverRequested"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"SequenceFlow_PickupToHandedOver"⟩
      , ⟨"SequenceFlow_RequestedToPickup"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_ParcelHandedOver"⟩
      , .receiveTask ⟨"ReceiveTask_AwaitCourierPickup"⟩ channel
      , .noneStartEvent ⟨"StartEvent_HandoverRequested"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"SequenceFlow_PickupToHandedOver"⟩
          sourceId := ⟨"ReceiveTask_AwaitCourierPickup"⟩
          targetId := ⟨"EndEvent_ParcelHandedOver"⟩ }
      , { id := ⟨"SequenceFlow_RequestedToPickup"⟩
          sourceId := ⟨"StartEvent_HandoverRequested"⟩
          targetId := ⟨"ReceiveTask_AwaitCourierPickup"⟩ } ] }

private def checkedProcess : CheckedProcess := checkedProcessWith sourceIdentity .unspecifiedMessage

private def program : Program := lowerCheckedProcess checkedProcess

private def directChannel : MessageChannel := .directMessage ⟨"Message_CourierPickup"⟩

private def subscriptionId : MessageSubscriptionId :=
  { processInstanceId := ⟨"Handover_1"⟩
    elementId := ⟨"ReceiveTask_AwaitCourierPickup"⟩
    activation := 1 }

private def startStimulus : Stimulus :=
  .startProcess ⟨"request-handover"⟩ ⟨processId.value⟩ subscriptionId.processInstanceId []

private def pickup : Stimulus := .deliverMessage ⟨"courier-scanned"⟩ subscriptionId .unspecifiedMessage

private def waitingResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState startStimulus

private def completedResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program waitingResult.state pickup

/-- ARECV-RESUME-01: the occurrence-addressed delivery is a declarative Message delivery step. -/
private theorem unspecified_delivery_is_permitted
    (successor : RuntimeState)
    (success : deliverMessage program waitingResult.state subscriptionId .unspecifiedMessage = some successor) :
    MessageDeliveryStep program waitingResult.state subscriptionId .unspecifiedMessage successor :=
  deliverMessage_sound program waitingResult.state successor subscriptionId .unspecifiedMessage success

private def mismatchedDeliveries : List Stimulus :=
  [ .deliverMessage ⟨"named-message-first"⟩ subscriptionId directChannel
  , .deliverMessage ⟨"named-operation"⟩ subscriptionId
      (.operationMessage ⟨"Interface_Courier"⟩ ⟨"Operation_Pickup"⟩ ⟨"Message_CourierPickup"⟩)
  , .deliverMessage ⟨"other-instance"⟩
      { subscriptionId with processInstanceId := ⟨"Handover_2"⟩ } .unspecifiedMessage
  , .deliverMessage ⟨"other-activation"⟩ { subscriptionId with activation := 2 } .unspecifiedMessage ]

/-- ARECV-REFUSE-01: a named Message, another instance or another activation leaves the wait unchanged. -/
private theorem every_addressless_mismatch_preserves_state :
    mismatchedDeliveries.map (fun stimulus =>
        let result := applyStimulus scenarioClosureLimit program waitingResult.state stimulus
        (result.outcome, result.state)) =
      List.replicate 4 (.rejected, waitingResult.state) := by
  decide +kernel

end Addressless

/-- The addressless checked node and its reused operation multiset pass independent definition binding. -/
private def addressless_definition_is_admitted : Bool :=
  definitionBindingValid Addressless.checkedProcess Addressless.program

/-- ARECV-WAIT-01: activation creates one Process-owned wait carrying the unspecified arm. -/
private def activation_creates_unspecified_wait : Bool := decide <|
    Addressless.waitingResult.outcome = .committed ∧
      Addressless.waitingResult.state.messageWaits =
        [{ processInstanceId := Addressless.subscriptionId.processInstanceId
           owner := rootScopeOccurrenceId Addressless.subscriptionId.processInstanceId Addressless.processId
           elementId := ⟨Addressless.subscriptionId.elementId.value⟩
           activation := Addressless.subscriptionId.activation
           channel := .unspecifiedMessage
           output := ⟨"place:SequenceFlow_PickupToHandedOver"⟩ }] ∧
      stableStateResumable Addressless.waitingResult.state = true

/-- ARECV-RESUME-01: the occurrence-addressed delivery completes the Process with no wait left. -/
private def unspecified_delivery_completes_process : Bool := decide <|
    Addressless.completedResult.outcome = .committed ∧
      Addressless.completedResult.state.messageWaits = [] ∧
      Addressless.completedResult.state.control = .completed Addressless.subscriptionId.processInstanceId

/-- A second delivery to the consumed occurrence is stale. -/
private def consumed_wait_is_stale : Bool := decide <|
    (applyStimulus scenarioClosureLimit Addressless.program Addressless.completedResult.state
        (.deliverMessage ⟨"courier-scanned-again"⟩ Addressless.subscriptionId .unspecifiedMessage)).outcome = .rejected

/-- ARECV-ADDRESS-02: the unspecified wait belongs to the addressless profile alone, and that profile refuses
the direct arm. -/
private def unspecified_arm_belongs_to_its_profile : Bool := decide <|
    programWellFormed (lowerCheckedProcess (Addressless.checkedProcessWith
        { Addressless.sourceIdentity with semanticProfile := ⟨"cibseven-2.2.0-message-addressed-receive-task-draft"⟩ }
        .unspecifiedMessage)) = false ∧
      programWellFormed (lowerCheckedProcess (Addressless.checkedProcessWith Addressless.sourceIdentity Addressless.directChannel)) = false ∧
      programWellFormed Addressless.program = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("catch_event_locus_is_not_receive_task_source", catch_event_locus_is_not_receive_task_source),
  ("receive_task_rejects_operation_message_channel", receive_task_rejects_operation_message_channel),
  ("lowering_preserves_direct_message_address", lowering_preserves_direct_message_address),
  ("canonical_observation_preserves_direct_subscription", canonical_observation_preserves_direct_subscription),
  ("exact_delivery_completes_after_two_internal_steps", exact_delivery_completes_after_two_internal_steps),
  ("pre_activation_delivery_is_rejected", pre_activation_delivery_is_rejected),
  ("consumed_subscription_is_stale", consumed_subscription_is_stale),
  ("addressless_definition_is_admitted", addressless_definition_is_admitted),
  ("activation_creates_unspecified_wait", activation_creates_unspecified_wait),
  ("unspecified_delivery_completes_process", unspecified_delivery_completes_process),
  ("consumed_wait_is_stale", consumed_wait_is_stale),
  ("unspecified_arm_belongs_to_its_profile", unspecified_arm_belongs_to_its_profile)
]

end BpmnSemantics.ReceiveTaskConformance
