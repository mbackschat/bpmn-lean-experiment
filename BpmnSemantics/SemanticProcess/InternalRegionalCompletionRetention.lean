import BpmnSemantics.SemanticProcess.InternalRegionalOwnershipClosure
import BpmnSemantics.SemanticProcess.BoundedScope
import BpmnSemantics.SemanticProcess.MonitoredScope

/-! REG-OWN-CLOSE-01 uses completion's selected root/child mask and exact deadline withdrawal.
The bounded evaluator's Timer erase requires predecessor identity uniqueness. ESL-CLOSE monitored
completion instead supplies exact child-body and optional Timer censuses, including the consumed
one-shot case, which derive retention masks without assuming successor validity. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem filter_keep_all {α : Type} (values : List α) :
    values.filter (fun _ => true) = values := List.filter_eq_self.mpr (by simp)

private theorem filter_keep_none {α : Type} (values : List α) :
    values.filter (fun _ => false) = [] := List.filter_eq_nil_iff.mpr (by simp)

def ordinaryCompletionReferenceRetention (occurrence : RuntimeScopeOccurrence) :
    RegionalReferenceRetention :=
  { scope := fun candidate => match occurrence.parent with
      | none => false
      | some _ => decide (candidate.id ≠ occurrence.id)
    activity := fun _ => true
    task := fun _ => true
    message := fun _ => true
    timer := fun _ => true
    race := fun _ => true }

def boundedCompletionReferenceRetention (occurrence : RuntimeScopeOccurrence)
    (child : ScopeOccurrenceId) (deadline : TimerWait) : RegionalReferenceRetention :=
  { ordinaryCompletionReferenceRetention occurrence with
    activity := fun record => !decide (record.body = .childScope child)
    timer := fun wait => wait != deadline }

theorem ordinaryCompletionReferenceRetention_matches_completion (state completed : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId)
    (occurrence : RuntimeScopeOccurrence)
    (unique : state.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (completion : completeScopeState? state scopeId parentOutput = some completed) :
    regionalReferenceFieldsMatch state completed (ordinaryCompletionReferenceRetention occurrence) := by
  have fields := completeScopeState_reference_fields state completed scopeId parentOutput
    occurrence unique completion
  cases parent : occurrence.parent <;>
    simpa [regionalReferenceFieldsMatch, ordinaryCompletionReferenceRetention, parent,
      filter_keep_all, filter_keep_none] using fields

/-- ESL-CLOSE withdraws the selected Activity even after a one-shot deadline was consumed.
The child-body mask preserves Task bodies unconditionally; exact body and tagged Timer censuses
settle agreement with record erasure independently of activation ordinals. -/
def monitoredCompletionReferenceRetention (occurrence : RuntimeScopeOccurrence)
    (_record : ActivityOccurrence) (deadline : Option TimerWait) : RegionalReferenceRetention :=
  { ordinaryCompletionReferenceRetention occurrence with
    activity := fun candidate => !decide (candidate.body = .childScope occurrence.id)
    timer := fun wait => match deadline with
      | none => true
      | some timer => !timerIdNamesWait (boundaryTimerWaitIdentity timer) wait }

theorem erase_matches_singleton_mask {α : Type} [DecidableEq α]
    (values : List α) (predicate : α → Bool) (value : α)
    (census : values.filter predicate = [value]) :
    values.erase value = values.filter (fun candidate => !predicate candidate) := by
  have selected : predicate value = true :=
    (List.mem_filter.mp (show value ∈ values.filter predicate by rw [census]; simp)).2
  induction values with
  | nil => simp at census
  | cons head tail ih =>
      cases matched : predicate head with
      | false =>
          have unequal : head ≠ value := by intro equal; subst head; simp_all
          simp only [List.filter_cons, matched, Bool.false_eq_true, ↓reduceIte] at census
          simp [unequal, matched, ih census]
      | true =>
          simp only [List.filter_cons, matched, ↓reduceIte, List.cons.injEq] at census
          obtain ⟨rfl, empty⟩ := census
          have retained : tail.filter (fun candidate => !predicate candidate) = tail := by
            apply List.filter_eq_self.mpr
            intro candidate member
            have rejected := List.filter_eq_nil_iff.mp empty candidate member
            simp_all
          simp [matched, retained]

/-- Primitive completion supplies scope retirement and collection frames; predecessor
Activity/Timer censuses then derive exact withdrawal without successor assumptions. -/
theorem monitoredCompletionReferenceRetention_matches_completion (program : Program)
    (before completed : RuntimeState) (scopeId : DefinitionScopeId)
    (output : Option ControlPlaceId) (occurrence : RuntimeScopeOccurrence)
    (pair : MonitoredScopePair) (bound : MonitoredScopeBinding program before pair)
    (selectedScope : pair.definition.childScopeId = scopeId)
    (unique : before.scopeOccurrences.filter (fun candidate =>
      decide (candidate.id.definitionScopeId = scopeId)) = [occurrence])
    (completion : completeScopeState? before scopeId output = some completed) :
    regionalReferenceFieldsMatch before
      { completed with
        timerWaits := removeMonitoredScopeTimer completed.timerWaits pair.timer
        activityOccurrences := completed.activityOccurrences.erase pair.record }
      (monitoredCompletionReferenceRetention occurrence pair.record pair.timer) := by
  obtain ⟨scopes, activities, tasks, messages, timers, races⟩ :=
    ordinaryCompletionReferenceRetention_matches_completion before completed scopeId output occurrence unique completion
  simp only [ordinaryCompletionReferenceRetention, filter_keep_all] at activities tasks messages timers races
  refine ⟨scopes, ?_, ?_, ?_, ?_, ?_⟩
  · change completed.activityOccurrences.erase pair.record = _
    rw [activities]
    have childCensus := bound.2.1.1
    rw [selectedScope, unique] at childCensus
    have childEqual : pair.child = occurrence := (List.singleton_inj.mp childCensus).symm
    have bodyCensus := bound.2.1.2.2.2.2.1
    rw [childEqual] at bodyCensus
    exact erase_matches_singleton_mask _ _ _ bodyCensus
  · simpa only [monitoredCompletionReferenceRetention, ordinaryCompletionReferenceRetention, filter_keep_all] using tasks
  · simpa only [monitoredCompletionReferenceRetention, ordinaryCompletionReferenceRetention, filter_keep_all] using messages
  · change removeMonitoredScopeTimer completed.timerWaits pair.timer = _
    rw [timers]
    have timerBinding := bound.2.2
    cases live : pair.timer with
    | none => simp [removeMonitoredScopeTimer, monitoredCompletionReferenceRetention, filter_keep_all]
    | some timer =>
        simp only [MonitoredScopeTimerBinding, live] at timerBinding
        exact erase_matches_singleton_mask _ _ _ timerBinding.2.2.1
  · simpa only [monitoredCompletionReferenceRetention, ordinaryCompletionReferenceRetention, filter_keep_all] using races

end BpmnSemantics.SemanticProcess
