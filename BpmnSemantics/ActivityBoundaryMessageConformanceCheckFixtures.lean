module

public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.CommandAdmission
public import BpmnSemantics.SemanticProcess.InternalCommutationCensus
public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.Transition

/-! # ActivityBoundaryMessageConformance check fixtures

The fixture definitions and executable checks of [`ActivityBoundaryMessageConformance`](ActivityBoundaryMessageConformance.lean), apart from its proofs, so the conformance check driver runs them without loading a proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)).
-/

@[expose] public section

namespace BpmnSemantics.ActivityBoundaryMessageConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def channel : MessageChannel :=
  .operationMessage
    ⟨"Interface_ApplicationMessages"⟩
    ⟨"Operation_ReceiveApplicationWithdrawal"⟩
    ⟨"Message_ApplicationWithdrawal"⟩

def checkedProcess : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-activity-boundary-message-draft"⟩
        sourceId := ⟨"activity-boundary-message"⟩
        sourceSha256 :=
          "5481e9dd1639c9bdf5b640b7cbeff7b6d44c6b6b661756c743b50efa7319fd16" }
    processId := ⟨"Process_ActivityBoundaryMessage"⟩
    definitionScopes := [rootDefinitionScope ⟨"Process_ActivityBoundaryMessage"⟩]
    nodeScopes := rootNodeScopes ⟨"Process_ActivityBoundaryMessage"⟩
      [ ⟨"BoundaryEnd"⟩, ⟨"HandleWithdrawal"⟩, ⟨"NormalEnd"⟩
      , ⟨"RecordReviewCompletion"⟩, ⟨"ReviewApplication"⟩, ⟨"Start"⟩
      , ⟨"Withdrawal"⟩ ]
    sequenceFlowScopes := rootSequenceFlowScopes
      ⟨"Process_ActivityBoundaryMessage"⟩
      [ ⟨"Flow_Boundary"⟩, ⟨"Flow_Boundary_End"⟩, ⟨"Flow_Normal"⟩
      , ⟨"Flow_Normal_End"⟩, ⟨"Flow_Start"⟩ ]
    nodes :=
      [ .noneEndEvent ⟨"BoundaryEnd"⟩
      , .userTask ⟨"HandleWithdrawal"⟩ (some "Handle withdrawal")
      , .noneEndEvent ⟨"NormalEnd"⟩
      , .userTask ⟨"RecordReviewCompletion"⟩ (some "Record review completion")
      , .userTask ⟨"ReviewApplication"⟩ (some "Review application")
      , .noneStartEvent ⟨"Start"⟩
      , .messageBoundaryEvent ⟨"Withdrawal"⟩ ⟨"ReviewApplication"⟩
          .interrupting channel ⟨"Flow_Boundary"⟩ ]
    sequenceFlows :=
      [ { id := ⟨"Flow_Boundary"⟩, sourceId := ⟨"Withdrawal"⟩,
          targetId := ⟨"HandleWithdrawal"⟩ }
      , { id := ⟨"Flow_Boundary_End"⟩, sourceId := ⟨"HandleWithdrawal"⟩,
          targetId := ⟨"BoundaryEnd"⟩ }
      , { id := ⟨"Flow_Normal"⟩, sourceId := ⟨"ReviewApplication"⟩,
          targetId := ⟨"RecordReviewCompletion"⟩ }
      , { id := ⟨"Flow_Normal_End"⟩, sourceId := ⟨"RecordReviewCompletion"⟩,
          targetId := ⟨"NormalEnd"⟩ }
      , { id := ⟨"Flow_Start"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"ReviewApplication"⟩ } ] }

def program : Program := lowerCheckedProcess checkedProcess

def messageBoundedOperation : SemanticOperation :=
  .awaitMessageBoundedUserTask
    ⟨"operation:ReviewApplication"⟩
    { elementId := ⟨"ReviewApplication"⟩ }
    ⟨"place:Flow_Start"⟩
    { id := ⟨"ReviewApplication"⟩
      name := some "Review application"
      output := ⟨"place:Flow_Normal"⟩ }
    { elementId := ⟨"Withdrawal"⟩
      channel
      output := ⟨"place:Flow_Boundary"⟩
      origin := { elementId := ⟨"Flow_Boundary"⟩ } }

def source_and_lowering_are_admitted : Bool := decide <|
    checkedWellFormed checkedProcess = true ∧
      lowerCheckedProcess checkedProcess = program ∧
      programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true
