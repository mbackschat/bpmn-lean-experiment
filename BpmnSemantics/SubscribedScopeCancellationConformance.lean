import BpmnSemantics.SemanticProcess.ScopeCancellation

/-! ESL-RETAIN finite ownership witnesses distinguish retaining a subscribed child body from
removing its contents. These constructed states exercise cleanup, not broader source admission. -/

namespace BpmnSemantics.SubscribedScopeCancellationConformance

open BpmnSemantics.SemanticProcess

private def root : ScopeOccurrenceId := ⟨⟨"Instance"⟩, ⟨"scope:root"⟩, 1⟩
private def child : ScopeOccurrenceId := ⟨⟨"Instance"⟩, ⟨"scope:child"⟩, 1⟩
private def reminder : OccurrenceId := ⟨⟨"Instance"⟩, ⟨"Reminder"⟩, 3⟩
private def timer : TimerWait :=
  { processInstanceId := root.processInstanceId, owner := root, elementId := ⟨"Reminder"⟩,
    activation := 3, deadlineMs := 3000, output := ⟨"place:reminder"⟩ }
private def message (owner : ScopeOccurrenceId) (activation : Nat) : MessageWait :=
  { processInstanceId := root.processInstanceId, owner, elementId := ⟨"Handler"⟩, activation,
    channel := .directMessage ⟨"Handler"⟩, output := ⟨"place:handled"⟩ }
private def record : ActivityOccurrence :=
  { processInstanceId := root.processInstanceId, activityElementId := ⟨"Child"⟩,
    activation := 7, owner := root, body := .childScope child, attachedHandlers := [.timer reminder] }
private def state : RuntimeState :=
  { initialState with
    control := .running root.processInstanceId
    scopeOccurrences := [{ id := root, parent := none }, { id := child, parent := some root }]
    activityOccurrences := [record]
    timerWaits := [timer]
    messageWaits := [message root 1, message root 2, message child 3]
    timerActivations := [{ elementId := ⟨"Reminder"⟩, count := 3 }]
    messageActivations := [{ elementId := ⟨"Handler"⟩, count := 3 }]
    activityActivations := [{ taskId := ⟨"Child"⟩, count := 7 }] }

theorem retained_body_keeps_its_parent_owned_subscription_and_record :
    (cancelScopeSubtree state child .retain).scopeOccurrences = state.scopeOccurrences ∧
      (cancelScopeSubtree state child .retain).activityOccurrences = [record] ∧
      (cancelScopeSubtree state child .retain).timerWaits = [timer] ∧
      (cancelScopeSubtree state child .retain).messageWaits = [message root 1, message root 2] := by
  decide +kernel

theorem removal_withdraws_parent_owned_subscription_but_keeps_outer_handlers :
    (cancelScopeSubtree state child .remove).scopeOccurrences = [{ id := root, parent := none }] ∧
      (cancelScopeSubtree state child .remove).activityOccurrences = [] ∧
      (cancelScopeSubtree state child .remove).timerWaits = [] ∧
      (cancelScopeSubtree state child .remove).messageWaits = [message root 1, message root 2] := by
  decide +kernel

theorem enclosing_removal_clears_every_handler_without_reusing_identities :
    (cancelScopeSubtree state root .remove).scopeOccurrences = [] ∧
      (cancelScopeSubtree state root .remove).activityOccurrences = [] ∧
      (cancelScopeSubtree state root .remove).timerWaits = [] ∧
      (cancelScopeSubtree state root .remove).messageWaits = [] ∧
      (cancelScopeSubtree state root .remove).timerActivations = state.timerActivations ∧
      (cancelScopeSubtree state root .remove).messageActivations = state.messageActivations ∧
      (cancelScopeSubtree state root .remove).activityActivations = state.activityActivations := by
  decide +kernel

end BpmnSemantics.SubscribedScopeCancellationConformance
