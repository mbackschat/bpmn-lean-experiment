module

import BpmnSemantics.SemanticProcess.CollectionOrder
import BpmnSemantics.SemanticProcess.InternalRegionalOrderFacts
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.CallRecordCanonicalEquality
import BpmnSemantics.SemanticProcess.ScopeStorageOrder
import BpmnSemantics.SemanticProcess.TokenOrder

/-! # Removal-only preservation

Cancellation and Call removal share these consequences of retaining exact records and issuance
counters. Their owner-liveness and Activity-controller rules remain at the distinct remover owners.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

theorem filterScopeOwnedWork_activity_occurrences_subset (state : RuntimeState)
    (keep : ScopeOccurrenceId → Bool) :
    ∀ record ∈ (filterScopeOwnedWork state keep).activityOccurrences,
      record ∈ state.activityOccurrences := by
  intro record present
  exact (List.mem_filter.mp present).1

theorem all_sublist {α : Type} (predicate : α → Bool) (before after : List α)
    (retained : after.Sublist before) (valid : before.all predicate = true) :
    after.all predicate = true := by
  apply List.all_eq_true.mpr
  intro value member
  exact List.all_eq_true.mp valid value (retained.subset member)

private theorem declarations_sublist {α : Type} (before after : List α)
    (retained : after.Sublist before) (inInstance declaration : α → Bool)
    (valid : (before.filter inInstance).all declaration = true) :
    (after.filter inInstance).all declaration = true := by
  apply List.all_eq_true.mpr
  intro value member
  obtain ⟨prior, selected⟩ := List.mem_filter.mp member
  exact List.all_eq_true.mp valid value
    (List.mem_filter.mpr ⟨retained.subset prior, selected⟩)

theorem runtimeStateIdentityBound_of_removal (before after : RuntimeState)
    (waits : after.waits.Sublist before.waits)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (activities : after.activityOccurrences.Sublist before.activityOccurrences)
    (taskCounters : after.activations = before.activations)
    (timerCounters : after.timerActivations = before.timerActivations)
    (activityCounters : after.activityActivations = before.activityActivations)
    (valid : runtimeStateIdentityBound before = true) :
    runtimeStateIdentityBound after = true := by
  simp only [runtimeStateIdentityBound, activationCount, timerActivationCount,
    activityActivationCount, taskCounters, timerCounters, activityCounters,
    Bool.and_eq_true] at valid ⊢
  exact ⟨⟨all_sublist _ _ _ waits valid.1.1, all_sublist _ _ _ timers valid.1.2⟩,
    all_sublist _ _ _ activities valid.2⟩

theorem waitDeclarationsValid_of_removal (program : Program) (instanceId : SemanticId)
    (before after : RuntimeState)
    (waits : after.waits.Sublist before.waits)
    (messages : after.messageWaits.Sublist before.messageWaits)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (effects : after.effectWaits.Sublist before.effectWaits)
    (incidents : after.effectIncidents.Sublist before.effectIncidents)
    (valid : waitDeclarationsValid program instanceId before = true) :
    waitDeclarationsValid program instanceId after = true := by
  simp only [waitDeclarationsValid, Bool.and_eq_true, and_assoc] at valid ⊢
  exact ⟨declarations_sublist _ _ waits _ _ valid.1,
    declarations_sublist _ _ messages _ _ valid.2.1,
    declarations_sublist _ _ timers _ _ valid.2.2.1,
    declarations_sublist _ _ effects _ _ valid.2.2.2.1,
    declarations_sublist _ _ incidents _ _ valid.2.2.2.2⟩

theorem hiddenRecordDeclarationsValid_of_removal (program : Program)
    (before after : RuntimeState)
    (parallel : after.parallelScopeControllers.Sublist before.parallelScopeControllers)
    (selections : after.selectedBranchSets.Sublist before.selectedBranchSets)
    (races : after.eventRaces.Sublist before.eventRaces)
    (sequential : after.sequentialScopeControllers.Sublist before.sequentialScopeControllers)
    (valid : hiddenRecordDeclarationsValid program before = true) :
    hiddenRecordDeclarationsValid program after = true := by
  simp only [hiddenRecordDeclarationsValid, Bool.and_eq_true] at valid ⊢
  have empty : before.parallelScopeControllers = [] := List.isEmpty_iff.mp valid.1.1.1
  have afterEmpty : after.parallelScopeControllers = [] := by simpa [empty] using parallel
  exact ⟨⟨⟨by simp [afterEmpty], all_sublist _ _ _ selections valid.1.1.2⟩,
    all_sublist _ _ _ races valid.1.2⟩, all_sublist _ _ _ sequential valid.2⟩

private theorem orderedBy_tail {α : Type} (before : α → α → Bool) (head : α)
    (tail : List α) (ordered : orderedBy before (head :: tail) = true) :
    orderedBy before tail = true := by
  cases tail with
  | nil => rfl
  | cons next rest =>
      simp only [orderedBy, Bool.and_eq_true] at ordered
      exact ordered.2

