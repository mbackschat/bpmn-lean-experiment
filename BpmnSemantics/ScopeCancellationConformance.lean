module

public import BpmnSemantics.SemanticProcess.CallActivity
public import BpmnSemantics.SemanticProcess.ScopeCancellation

/-! # Regional Activity lifetime regression witnesses

AOO-CANCEL-01 follows the Activity record's body and tagged attachments across scope owners.
ESL-RETAIN-01 preserves that record while its selected child body remains live.
These literal ownership graphs exercise cancellation without claiming new profile admission.
Called-Process cleanup also supplies exact predecessor membership for the Activity issuing census.
-/

@[expose] public section

set_option Elab.async false

namespace BpmnSemantics.ScopeCancellationConformance

open BpmnSemantics.SemanticProcess

def root : ScopeOccurrenceId := ⟨⟨"Instance"⟩, ⟨"scope:root"⟩, 1⟩
def child : ScopeOccurrenceId := ⟨⟨"Instance"⟩, ⟨"scope:child"⟩, 1⟩
def activityId : ActivityOccurrenceId := ⟨⟨"Instance"⟩, ⟨"Child"⟩, 1⟩
def messageId : OccurrenceId := ⟨⟨"Instance"⟩, ⟨"Message"⟩, 1⟩

def attachedMessage : MessageWait :=
  { processInstanceId := ⟨"Instance"⟩
    owner := root
    elementId := ⟨"Message"⟩
    activation := 1
    channel := .directMessage ⟨"Message"⟩
    output := ⟨"place:handler"⟩ }

def otherActivationMessage : MessageWait :=
  { attachedMessage with activation := 2 }

def sameCoordinatesTimer : TimerWait :=
  { processInstanceId := ⟨"Instance"⟩
    owner := root
    elementId := ⟨"Message"⟩
    activation := 1
    deadlineMs := 9000
    output := ⟨"place:timer"⟩ }

def state : RuntimeState :=
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
           { owner := .effectOccurrence ⟨⟨"Instance"⟩, ⟨"Child"⟩, 1⟩, bindings := [] }]
        processInterfaces := [], scopes := [] } }

def removal_withdraws_exact_activity_local_data : Bool := decide <|
    (cancelScopeSubtree state child .remove).variables.activities =
      state.variables.activities.tail

def retained_child_preserves_parent_activity_local_data : Bool := decide <|
    (cancelScopeSubtree state child .retain).variables.activities =
      state.variables.activities

def removal_withdraws_exact_parent_owned_message : Bool := decide <|
    (cancelScopeSubtree state child .remove).messageWaits =
      [otherActivationMessage]

def retained_child_preserves_parent_owned_message : Bool := decide <|
    (cancelScopeSubtree state child .retain).messageWaits =
      state.messageWaits

def message_attachment_does_not_withdraw_same_coordinates_timer : Bool := decide <|
    (cancelScopeSubtree state child .remove).timerWaits =
      [sameCoordinatesTimer]

def activity_record_lifetime_follows_child_body_disposition : Bool := decide <|
    (cancelScopeSubtree state child .remove).activityOccurrences = [] ∧
      (cancelScopeSubtree state child .retain).activityOccurrences =
        state.activityOccurrences

def disposition_selects_the_region_occurrence_lifetime : Bool := decide <|
    (cancelScopeSubtree state child .remove).scopeOccurrences =
        [{ id := root, parent := none }] ∧
      (cancelScopeSubtree state child .retain).scopeOccurrences =
        state.scopeOccurrences

def grandchild : ScopeOccurrenceId := ⟨⟨"Instance"⟩, ⟨"scope:grandchild"⟩, 1⟩

def descendantBodyState : RuntimeState :=
  { state with
    scopeOccurrences := state.scopeOccurrences ++ [{ id := grandchild, parent := some child }]
    activityOccurrences := state.activityOccurrences.map fun occurrence =>
      { occurrence with body := .childScope grandchild } }

def retained_region_withdraws_removed_descendant_body_and_exact_attachments : Bool := decide <|
    (cancelScopeSubtree descendantBodyState child .retain).scopeOccurrences =
        state.scopeOccurrences ∧
      (cancelScopeSubtree descendantBodyState child .retain).activityOccurrences = [] ∧
      (cancelScopeSubtree descendantBodyState child .retain).messageWaits =
        [otherActivationMessage] ∧
      (cancelScopeSubtree descendantBodyState child .retain).timerWaits =
        [sameCoordinatesTimer] ∧
      (cancelScopeSubtree descendantBodyState child .retain).variables.activities =
        state.variables.activities.tail

def otherRoot : ScopeOccurrenceId := ⟨⟨"OtherInstance"⟩, ⟨"scope:root"⟩, 1⟩

def triggerFor (owner : ScopeOccurrenceId) : CompensationTriggerExecution :=
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

def handlerWaitFor (owner : ScopeOccurrenceId) : CompensationHandlerEffectWait :=
  { id := ⟨owner.processInstanceId, ⟨"Effect"⟩, 1⟩
    triggerId := (triggerFor owner).id
    handlerId := ⟨owner.processInstanceId, ⟨"Handler"⟩, 1⟩
    descriptor :=
      { protocol := "urn:bpmn-lean:effect-protocol:activity-v1"
        operation := "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" }
    arguments := [] }

def compensationState : RuntimeState :=
  { state with
    scopeOccurrences := state.scopeOccurrences ++ [{ id := otherRoot, parent := none }]
    compensationActivityRetentions :=
      [{ owner := root, nextCompletionOrdinal := 1, records := [] },
       { owner := otherRoot, nextCompletionOrdinal := 1, records := [] }]
    compensationTriggers := [triggerFor root, triggerFor otherRoot]
    compensationHandlerEffectWaits := [handlerWaitFor root, handlerWaitFor otherRoot] }

def root_disposal_removes_only_owned_compensation_state : Bool := decide <|
    (cancelScopeSubtree compensationState root .remove).compensationActivityRetentions =
        [{ owner := otherRoot, nextCompletionOrdinal := 1, records := [] }] ∧
      (cancelScopeSubtree compensationState root .remove).compensationTriggers =
        [triggerFor otherRoot] ∧
      (cancelScopeSubtree compensationState root .remove).compensationHandlerEffectWaits =
        [handlerWaitFor otherRoot]

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

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("removal_withdraws_exact_activity_local_data", removal_withdraws_exact_activity_local_data),
  ("retained_child_preserves_parent_activity_local_data", retained_child_preserves_parent_activity_local_data),
  ("removal_withdraws_exact_parent_owned_message", removal_withdraws_exact_parent_owned_message),
  ("retained_child_preserves_parent_owned_message", retained_child_preserves_parent_owned_message),
  ("message_attachment_does_not_withdraw_same_coordinates_timer", message_attachment_does_not_withdraw_same_coordinates_timer),
  ("activity_record_lifetime_follows_child_body_disposition", activity_record_lifetime_follows_child_body_disposition),
  ("disposition_selects_the_region_occurrence_lifetime", disposition_selects_the_region_occurrence_lifetime),
  ("retained_region_withdraws_removed_descendant_body_and_exact_attachments", retained_region_withdraws_removed_descendant_body_and_exact_attachments),
  ("root_disposal_removes_only_owned_compensation_state", root_disposal_removes_only_owned_compensation_state)
]

end BpmnSemantics.ScopeCancellationConformance
