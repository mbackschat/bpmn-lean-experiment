import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.CommandAdmission
import BpmnSemantics.SemanticProcess.InternalCommutationCensus
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.MessageBoundedTaskLaws
import BpmnSemantics.SemanticProcess.RootScopeFixtures
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.Transition

/-! # Interrupting Activity boundary Message conformance

Kernel-decided witnesses bind the exact source identity to its distinct checked and IL arms, then
exercise atomic same-owner arming, both exclusive victories, the refusal matrix, and the tagged
handler adversary. Public Flow Node occurrence publication remains outside this checkpoint.
-/

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

theorem source_and_lowering_are_admitted :
    checkedWellFormed checkedProcess = true ∧
      lowerCheckedProcess checkedProcess = program ∧
      programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true := by
  decide +kernel

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

theorem late_arming_checked_process_is_refused :
    checkedWellFormed lateArmingCheckedProcess = false := by
  decide +kernel

theorem late_arming_program_profile_is_refused :
    programProfileCapabilitiesValid lateArmingProgram = false := by
  decide +kernel

theorem boundary_message_is_grouped_only_with_its_host :
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
        | _ => false) = [] := by
  decide +kernel

theorem message_bounded_arming_is_classified_as_composite :
    semanticOperationInternalFamily messageBoundedOperation =
      .compositeWaitAndActivityArming := by
  decide +kernel

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

theorem operation_arms_the_exact_atomic_state :
    fire? program messageBoundedOperation beforeArming = some armedState ∧
      armedState.tokens = [] ∧
      (armedState.waits.map fun wait =>
        (wait.task.id.value, wait.activation, wait.owner)) =
          [("ReviewApplication", 1, owner)] ∧
      (armedState.messageWaits.map fun wait =>
        (wait.elementId.value, wait.activation, wait.channel, wait.owner)) =
          [("Withdrawal", 1, channel, owner)] ∧
      (armedState.activityOccurrences.map fun record =>
        (record.activityElementId.value, record.activation, record.owner,
          record.attachedHandlers)) =
          [("ReviewApplication", 1, owner,
            [.message
              { processInstanceId := instanceId, elementId := ⟨"Withdrawal"⟩,
                activation := 1 }])] := by
  decide +kernel

theorem arming_writer_preserves_identity_and_body_claim_discipline :
    activityIdentityIssuingDiscipline beforeArming armedState = true ∧
      activityBodyClaimsUnique armedState.activityOccurrences = true := by
  constructor
  · simpa [armedState] using
      activateMessageBoundedUserTask_issues_fresh_activity beforeArming instanceId owner
        ⟨"place:Flow_Start"⟩
        { id := ⟨"ReviewApplication"⟩, name := some "Review application",
          output := ⟨"place:Flow_Normal"⟩ }
        { elementId := ⟨"Withdrawal"⟩, channel,
          output := ⟨"place:Flow_Boundary"⟩,
          origin := { elementId := ⟨"Flow_Boundary"⟩ } }
  · apply activateMessageBoundedUserTask_preserves_activityBodyClaimsUnique
    · decide +kernel
    · decide +kernel
    · decide +kernel

theorem armed_state_is_well_formed :
    runtimeStateWellFormed program instanceId armedState = true := by
  decide +kernel

def taskId : UserTaskInstanceId :=
  { processInstanceId := instanceId, elementId := ⟨"ReviewApplication"⟩, activation := 1 }

def subscriptionId : MessageSubscriptionId :=
  { processInstanceId := instanceId, elementId := ⟨"Withdrawal"⟩, activation := 1 }

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

theorem task_victory_uses_only_the_normal_route :
    completeMessageBoundedUserTask? program armedState instanceId
      ⟨"ReviewApplication"⟩ 1 [] = some afterTaskVictory := by
  decide +kernel

theorem task_victory_evaluator_is_sound :
    MessageBoundedTaskVictoryStep program armedState afterTaskVictory :=
  completeMessageBoundedUserTask_sound program armedState afterTaskVictory instanceId
    ⟨"ReviewApplication"⟩ 1 [] task_victory_uses_only_the_normal_route

theorem message_victory_uses_only_the_boundary_route :
    interruptMessageBoundedUserTask? program armedState subscriptionId channel =
      some afterMessageVictory := by
  decide +kernel

theorem message_victory_evaluator_is_sound :
    MessageBoundedTaskVictoryStep program armedState afterMessageVictory :=
  interruptMessageBoundedUserTask_sound program armedState afterMessageVictory subscriptionId
    channel message_victory_uses_only_the_boundary_route

theorem both_victory_writers_issue_no_activity_identity :
    activityIdentityIssuingDiscipline armedState afterTaskVictory = true ∧
      activityIdentityIssuingDiscipline armedState afterMessageVictory = true := by
  exact
    ⟨messageBoundedTaskVictory_activity_identity_discipline program armedState
        afterTaskVictory task_victory_evaluator_is_sound,
      messageBoundedTaskVictory_activity_identity_discipline program armedState
        afterMessageVictory message_victory_evaluator_is_sound⟩

def wrongFamilyState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences.map fun record =>
      { record with
        attachedHandlers := record.attachedHandlers.map fun
          | .message occurrence => .timer occurrence
          | handler => handler } }

theorem wrong_handler_family_is_neither_well_formed_nor_deliverable :
    runtimeStateWellFormed program instanceId wrongFamilyState = false ∧
      interruptMessageBoundedUserTask? program wrongFamilyState subscriptionId channel = none := by
  decide +kernel

def wrongChannel : MessageChannel :=
  .operationMessage ⟨"Interface_Other"⟩ ⟨"Operation_Other"⟩ ⟨"Message_Other"⟩

private def rejectedPreserving (admission : ExternalAdmission) (state : RuntimeState) : Bool :=
  decide (admission.outcome = .rejected) && decide (admission.state = state)

theorem exact_refusal_matrix :
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
          armedState = true := by
  decide +kernel

theorem stale_losing_inputs_preserve_the_winning_state :
    rejectedPreserving (dispatchStimulus program afterTaskVictory
        (.deliverMessage ⟨"stale-message"⟩ subscriptionId channel)) afterTaskVictory = true ∧
      rejectedPreserving (dispatchStimulus program afterMessageVictory
        (.completeUserTaskInstance ⟨"stale-task"⟩ taskId [])) afterMessageVictory = true := by
  decide +kernel

end BpmnSemantics.ActivityBoundaryMessageConformance