theorem orderedBy_sublist {α : Type} {before : α → α → Bool}
    (compose : ∀ a b c, before b a = false → before c b = false → before c a = false)
    (values retained : List α) (selection : retained.Sublist values) :
    orderedBy before values = true → orderedBy before retained = true := by
  induction selection with
  | slnil => exact fun _ => rfl
  | @cons kept prior head selection ih =>
      exact fun ordered => ih (orderedBy_tail before head prior ordered)
  | @cons_cons kept prior head selection ih =>
      intro ordered
      have tail := orderedBy_tail before head prior ordered
      have selectedOrder := ih tail
      cases kept with
      | nil => rfl
      | cons next rest =>
          have member : next ∈ prior := selection.subset (by simp)
          have bound : before next head = false := by
            cases prior with
            | nil => contradiction
            | cons first more =>
                simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true'] at ordered
                exact orderedBy_bound compose first more head tail
                  ordered.1 next member
          simp only [orderedBy, Bool.and_eq_true, Bool.not_eq_true']
          exact ⟨bound, selectedOrder⟩

theorem canonicalCollectionOrder_of_removal (before after : RuntimeState)
    (tokens : after.tokens.Sublist before.tokens)
    (waits : after.waits.Sublist before.waits)
    (messages : after.messageWaits.Sublist before.messageWaits)
    (timers : after.timerWaits.Sublist before.timerWaits)
    (effects : after.effectWaits.Sublist before.effectWaits)
    (data : after.variables.activities.Sublist before.variables.activities)
    (selections : after.selectedBranchSets.Sublist before.selectedBranchSets)
    (races : after.eventRaces.Sublist before.eventRaces)
    (calls : after.calledProcessOccurrences.Sublist before.calledProcessOccurrences)
    (activities : after.activityOccurrences.Sublist before.activityOccurrences)
    (sequential : after.sequentialMultiInstanceControllers.Sublist before.sequentialMultiInstanceControllers)
    (parallel : after.parallelMultiInstanceControllers.Sublist before.parallelMultiInstanceControllers)
    (scopes : after.scopeOccurrences.Sublist before.scopeOccurrences)
    (activityCounters : after.activityActivations = before.activityActivations)
    (taskCounters : after.activations = before.activations)
    (messageCounters : after.messageActivations = before.messageActivations)
    (timerCounters : after.timerActivations = before.timerActivations)
    (effectCounters : after.effectActivations = before.effectActivations)
    (scopeCounters : after.scopeActivations = before.scopeActivations)
    (callCounters : after.callActivations = before.callActivations)
    (raceCounters : after.eventRaceActivations = before.eventRaceActivations)
    (ordered : canonicalCollectionOrder before = true) :
    canonicalCollectionOrder after = true := by
  simp only [canonicalCollectionOrder, Bool.and_eq_true, and_assoc] at ordered ⊢
  obtain ⟨tokenOrder, activityCounterOrder, taskOrder, taskCounterOrder,
    messageOrder, timerOrder, effectOrder, messageCounterOrder, timerCounterOrder,
    effectCounterOrder, variableOrder, selectionOrder, raceOrder, callOrder,
    activityOrder, sequentialOrder, parallelOrder, scopeOrder, scopeCounterOrder,
    callCounterOrder, raceCounterOrder⟩ := ordered
  simp only [parallelMultiInstanceControllersOrdered_eq_orderedBy] at parallelOrder ⊢
  rw [activityCounters, taskCounters, messageCounters, timerCounters, effectCounters,
    scopeCounters, callCounters, raceCounters]
  exact ⟨orderedBy_sublist controlTokenBefore_compose _ _ tokens tokenOrder,
    activityCounterOrder, orderedBy_sublist userTaskWaitBefore_compose _ _ waits taskOrder,
    taskCounterOrder, orderedBy_sublist regional_messageWaitBefore_compose _ _ messages messageOrder,
    orderedBy_sublist regional_timerWaitBefore_compose _ _ timers timerOrder,
    orderedBy_sublist regional_effectWaitBefore_compose _ _ effects effectOrder,
    messageCounterOrder, timerCounterOrder, effectCounterOrder,
    orderedBy_sublist regional_activityVariableScopeBefore_compose _ _ data variableOrder,
    orderedBy_sublist regional_selectionBefore_compose _ _ selections selectionOrder,
    orderedBy_sublist regional_eventRaceBefore_compose _ _ races raceOrder,
    orderedBy_sublist callRecordBefore_compose _ _ calls callOrder,
    orderedBy_sublist regional_activityOccurrenceBefore_compose _ _ activities activityOrder,
    orderedBy_sublist regional_sequentialMultiInstanceControllerBefore_compose _ _ sequential sequentialOrder,
    orderedBy_sublist regional_parallelMultiInstanceControllerBefore_compose _ _ parallel parallelOrder,
    orderedBy_sublist (fun a b c => scopeOwnerBefore_compose a.id b.id c.id) _ _ scopes scopeOrder,
    scopeCounterOrder, callCounterOrder, raceCounterOrder⟩

end BpmnSemantics.SemanticProcess
