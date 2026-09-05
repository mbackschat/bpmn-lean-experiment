import BpmnSemantics.RuntimeStateWellFormedFixtures

/-! # Runtime-state Activity occurrence negative fixtures

This module owns the kernel-decided Activity occurrence fixtures separately from the sequential
Multi-Instance controller reductions so the independent proof families do not accumulate in one
kernel target under the repository's hard 3 GiB Lean measurement bound.
-/

set_option Elab.async false

namespace BpmnSemantics.RuntimeStateWellFormedConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

theorem armed_state_is_well_formed :
    runtimeStateWellFormed program instanceId armedState = true := by decide +kernel

/-- `A1`, violating `AOO-BODY-01`: a record whose body has been removed while it survives. -/
def strandedActivityBodyState : RuntimeState :=
  { armedState with waits := [] }

theorem stranded_activity_body_is_refused :
    runtimeStateWellFormed program instanceId strandedActivityBodyState = false := by decide +kernel

theorem stranded_activity_body_fails_ownership_with_siblings_intact :
    activityRecordsOwnLiveWork strandedActivityBodyState = false ∧
      attachedTimersUnambiguous strandedActivityBodyState = true ∧
      activityIdentitiesUnique strandedActivityBodyState = true ∧
      waitOwnersLive strandedActivityBodyState = true := by decide +kernel

/-- `A2`, violating `AOO-ATTACH-01`: two records claiming one live deadline. -/
def ambiguousAttachedTimerState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++
      armedState.activityOccurrences.map fun record =>
        { record with activityElementId := { value := record.activityElementId.value ++ "_Other" } }
    activityActivations := armedState.activityActivations ++
      armedState.activityOccurrences.map fun record =>
        { taskId := { value := record.activityElementId.value ++ "_Other" }
          count := record.activation } }

theorem ambiguous_attached_timer_is_refused :
    runtimeStateWellFormed program instanceId ambiguousAttachedTimerState = false := by decide +kernel

theorem ambiguous_attached_timer_fails_attachment_with_identity_intact :
    attachedTimersUnambiguous ambiguousAttachedTimerState = false ∧
      activityIdentitiesUnique ambiguousAttachedTimerState = true := by decide +kernel

/-- A Message handler with the same occurrence coordinates as a live Timer cannot satisfy Timer ownership. -/
def sameShapedMessageHandlerState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences.map fun record =>
      { record with
        attachedHandlers := record.attachedHandlers.map fun
          | .timer occurrence => .message occurrence
          | handler => handler } }

theorem same_shaped_message_handler_is_not_a_timer_owner :
    runtimeStateWellFormed program instanceId sameShapedMessageHandlerState = false := by
  decide +kernel

/-- `A3`, violating `AOO-ID-01`: one Activity occurrence identity carried twice. -/
def duplicateActivityIdentityState : RuntimeState :=
  { armedState with
    activityOccurrences := armedState.activityOccurrences ++ armedState.activityOccurrences }

theorem duplicate_activity_identity_is_refused :
    runtimeStateWellFormed program instanceId duplicateActivityIdentityState = false := by
  decide +kernel

theorem duplicate_activity_identity_fails_uniqueness :
    activityIdentitiesUnique duplicateActivityIdentityState = false := by decide +kernel

/-- The incidental Activity/task counter agreement is asserted nowhere, so disagreement stays admitted. -/
def disagreeingActivityCounterState : RuntimeState :=
  { armedState with
    activityActivations := armedState.activityActivations.map fun activation =>
      { activation with count := activation.count + 4 } }

theorem disagreeing_activity_counter_is_admitted :
    runtimeStateWellFormed program instanceId disagreeingActivityCounterState = true := by
  decide +kernel

private def ownerA : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := ⟨"scope:A"⟩, activation := 1 }

private def ownerB : ScopeOccurrenceId :=
  { processInstanceId := instanceId, definitionScopeId := ⟨"scope:B"⟩, activation := 1 }

private def ownedTaskId : OccurrenceId :=
  { processInstanceId := instanceId, elementId := ⟨"Task"⟩, activation := 1 }

private def ownedTaskWait (owner : ScopeOccurrenceId) : UserTaskWait :=
  { processInstanceId := instanceId, task := { id := ⟨"Task"⟩, name := none }
    activation := 1, owner, output := ⟨"out"⟩ }

private def ownershipState (body : ActivityBody) (waits : List UserTaskWait) : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := ownerA, parent := none }, { id := ownerB, parent := some ownerA }]
    waits
    activityOccurrences :=
      [{ processInstanceId := instanceId, activityElementId := ⟨"Activity"⟩, activation := 1
         owner := ownerA, body, attachedHandlers := [] }] }

theorem task_body_owner_must_agree_for_singular_and_parallel_bodies :
    activityRecordsOwnLiveWork
      (ownershipState (.userTask ownedTaskId) [ownedTaskWait ownerB]) = false ∧
      activityRecordsOwnLiveWork
        (ownershipState (.parallelUserTasks ownedTaskId []) [ownedTaskWait ownerB]) = false ∧
      activityRecordsOwnLiveWork
        (ownershipState (.parallelUserTasks ownedTaskId [{ ownedTaskId with activation := 2 }])
          [ownedTaskWait ownerA, { ownedTaskWait ownerB with activation := 2 }]) = false ∧
      waitOwnersLive (ownershipState (.userTask ownedTaskId) [ownedTaskWait ownerB]) = true ∧
      waitIdentitiesUnique (ownershipState (.userTask ownedTaskId) [ownedTaskWait ownerB]) = true := by
  decide +kernel

theorem owner_filter_cannot_hide_a_duplicate_task_identity :
    activityRecordsOwnLiveWork (ownershipState (.userTask ownedTaskId)
      [ownedTaskWait ownerA, ownedTaskWait ownerB]) = false ∧
      activityRecordsOwnLiveWork (ownershipState (.parallelUserTasks ownedTaskId [])
        [ownedTaskWait ownerA, ownedTaskWait ownerB]) = false := by
  decide +kernel

theorem task_owner_agreement_preserves_child_scope_identity :
    activityRecordsOwnLiveWork
      (ownershipState (.userTask ownedTaskId) [ownedTaskWait ownerA]) = true ∧
      activityRecordsOwnLiveWork
        (ownershipState (.parallelUserTasks ownedTaskId []) [ownedTaskWait ownerA]) = true ∧
      activityRecordsOwnLiveWork (ownershipState (.childScope ownerB) []) = true ∧
      decide (ownerA = ownerB) = false := by
  decide +kernel

end BpmnSemantics.RuntimeStateWellFormedConformance
