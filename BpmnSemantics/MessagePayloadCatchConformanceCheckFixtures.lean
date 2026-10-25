module

public import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.InternalCommutationCensus
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity

/-! Fixture definitions and executable checks of [`MessagePayloadCatchConformance`](MessagePayloadCatchConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.MessagePayloadCatchConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess

def profileId : ProfileId :=
  ⟨"bpmn-2.0.2-message-payload-catch-draft"⟩

def channel : MessageChannel :=
  .operationMessage
    ⟨"Interface_SettlementMessages"⟩
    ⟨"Operation_ReceiveSettlementConfirmation"⟩
    ⟨"Message_SettlementConfirmed"⟩

def directOutput : DirectCatchEventPayloadOutput :=
  { associationId := "DataOutputAssociation_SettlementReference"
    sourceDataOutputId := "DataOutput_ConfirmedReference"
    sourceDataOutputName := some "Confirmed settlement reference"
    targetPropertyId := "Property_SettlementReference" }

def processId : ProcessId :=
  ⟨"Process_MessagePayloadCatch"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := profileId
        sourceId := ⟨"message-payload-catch"⟩
        sourceSha256 :=
          "6f1177913a919a024719c7a91c207be70df1ded57852626bc8f4c25551ffc605" }
    processId
    definitionScopes := [rootDefinitionScope processId]
    nodeScopes := rootNodeScopes processId
      [ ⟨"EndEvent_SettlementRecorded"⟩, ⟨"MessageCatch_SettlementConfirmed"⟩
      , ⟨"StartEvent_AwaitSettlement"⟩, ⟨"UserTask_RecordSettlement"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes processId
      [ ⟨"Flow_MessageToTask"⟩, ⟨"Flow_StartToMessage"⟩
      , ⟨"Flow_TaskToEnd"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"EndEvent_SettlementRecorded"⟩
      , .payloadMessageCatchEvent
          ⟨"MessageCatch_SettlementConfirmed"⟩ channel directOutput
      , .noneStartEvent ⟨"StartEvent_AwaitSettlement"⟩
      , .userTask ⟨"UserTask_RecordSettlement"⟩ (some "Record settlement") ]
    sequenceFlows :=
      [ { id := ⟨"Flow_MessageToTask"⟩
          sourceId := ⟨"MessageCatch_SettlementConfirmed"⟩
          targetId := ⟨"UserTask_RecordSettlement"⟩ }
      , { id := ⟨"Flow_StartToMessage"⟩
          sourceId := ⟨"StartEvent_AwaitSettlement"⟩
          targetId := ⟨"MessageCatch_SettlementConfirmed"⟩ }
      , { id := ⟨"Flow_TaskToEnd"⟩
          sourceId := ⟨"UserTask_RecordSettlement"⟩
          targetId := ⟨"EndEvent_SettlementRecorded"⟩ } ] }

def program : Program :=
  lowerCheckedProcess checkedProcess

def directChannelCheckedProcess : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun node =>
      match node with
      | .payloadMessageCatchEvent id _ output =>
          .payloadMessageCatchEvent id
            (.directMessage ⟨"Message_SettlementConfirmed"⟩) output
      | other => other }

def mergedMessageAndOutputCheckedProcess : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun node =>
      match node with
      | .payloadMessageCatchEvent id address output =>
          .payloadMessageCatchEvent id address
            { output with sourceDataOutputId := "Message_SettlementConfirmed" }
      | other => other }

def mergedOutputAndPropertyCheckedProcess : CheckedProcess :=
  { checkedProcess with
    nodes := checkedProcess.nodes.map fun node =>
      match node with
      | .payloadMessageCatchEvent id address output =>
          .payloadMessageCatchEvent id address
            { output with targetPropertyId := output.sourceDataOutputId }
      | other => other }

def subscriptionId : MessageSubscriptionId :=
  { processInstanceId := ⟨"MessagePayloadInstance_1"⟩
    elementId := ⟨"MessageCatch_SettlementConfirmed"⟩
    activation := 1 }

def payload : VariableValue :=
  .string "settlement-reference-123"

def startStimulus : Stimulus :=
  .startProcess ⟨"start-message-payload-process"⟩ ⟨processId.value⟩
    subscriptionId.processInstanceId []

def exactDelivery : Stimulus :=
  .deliverPayloadMessage ⟨"deliver-settlement"⟩ subscriptionId channel payload

