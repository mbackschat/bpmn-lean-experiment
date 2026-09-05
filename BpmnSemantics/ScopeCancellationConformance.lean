import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.ScopeCancellation

/-! # Regional Activity lifetime regression witnesses

AOO-CANCEL-01 follows the Activity record's body and tagged attachments across scope owners.
These literal ownership graphs exercise cancellation without claiming new profile admission.
Called-Process cleanup also supplies exact predecessor membership for the Activity issuing census.
-/

set_option Elab.async false

namespace BpmnSemantics.ScopeCancellationConformance

open BpmnSemantics.SemanticProcess

private def root : ScopeOccurrenceId := ⟨⟨"Instance"⟩, ⟨"scope:root"⟩, 1⟩
private def child : ScopeOccurrenceId := ⟨⟨"Instance"⟩, ⟨"scope:child"⟩, 1⟩
private def activityId : ActivityOccurrenceId := ⟨⟨"Instance"⟩, ⟨"Child"⟩, 1⟩
private def messageId : OccurrenceId := ⟨⟨"Instance"⟩, ⟨"Message"⟩, 1⟩

private def attachedMessage : MessageWait :=
  { processInstanceId := ⟨"Instance"⟩
    owner := root
    elementId := ⟨"Message"⟩
    activation := 1
    channel := .directMessage ⟨"Message"⟩
    output := ⟨"place:handler"⟩ }

private def otherActivationMessage : MessageWait :=
  { attachedMessage with activation := 2 }

private def sameCoordinatesTimer : TimerWait :=
  { processInstanceId := ⟨"Instance"⟩
    owner := root
    elementId := ⟨"Message"⟩
    activation := 1
    deadlineMs := 9000
    output := ⟨"place:timer"⟩ }

private def state : RuntimeState :=
  { initialState with
    control := .running ⟨"Instance"⟩
    scopeOccurrences := [{ id := root, parent := none }, { id := child, parent := some root }]
    activityOccurrences :=
      [{ processInstanceId := ⟨"Instance"⟩
         activityElementId := ⟨"Child"⟩
         activation := 1
         owner := root
         body := .childScope child
         attachedHandlers := [.message messageId] }]
    messageWaits := [attachedMessage, otherActivationMessage]
    timerWaits := [sameCoordinatesTimer]
    variables :=
      { process := { bindings := [] }
        activities :=
          [{ owner := .activityOccurrence activityId, bindings := [] },
           { owner := .activityOccurrence { activityId with activation := 2 }, bindings := [] },
           { owner := .effectOccurrence ⟨⟨"Instance"⟩, ⟨"Child"⟩, 1⟩, bindings := [] }] } }

theorem removal_withdraws_exact_activity_local_data :
    (cancelScopeSubtree state child .remove).variables.activities =
      state.variables.activities.tail := by decide +kernel

theorem retained_region_also_withdraws_exact_activity_local_data :
    (cancelScopeSubtree state child .retain).variables.activities =
      state.variables.activities.tail := by decide +kernel

theorem removal_withdraws_exact_parent_owned_message :
    (cancelScopeSubtree state child .remove).messageWaits =
      [otherActivationMessage] := by decide +kernel

theorem retained_region_also_withdraws_exact_parent_owned_message :
    (cancelScopeSubtree state child .retain).messageWaits =
      [otherActivationMessage] := by decide +kernel

theorem message_attachment_does_not_withdraw_same_coordinates_timer :
    (cancelScopeSubtree state child .remove).timerWaits =
      [sameCoordinatesTimer] := by decide +kernel

theorem both_dispositions_withdraw_the_activity_record :
    (cancelScopeSubtree state child .remove).activityOccurrences = [] ∧
      (cancelScopeSubtree state child .retain).activityOccurrences = [] := by decide +kernel

theorem disposition_selects_only_the_region_occurrence_lifetime :
    (cancelScopeSubtree state child .remove).scopeOccurrences =
        [{ id := root, parent := none }] ∧
      (cancelScopeSubtree state child .retain).scopeOccurrences =
        state.scopeOccurrences := by decide +kernel

private def otherRoot : ScopeOccurrenceId := ⟨⟨"OtherInstance"⟩, ⟨"scope:root"⟩, 1⟩

private def triggerFor (owner : ScopeOccurrenceId) : CompensationTriggerExecution :=
  { id := ⟨owner.processInstanceId, ⟨"Throw"⟩, 1⟩
    owner
    output := ⟨"place:afterCompensation"⟩
    lifecycle := .active
    handlers :=
      [{ identity :=
           { id := ⟨owner.processInstanceId, ⟨"Handler"⟩, 1⟩
             subject := .boundaryActivity ⟨owner.processInstanceId, ⟨"Activity"⟩, 1⟩
             handlerElementId := ⟨"Handler"⟩ }
         lifecycle := .compensating none ⟨owner.processInstanceId, ⟨"Effect"⟩, 1⟩ }]
    dependencies := [] }

private def handlerWaitFor (owner : ScopeOccurrenceId) : CompensationHandlerEffectWait :=
  { id := ⟨owner.processInstanceId, ⟨"Effect"⟩, 1⟩
    triggerId := (triggerFor owner).id
    handlerId := ⟨owner.processInstanceId, ⟨"Handler"⟩, 1⟩
    descriptor :=
      { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
        operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }
    arguments := [] }

private def compensationState : RuntimeState :=
  { state with
    scopeOccurrences := state.scopeOccurrences ++ [{ id := otherRoot, parent := none }]
    compensationActivityRetentions :=
      [{ owner := root, nextCompletionOrdinal := 1, records := [] },
       { owner := otherRoot, nextCompletionOrdinal := 1, records := [] }]
    compensationTriggers := [triggerFor root, triggerFor otherRoot]
    compensationHandlerEffectWaits := [handlerWaitFor root, handlerWaitFor otherRoot] }

theorem root_disposal_removes_only_owned_compensation_state :
    (cancelScopeSubtree compensationState root .remove).compensationActivityRetentions =
        [{ owner := otherRoot, nextCompletionOrdinal := 1, records := [] }] ∧
      (cancelScopeSubtree compensationState root .remove).compensationTriggers =
        [triggerFor otherRoot] ∧
      (cancelScopeSubtree compensationState root .remove).compensationHandlerEffectWaits =
        [handlerWaitFor otherRoot] := by decide +kernel

theorem returnProcessStep_activity_identity_discipline
    (before after : RuntimeState) (id origin calledProcessId calledRootScopeId callerOutput)
    (step : ReturnProcessStep before id origin calledProcessId calledRootScopeId callerOutput after) :
    activityIdentityIssuingDiscipline before after = true := by
  cases step
  apply activityIdentityIssuingDiscipline_of_subset
  intro successor present
  exact (List.mem_filter.mp present).1

theorem returnProcessState_activity_identity_discipline
    (before after : RuntimeState) (id origin calledProcessId calledRootScopeId callerOutput)
    (returned : returnProcessState? before id origin calledProcessId calledRootScopeId callerOutput =
      some after) :
    activityIdentityIssuingDiscipline before after = true := by
  exact returnProcessStep_activity_identity_discipline before after id origin calledProcessId
    calledRootScopeId callerOutput (returnProcessState_sound before after _ _ _ _ _ returned)

end BpmnSemantics.ScopeCancellationConformance