def lateArmingCheckedProcess : CheckedProcess :=
  { checkedProcess with
    sequenceFlows :=
      [ { id := ⟨"Flow_Boundary"⟩, sourceId := ⟨"Withdrawal"⟩,
          targetId := ⟨"HandleWithdrawal"⟩ }
      , { id := ⟨"Flow_Boundary_End"⟩, sourceId := ⟨"HandleWithdrawal"⟩,
          targetId := ⟨"BoundaryEnd"⟩ }
      , { id := ⟨"Flow_Normal"⟩, sourceId := ⟨"RecordReviewCompletion"⟩,
          targetId := ⟨"ReviewApplication"⟩ }
      , { id := ⟨"Flow_Normal_End"⟩, sourceId := ⟨"ReviewApplication"⟩,
          targetId := ⟨"NormalEnd"⟩ }
      , { id := ⟨"Flow_Start"⟩, sourceId := ⟨"Start"⟩,
          targetId := ⟨"RecordReviewCompletion"⟩ } ] }

def lateArmingProgram : Program := lowerCheckedProcess lateArmingCheckedProcess

def late_arming_checked_process_is_refused : Bool := decide <|
    checkedWellFormed lateArmingCheckedProcess = false
def late_arming_program_profile_is_refused : Bool := decide <|
    programProfileCapabilitiesValid lateArmingProgram = false
def boundary_message_is_grouped_only_with_its_host : Bool := decide <|
    messageBoundedTaskOperations program =
      [(⟨"place:Flow_Start"⟩,
        { id := ⟨"ReviewApplication"⟩, name := some "Review application",
          output := ⟨"place:Flow_Normal"⟩ },
        { elementId := ⟨"Withdrawal"⟩, channel,
          output := ⟨"place:Flow_Boundary"⟩,
          origin := { elementId := ⟨"Flow_Boundary"⟩ } })] ∧
      (program.operations.filter fun
        | .awaitMessage _ _ _ _ message => decide (message.elementId = ⟨"Withdrawal"⟩)
        | .awaitUserTask _ _ _ _ task => decide (task.id = ⟨"ReviewApplication"⟩)
        | _ => false) = []
def message_bounded_arming_is_classified_as_composite : Bool := decide <|
    semanticOperationInternalFamily messageBoundedOperation =
      .compositeWaitAndActivityArming
def instanceId : SemanticId := ⟨"Instance_ActivityBoundaryMessage_1"⟩

def owner : ScopeOccurrenceId :=
  rootScopeOccurrenceId instanceId checkedProcess.processId

def beforeArming : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    tokens := [rootToken instanceId checkedProcess.processId ⟨"place:Flow_Start"⟩]
    scopeActivations :=
      [{ scopeId := owner.definitionScopeId, count := owner.activation }] }

def armedState : RuntimeState :=
  activateMessageBoundedUserTask beforeArming instanceId owner
    ⟨"place:Flow_Start"⟩
    { id := ⟨"ReviewApplication"⟩, name := some "Review application",
      output := ⟨"place:Flow_Normal"⟩ }
    { elementId := ⟨"Withdrawal"⟩, channel,
      output := ⟨"place:Flow_Boundary"⟩,
      origin := { elementId := ⟨"Flow_Boundary"⟩ } }

def taskId : UserTaskInstanceId :=
  { processInstanceId := instanceId, elementId := ⟨"ReviewApplication"⟩, activation := 1 }

def subscriptionId : MessageSubscriptionId :=
  { processInstanceId := instanceId, elementId := ⟨"Withdrawal"⟩, activation := 1 }

def taskStart : OpenSemanticFlowNodeOccurrence :=
  { anchor := .wait taskId
    processId := checkedProcess.processId
    elementId := ⟨"ReviewApplication"⟩
    owner }

def subscriptionStart : OpenSemanticFlowNodeOccurrence :=
  { anchor := .wait subscriptionId
    processId := checkedProcess.processId
    elementId := ⟨"Withdrawal"⟩
    owner }

def armed_open_occurrences_are_exactly_task_and_subscription : Bool := decide <|
    projectOpenFlowNodeOccurrences? program armedState =
      some [taskStart, subscriptionStart]
def arming_publishes_both_waits_and_no_boundary_transition : Bool := decide <|
    flowNodeOccurrenceDeltaForOperation? program beforeArming armedState
        messageBoundedOperation ⟨"arm-boundary-message"⟩ 0 =
      some (canonicalFlowNodeOccurrenceDelta [taskStart, subscriptionStart] [])
def afterTaskVictory : RuntimeState :=
  { armedState with
    waits := []
    messageWaits := []
    activityOccurrences := []
    tokens := [rootToken instanceId checkedProcess.processId ⟨"place:Flow_Normal"⟩] }

def afterMessageVictory : RuntimeState :=
  { armedState with
    waits := []
    messageWaits := []
    activityOccurrences := []
    tokens := [rootToken instanceId checkedProcess.processId ⟨"place:Flow_Boundary"⟩] }