def taskId : UserTaskInstanceId :=
  { processInstanceId := subscriptionId.processInstanceId
    elementId := ⟨"UserTask_RecordSettlement"⟩
    activation := 1 }

def exactCompletion : Stimulus :=
  .completeUserTaskInstance ⟨"complete-settlement-recording"⟩ taskId []

def messageWaitingResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program initialState startStimulus

def payloadSettledState : RuntimeState :=
  (deliverPayloadMessage program messageWaitingResult.state subscriptionId channel payload).getD
    initialState

def taskWaitingResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program messageWaitingResult.state exactDelivery

def completedResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program taskWaitingResult.state exactCompletion

/-- Pairwise distinction makes every routing witness below adversarial to name merging. -/
def registeredSettlementIdentitiesArePairwiseDistinct : Bool := decide <|
    List.Pairwise (fun left right => left ≠ right)
      [ "MessageCatch_SettlementConfirmed"
      , "Message_SettlementConfirmed"
      , directOutput.sourceDataOutputId
      , directOutput.targetPropertyId
      , "settlement-reference-123" ]

/-- The exact checked graph, independently validated lowered program, and their binding agree. -/
def exactCheckedAndLoweredDefinitionAreAdmitted : Bool := decide <|
    checkedWellFormed checkedProcess = true ∧
      programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧
      definitionBindingValid checkedProcess program = true

/-- Payload mediation requires the complete Interface/Operation/Message address. -/
def directMessageChannelIsRejected : Bool := decide <|
    checkedWellFormed directChannelCheckedProcess = false ∧
      programProfileCapabilitiesValid (lowerCheckedProcess directChannelCheckedProcess) = false ∧
      definitionBindingValid directChannelCheckedProcess
        (lowerCheckedProcess directChannelCheckedProcess) = false

/-- The Message and declared `DataOutput` identities cannot collapse. -/
def mergedMessageAndOutputIdentityIsRejected : Bool := decide <|
    checkedWellFormed mergedMessageAndOutputCheckedProcess = false ∧
      programProfileCapabilitiesValid
        (lowerCheckedProcess mergedMessageAndOutputCheckedProcess) = false ∧
      definitionBindingValid mergedMessageAndOutputCheckedProcess
        (lowerCheckedProcess mergedMessageAndOutputCheckedProcess) = false

/-- The fill name and association target cannot collapse. -/
def mergedOutputAndPropertyIdentityIsRejected : Bool := decide <|
    checkedWellFormed mergedOutputAndPropertyCheckedProcess = false ∧
      programProfileCapabilitiesValid
        (lowerCheckedProcess mergedOutputAndPropertyCheckedProcess) = false ∧
      definitionBindingValid mergedOutputAndPropertyCheckedProcess
        (lowerCheckedProcess mergedOutputAndPropertyCheckedProcess) = false

/-- Lowering retains the channel and all four direct-output fields on the distinct payload arm. -/
def loweringPreservesMessageAndDirectOutput : Bool := decide <|
    program.operations.find? (fun operation =>
        decide (operation.id.value =
          "operation:MessageCatch_SettlementConfirmed")) =
      some
        (.awaitPayloadMessage
          ⟨"operation:MessageCatch_SettlementConfirmed"⟩
          { elementId := ⟨"MessageCatch_SettlementConfirmed"⟩ }
          ⟨"place:Flow_StartToMessage"⟩
          ⟨"place:Flow_MessageToTask"⟩
          { elementId := ⟨"MessageCatch_SettlementConfirmed"⟩, channel }
          directOutput)

/-- The selected profile contains the payload arm and no payload-free Message arm. -/
def payloadProfileSelectsOnlyPayloadMessageArming : Bool := decide <|
    program.operations.any (fun operation =>
        match operation with | .awaitPayloadMessage .. => true | _ => false) = true ∧
      program.operations.any (fun operation =>
        match operation with | .awaitMessage .. => true | _ => false) = false

/-- Payload arming stays in the ordinary wait-arming commutation family. -/
def payloadArmingUsesOrdinaryWaitCommutationFamily : Bool := decide <|
    (program.operations.find? (fun operation =>
        decide (operation.id.value =
          "operation:MessageCatch_SettlementConfirmed"))).map
        semanticOperationInternalFamily =
      some .ordinaryWaitArming

