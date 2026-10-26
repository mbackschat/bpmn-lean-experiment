module

public import BpmnSemantics.ActivityBoundaryMessageConformanceCheckFixtures
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.CommandAdmission
public import BpmnSemantics.SemanticProcess.InternalCommutationCensus
public import BpmnSemantics.SemanticProcess.Lowering
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.MessageBoundedTaskLaws
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
public import BpmnSemantics.SemanticProcess.Transition
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.ProfileShapeCatalog
import all BpmnSemantics.SemanticProcess.SequentialScopeRuntime

/-! # Interrupting Activity boundary Message conformance

Kernel-decided witnesses bind the exact source identity to its distinct checked and IL arms, then
exercise atomic same-owner arming, both exclusive victories, the refusal matrix, the tagged handler
adversary, and exact Flow Node occurrence publication.
-/

@[expose] public section

namespace BpmnSemantics.ActivityBoundaryMessageConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

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

theorem stale_losing_inputs_preserve_the_winning_state :
    rejectedPreserving (dispatchStimulus program afterTaskVictory
        (.deliverMessage ⟨"stale-message"⟩ subscriptionId channel)) afterTaskVictory = true ∧
      rejectedPreserving (dispatchStimulus program afterMessageVictory
        (.completeUserTaskInstance ⟨"stale-task"⟩ taskId [])) afterMessageVictory = true := by
  decide +kernel

end BpmnSemantics.ActivityBoundaryMessageConformance
