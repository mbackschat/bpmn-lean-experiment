import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Scope-subtree cancellation

This module owns classification and removal of every represented live runtime owner in one selected
scope-occurrence subtree, including transitively called Process instances and Activity-local effect
state. The selected occurrence may be retained for immediate normal completion or removed for an
interrupting boundary route. Activation counters, Process variables, End history, and logical time are
never cancellation targets.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive SelectedScopeDisposition where
  | retain
  | remove
  deriving Repr, DecidableEq

private def occurrenceParent? (occurrences : List RuntimeScopeOccurrence)
    (candidate : ScopeOccurrenceId) : Option ScopeOccurrenceId :=
  (occurrences.find? fun occurrence => decide (occurrence.id = candidate))
    |>.bind (·.parent)

private def occurrenceInSubtreeWithin
    (occurrences : List RuntimeScopeOccurrence) (root candidate : ScopeOccurrenceId) :
    Nat → Bool
  | 0 => false
  | fuel + 1 =>
      if candidate = root then true
      else match occurrenceParent? occurrences candidate with
        | some parent => occurrenceInSubtreeWithin occurrences root parent fuel
        | none => false

/-- Whether one live occurrence is the selected scope occurrence or one of its descendants. -/
def occurrenceInSubtree (occurrences : List RuntimeScopeOccurrence)
    (root candidate : ScopeOccurrenceId) : Bool :=
  occurrenceInSubtreeWithin occurrences root candidate (occurrences.length + 1)

private def calledInstanceClosureWithin
    (records : List CalledProcessOccurrence) (seed : List SemanticId) :
    Nat → List SemanticId
  | 0 => seed
  | fuel + 1 =>
      let expanded := (seed ++ records.filterMap fun record =>
        if seed.contains record.caller.processInstanceId then
          some record.calledRoot.processInstanceId
        else none).eraseDups
      if expanded.length = seed.length then expanded
      else calledInstanceClosureWithin records expanded fuel

/-- Semantic Process-instance IDs transitively owned by calls whose callers lie in one cancelled scope subtree. -/
def calledInstanceClosure (state : RuntimeState)
    (root : ScopeOccurrenceId) : List SemanticId :=
  let direct := state.calledProcessOccurrences.filterMap fun record =>
    if occurrenceInSubtree state.scopeOccurrences root record.caller then
      some record.calledRoot.processInstanceId
    else none
  calledInstanceClosureWithin state.calledProcessOccurrences direct
    (state.calledProcessOccurrences.length + 1)

private def effectOccurrenceId (wait : EffectWait) : EffectOccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

private def keepScopeOccurrence (disposition : SelectedScopeDisposition)
    (root : ScopeOccurrenceId) (cancelled : ScopeOccurrenceId → Bool)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  match disposition with
  | .retain => occurrence.id = root || !cancelled occurrence.id
  | .remove => !cancelled occurrence.id

/-- Remove all represented live owners in the selected occurrence subtree while independently choosing whether the selected occurrence itself remains for a following completion step. -/
def cancelScopeSubtree (state : RuntimeState) (root : ScopeOccurrenceId)
    (disposition : SelectedScopeDisposition) : RuntimeState :=
  let calledInstances := calledInstanceClosure state root
  let cancelled := fun owner =>
    occurrenceInSubtree state.scopeOccurrences root owner ||
      calledInstances.contains owner.processInstanceId
  let cancelledEffects := state.effectWaits.filter fun wait =>
    cancelled wait.owner
  let cancelledIncidents := state.effectIncidents.filter fun incident =>
    cancelled incident.wait.owner
  -- A handler attached to an Activity is owned by the scope *holding* that Activity, so an
  -- owner-only rule leaves a bounded Sub-Process deadline alive after its child region is gone. The
  -- records name what each Activity owns, and the withdrawn ones carry their attached waits out.
  let withdrawnTimers := attachedTimersOf (withdrawnByRegion cancelled state.activityOccurrences)
  { state with
    tokens := state.tokens.filter fun token => !cancelled token.owner
    scopeOccurrences := state.scopeOccurrences.filter
      (keepScopeOccurrence disposition root cancelled)
    waits := state.waits.filter fun wait => !cancelled wait.owner
    messageWaits := state.messageWaits.filter fun wait => !cancelled wait.owner
    timerWaits := state.timerWaits.filter fun wait =>
      !cancelled wait.owner && !anyTimerIdNamesWait withdrawnTimers wait
    activityOccurrences := retainedByRegion cancelled state.activityOccurrences
    effectWaits := state.effectWaits.filter fun wait => !cancelled wait.owner
    effectIncidents :=
      state.effectIncidents.filter fun incident => !cancelled incident.wait.owner
    selectedBranchSets :=
      state.selectedBranchSets.filter fun record => !cancelled record.owner
    eventRaces := state.eventRaces.filter fun race => !cancelled race.owner
    calledProcessOccurrences :=
      state.calledProcessOccurrences.filter fun record =>
        !cancelled record.caller && !cancelled record.calledRoot
    variables :=
      { state.variables with
        activities := state.variables.activities.filter fun activity =>
          !calledInstances.contains activity.owner.processInstanceId &&
            !(cancelledEffects.any fun wait =>
              activityScopeMatches (effectOccurrenceId wait) activity) &&
            !(cancelledIncidents.any fun incident =>
              activityScopeMatches incident.id.effectId activity) } }

/-! ## Withdrawal completeness

The composed facts, quantified over every state, region, and disposition. The deadline arm of the
bounded-scope family used to establish withdrawal structurally, by erasing from a list its premise
forced to contain the deadline. That premise is discharged, so withdrawal now rests on these two.
-/

/-- No record the region withdrew survives it. -/
theorem cancelScopeSubtree_retains_no_withdrawn_record (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    ∀ record ∈ (cancelScopeSubtree state root disposition).activityOccurrences,
      recordInRegion
        (fun owner =>
          occurrenceInSubtree state.scopeOccurrences root owner ||
            (calledInstanceClosure state root).contains owner.processInstanceId)
        record = false := by
  intro record retained
  simp only [cancelScopeSubtree] at retained
  exact retained_records_are_outside_the_region _ _ record retained

/-- No Timer wait a withdrawn record listed survives the region either. -/
theorem cancelScopeSubtree_withdraws_listed_timers (state : RuntimeState)
    (root : ScopeOccurrenceId) (disposition : SelectedScopeDisposition) :
    ∀ wait ∈ (cancelScopeSubtree state root disposition).timerWaits,
      anyTimerIdNamesWait
        (attachedTimersOf
          (withdrawnByRegion
            (fun owner =>
              occurrenceInSubtree state.scopeOccurrences root owner ||
                (calledInstanceClosure state root).contains owner.processInstanceId)
            state.activityOccurrences))
        wait = false := by
  intro wait survives
  simp only [cancelScopeSubtree, List.mem_filter, Bool.and_eq_true,
    Bool.not_eq_true'] at survives
  exact survives.2.2

/-- Regional interruption removes the selected occurrence and then emits the caught route token in its live parent. -/
def interruptScope (state : RuntimeState) (root parent : ScopeOccurrenceId)
    (output : ControlPlaceId) : RuntimeState :=
  let cancelled := cancelScopeSubtree state root .remove
  { cancelled with tokens := addToken cancelled.tokens output parent }

end BpmnSemantics.SemanticProcess