/-- Arming consumes the incoming token, creates the unchanged ordinary Message wait and its exact
activation high-water mark, and creates no Process or local variable binding. -/
def payloadArmingCreatesOnlyTheOrdinaryMessageWait : Bool := decide <|
    messageWaitingResult.outcome = .committed ∧
      projectTokenMultiplicities program messageWaitingResult.state =
        [ (⟨"place:Flow_MessageToTask"⟩, 0)
        , (⟨"place:Flow_StartToMessage"⟩, 0)
        , (⟨"place:Flow_TaskToEnd"⟩, 0) ] ∧
      messageWaitingResult.state.messageWaits =
        [{ processInstanceId := subscriptionId.processInstanceId
           owner := rootScopeOccurrenceId subscriptionId.processInstanceId processId
           elementId := ⟨subscriptionId.elementId.value⟩
           activation := subscriptionId.activation
           channel
           output := ⟨"place:Flow_MessageToTask"⟩ }] ∧
      messageWaitingResult.state.messageActivations =
        [{ elementId := ⟨subscriptionId.elementId.value⟩, count := 1 }] ∧
      messageWaitingResult.state.variables = emptyScopedVariables

/-- Delivery atomically withdraws the subscription, follows its outgoing place, and commits only
the routed `Property`; the `DataOutput`, its presentation name, Message id, and payload value never
become Process binding names. -/
def exactDeliveryIsOneAtomicRoutedCommit : Bool := decide <|
    payloadSettledState.messageWaits = [] ∧
      payloadSettledState.tokens =
        [{ placeId := ⟨"place:Flow_MessageToTask"⟩
           owner := rootScopeOccurrenceId subscriptionId.processInstanceId processId }] ∧
      payloadSettledState.variables.process.bindings =
        [{ name := directOutput.targetPropertyId, value := payload }] ∧
      payloadSettledState.variables.activities = [] ∧
      (payloadSettledState.variables.process.bindings.map (·.name)).contains
          directOutput.sourceDataOutputId = false ∧
      (payloadSettledState.variables.process.bindings.map (·.name)).contains
          "Confirmed settlement reference" = false ∧
      (payloadSettledState.variables.process.bindings.map (·.name)).contains
          "Message_SettlementConfirmed" = false ∧
      (payloadSettledState.variables.process.bindings.map (·.name)).contains
          "settlement-reference-123" = false

def unrelatedBinding : VariableBinding :=
  { name := "Property_UnrelatedAudit", value := .boolean true }

def messageWaitingWithUnrelatedBinding : RuntimeState :=
  { messageWaitingResult.state with
    variables :=
      { messageWaitingResult.state.variables with
        process := { bindings := [unrelatedBinding] } } }

/-- A routed replacement is a one-name merge; unrelated Process state is retained. -/
def deliveryPreservesUnrelatedProcessBindings : Bool := decide <|
    (deliverPayloadMessage program messageWaitingWithUnrelatedBinding subscriptionId channel
        payload).map (fun state => state.variables.process.bindings) =
      some
        [ { name := directOutput.targetPropertyId, value := payload }
        , unrelatedBinding ]

/-- The selected ingress admits exactly scalar payload forms in this capsule. -/
def payloadValueDomainAdmitsScalarsAndRejectsCollections : Bool := decide <|
    [ .string "value", .boolean true, .integer 7, .null ].all
          (variableValueAdmitted profileId .messagePayload) = true ∧
      variableValueAdmitted profileId .messagePayload (.stringList ["value"]) = false

def payloadFreeDelivery : Stimulus :=
  .deliverMessage ⟨"deliver-without-payload"⟩ subscriptionId channel