def task_victory_completes_task_and_cancels_subscription : Bool := decide <|
    flowNodeOccurrenceDeltaForStimulus? program armedState afterTaskVictory
        (.completeUserTaskInstance ⟨"complete-review"⟩ taskId []) 0 =
      some (canonicalFlowNodeOccurrenceDelta []
        [ { anchor := .wait taskId, terminal := .completed }
        , { anchor := .wait subscriptionId, terminal := .cancelled } ])
def message_victory_cancels_task_and_completes_boundary_atomically : Bool := decide <|
    flowNodeOccurrenceDeltaForStimulus? program armedState afterMessageVictory
        (.deliverMessage ⟨"deliver-withdrawal"⟩ subscriptionId channel) 0 =
      some (instantaneousFlowNodeOccurrenceDeltaWithEnds ⟨"deliver-withdrawal"⟩ 0
        [{ processId := checkedProcess.processId, elementId := ⟨"Withdrawal"⟩, owner }]
        [ { anchor := .wait taskId, terminal := .cancelled }
        , { anchor := .wait subscriptionId, terminal := .completed } ])
def mismatchedPairState : RuntimeState :=
  { armedState with
    messageWaits := armedState.messageWaits.map fun wait => { wait with activation := 2 }
    messageActivations := [{ elementId := ⟨"Withdrawal"⟩, count := 2 }] }

def independently_projected_open_set_rejects_a_mismatched_pair : Bool := decide <|
    projectOpenFlowNodeOccurrences? program mismatchedPairState = none
def wrongFamilyState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences.map fun record =>
      { record with
        attachedHandlers := record.attachedHandlers.map fun
          | .message occurrence => .timer occurrence
          | handler => handler } }

def wrong_handler_family_is_neither_well_formed_nor_deliverable : Bool := decide <|
    runtimeStateWellFormed program instanceId wrongFamilyState = false ∧
      interruptMessageBoundedUserTask? program wrongFamilyState subscriptionId channel = none
def wrongChannel : MessageChannel :=
  .operationMessage ⟨"Interface_Other"⟩ ⟨"Operation_Other"⟩ ⟨"Message_Other"⟩

def rejectedPreserving (admission : ExternalAdmission) (state : RuntimeState) : Bool :=
  decide (admission.outcome = .rejected) && decide (admission.state = state)

def exact_refusal_matrix : Bool := decide <|
    rejectedPreserving (dispatchStimulus program armedState
        (.completeUserTaskInstance ⟨"wrong-task"⟩
          { taskId with activation := 2 } [])) armedState = true ∧
      rejectedPreserving (dispatchStimulus program armedState
        (.completeUserTaskInstance ⟨"nonempty-completion"⟩ taskId
          [{ name := "unexpected", value := .string "value" }])) armedState = true ∧
      rejectedPreserving (dispatchStimulus program armedState
        (.deliverMessage ⟨"wrong-subscription"⟩
          { subscriptionId with activation := 2 } channel)) armedState = true ∧
      rejectedPreserving (dispatchStimulus program armedState
        (.deliverMessage ⟨"wrong-channel"⟩ subscriptionId wrongChannel)) armedState = true ∧
      rejectedPreserving (dispatchStimulus program armedState
        (.deliverPayloadMessage ⟨"payload"⟩ subscriptionId channel (.string "payload")))
          armedState = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("source_and_lowering_are_admitted", source_and_lowering_are_admitted),
  ("late_arming_checked_process_is_refused", late_arming_checked_process_is_refused),
  ("late_arming_program_profile_is_refused", late_arming_program_profile_is_refused),
  ("boundary_message_is_grouped_only_with_its_host", boundary_message_is_grouped_only_with_its_host),
  ("message_bounded_arming_is_classified_as_composite", message_bounded_arming_is_classified_as_composite),
  ("armed_open_occurrences_are_exactly_task_and_subscription", armed_open_occurrences_are_exactly_task_and_subscription),
  ("arming_publishes_both_waits_and_no_boundary_transition", arming_publishes_both_waits_and_no_boundary_transition),
  ("task_victory_completes_task_and_cancels_subscription", task_victory_completes_task_and_cancels_subscription),
  ("message_victory_cancels_task_and_completes_boundary_atomically", message_victory_cancels_task_and_completes_boundary_atomically),
  ("independently_projected_open_set_rejects_a_mismatched_pair", independently_projected_open_set_rejects_a_mismatched_pair),
  ("wrong_handler_family_is_neither_well_formed_nor_deliverable", wrong_handler_family_is_neither_well_formed_nor_deliverable),
  ("exact_refusal_matrix", exact_refusal_matrix)
]

end BpmnSemantics.ActivityBoundaryMessageConformance