/-- The existing payload-free command cannot consume a payload-declaring subscription. -/
def payloadFreeDeliveryArmRefusesAndKeepsSubscriptionLive : Bool := decide <|
    applyStimulus scenarioClosureLimit program messageWaitingResult.state payloadFreeDelivery =
      { outcome := .rejected
        state := messageWaitingResult.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def mismatchedPayloadDeliveries : List Stimulus :=
  [ .deliverPayloadMessage ⟨"wrong-instance"⟩
      { subscriptionId with processInstanceId := ⟨"OtherInstance"⟩ } channel payload
  , .deliverPayloadMessage ⟨"wrong-element"⟩
      { subscriptionId with elementId := ⟨"OtherCatch"⟩ } channel payload
  , .deliverPayloadMessage ⟨"wrong-activation"⟩
      { subscriptionId with activation := 2 } channel payload
  , .deliverPayloadMessage ⟨"wrong-channel"⟩ subscriptionId
      (.operationMessage ⟨"OtherInterface"⟩
        ⟨"Operation_ReceiveSettlementConfirmation"⟩
        ⟨"Message_SettlementConfirmed"⟩) payload
  , .deliverPayloadMessage ⟨"collection-payload"⟩ subscriptionId channel
      (.stringList ["settlement-reference-123"]) ]

/-- Wrong/stale occurrence identity, channel mismatch, and the excluded collection value all reject
with the exact live subscription state retained. -/
def everyPayloadMismatchKeepsTheSubscriptionLive : Bool := decide <|
    mismatchedPayloadDeliveries.map (fun stimulus =>
        let result := applyStimulus scenarioClosureLimit program messageWaitingResult.state stimulus
        (result.outcome, result.state)) =
      List.replicate 5 (.rejected, messageWaitingResult.state)

/-- Once the exact occurrence has settled, the same occurrence identity is stale. -/
def consumedPayloadSubscriptionCannotSettleTwice : Bool := decide <|
    applyStimulus scenarioClosureLimit program taskWaitingResult.state
        (.deliverPayloadMessage ⟨"deliver-settlement-stale"⟩ subscriptionId channel payload) =
      { outcome := .rejected
        state := taskWaitingResult.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def eventRaceOwnedWaitingState : RuntimeState :=
  { messageWaitingResult.state with
    eventRaces :=
      [{ id :=
          { processInstanceId := subscriptionId.processInstanceId
            elementId := ⟨"EventGateway_ArtificialOwner"⟩
            activation := 1 }
         owner := rootScopeOccurrenceId subscriptionId.processInstanceId processId
         messageSubscriptionId := subscriptionId
         timerOccurrenceId :=
           { processInstanceId := subscriptionId.processInstanceId
             elementId := ⟨"TimerCatch_ArtificialSibling"⟩
             activation := 1 } }] }

/-- Payload delivery is not an Event Race winning operation in this bounded capsule. -/
def eventRaceOwnershipRefusesPayloadDeliveryExactly : Bool := decide <|
    applyStimulus scenarioClosureLimit program eventRaceOwnedWaitingState exactDelivery =
      { outcome := .rejected
        state := eventRaceOwnedWaitingState
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

def payloadFreeCheckedProcess : CheckedProcess :=
  { checkedProcess with
    identity :=
      { checkedProcess.identity with
        semanticProfile := ⟨"bpmn-2.0.2-intermediate-catch-message-draft"⟩ }
    nodes := checkedProcess.nodes.map fun node =>
      match node with
      | .payloadMessageCatchEvent id address _ =>
          .intermediateCatchMessageEvent id address
      | other => other }

def payloadFreeProgram : Program :=
  lowerCheckedProcess payloadFreeCheckedProcess

def payloadFreeWaitingResult : StimulusResult :=
  applyStimulus scenarioClosureLimit payloadFreeProgram initialState startStimulus

/-- An admitted ordinary Message program has no payload declarer, even though its public wait shape
and subscription address are identical. -/
def payloadDeliveryAgainstPayloadFreeProgramRefusesAndKeepsWait : Bool := decide <|
    definitionBindingValid payloadFreeCheckedProcess payloadFreeProgram = true ∧
      payloadFreeWaitingResult.state.messageWaits = messageWaitingResult.state.messageWaits ∧
      applyStimulus scenarioClosureLimit payloadFreeProgram payloadFreeWaitingResult.state
          exactDelivery =
        { outcome := .rejected
          state := payloadFreeWaitingResult.state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false }

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
    enabledInteractions := [.deliverPayloadMessage subscriptionId channel]
    logicalTimeMs := 0 }

def taskWaitingObservation : StateObservation :=
  { instanceId := taskId.processInstanceId
    status := .running
    activeWaits :=
      [{ elementId := taskId.elementId
         kind := .userTask
         multiplicity := 1 }]
    openUserTasks :=
      [{ id := taskId, name := some "Record settlement", state := .active }]
    openMessageSubscriptions := []
    openTimers := []
    openEffects := []
    variables := [{ name := directOutput.targetPropertyId, value := payload }]
    enabledInteractions := [.completeUserTaskInstance taskId]
    logicalTimeMs := 0 }

def completedObservation : StateObservation :=
  { taskWaitingObservation with
    status := .completed
    activeWaits := []
    openUserTasks := []
    enabledInteractions := [] }

/-- Public waiting state keeps the ordinary Message wait/subscription shapes but advertises the
payload-bearing delivery capability selected from the unique declarer. -/
def publicWaitingObservationPublishesPayloadDelivery : Bool := decide <|
    observeStableState program messageWaitingResult.state = some messageWaitingObservation

/-- A supplied String commits the routed Property before the trailing User Task opens. -/
def suppliedStringCommitsAndOpensTrailingTask : Bool := decide <|
    taskWaitingResult.outcome = .committed ∧
      taskWaitingResult.state.messageWaits = [] ∧
      taskWaitingResult.state.variables.process.bindings =
        [{ name := directOutput.targetPropertyId, value := payload }] ∧
      observeStableState program taskWaitingResult.state = some taskWaitingObservation

def nullDelivery : Stimulus :=
  .deliverPayloadMessage ⟨"deliver-null-settlement"⟩ subscriptionId channel .null

def nullTaskWaitingResult : StimulusResult :=
  applyStimulus scenarioClosureLimit program messageWaitingResult.state nullDelivery

/-- Explicit null is a supplied scalar, not absence. -/
def suppliedNullCommitsTheRoutedProperty : Bool := decide <|
    nullTaskWaitingResult.outcome = .committed ∧
      nullTaskWaitingResult.state.variables.process.bindings =
        [{ name := directOutput.targetPropertyId, value := .null }]

/-- Completing the trailing User Task and None End retains the routed Process Property. -/
def trailingUserTaskAndEndRetainTheRoutedProperty : Bool := decide <|
    completedResult.outcome = .committed ∧
      completedResult.state.variables.process.bindings =
        [{ name := directOutput.targetPropertyId, value := payload }] ∧
      observeStableState program completedResult.state = some completedObservation

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("registeredSettlementIdentitiesArePairwiseDistinct", registeredSettlementIdentitiesArePairwiseDistinct),
  ("exactCheckedAndLoweredDefinitionAreAdmitted", exactCheckedAndLoweredDefinitionAreAdmitted),
  ("directMessageChannelIsRejected", directMessageChannelIsRejected),
  ("mergedMessageAndOutputIdentityIsRejected", mergedMessageAndOutputIdentityIsRejected),
  ("mergedOutputAndPropertyIdentityIsRejected", mergedOutputAndPropertyIdentityIsRejected),
  ("loweringPreservesMessageAndDirectOutput", loweringPreservesMessageAndDirectOutput),
  ("payloadProfileSelectsOnlyPayloadMessageArming", payloadProfileSelectsOnlyPayloadMessageArming),
  ("payloadArmingUsesOrdinaryWaitCommutationFamily", payloadArmingUsesOrdinaryWaitCommutationFamily),
  ("payloadArmingCreatesOnlyTheOrdinaryMessageWait", payloadArmingCreatesOnlyTheOrdinaryMessageWait),
  ("exactDeliveryIsOneAtomicRoutedCommit", exactDeliveryIsOneAtomicRoutedCommit),
  ("deliveryPreservesUnrelatedProcessBindings", deliveryPreservesUnrelatedProcessBindings),
  ("payloadValueDomainAdmitsScalarsAndRejectsCollections", payloadValueDomainAdmitsScalarsAndRejectsCollections),
  ("payloadFreeDeliveryArmRefusesAndKeepsSubscriptionLive", payloadFreeDeliveryArmRefusesAndKeepsSubscriptionLive),
  ("everyPayloadMismatchKeepsTheSubscriptionLive", everyPayloadMismatchKeepsTheSubscriptionLive),
  ("consumedPayloadSubscriptionCannotSettleTwice", consumedPayloadSubscriptionCannotSettleTwice),
  ("eventRaceOwnershipRefusesPayloadDeliveryExactly", eventRaceOwnershipRefusesPayloadDeliveryExactly),
  ("payloadDeliveryAgainstPayloadFreeProgramRefusesAndKeepsWait", payloadDeliveryAgainstPayloadFreeProgramRefusesAndKeepsWait),
  ("publicWaitingObservationPublishesPayloadDelivery", publicWaitingObservationPublishesPayloadDelivery),
  ("suppliedStringCommitsAndOpensTrailingTask", suppliedStringCommitsAndOpensTrailingTask),
  ("suppliedNullCommitsTheRoutedProperty", suppliedNullCommitsTheRoutedProperty),
  ("trailingUserTaskAndEndRetainTheRoutedProperty", trailingUserTaskAndEndRetainTheRoutedProperty)
]

end BpmnSemantics.MessagePayloadCatchConformance
